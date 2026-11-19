// Tests für die Pläne zum Abhaken (public/plan.js)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const kontext = { window: {} };
vm.runInNewContext(readFileSync(new URL('../public/plan.js', import.meta.url), 'utf8'), kontext);
const { teileAntwort, parsePlan, planAlsText } = kontext.window.KIPlan;

const ANTWORT = `Hier ist dein Plan für den Start:

\`\`\`plan
# Vintage Reselling starten
Ziel: In 30 Tagen die ersten 10 Verkäufe
Dauer: 30 Tage

## Woche 1: Basis
- [ ] **Nische festlegen** – z. B. 90er-Sportjacken
- [ ] Budget festlegen: 200 € für den Test
- [x] Vinted-Account einrichten

## Woche 2: Einkauf
- [ ] Supplier auswählen – mit [Vintage Depots](https://vintagedepots.de) oder [Host of Vintage](https://host-of-vintage.de)
- [ ] Testbestellung aufgeben
\`\`\`

**Dein nächster Schritt:** Nische aufschreiben.`;

test('teileAntwort trennt Text und Plan', () => {
  const teile = teileAntwort(ANTWORT);
  assert.equal(JSON.stringify(teile.map((t) => [t.typ, t.geschlossen])), JSON.stringify([['md', true], ['plan', true], ['md', true]]));
  assert.match(teile[0].text, /Hier ist dein Plan/);
  assert.match(teile[2].text, /nächster Schritt/);
});

test('halber Plan während des Streamens', () => {
  const halb = ANTWORT.slice(0, ANTWORT.indexOf('## Woche 2'));
  const teile = teileAntwort(halb);
  assert.equal(teile.at(-1).typ, 'plan');
  assert.equal(teile.at(-1).geschlossen, false);
  assert.equal(parsePlan(teile.at(-1).text).anzahl, 3);
});

test('andere Code-Blöcke bleiben normaler Text', () => {
  const teile = teileAntwort('```js\nconst a = 1;\n```\nText');
  assert.equal(teile.length, 1);
  assert.equal(teile[0].typ, 'md');
});

test('parsePlan liest Titel, Ziel, Dauer, Phasen und Aufgaben', () => {
  const plan = parsePlan(teileAntwort(ANTWORT)[1].text);
  assert.equal(plan.titel, 'Vintage Reselling starten');
  assert.equal(plan.ziel, 'In 30 Tagen die ersten 10 Verkäufe');
  assert.equal(plan.dauer, '30 Tage');
  assert.equal(plan.phasen.length, 2);
  assert.equal(plan.anzahl, 5);
  const [a, b, c] = plan.phasen[0].aufgaben;
  assert.deepEqual([a.titel, a.detail, a.nr, a.vorab], ['Nische festlegen', 'z. B. 90er-Sportjacken', 0, false]);
  assert.deepEqual([b.titel, b.detail], ['Budget festlegen', '200 € für den Test']);
  assert.equal(c.vorab, true);
  assert.match(plan.phasen[1].aufgaben[0].detail, /\[Vintage Depots\]\(https:\/\/vintagedepots\.de\)/);
  assert.match(plan.id, /^p[0-9a-z]+$/);
});

test('gleicher Plan = gleiche ID, anderer Plan = andere ID', () => {
  const text = teileAntwort(ANTWORT)[1].text;
  assert.equal(parsePlan(text).id, parsePlan(text).id);
  assert.notEqual(parsePlan(text).id, parsePlan(text.replace('Testbestellung', 'Erste Bestellung')).id);
});

test('verzeiht Formatfehler der KI', () => {
  const plan = parsePlan('**Mein Plan**\n- Schritt ohne Kästchen\n1. Nummerierter Schritt\n**Tipp:** kein Schritt');
  assert.equal(plan.titel, 'Mein Plan');
  assert.equal(plan.anzahl, 2);
  assert.match(plan.phasen[0].notiz, /Tipp/);
  assert.equal(parsePlan('').titel, 'Dein Plan');
});

test('planAlsText für Kopieren', () => {
  const plan = parsePlan(teileAntwort(ANTWORT)[1].text);
  const text = planAlsText(plan, new Set([0, 2]));
  assert.match(text, /^Vintage Reselling starten\nZiel: In 30 Tagen/);
  assert.match(text, /✓ Nische festlegen – z\. B\. 90er-Sportjacken/);
  assert.match(text, /○ Budget festlegen/);
  assert.match(text, /Vintage Depots \(https:\/\/vintagedepots\.de\)/);
});
