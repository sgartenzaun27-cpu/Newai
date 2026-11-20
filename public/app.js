// Chat-Logik von Room 404: Fragen senden, Antworten live anzeigen,
// Pläne zum Abhaken speichern und Empfehlungs-Karten zeigen.
(() => {
  'use strict';

  const C = Object.assign(
    {
      name: 'Room 404',
      signal: '404',
      ueberschrift: 'Diese Seite gibt es nicht.',
      fluestern: '',
      untertitel: '',
      startfragen: [],
      platzhalter: 'Frag Room 404 …',
      partner: [],
      utmQuelle: 'room404',
    },
    window.KI_CONFIG || {},
  );
  const P = window.KIPlan;

  const SPEICHER = 'business-ki:verlauf:v1';
  const LIMIT = 'business-ki:limit:v1';
  const PLAENE = 'business-ki:plaene:v1';
  const MAX_GESPEICHERT = 40;
  const MAX_MITSENDEN = 12;
  const UMFANG = 157.08; // 2π · 25 – Umfang des Fortschrittsrings

  const $ = (s, wurzel = document) => wurzel.querySelector(s);
  const el = {
    kopf: $('.kopf'),
    marke: $('.marke'),
    neu: $('.neu'),
    plaeneKnopf: $('.plaene-knopf'),
    zahl: $('.plaene-knopf .zahl'),
    start: $('.start'),
    signal: $('.signal-zahl'),
    lichtspalt: $('.lichtspalt'),
    fluestern: $('.fluestern'),
    titel: $('#start-titel'),
    text: $('.start-text'),
    vorschlaege: $('.vorschlaege'),
    verlauf: $('.verlauf'),
    form: $('.frage'),
    eingabe: $('#eingabe'),
    senden: $('.senden'),
    rest: $('.rest'),
    dialog: $('dialog.plaene'),
    dialogInhalt: $('.plaene-inhalt'),
    zurueck: $('.zurueck'),
    schliessen: $('.schliessen'),
  };

  const ICONS = {
    plan: '<path d="M9 6h11M9 12h11M9 18h11M4 6l1 1 2-2M4 12l1 1 2-2M4 18l1 1 2-2"/>',
    supplier: '<path d="M21 8 12 3 3 8l9 5 9-5zM3 8v8l9 5 9-5V8M12 13v8"/>',
    snipe: '<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2.5"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>',
    schild: '<path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z"/><path d="M9 12l2 2 4-4"/>',
    badge: '<path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9L12 3.5z"/>',
    shop: '<path d="M5 8h14l-1 12H6L5 8zM9 8V6a3 3 0 0 1 6 0v2"/>',
    pfeil: '<path d="M12 19V5M5.5 11.5 12 5l6.5 6.5"/>',
    stopp: '<rect x="7" y="7" width="10" height="10" rx="2" fill="currentColor" stroke="none"/>',
    kopieren: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h8"/>',
    weiter: '<path d="M9 6l6 6-6 6"/>',
  };
  const svg = (name) => `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] || ICONS.plan}</svg>`;

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
  let sitzung = 0; // wird bei "Neu" hochgezählt
  let hakenZaehler = 0;

  const verlaufSpeichern = () => speichern(SPEICHER, verlauf.slice(-MAX_GESPEICHERT));

  // ---------------------------------------------------------------- Pläne speichern

  const plaeneLaden = () => {
    const alle = laden(PLAENE, {});
    return alle && typeof alle === 'object' ? alle : {};
  };

  function plaeneSpeichern(alle) {
    speichern(PLAENE, alle);
    zahlAktualisieren();
  }

  function planMerken(plan) {
    if (!plan.anzahl) return;
    const alle = plaeneLaden();
    if (alle[plan.id]) return;
    const vorab = plan.phasen.flatMap((p) => p.aufgaben.filter((a) => a.vorab).map((a) => a.nr));
    alle[plan.id] = { plan, erledigt: vorab, erstellt: Date.now(), geaendert: Date.now() };
    plaeneSpeichern(alle);
  }

  const erledigteVon = (id) => new Set((plaeneLaden()[id] || {}).erledigt || []);

  function planUmschalten(plan, nr, an) {
    const alle = plaeneLaden();
    const eintrag = alle[plan.id] || (alle[plan.id] = { plan, erledigt: [], erstellt: Date.now() });
    const set = new Set(eintrag.erledigt);
    if (an) set.add(nr);
    else set.delete(nr);
    eintrag.erledigt = [...set];
    eintrag.geaendert = Date.now();
    plaeneSpeichern(alle);
    document.querySelectorAll(`.plan[data-plan-id="${plan.id}"]`).forEach((k) => k.dispatchEvent(new Event('aktualisieren')));
  }

  function zahlAktualisieren() {
    const n = Object.keys(plaeneLaden()).length;
    el.zahl.textContent = String(n);
    el.zahl.hidden = n === 0;
    el.plaeneKnopf.setAttribute('aria-label', n ? `Meine Pläne, ${n} gespeichert` : 'Meine Pläne');
  }

  // ---------------------------------------------------------------- Bausteine

  function ringHtml() {
    return `<div class="ring" role="img" aria-label="0 Prozent erledigt"><svg viewBox="0 0 58 58" aria-hidden="true"><circle class="spur" cx="29" cy="29" r="25"/><circle class="wert" cx="29" cy="29" r="25" stroke-dasharray="${UMFANG}" stroke-dashoffset="${UMFANG}"/></svg><span>0 %</span></div>`;
  }

  function ringSetzen(ring, anteil) {
    const prozent = Math.round(anteil * 100);
    ring.querySelector('.wert').style.strokeDashoffset = String(UMFANG * (1 - anteil));
    ring.querySelector('span').textContent = `${prozent} %`;
    ring.setAttribute('aria-label', `${prozent} Prozent erledigt`);
  }

  function partnerFuer(host) {
    return C.partner.find((p) => host === p.domain || host.endsWith(`.${p.domain}`));
  }

  // Links zu deinen Seiten bekommen eine Kennung, damit du in deinen Statistiken siehst, was die KI bringt.
  function linksVorbereiten(wurzel) {
    wurzel.querySelectorAll('a[href]').forEach((a) => {
      let url;
      try {
        url = new URL(a.getAttribute('href'));
      } catch {
        return;
      }
      const partner = partnerFuer(url.hostname.replace(/^www\./, ''));
      if (!partner) return;
      if (C.utmQuelle && !url.searchParams.has('utm_source')) {
        url.searchParams.set('utm_source', C.utmQuelle);
        url.searchParams.set('utm_medium', 'chat');
      }
      a.href = url.toString();
      a.dataset.partner = partner.domain;
    });
  }

  function empfehlungenAnhaengen(ziel) {
    const gesehen = new Map();
    ziel.querySelectorAll('a[data-partner]').forEach((a) => {
      if (!gesehen.has(a.dataset.partner)) gesehen.set(a.dataset.partner, a.href);
    });
    if (!gesehen.size) return;
    const box = document.createElement('div');
    box.className = 'empfehlungen';
    for (const [domain, href] of [...gesehen].slice(0, 3)) {
      const p = C.partner.find((x) => x.domain === domain);
      const karte = document.createElement('a');
      karte.className = 'empfehlung';
      karte.href = href;
      karte.target = '_blank';
      karte.rel = 'noopener';
      karte.innerHTML = '<span class="empfehlung-text"><strong></strong><span></span></span><span class="knopf-primaer"></span>';
      $('strong', karte).textContent = p.name;
      $('.empfehlung-text span', karte).textContent = p.text;
      $('.knopf-primaer', karte).textContent = p.knopf || 'Seite öffnen';
      box.append(karte);
    }
    ziel.append(box);
  }

  function planKarte(plan, { live = false, imDialog = false } = {}) {
    const karte = document.createElement('section');
    karte.className = `plan${live ? ' live' : ''}`;
    karte.dataset.planId = plan.id;
    karte.setAttribute('aria-label', `Plan: ${plan.titel}`);
    karte.innerHTML = `<div class="plan-kopf">${ringHtml()}<div><p class="plan-art">Plan zum Abhaken</p><h3 class="plan-titel"></h3></div></div>`;
    $('.plan-titel', karte).textContent = plan.titel;

    if (plan.ziel || plan.dauer) {
      const meta = document.createElement('div');
      meta.className = 'plan-meta';
      if (plan.ziel) meta.insertAdjacentHTML('beforeend', `<p><strong>Ziel:</strong> ${window.renderInline(plan.ziel)}</p>`);
      if (plan.dauer) meta.insertAdjacentHTML('beforeend', `<p><strong>Dauer:</strong> ${window.renderInline(plan.dauer)}</p>`);
      karte.append(meta);
    }

    const phasen = document.createElement('ol');
    phasen.className = 'phasen';
    plan.phasen.forEach((phase, i) => {
      const li = document.createElement('li');
      li.className = 'phase';
      li.innerHTML = '<div class="phase-kopf"><h4></h4><small></small></div>';
      $('h4', li).textContent = phase.titel || `Schritt ${i + 1}`;
      if (phase.notiz) li.insertAdjacentHTML('beforeend', `<p class="phase-notiz">${window.renderInline(phase.notiz)}</p>`);
      const liste = document.createElement('ul');
      liste.className = 'aufgaben';
      for (const aufgabe of phase.aufgaben) {
        const id = `haken-${++hakenZaehler}`;
        const zeile = document.createElement('li');
        zeile.className = 'aufgabe';
        zeile.dataset.nr = String(aufgabe.nr);
        zeile.innerHTML = `<input class="haken" type="checkbox" id="${id}"${live ? ' disabled' : ''}><div><label class="aufgabe-titel" for="${id}">${window.renderInline(aufgabe.titel)}</label>${aufgabe.detail ? `<p class="aufgabe-detail">${window.renderInline(aufgabe.detail)}</p>` : ''}</div>`;
        $('input', zeile).addEventListener('change', (e) => planUmschalten(plan, aufgabe.nr, e.target.checked));
        liste.append(zeile);
      }
      li.append(liste);
      phasen.append(li);
    });
    karte.append(phasen);

    const fuss = document.createElement('div');
    fuss.className = 'plan-fuss';
    if (live) {
      fuss.innerHTML = '<p>Plan wird erstellt …</p>';
    } else {
      fuss.innerHTML = `<button class="knopf-zweit kopieren" type="button">${svg('kopieren')}<span>Kopieren</span></button>`;
      if (!imDialog) {
        fuss.insertAdjacentHTML('beforeend', '<button class="knopf-text oeffnen" type="button">In „Meine Pläne“ öffnen</button>');
        $('.oeffnen', fuss).addEventListener('click', () => plaeneOeffnen(plan.id));
      }
      $('.kopieren', fuss).addEventListener('click', (e) => planKopieren(plan, e.currentTarget));
    }
    karte.append(fuss);

    karte.addEventListener('aktualisieren', () => karteAktualisieren(karte, plan));
    karteAktualisieren(karte, plan);
    linksVorbereiten(karte);
    return karte;
  }

  function karteAktualisieren(karte, plan) {
    const erledigt = erledigteVon(plan.id);
    let fertig = 0;
    karte.querySelectorAll('.aufgabe').forEach((zeile) => {
      const an = erledigt.has(Number(zeile.dataset.nr));
      if (an) fertig++;
      zeile.classList.toggle('erledigt', an);
      $('input', zeile).checked = an;
    });
    karte.querySelectorAll('.phase').forEach((phase) => {
      const zeilen = phase.querySelectorAll('.aufgabe');
      const fertigHier = phase.querySelectorAll('.aufgabe.erledigt').length;
      $('small', phase).textContent = zeilen.length ? `${fertigHier}/${zeilen.length}` : '';
    });
    const alle = plan.anzahl;
    const geschafft = alle > 0 && fertig === alle && !karte.classList.contains('live');
    ringSetzen($('.ring', karte), alle ? fertig / alle : 0);
    karte.classList.toggle('geschafft', geschafft);
    $('.plan-art', karte).textContent = geschafft
      ? 'Alles erledigt. Stark!'
      : fertig
        ? `${fertig} von ${alle} erledigt`
        : 'Plan zum Abhaken';
  }

  async function planKopieren(plan, knopf) {
    const text = P.planAlsText(plan, erledigteVon(plan.id));
    let ok = false;
    try {
      await navigator.clipboard.writeText(text);
      ok = true;
    } catch {
      const feld = document.createElement('textarea');
      feld.value = text;
      feld.setAttribute('readonly', '');
      feld.style.position = 'fixed';
      feld.style.opacity = '0';
      document.body.append(feld);
      feld.select();
      try {
        ok = document.execCommand('copy');
      } catch {
        ok = false;
      }
      feld.remove();
    }
    const beschriftung = $('span', knopf);
    beschriftung.textContent = ok ? 'Kopiert' : 'Kopieren ging nicht';
    setTimeout(() => {
      beschriftung.textContent = 'Kopieren';
    }, 2000);
  }

  // ---------------------------------------------------------------- Meine Pläne

  function plaeneOeffnen(id) {
    if (id) planZeigen(id);
    else planListeZeigen();
    if (!el.dialog.open) el.dialog.showModal();
  }

  function planListeZeigen() {
    el.zurueck.hidden = true;
    const eintraege = Object.entries(plaeneLaden()).sort((a, b) => (b[1].geaendert || 0) - (a[1].geaendert || 0));

    if (!eintraege.length) {
      el.dialogInhalt.innerHTML =
        '<div class="leer"><strong>Noch keine Pläne.</strong><p>Frag die KI nach einem Plan, zum Beispiel für deinen Vintage-Start. Er landet automatisch hier.</p><button class="knopf-primaer" type="button">Plan anfragen</button></div>';
      $('.knopf-primaer', el.dialogInhalt).addEventListener('click', () => {
        el.dialog.close();
        const erste = vorschlaege()[0];
        fragen(erste ? erste.frage : 'Wie fange ich mit Vintage Reselling an? Gib mir einen Plan zum Abhaken.');
      });
      return;
    }

    const liste = document.createElement('ul');
    liste.className = 'plan-liste';
    for (const [id, eintrag] of eintraege) {
      const plan = eintrag.plan;
      const fertig = (eintrag.erledigt || []).length;
      const li = document.createElement('li');
      li.innerHTML = `<button class="plan-eintrag" type="button">${ringHtml()}<span><strong></strong><small></small></span>${svg('weiter')}</button>`;
      $('strong', li).textContent = plan.titel;
      $('small', li).textContent = fertig >= plan.anzahl ? 'Alles erledigt' : `${fertig} von ${plan.anzahl} erledigt`;
      ringSetzen($('.ring', li), plan.anzahl ? Math.min(fertig / plan.anzahl, 1) : 0);
      $('button', li).addEventListener('click', () => planZeigen(id));
      liste.append(li);
    }
    el.dialogInhalt.replaceChildren(liste);
  }

  function planZeigen(id) {
    const eintrag = plaeneLaden()[id];
    if (!eintrag) {
      planListeZeigen();
      return;
    }
    el.zurueck.hidden = false;
    const loeschen = document.createElement('div');
    loeschen.className = 'loeschen';
    const frage = () => {
      loeschen.innerHTML = '<button class="knopf-text" type="button">Plan löschen</button>';
      $('button', loeschen).addEventListener('click', bestaetigen);
    };
    const bestaetigen = () => {
      loeschen.innerHTML =
        '<span>Wirklich löschen?</span><button class="knopf-primaer" type="button">Löschen</button><button class="knopf-text abbrechen" type="button">Abbrechen</button>';
      $('.knopf-primaer', loeschen).addEventListener('click', () => {
        const alle = plaeneLaden();
        delete alle[id];
        plaeneSpeichern(alle);
        document.querySelectorAll(`.plan[data-plan-id="${id}"]`).forEach((k) => k.dispatchEvent(new Event('aktualisieren')));
        planListeZeigen();
      });
      $('.abbrechen', loeschen).addEventListener('click', frage);
    };
    frage();
    el.dialogInhalt.replaceChildren(planKarte(eintrag.plan, { imDialog: true }), loeschen);
    el.dialogInhalt.scrollTop = 0;
  }

  el.plaeneKnopf.addEventListener('click', () => plaeneOeffnen());
  el.zurueck.addEventListener('click', planListeZeigen);
  el.schliessen.addEventListener('click', () => el.dialog.close());
  el.dialog.addEventListener('click', (e) => {
    if (e.target === el.dialog) el.dialog.close();
  });

  // ---------------------------------------------------------------- Aufbau

  document.title = C.name;
  const markeTeile = C.name.match(/^(.*?)\s*(\d+)$/);
  if (markeTeile) {
    const wort = document.createElement('span');
    wort.textContent = markeTeile[1];
    const zahl = document.createElement('span');
    zahl.className = 'marke-zahl';
    zahl.textContent = markeTeile[2];
    el.marke.replaceChildren(wort, zahl);
  } else {
    el.marke.textContent = C.name;
  }

  const ueberschrift = [C.ueberschrift, C.ueberschriftKursiv].filter(Boolean).join(' ');
  el.signal.textContent = C.signal || '';
  el.signal.parentElement.hidden = !C.signal;
  el.lichtspalt.hidden = !C.signal;
  el.titel.textContent = ueberschrift;
  el.fluestern.textContent = C.fluestern || '';
  el.fluestern.hidden = !C.fluestern;
  el.text.textContent = C.untertitel;
  el.eingabe.placeholder = C.platzhalter;

  // Der eine große Moment beim Betreten: die 404 geht an, die Überschrift tippt sich wie in einem Terminal.
  function eingangAnimieren() {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    el.signal.classList.add('an');
    if (C.fluestern) el.fluestern.classList.add('wartet');
    el.titel.style.minHeight = `${el.titel.offsetHeight}px`; // Platz für den fertigen Text freihalten
    el.titel.setAttribute('aria-label', ueberschrift);
    el.titel.textContent = '';
    setTimeout(() => eintippen(el.titel, ueberschrift), 250);
  }

  function eintippen(ziel, text, dauer = 950) {
    const start = performance.now();
    const schritt = (jetzt) => {
      const anteil = Math.min((jetzt - start) / dauer, 1);
      ziel.textContent = text.slice(0, Math.round(text.length * anteil));
      if (anteil < 1) {
        ziel.insertAdjacentHTML('beforeend', '<span class="cursor" aria-hidden="true"></span>');
        requestAnimationFrame(schritt);
      } else {
        ziel.textContent = text;
        ziel.removeAttribute('aria-label');
        ziel.style.minHeight = '';
        el.fluestern.classList.add('zeigen');
        el.fluestern.classList.remove('wartet');
      }
    };
    requestAnimationFrame(schritt);
  }

  function vorschlaege() {
    return (C.startfragen || []).map((f) => (typeof f === 'string' ? { titel: f, frage: f, icon: 'plan' } : f));
  }

  for (const v of vorschlaege()) {
    const li = document.createElement('li');
    li.innerHTML = `<button type="button"><span class="symbol">${svg(v.icon)}</span><span></span></button>`;
    $('button > span:last-child', li).textContent = v.titel;
    $('button', li).addEventListener('click', () => fragen(v.frage || v.titel));
    el.vorschlaege.append(li);
  }

  function frageBlase(text) {
    const div = document.createElement('div');
    div.className = 'frage-blase';
    div.textContent = text;
    el.verlauf.append(div);
    return div;
  }

  function antwortFeld() {
    const art = document.createElement('article');
    art.className = 'antwort';
    el.verlauf.append(art);
    return art;
  }

  function zeigeAntwort(ziel, text, fertig) {
    const stueck = document.createDocumentFragment();
    for (const teil of P.teileAntwort(text)) {
      if (teil.typ === 'plan') {
        const plan = P.parsePlan(teil.text);
        if (fertig) planMerken(plan);
        stueck.append(planKarte(plan, { live: !fertig }));
      } else {
        const div = document.createElement('div');
        div.className = 'md';
        div.innerHTML = window.renderMarkdown(teil.text);
        linksVorbereiten(div);
        stueck.append(div);
      }
    }
    ziel.replaceChildren(stueck);
    if (fertig) empfehlungenAnhaengen(ziel);
  }

  function modus() {
    const leer = el.verlauf.children.length === 0;
    el.start.hidden = !leer;
    el.neu.hidden = leer;
  }

  for (const m of verlauf) {
    if (m.role === 'user') frageBlase(m.content);
    else zeigeAntwort(antwortFeld(), m.content, true);
  }
  modus();
  zahlAktualisieren();
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  if (verlauf.length) {
    requestAnimationFrame(nachUnten);
  } else {
    window.scrollTo(0, 0);
    eingangAnimieren();
  }

  window.addEventListener(
    'scroll',
    () => {
      el.kopf.classList.toggle('mit-linie', window.scrollY > 4);
    },
    { passive: true },
  );

  // ---------------------------------------------------------------- Tageslimit

  function zeigeRest(rest) {
    if (typeof rest !== 'number' || Number.isNaN(rest)) return;
    speichern(LIMIT, { tag: heute(), rest });
    limitErreicht = rest <= 0;
    el.rest.textContent =
      rest <= 0
        ? 'Für heute sind alle Fragen aufgebraucht. Morgen geht’s weiter.'
        : rest === 1
          ? 'Kostenlos – noch 1 Frage heute'
          : `Kostenlos – noch ${rest} Fragen heute`;
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
      el.senden.innerHTML = svg('stopp');
      el.senden.setAttribute('aria-label', 'Antwort stoppen');
      el.senden.disabled = false;
      return;
    }
    el.senden.innerHTML = svg('pfeil');
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
    return window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 160;
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
    const blase = frageBlase(text);
    el.eingabe.value = '';
    groesse();
    modus();
    anfragen(blase);
  }

  function fehlerZeigen(ziel, nachricht, nochmal) {
    ziel.className = 'antwort fehler';
    ziel.replaceChildren();
    const p = document.createElement('p');
    p.textContent = nachricht;
    ziel.append(p);
    if (!nochmal) return;
    const knopfNochmal = document.createElement('button');
    knopfNochmal.type = 'button';
    knopfNochmal.className = 'knopf-primaer';
    knopfNochmal.textContent = 'Nochmal senden';
    knopfNochmal.addEventListener('click', () => {
      if (laufend || limitErreicht) return;
      ziel.remove();
      anfragen(null);
    });
    ziel.append(knopfNochmal);
  }

  async function anfragen(blase) {
    const meineSitzung = sitzung;
    const aktuell = () => meineSitzung === sitzung;

    const ziel = antwortFeld();
    ziel.setAttribute('aria-busy', 'true');
    ziel.innerHTML = '<div class="tippen" aria-hidden="true"><i></i><i></i><i></i></div><span class="unsichtbar">Schreibt …</span>';
    nachUnten();

    const steuerung = new AbortController();
    laufend = steuerung;
    knopf();

    let text = '';
    let geplant = 0; // ID des vorgemerkten Zeichnens
    let abgeschlossen = false;
    const malen = () => {
      geplant = 0;
      if (abgeschlossen || !aktuell() || !text) return;
      const unten = untenNah();
      zeigeAntwort(ziel, text, false);
      if (unten) nachUnten();
    };

    const fertig = () => {
      abgeschlossen = true; // ein noch vorgemerktes Zeichnen darf die fertige Antwort nicht überschreiben
      if (geplant) cancelAnimationFrame(geplant);
      const unten = untenNah();
      zeigeAntwort(ziel, text, true);
      if (unten) nachUnten(); // Empfehlungs-Karten sichtbar machen
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
        if (!geplant) geplant = requestAnimationFrame(malen);
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
          const letzteBlase = blase || [...el.verlauf.querySelectorAll('.frage-blase')].pop();
          if (letzteBlase) letzteBlase.remove();
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
