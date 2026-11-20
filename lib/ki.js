// Herzstück von Room 404: baut den Prompt aus dem Ordner /wissen, fragt die
// KI-Anbieter der Reihe nach (erst die Gratis-Anbieter, dann dein eigener Key)
// und streamt die Antwort als reinen Text an den Browser zurück.
//
// Einstellungen kommen aus Umgebungsvariablen (Vercel: Settings → Environment Variables).
// Trag einfach die Keys ein, die du hast – die App nimmt automatisch den nächsten,
// wenn einer voll oder nicht erreichbar ist:
//   GEMINI_API_KEY       Gratis-Key von Google AI Studio      (Modell: GEMINI_MODEL)
//   OPENROUTER_API_KEY   Key von openrouter.ai                (Modell: OPENROUTER_MODEL)
//   GROQ_API_KEY         Gratis-Key von console.groq.com      (Modell: GROQ_MODEL)
//   AI_API_KEY           Optional: dein eigener Key (alte Einstellung, geht weiterhin)
//                        mit AI_BASE_URL und AI_MODEL
//   AI_REIHENFOLGE       Optional, z. B. "gemini,openrouter,groq,eigener" (Standard)
//   AI_MAX_TOKENS        Optional. Maximale Antwortlänge in Tokens. Standard: 3000
//   AI_REASONING_EFFORT  Optional: low | medium | high | off. Standard: low
//   DAILY_LIMIT          Optional. Fragen pro Nutzer und Tag. Standard: 20 (0 = kein Limit)

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const WISSEN_DATEIEN = ['anweisungen.md', 'angebote.md', 'wissen.md'];

const MAX_NACHRICHTEN = 12; // so viel Verlauf geht pro Frage mit an die KI
const MAX_ZEICHEN = 4000; // pro Nachricht
const MAX_BODY = 100_000; // Zeichen pro Anfrage
const ANBIETER_TIMEOUT_MS = 20_000; // so lange warten wir pro Anbieter auf den Antwortbeginn
const GESAMT_BUDGET_MS = 40_000; // danach probieren wir keinen weiteren Anbieter mehr

const ANBIETER = {
  gemini: {
    name: 'Gemini',
    key: 'GEMINI_API_KEY',
    url: ['GEMINI_BASE_URL', 'https://generativelanguage.googleapis.com/v1beta/openai'],
    modell: ['GEMINI_MODEL', 'gemini-3.5-flash-lite'],
  },
  openrouter: {
    name: 'OpenRouter',
    key: 'OPENROUTER_API_KEY',
    url: ['OPENROUTER_BASE_URL', 'https://openrouter.ai/api/v1'],
    modell: ['OPENROUTER_MODEL', 'openrouter/free'],
  },
  groq: {
    name: 'Groq',
    key: 'GROQ_API_KEY',
    url: ['GROQ_BASE_URL', 'https://api.groq.com/openai/v1'],
    modell: ['GROQ_MODEL', 'openai/gpt-oss-120b'],
  },
  eigener: {
    name: 'Eigener Key',
    key: 'AI_API_KEY',
    url: ['AI_BASE_URL', 'https://openrouter.ai/api/v1'],
    modell: ['AI_MODEL', 'google/gemini-3.5-flash-lite'],
  },
};
const STANDARD_REIHENFOLGE = ['gemini', 'openrouter', 'groq', 'eigener'];

// ---------------------------------------------------------------- Einstellungen

const sauber = (wert) => (wert || '').trim();

function typVonUrl(url) {
  if (/openrouter\.ai/i.test(url)) return 'openrouter';
  if (/generativelanguage\.googleapis\.com/i.test(url)) return 'gemini';
  if (/api\.groq\.com/i.test(url)) return 'groq';
  return 'andere';
}

