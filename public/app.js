// Chat-Logik der Business-KI: Fragen senden, Antwort live anzeigen, Verlauf merken.
(() => {
  'use strict';

  const C = Object.assign(
    {
      name: 'Business-KI',
      ueberschrift: 'Was willst du verkaufen?',
      untertitel: '',
      startfragen: [],
      platzhalter: 'Deine Frage …',
    },
    window.KI_CONFIG || {},
  );

  const SPEICHER = 'business-ki:verlauf:v1';
  const LIMIT = 'business-ki:limit:v1';
  const MAX_GESPEICHERT = 40;
  const MAX_MITSENDEN = 12;

  const $ = (s) => document.querySelector(s);
  const el = {
    marke: $('.marke'),
    neu: $('.neu'),
    start: $('.start'),
    titel: $('#start-titel'),
    text: $('.start-text'),
    anhaenger: $('.anhaenger'),
    verlauf: $('.verlauf'),
    form: $('.frage'),
    eingabe: $('#eingabe'),
    senden: $('.senden'),
    rest: $('.rest'),
  };

  const ICON_SENDEN =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19V5M5.5 11.5 12 5l6.5 6.5" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const ICON_STOPP =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6.5" y="6.5" width="11" height="11" rx="2" fill="currentColor"/></svg>';

  // ---------------------------------------------------------------- Speicher

  function laden(schluessel, standard) {
    try {
      const wert = localStorage.getItem(schluessel);
      return wert ? JSON.parse(wert) : standard;
    } catch {
      return standard;
    }
  }

  function speichern(schluessel, wert) {
    try {
      localStorage.setItem(schluessel, JSON.stringify(wert));
    } catch {
      // privater Modus o. Ä. – dann eben ohne Speichern
    }
  }

  function heute() {
    const d = new Date();
    return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
  }

  let verlauf = laden(SPEICHER, []).filter(
    (m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string',
  );
  let laufend = null; // AbortController, solange eine Antwort kommt
  let limitErreicht = false;
  let sitzung = 0; // wird bei "Neuer Chat" hochgezählt

  const verlaufSpeichern = () => speichern(SPEICHER, verlauf.slice(-MAX_GESPEICHERT));

  // ---------------------------------------------------------------- Aufbau

  document.title = C.name;
  el.marke.textContent = C.name;
  el.titel.textContent = C.ueberschrift;
  el.text.textContent = C.untertitel;
  el.eingabe.placeholder = C.platzhalter;

  C.startfragen.forEach((frage, i) => {
    const li = document.createElement('li');
    li.style.setProperty('--i', i);
    const knopf = document.createElement('button');
    knopf.type = 'button';
    knopf.textContent = frage;
    knopf.addEventListener('click', () => fragen(frage));
    li.append(knopf);
    el.anhaenger.append(li);
  });

  function notiz(text) {
    const div = document.createElement('div');
    div.className = 'notiz';
    div.textContent = text;
    el.verlauf.append(div);
    return div;
  }

  function etikett() {
    const art = document.createElement('article');
    art.className = 'antwort';
    el.verlauf.append(art);
    return art;
  }

  function zeigeAntwort(ziel, text) {
    ziel.innerHTML = window.renderMarkdown(text);
  }

  function modus() {
    const leer = el.verlauf.children.length === 0;
    el.start.hidden = !leer;
    el.neu.hidden = leer;
  }

  for (const m of verlauf) {
    if (m.role === 'user') notiz(m.content);
    else zeigeAntwort(etikett(), m.content);
  }
  modus();
  if (verlauf.length) requestAnimationFrame(nachUnten);

  // ---------------------------------------------------------------- Tageslimit

  function zeigeRest(rest) {
    if (typeof rest !== 'number' || Number.isNaN(rest)) return;
    speichern(LIMIT, { tag: heute(), rest });
    limitErreicht = rest <= 0;
    el.rest.textContent =
      rest <= 0
        ? 'Für heute sind alle Fragen aufgebraucht. Morgen geht’s weiter.'
        : rest === 1
          ? 'Noch 1 Frage heute'
          : `Noch ${rest} Fragen heute`;
    el.eingabe.disabled = limitErreicht;
    el.eingabe.placeholder = limitErreicht ? 'Morgen geht’s weiter' : C.platzhalter;
    knopf();
  }

  const gemerkt = laden(LIMIT, null);
  if (gemerkt && gemerkt.tag === heute()) {
    zeigeRest(gemerkt.rest);
  } else {
    fetch('/api/chat')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d && d.tageslimit > 0) zeigeRest(d.tageslimit);
      })
      .catch(() => {});
  }

  // ---------------------------------------------------------------- Eingabe

  function knopf() {
    if (laufend) {
      el.senden.innerHTML = ICON_STOPP;
      el.senden.setAttribute('aria-label', 'Antwort stoppen');
      el.senden.disabled = false;
      return;
    }
    el.senden.innerHTML = ICON_SENDEN;
    el.senden.setAttribute('aria-label', 'Frage senden');
    el.senden.disabled = limitErreicht || !el.eingabe.value.trim();
  }

  function groesse() {
    el.eingabe.style.height = 'auto';
    el.eingabe.style.height = `${Math.min(el.eingabe.scrollHeight, 160)}px`;
    knopf();
  }

  el.eingabe.addEventListener('input', groesse);

  el.eingabe.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || e.shiftKey || e.isComposing) return;
    e.preventDefault();
    if (!laufend) fragen(el.eingabe.value);
  });

  el.form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (laufend) laufend.abort();
    else fragen(el.eingabe.value);
  });

  el.neu.addEventListener('click', () => {
    sitzung++;
    if (laufend) laufend.abort();
    verlauf = [];
    verlaufSpeichern();
    el.verlauf.replaceChildren();
    modus();
    window.scrollTo(0, 0);
  });

  function untenNah() {
    return window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 140;
  }

  function nachUnten() {
    window.scrollTo(0, document.documentElement.scrollHeight);
  }

  // ---------------------------------------------------------------- Fragen & Antworten

  function fragen(roh) {
    const text = String(roh || '').trim();
    if (!text || laufend || limitErreicht) return;
    verlauf.push({ role: 'user', content: text });
    verlaufSpeichern();
    const frageEl = notiz(text);
    el.eingabe.value = '';
    groesse();
    modus();
    anfragen(frageEl);
  }

  function fehlerZeigen(ziel, nachricht, nochmal) {
    ziel.classList.add('fehler');
    ziel.replaceChildren();
    const p = document.createElement('p');
    p.textContent = nachricht;
    ziel.append(p);
    if (!nochmal) return;
    const knopfNochmal = document.createElement('button');
    knopfNochmal.type = 'button';
    knopfNochmal.className = 'nochmal';
    knopfNochmal.textContent = 'Nochmal senden';
    knopfNochmal.addEventListener('click', () => {
      if (laufend || limitErreicht) return;
      ziel.remove();
      anfragen(null);
    });
    ziel.append(knopfNochmal);
  }

  async function anfragen(frageEl) {
    const meineSitzung = sitzung;
    const aktuell = () => meineSitzung === sitzung;

    const ziel = etikett();
    ziel.setAttribute('aria-busy', 'true');
    ziel.innerHTML = '<p class="schreibt">Schreibt …</p>';
    nachUnten();

    const steuerung = new AbortController();
    laufend = steuerung;
    knopf();

    let text = '';
    let gemalt = false;
    const malen = () => {
      gemalt = false;
      if (!aktuell() || !text) return;
      const unten = untenNah();
      zeigeAntwort(ziel, text);
      if (unten) nachUnten();
    };

    const fertig = () => {
      zeigeAntwort(ziel, text);
      verlauf.push({ role: 'assistant', content: text });
      verlaufSpeichern();
    };

    try {
      const antwort = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: verlauf.slice(-MAX_MITSENDEN) }),
        signal: steuerung.signal,
      });

      if (!antwort.ok) {
        const daten = await antwort.json().catch(() => ({}));
        if (!aktuell()) return;
        if (daten.limitErreicht) {
          verlauf.pop(); // unbeantwortete Frage nicht speichern
          verlaufSpeichern();
          fehlerZeigen(ziel, daten.fehler, false);
          zeigeRest(0);
        } else {
          fehlerZeigen(ziel, daten.fehler || `Da ist etwas schiefgelaufen (Fehler ${antwort.status}).`, true);
        }
        return;
      }

      const rest = antwort.headers.get('X-Limit-Remaining');
      if (rest !== null) zeigeRest(Number(rest));

      const leser = antwort.body.getReader();
      const decoder = new TextDecoder();
      for (;;) {
        const { value, done } = await leser.read();
        if (done) break;
        text += decoder.decode(value, { stream: true });
        if (!gemalt) {
          gemalt = true;
          requestAnimationFrame(malen);
        }
      }
      text += decoder.decode();
      if (aktuell()) fertig();
    } catch (err) {
      if (!aktuell()) return;
      if (err && err.name === 'AbortError') {
        if (text.trim()) {
          text += ' …';
          fertig();
        } else {
          // Gestoppt, bevor etwas kam: Frage zurück ins Eingabefeld
          ziel.remove();
          const frage = verlauf.pop();
          verlaufSpeichern();
          const notizEl = frageEl || el.verlauf.querySelector('div.notiz:last-of-type');
          if (notizEl) notizEl.remove();
          if (frage) el.eingabe.value = frage.content;
          groesse();
          modus();
        }
      } else if (text.trim()) {
        text += '\n\n⚠️ Die Verbindung wurde unterbrochen.';
        fertig();
      } else {
        fehlerZeigen(ziel, 'Keine Verbindung. Prüf dein Internet und versuch es nochmal.', true);
      }
    } finally {
      if (laufend === steuerung) laufend = null;
      ziel.removeAttribute('aria-busy');
      knopf();
    }
  }

  knopf();
})();
