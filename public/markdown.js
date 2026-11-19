// Kleiner, sicherer Markdown-Renderer für die KI-Antworten (ohne Zusatzpakete).
// Unterstützt: Überschriften, Absätze, fett/kursiv, Listen (auch verschachtelt),
// Links, Tabellen, Zitate, Code und Trennlinien. Alles wird vorher escaped.
(function (global) {
  'use strict';

  function escapeHtml(s) {
    return s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function sichereUrl(url) {
    const u = url.trim();
    return /^(https?:\/\/|mailto:)/i.test(u) ? u : null;
  }

  function link(url, inhaltHtml) {
    return `<a href="${escapeHtml(url)}" target="_blank" rel="noopener">${inhaltHtml}</a>`;
  }

  // fett, kursiv, durchgestrichen – auf bereits escaptem Text
  function formatiere(s) {
    return s
      .replace(/\*\*(?=\S)([\s\S]*?\S)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|[^*\w])\*(?=\S)([^*\n]*?\S)\*(?!\*)/g, '$1<em>$2</em>')
      .replace(/~~(?=\S)([\s\S]*?\S)~~/g, '<del>$1</del>');
  }

  function inline(text) {
    const ablage = [];
    const merke = (html) => `\u0000${ablage.push(html) - 1}\u0000`;
    let s = text;

    s = s.replace(/`([^`\n]+)`/g, (_, code) => merke(`<code>${escapeHtml(code)}</code>`));
    s = s.replace(/\[([^\]\n]+)\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g, (ganz, titel, ziel) => {
      const url = sichereUrl(ziel);
      return url ? merke(link(url, formatiere(escapeHtml(titel)))) : ganz;
    });
    s = s.replace(/\bhttps?:\/\/[^\s<>()[\]"'„“”]*[^\s<>()[\]"'„“”.,;:!?‚‘’]/g, (url) => merke(link(url, escapeHtml(url))));

    s = formatiere(escapeHtml(s));
    return s.replace(/\u0000(\d+)\u0000/g, (_, i) => ablage[Number(i)]);
  }

  const RE_LISTE = /^(\s*)([-*+•]|\d{1,3}[.)])\s+(.*)$/;
  const RE_TRENNER = /^\s*([-*_])(\s*\1){2,}\s*$/;
  const RE_UEBERSCHRIFT = /^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/;
  const RE_TABELLEN_LINIE = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;

  const einrueckung = (zeile) => zeile.replace(/\t/g, '    ').match(/^ */)[0].length;
  const zellen = (zeile) =>
    zeile
      .trim()
      .replace(/^\|/, '')
      .replace(/\|$/, '')
      .split('|')
      .map((z) => z.trim());

  function renderMarkdown(md) {
    const zeilen = String(md || '').replace(/\u0000/g, '').replace(/\r\n?/g, '\n').split('\n');
    let html = '';
    let absatz = [];
    const listen = []; // offene Listen: { typ, tiefe }
    let leerDavor = false;

    const absatzZu = () => {
      if (absatz.length) html += `<p>${absatz.map(inline).join('<br>')}</p>`;
      absatz = [];
    };
    const listenZu = () => {
      while (listen.length) html += `</li></${listen.pop().typ}>`;
    };
    const blockZu = () => {
      absatzZu();
      listenZu();
    };
    const listeAuf = (typ, tiefe, start) => {
      html += typ === 'ol' && start > 1 ? `<ol start="${start}" style="counter-reset: schritt ${start - 1}">` : `<${typ}>`;
      listen.push({ typ, tiefe });
    };

    for (let i = 0; i < zeilen.length; i++) {
      const zeile = zeilen[i];

      // Code-Block
      if (/^\s*```/.test(zeile)) {
        blockZu();
        const code = [];
        while (++i < zeilen.length && !/^\s*```/.test(zeilen[i])) code.push(zeilen[i]);
        html += `<pre><code>${escapeHtml(code.join('\n'))}</code></pre>`;
        leerDavor = false;
        continue;
      }

      if (!zeile.trim()) {
        absatzZu();
        leerDavor = true;
        continue;
      }

      if (RE_TRENNER.test(zeile)) {
        blockZu();
        html += '<hr>';
        leerDavor = false;
        continue;
      }

      const ueberschrift = zeile.match(RE_UEBERSCHRIFT);
      if (ueberschrift) {
        blockZu();
        const ebene = ueberschrift[1].length <= 2 ? 3 : ueberschrift[1].length === 3 ? 4 : 5;
        html += `<h${ebene}>${inline(ueberschrift[2])}</h${ebene}>`;
        leerDavor = false;
        continue;
      }

      if (/^\s*>/.test(zeile)) {
        blockZu();
        const zitat = [];
        while (i < zeilen.length && /^\s*>/.test(zeilen[i])) zitat.push(zeilen[i++].replace(/^\s*>\s?/, ''));
        i--;
        html += `<blockquote>${renderMarkdown(zitat.join('\n'))}</blockquote>`;
        leerDavor = false;
        continue;
      }

      if (zeile.includes('|') && i + 1 < zeilen.length && RE_TABELLEN_LINIE.test(zeilen[i + 1])) {
        blockZu();
        const kopf = zellen(zeile);
        i += 2;
        const reihen = [];
        while (i < zeilen.length && zeilen[i].includes('|') && zeilen[i].trim()) reihen.push(zellen(zeilen[i++]));
        i--;
        html += '<div class="tabelle"><table><thead><tr>';
        html += kopf.map((z) => `<th>${inline(z)}</th>`).join('');
        html += '</tr></thead><tbody>';
        html += reihen.map((r) => `<tr>${kopf.map((_, k) => `<td>${inline(r[k] || '')}</td>`).join('')}</tr>`).join('');
        html += '</tbody></table></div>';
        leerDavor = false;
        continue;
      }

      const punkt = zeile.match(RE_LISTE);
      if (punkt) {
        absatzZu();
        const tiefe = einrueckung(zeile);
        const typ = /\d/.test(punkt[2]) ? 'ol' : 'ul';
        const start = typ === 'ol' ? parseInt(punkt[2], 10) : 1;

        while (listen.length && tiefe < listen.at(-1).tiefe) html += `</li></${listen.pop().typ}>`;
        const oben = listen.at(-1);
        if (oben && tiefe >= oben.tiefe + 2) {
          listeAuf(typ, tiefe, start); // verschachtelte Liste im aktuellen Punkt
        } else if (oben && oben.typ !== typ) {
          html += `</li></${listen.pop().typ}>`;
          listeAuf(typ, tiefe, start);
        } else if (oben) {
          html += '</li>';
        } else {
          listeAuf(typ, tiefe, start);
        }
        const aufgabe = punkt[3].match(/^\[( |x|X)\]\s+(.*)$/);
        if (aufgabe) {
          const an = aufgabe[1] !== ' ';
          html += `<li class="aufgabe-statisch${an ? ' an' : ''}"><span class="kaestchen" aria-hidden="true"></span>${inline(aufgabe[2])}`;
        } else {
          html += `<li>${inline(punkt[3])}`;
        }
        leerDavor = false;
        continue;
      }

      // Fortsetzung eines Listenpunkts (eingerückt oder direkt darunter)
      if (listen.length && (einrueckung(zeile) >= 2 || !leerDavor)) {
        html += `${leerDavor ? '<br><br>' : '<br>'}${inline(zeile.trim())}`;
        leerDavor = false;
        continue;
      }

      listenZu();
      absatz.push(zeile.trim());
      leerDavor = false;
    }

    blockZu();
    return html;
  }

  global.renderMarkdown = renderMarkdown;
  global.renderInline = inline;
})(typeof window !== 'undefined' ? window : globalThis);
