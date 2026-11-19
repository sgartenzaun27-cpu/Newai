// Pläne zum Abhaken: erkennt ```plan-Blöcke in KI-Antworten und macht daraus Daten.
// Reine Funktionen ohne DOM – laufen im Browser und in den Tests.
(function (global) {
  'use strict';

  const RE_PLAN_START = /^\s*```\s*plan\b.*$/i;
  const RE_FENCE_ENDE = /^\s*```\s*$/;

  // Antwort in Teile zerlegen: normaler Text und Plan-Blöcke.
  function teileAntwort(text) {
    const zeilen = String(text || '').replace(/\r\n?/g, '\n').split('\n');
    const teile = [];
    let puffer = [];
    let imPlan = false;
    let imCode = false;

    const abschliessen = (typ, geschlossen) => {
      const inhalt = puffer.join('\n');
      if (typ === 'plan' || inhalt.trim()) teile.push({ typ, text: inhalt, geschlossen });
      puffer = [];
    };

    for (const zeile of zeilen) {
      if (imPlan) {
        if (RE_FENCE_ENDE.test(zeile)) {
          abschliessen('plan', true);
          imPlan = false;
        } else {
          puffer.push(zeile);
        }
        continue;
      }
      if (!imCode && RE_PLAN_START.test(zeile)) {
        abschliessen('md', true);
        imPlan = true;
        continue;
      }
      if (/^\s*```/.test(zeile)) imCode = !imCode; // andere Code-Blöcke nicht anfassen
      puffer.push(zeile);
    }
    abschliessen(imPlan ? 'plan' : 'md', !imPlan);
    return teile;
  }

  const ohneSterne = (s) => s.replace(/^\*\*(.+)\*\*$/, '$1').replace(/^__(.+)__$/, '$1').trim();

  function teileAufgabe(text) {
    const trenner = [' – ', ' — ', ' - ', ': '];
    let pos = -1;
    let laenge = 0;
    for (const t of trenner) {
      const p = text.indexOf(t);
      if (p > 0 && (pos === -1 || p < pos)) {
        pos = p;
        laenge = t.length;
      }
    }
    if (pos === -1) return { titel: ohneSterne(text), detail: '' };
    return { titel: ohneSterne(text.slice(0, pos)), detail: text.slice(pos + laenge).trim() };
  }

  function hash(text) {
    let h = 5381;
    for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
    return `p${(h >>> 0).toString(36)}`;
  }

  function parsePlan(text) {
    const plan = { titel: '', ziel: '', dauer: '', phasen: [], anzahl: 0, id: '' };
    let phase = null;
    const neuePhase = (titel) => {
      phase = { titel, aufgaben: [], notiz: '' };
      plan.phasen.push(phase);
    };

    for (const roh of String(text || '').split('\n')) {
      const zeile = roh.trim();
      if (!zeile) continue;
      let m;
      if ((m = zeile.match(/^#\s+(.+?)\s*#*$/)) && !plan.titel) {
        plan.titel = ohneSterne(m[1]);
      } else if ((m = zeile.match(/^#{2,6}\s+(.+?)\s*#*$/))) {
        neuePhase(ohneSterne(m[1]));
      } else if ((m = zeile.match(/^\**\s*ziel\s*\**\s*:\s*\**\s*(.+)$/i))) {
        plan.ziel = m[1].trim();
      } else if ((m = zeile.match(/^\**\s*(dauer|zeitraum)\s*\**\s*:\s*\**\s*(.+)$/i))) {
        plan.dauer = m[2].trim();
      } else if ((m = zeile.match(/^(?:[-*+•]|\d{1,2}[.)])\s+(?:\[( |x|X)\]\s*)?(.+)$/))) {
        if (!phase) neuePhase('');
        phase.aufgaben.push({ ...teileAufgabe(m[2].trim()), nr: plan.anzahl++, vorab: m[1] === 'x' || m[1] === 'X' });
      } else if (!plan.titel && !plan.phasen.length) {
        plan.titel = ohneSterne(zeile.replace(/^#+\s*/, ''));
      } else if (phase) {
        phase.notiz = phase.notiz ? `${phase.notiz} ${zeile}` : zeile;
      }
    }

    if (!plan.titel) plan.titel = 'Dein Plan';
    plan.phasen = plan.phasen.filter((p) => p.aufgaben.length || p.titel);
    const schluessel = [plan.titel, ...plan.phasen.flatMap((p) => p.aufgaben.map((a) => a.titel))].join('|');
    plan.id = hash(schluessel);
    return plan;
  }

  // Markdown-Links für den Text-Export auflösen: [Name](url) → Name (url)
  const ohneMarkdown = (s) =>
    s
      .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '$1 ($2)')
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/(^|[^*])\*([^*]+)\*/g, '$1$2');

  function planAlsText(plan, erledigt = new Set()) {
    const zeilen = [plan.titel];
    if (plan.ziel) zeilen.push(`Ziel: ${ohneMarkdown(plan.ziel)}`);
    if (plan.dauer) zeilen.push(`Dauer: ${ohneMarkdown(plan.dauer)}`);
    for (const phase of plan.phasen) {
      zeilen.push('');
      if (phase.titel) zeilen.push(ohneMarkdown(phase.titel));
      for (const a of phase.aufgaben) {
        const haken = erledigt.has(a.nr) ? '✓' : '○';
        zeilen.push(`${haken} ${ohneMarkdown(a.titel)}${a.detail ? ` – ${ohneMarkdown(a.detail)}` : ''}`);
      }
    }
    return zeilen.join('\n');
  }

  global.KIPlan = { teileAntwort, parsePlan, planAlsText };
})(typeof window !== 'undefined' ? window : globalThis);