export function anbieterKette(env = process.env) {
  const reihenfolge = sauber(env.AI_REIHENFOLGE)
    ? env.AI_REIHENFOLGE.split(',').map((s) => s.trim().toLowerCase())
    : STANDARD_REIHENFOLGE;
  const kette = [];
  for (const id of reihenfolge) {
    const vorlage = ANBIETER[id];
    if (!vorlage || kette.some((a) => a.id === id)) continue;
    const key = sauber(env[vorlage.key]);
    if (!key) continue;
    const baseUrl = (sauber(env[vorlage.url[0]]) || vorlage.url[1]).replace(/\/+$/, '');
    kette.push({
      id,
      name: vorlage.name,
      key,
      baseUrl,
      modell: sauber(env[vorlage.modell[0]]) || vorlage.modell[1],
      typ: id === 'eigener' ? typVonUrl(baseUrl) : id,
    });
  }
  return kette;
}

export function einstellungen(env = process.env) {
  return {
    kette: anbieterKette(env),
    maxTokens: ganzzahl(env.AI_MAX_TOKENS, 3000),
    reasoning: (sauber(env.AI_REASONING_EFFORT) || 'low').toLowerCase(),
    tageslimit: ganzzahl(env.DAILY_LIMIT, 20),
  };
}

function ganzzahl(wert, standard) {
  const n = Number.parseInt(wert, 10);
  return Number.isFinite(n) && n >= 0 ? n : standard;
}

// Anbieter-spezifische Extras, damit die Modelle nicht unnötig lange "nachdenken".
export function zusatzParameter(anbieter, aufwand) {
  if (!aufwand || aufwand === 'off') return {};
  if (anbieter.typ === 'openrouter') return { reasoning: { effort: aufwand, exclude: true } };
  if (anbieter.typ === 'gemini') return { reasoning_effort: aufwand };
  if (anbieter.typ === 'groq' && /gpt-oss/i.test(anbieter.modell)) return { reasoning_effort: aufwand };
  return {};
}

// ---------------------------------------------------------------- Pausen für volle Anbieter
// Ist ein Anbieter voll (429) oder falsch eingerichtet, fragen wir ihn eine Weile zuerst nicht.

const pausen = new Map();

function pausieren(id, status) {
  let ms = 20_000;
  if (status === 429 || status === 413) ms = 60_000;
  else if ([400, 401, 402, 403, 404].includes(status)) ms = 10 * 60_000;
  pausen.set(id, Date.now() + ms);
}

const pausiert = (id) => (pausen.get(id) || 0) > Date.now();

function sortiert(kette) {
  return [...kette.filter((a) => !pausiert(a.id)), ...kette.filter((a) => pausiert(a.id))];
}

export function pausenZuruecksetzen() {
  pausen.clear();
}

// ---------------------------------------------------------------- Wissen & Prompt

function wissenOrdner() {
  return [
    path.join(process.cwd(), 'wissen'),
    fileURLToPath(new URL('../wissen/', import.meta.url)),
  ];
}

async function ladeDatei(name) {
  for (const ordner of wissenOrdner()) {
    try {
      return await readFile(path.join(ordner, name), 'utf8');
    } catch {
      // nächsten Ordner probieren
    }
  }
  console.warn(`[room404] Wissensdatei nicht gefunden: ${name}`);
  return '';
}

export async function ladeWissen() {
  const [anweisungen, angebote, wissen] = await Promise.all(WISSEN_DATEIEN.map(ladeDatei));
  return { anweisungen, angebote, wissen };
}

// Kommentare <!-- ... --> sind Notizen für dich, nicht für die KI.
export function ohneKommentare(text = '') {
  return text.replace(/<!--[\s\S]*?-->/g, '').replace(/\n{3,}/g, '\n\n').trim();
}

export function bauePrompt({ anweisungen, angebote, wissen }, jetzt = new Date()) {
  const datum = jetzt.toLocaleDateString('de-DE', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Berlin',
  });
  return [
    ohneKommentare(anweisungen) || 'Du bist Room 404, eine hilfreiche Business-KI. Antworte auf Deutsch.',
    '=== ANGEBOTE – nur diese darfst du empfehlen ===',
    ohneKommentare(angebote) || '(Noch keine Angebote eingetragen – empfiehl nichts Konkretes.)',
    '=== WISSEN – aus echter Erfahrung, nutze es bevorzugt ===',
    ohneKommentare(wissen) || '(Noch kein eigenes Wissen eingetragen.)',
    '=== KONTEXT ===',
    `Heutiges Datum: ${datum}`,
  ].join('\n\n');
}

