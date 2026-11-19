// Tests für den Markdown-Renderer der Chat-Seite (public/markdown.js)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const kontext = { window: {} };
vm.runInNewContext(readFileSync(new URL('../public/markdown.js', import.meta.url), 'utf8'), kontext);
const md = kontext.window.renderMarkdown;

test('escaped HTML und gefährliche Links', () => {
  assert.equal(md('<script>alert(1)</script>'), '<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>');
  assert.doesNotMatch(md('[klick](javascript:alert(1))'), /<a /);
  const angriff = md('[x](https://a.de/"onmouseover="alert(1))');
  assert.doesNotMatch(angriff, /onmouseover="/);
  assert.equal(md('a\u0000b'), '<p>ab</p>');
});

test('fett, kursiv und Gendersternchen', () => {
  assert.equal(md('**fett** und *kursiv*'), '<p><strong>fett</strong> und <em>kursiv</em></p>');
  assert.equal(md('Kund*innen und Verkäufer*innen'), '<p>Kund*innen und Verkäufer*innen</p>');
  assert.equal(md('5 * 3 = 15'), '<p>5 * 3 = 15</p>');
  assert.equal(md('**noch offen'), '<p>**noch offen</p>', 'halbfertiger Stream darf nicht kaputtgehen');
});

test('Links werden sicher und klickbar', () => {
  assert.equal(
    md('Hol dir die [Liste](https://example.com/liste).'),
    '<p>Hol dir die <a href="https://example.com/liste" target="_blank" rel="noopener">Liste</a>.</p>',
  );
  assert.equal(
    md('Schau auf https://shop.de/x.'),
    '<p>Schau auf <a href="https://shop.de/x" target="_blank" rel="noopener">https://shop.de/x</a>.</p>',
  );
  assert.match(md('[**fette Liste**](https://example.com)'), /<a [^>]+><strong>fette Liste<\/strong><\/a>/);
  assert.equal(md('`<b>`'), '<p><code>&lt;b&gt;</code></p>');
});

test('Überschriften, Absätze, Trennlinie, Zitat, Code', () => {
  assert.equal(md('## Titel'), '<h3>Titel</h3>');
  assert.equal(md('### Unter'), '<h4>Unter</h4>');
  assert.equal(md('a\nb\n\nc'), '<p>a<br>b</p><p>c</p>');
  assert.equal(md('---'), '<hr>');
  assert.equal(md('> Zitat'), '<blockquote><p>Zitat</p></blockquote>');
  assert.equal(md('```\n<b>\n```'), '<pre><code>&lt;b&gt;</code></pre>');
});

test('Listen: nummeriert, Fortsetzung, verschachtelt, Startnummer', () => {
  assert.equal(
    md('1. **Eins**\n   Erklärung\n   - Unterpunkt\n2. Zwei'),
    '<ol><li><strong>Eins</strong><br>Erklärung<ul><li>Unterpunkt</li></ul></li><li>Zwei</li></ol>',
  );
  assert.equal(md('3. Drei\n4. Vier'), '<ol start="3" style="counter-reset: schritt 2"><li>Drei</li><li>Vier</li></ol>');
  assert.equal(
    md('- [ ] offen\n- [x] fertig'),
    '<ul><li class="aufgabe-statisch"><span class="kaestchen" aria-hidden="true"></span>offen</li><li class="aufgabe-statisch an"><span class="kaestchen" aria-hidden="true"></span>fertig</li></ul>',
  );
  assert.equal(md('- a\n- b\n\nText danach'), '<ul><li>a</li><li>b</li></ul><p>Text danach</p>');
  assert.equal(md('• Punkt'), '<ul><li>Punkt</li></ul>');
  assert.equal(md('- a\n1. b'), '<ul><li>a</li></ul><ol><li>b</li></ol>');
});

test('Tabellen', () => {
  const html = md('| Posten | Beispiel |\n|---|---|\n| Einkauf | 8 € |\n| Verkauf | 35 € |');
  assert.match(html, /^<div class="tabelle"><table>/);
  assert.match(html, /<th>Posten<\/th><th>Beispiel<\/th>/);
  assert.match(html, /<td>Einkauf<\/td><td>8 €<\/td>/);
  assert.match(html, /<td>Verkauf<\/td><td>35 €<\/td>/);
});
