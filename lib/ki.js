// Herzstück der Business-KI: baut den Prompt aus dem Ordner /wissen, ruft das
// KI-Modell auf und streamt die Antwort als reinen Text an den Browser zurück.
//
// Einstellungen kommen aus Umgebungsvariablen (Vercel: Settings → Environment Variables):
//   AI_API_KEY           Pflicht. Dein API-Key (z. B. von openrouter.ai)
//   AI_BASE_URL          Optional. Standard: https://openrouter.ai/api/v1
//                        (jede OpenAI-kompatible Schnittstelle funktioniert)
//   AI_MODEL             Optional. Standard: google/gemini-3.5-flash-lite
//   AI_MAX_TOKENS        Optional. Maximale Antwortlänge in Tokens. Standard: 2000
//   AI_REASONING_EFFORT  Optional, nur bei OpenRouter: low | medium | high | off. Standard: low
//   DAILY_LIMIT          Optional. Fragen pro Nutzer und Tag. Standard: 20 (0 = kein Limit)

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const WISSEN_DATEIEN = ['anweisungen.md', 'angebote.md', 'wissen.md'];

const MAX_NACHRICHTEN = 12; // so viel Verlauf geht pro Frage mit an die KI
const MAX_ZEICHEN = 4000; // pro Nachricht
const MAX_BODY = 100_000; // Zeichen pro Anfrage
const VERBINDUNGS_TIMEOUT_MS = 30_000; // so lange warten wir auf den Antwortbeginn

// ---------------------------------------------------------------- Einstellungen

export function einstellungen(env = process.env) {
  return {
    apiKey: (env.AI_API_KEY || '').trim(),
    baseUrl: (env.AI_BASE_URL || 'https://openrouter.ai/api/v1').trim().replace(/\/+$/, ''),
    model: (env.AI_MODEL || 'google/gemini-3.5-flash-lite').trim(),
    maxTokens: ganzzahl(env.AI_MAX_TOKENS, 2000),
    reasoning: (env.AI_REASONING_EFFORT || 'low').trim().toLowerCase(),
    tageslimit: ganzzahl(env.DAILY_LIMIT, 20),
  };
}

function ganzzahl(wert, standard) {
  const n = Number.parseInt(wert, 10);
  return Number.isFinite(n) && n >= 0 ? n : standard;
}

const istOpenRouter = (url) => /openrouter\.ai/i.test(url);

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
  console.warn(`[business-ki] Wissensdatei nicht gefunden: ${name}`);
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
    ohneKommentare(anweisungen) || 'Du bist eine hilfreiche Business-KI. Antworte auf Deutsch.',
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

// Wenn die KI gar nicht geantwortet hat, zählt die Frage nicht.
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

function textHeader(rest) {
  const header = {
    'Content-Type': 'text/plain; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Accel-Buffering': 'no',
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
    console.error('[business-ki] Fehler im Stream:', JSON.stringify(paket.error).slice(0, 500));
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
        if (err?.name !== 'AbortError') console.error('[business-ki] Stream-Fehler:', err?.message || err);
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

// ---------------------------------------------------------------- Anfrage bearbeiten

export async function bearbeiteAnfrage(request, env = process.env) {
  const e = einstellungen(env);

  // GET /api/chat = kurzer Statuscheck für dich beim Einrichten
  if (request.method === 'GET') {
    const { angebote } = await ladeWissen();
    return json(200, {
      ok: true,
      apiKeyGesetzt: Boolean(e.apiKey),
      modell: e.model,
      tageslimit: e.tageslimit,
      platzhalterInAngeboten: angebote.includes('PLATZHALTER'),
    });
  }
  if (request.method !== 'POST') return json(405, { fehler: 'Nur POST erlaubt.' }, { Allow: 'GET, POST' });

  if (!e.apiKey) {
    console.error('[business-ki] AI_API_KEY fehlt – in den Umgebungsvariablen eintragen.');
    return json(500, { fehler: 'Die KI ist noch nicht eingerichtet (AI_API_KEY fehlt).' });
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

  const anfrage = {
    model: e.model,
    messages: [{ role: 'system', content: bauePrompt(await ladeWissen()) }, ...nachrichten],
    stream: true,
    max_tokens: e.maxTokens,
  };
  if (istOpenRouter(e.baseUrl) && e.reasoning && e.reasoning !== 'off') {
    anfrage.reasoning = { effort: e.reasoning, exclude: true };
  }

  const abbruch = new AbortController();
  const timer = setTimeout(() => abbruch.abort(), VERBINDUNGS_TIMEOUT_MS);
  request.signal?.addEventListener?.('abort', () => abbruch.abort(), { once: true });

  let antwort;
  try {
    antwort = await fetch(`${e.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${e.apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
      },
      body: JSON.stringify(anfrage),
      signal: abbruch.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    limitErstatten(kennung, e.tageslimit);
    console.error('[business-ki] KI nicht erreichbar:', err?.message || err);
    return json(504, { fehler: fehlertext(err?.name === 'AbortError' ? 408 : 503) });
  }
  clearTimeout(timer);

  if (!antwort.ok || !antwort.body) {
    const details = await antwort.text().catch(() => '');
    console.error(`[business-ki] KI-Fehler ${antwort.status}: ${details.slice(0, 500)}`);
    limitErstatten(kennung, e.tageslimit);
    return json(502, { fehler: fehlertext(antwort.status) });
  }

  // Manche Anbieter antworten trotz stream:true mit einem fertigen JSON.
  if ((antwort.headers.get('content-type') || '').includes('application/json')) {
    const paket = await antwort.json().catch(() => null);
    const text = paket?.choices?.[0]?.message?.content;
    if (typeof text === 'string' && text.trim()) {
      return new Response(text, { status: 200, headers: textHeader(limit.rest) });
    }
    console.error('[business-ki] Unerwartete Antwort:', JSON.stringify(paket).slice(0, 500));
    limitErstatten(kennung, e.tageslimit);
    return json(502, { fehler: fehlertext(502) });
  }

  const quelle = mitFallback(textAusSse(antwort.body));
  return new Response(alsStream(quelle, () => abbruch.abort()), { status: 200, headers: textHeader(limit.rest) });
}