// ---------------------------------------------------------------- Eingaben prüfen

export function bereinigeNachrichten(roh) {
  if (!Array.isArray(roh)) return null;

  const zusammen = [];
  for (const m of roh) {
    if (!m || (m.role !== 'user' && m.role !== 'assistant') || typeof m.content !== 'string') continue;
    const content = m.content.slice(0, MAX_ZEICHEN).trim();
    if (!content) continue;
    const letzte = zusammen.at(-1);
    if (letzte && letzte.role === m.role) letzte.content += `\n\n${content}`; // gleiche Rolle zusammenfassen
    else zusammen.push({ role: m.role, content });
  }

  const liste = zusammen.slice(-MAX_NACHRICHTEN);
  while (liste.length && liste[0].role !== 'user') liste.shift();
  if (!liste.length || liste.at(-1).role !== 'user') return null;
  return liste;
}

// ---------------------------------------------------------------- Tageslimit
// Einfaches Limit im Speicher der Serverfunktion. Für den Prototyp okay;
// ein dichtes Limit pro Nutzer braucht später eine Datenbank.

const zaehler = new Map();
let zaehlerTag = '';

function heute(jetzt = new Date()) {
  return jetzt.toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' }); // JJJJ-MM-TT
}

export function pruefeLimit(kennung, limit, jetzt = new Date()) {
  if (!limit) return { erlaubt: true, rest: null };
  const tag = heute(jetzt);
  if (tag !== zaehlerTag) {
    zaehler.clear();
    zaehlerTag = tag;
  }
  const bisher = zaehler.get(kennung) || 0;
  if (bisher >= limit) return { erlaubt: false, rest: 0 };
  zaehler.set(kennung, bisher + 1);
  return { erlaubt: true, rest: limit - bisher - 1 };
}

// Wenn keine KI geantwortet hat, zählt die Frage nicht.
function limitErstatten(kennung, limit) {
  if (!limit) return;
  const bisher = zaehler.get(kennung) || 0;
  if (bisher > 0) zaehler.set(kennung, bisher - 1);
}

export function limitZuruecksetzen() {
  zaehler.clear();
  zaehlerTag = '';
}

function clientKennung(request) {
  const h = request.headers;
  const ip = h.get('x-vercel-forwarded-for') || h.get('x-real-ip') || (h.get('x-forwarded-for') || '').split(',')[0];
  return (ip || 'unbekannt').trim();
}

// ---------------------------------------------------------------- Antworten

const FEHLERTEXTE = {
  400: 'Die KI konnte die Anfrage nicht verarbeiten.',
  402: 'Die KI macht gerade eine kurze Pause.',
  408: 'Die KI hat zu lange gebraucht. Versuch es nochmal.',
  413: 'Gerade ist viel los. Versuch es in einer Minute nochmal.',
  429: 'Gerade ist viel los. Versuch es in einer Minute nochmal.',
};

function fehlertext(status) {
  const text = FEHLERTEXTE[status] || 'Die KI ist gerade nicht erreichbar. Versuch es gleich nochmal.';
  return `${text} (Fehler ${status})`;
}

function json(status, daten, extraHeader = {}) {
  return new Response(JSON.stringify(daten), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...extraHeader },
  });
}

function textHeader(rest, anbieter) {
  const header = {
    'Content-Type': 'text/plain; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Accel-Buffering': 'no',
    'X-KI-Anbieter': anbieter.name,
  };
  if (rest !== null && rest !== undefined) header['X-Limit-Remaining'] = String(rest);
  return header;
}

// ---------------------------------------------------------------- Streaming

const ENDE = Symbol('ende');

// Eine Zeile aus dem OpenAI-kompatiblen Event-Stream auswerten.
export function verarbeiteSseZeile(zeile) {
  if (!zeile.startsWith('data:')) return null; // Kommentare/Keep-alives ignorieren
  const daten = zeile.slice(5).trim();
  if (!daten) return null;
  if (daten === '[DONE]') return ENDE;

  let paket;
  try {
    paket = JSON.parse(daten);
  } catch {
    return null;
  }
  if (paket.error) {
    const code = paket.error.code ?? paket.error.status ?? '';
    console.error('[room404] Fehler im Stream:', JSON.stringify(paket.error).slice(0, 500));
    return { fehler: `\n\n⚠️ Die Antwort wurde unterbrochen${code ? ` (Fehler ${code})` : ''}. Versuch es nochmal.` };
  }
  const text = paket.choices?.[0]?.delta?.content;
  return typeof text === 'string' && text.length ? text : null;
}

export async function* textAusSse(body) {
  const decoder = new TextDecoder();
  let puffer = '';
  for await (const stueck of body) {
    puffer += decoder.decode(stueck, { stream: true });
    let pos;
    while ((pos = puffer.indexOf('\n')) !== -1) {
      const zeile = puffer.slice(0, pos).replace(/\r$/, '');
      puffer = puffer.slice(pos + 1);
      const ergebnis = verarbeiteSseZeile(zeile);
      if (ergebnis === ENDE) return;
      if (ergebnis?.fehler) {
        yield ergebnis.fehler;
        return;
      }
      if (ergebnis) yield ergebnis;
    }
  }
  puffer += decoder.decode();
  const rest = verarbeiteSseZeile(puffer.trim());
  if (typeof rest === 'string') yield rest;
  else if (rest?.fehler) yield rest.fehler;
}

async function* mitFallback(quelle) {
  let etwasGesendet = false;
  for await (const text of quelle) {
    etwasGesendet = true;
    yield text;
  }
  if (!etwasGesendet) yield 'Hm, da kam keine Antwort. Versuch es bitte nochmal.';
}

export function alsStream(quelle, beiAbbruch = () => {}) {
  const encoder = new TextEncoder();
  return new ReadableStream({
    async pull(controller) {
      try {
        const { value, done } = await quelle.next();
        if (done) controller.close();
        else controller.enqueue(encoder.encode(value));
      } catch (err) {
        if (err?.name !== 'AbortError') console.error('[room404] Stream-Fehler:', err?.message || err);
        try {
          controller.enqueue(encoder.encode('\n\n⚠️ Die Verbindung wurde unterbrochen. Versuch es nochmal.'));
          controller.close();
        } catch {
          // Stream ist schon zu
        }
      }
    },
    async cancel() {
      beiAbbruch();
      try {
        await quelle.return();
      } catch {
        // egal
      }
    },
  });
}

// ---------------------------------------------------------------- Einen Anbieter fragen

async function frageAnbieter(anbieter, nachrichten, e, signalNutzer) {
  const anfrage = {
    model: anbieter.modell,
    messages: nachrichten,
    stream: true,
    max_tokens: e.maxTokens,
    ...zusatzParameter(anbieter, e.reasoning),
  };

  const abbruch = new AbortController();
  const timer = setTimeout(() => abbruch.abort(), ANBIETER_TIMEOUT_MS);
  const weiterleiten = () => abbruch.abort();
  signalNutzer?.addEventListener?.('abort', weiterleiten, { once: true });

  let antwort;
  try {
    antwort = await fetch(`${anbieter.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${anbieter.key}`,
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
      },
      body: JSON.stringify(anfrage),
      signal: abbruch.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    signalNutzer?.removeEventListener?.('abort', weiterleiten);
    const zeit = err?.name === 'AbortError';
    console.error(`[room404] ${anbieter.name} nicht erreichbar:`, err?.message || err);
    return { ok: false, status: zeit ? 408 : 503 };
  }
  clearTimeout(timer);

  if (!antwort.ok || !antwort.body) {
    signalNutzer?.removeEventListener?.('abort', weiterleiten);
    const details = await antwort.text().catch(() => '');
    console.error(`[room404] ${anbieter.name} Fehler ${antwort.status}: ${details.slice(0, 400)}`);
    return { ok: false, status: antwort.status };
  }

  // Manche Anbieter antworten trotz stream:true mit einem fertigen JSON.
  if ((antwort.headers.get('content-type') || '').includes('application/json')) {
    const paket = await antwort.json().catch(() => null);
    const text = paket?.choices?.[0]?.message?.content;
    if (typeof text === 'string' && text.trim()) return { ok: true, text, abbruch };
    signalNutzer?.removeEventListener?.('abort', weiterleiten);
    console.error(`[room404] ${anbieter.name} unerwartete Antwort:`, JSON.stringify(paket).slice(0, 400));
    return { ok: false, status: 502 };
  }

  return { ok: true, body: antwort.body, abbruch };
}

// ---------------------------------------------------------------- Anfrage bearbeiten

export async function bearbeiteAnfrage(request, env = process.env) {
  const e = einstellungen(env);

  // GET /api/chat = kurzer Statuscheck für dich beim Einrichten
  if (request.method === 'GET') {
    const { angebote } = await ladeWissen();
    return json(200, {
      ok: true,
      apiKeyGesetzt: e.kette.length > 0,
      anbieter: e.kette.map((a) => ({ name: a.name, modell: a.modell, pausiert: pausiert(a.id) })),
      tageslimit: e.tageslimit,
      platzhalterInAngeboten: ohneKommentare(angebote).includes('PLATZHALTER'),
    });
  }
  if (request.method !== 'POST') return json(405, { fehler: 'Nur POST erlaubt.' }, { Allow: 'GET, POST' });

  if (!e.kette.length) {
    console.error('[room404] Kein API-Key – GEMINI_API_KEY, OPENROUTER_API_KEY, GROQ_API_KEY oder AI_API_KEY eintragen.');
    return json(500, { fehler: 'Die KI ist noch nicht eingerichtet (kein API-Key hinterlegt).' });
  }

  let daten;
  try {
    const roh = await request.text();
    if (roh.length > MAX_BODY) return json(413, { fehler: 'Die Nachricht ist zu lang.' });
    daten = JSON.parse(roh);
  } catch {
    return json(400, { fehler: 'Ungültige Anfrage.' });
  }

  const nachrichten = bereinigeNachrichten(daten?.messages);
  if (!nachrichten) return json(400, { fehler: 'Keine Frage gefunden.' });

  const kennung = clientKennung(request);
  const limit = pruefeLimit(kennung, e.tageslimit);
  if (!limit.erlaubt) {
    return json(
      429,
      { fehler: `Du hast heute alle ${e.tageslimit} Fragen genutzt. Morgen geht's weiter!`, limitErreicht: true },
      { 'X-Limit-Remaining': '0' },
    );
  }

  const komplett = [{ role: 'system', content: bauePrompt(await ladeWissen()) }, ...nachrichten];
  const start = Date.now();
  let letzterStatus = 503;

  for (const anbieter of sortiert(e.kette)) {
    if (request.signal?.aborted) break;
    if (Date.now() - start > GESAMT_BUDGET_MS) break;

    const ergebnis = await frageAnbieter(anbieter, komplett, e, request.signal);
    if (!ergebnis.ok) {
      letzterStatus = ergebnis.status;
      pausieren(anbieter.id, ergebnis.status);
      continue;
    }

    pausen.delete(anbieter.id);
    const header = textHeader(limit.rest, anbieter);
    if (ergebnis.text) return new Response(ergebnis.text, { status: 200, headers: header });
    const quelle = mitFallback(textAusSse(ergebnis.body));
    return new Response(alsStream(quelle, () => ergebnis.abbruch.abort()), { status: 200, headers: header });
  }

  limitErstatten(kennung, e.tageslimit);
  return json(502, { fehler: fehlertext(letzterStatus) });
}
