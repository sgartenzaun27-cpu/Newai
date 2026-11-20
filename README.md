# Room 404

**Diese Seite gibt es nicht. Zumindest nicht für alle.**

Room 404 ist die kostenlose KI mit dem Business-Wissen, das sonst keiner teilt. Sie antwortet nach **deinen** Regeln, mit **deinem** Wissen, baut Pläne zum Abhaken und empfiehlt nur **deine** Angebote: Vintage Depots, Host of Vintage, VintageHost und Badgeo.

## Was wo liegt

| Datei | Was drin ist |
| --- | --- |
| `wissen/anweisungen.md` | Wer Room 404 ist und wie die KI antwortet: Ton, Format, Pläne, Regeln für Empfehlungen |
| `wissen/angebote.md` | Deine Seiten mit Preisen und wann die KI sie empfiehlt. Telekom und Copy Trading liegen dort pausiert bereit |
| `wissen/wissen.md` | Deine Erfahrung: Supplier, Snipen, Vinted-Sperre, Google-Badges, Shopify, TikTok |
| `public/config.js` | Texte der Startseite, Beispielfragen und die Empfehlungs-Karten |
| `public/` | Die Chat-Seite (HTML, CSS, JavaScript, Schriften) |
| `api/chat.js`, `lib/ki.js` | Die Serverfunktion, die mit den KIs spricht |

Alles in `wissen/` ist normales Deutsch – kein Code. Text in `<!-- … -->` ist nur für dich, die KI sieht ihn nicht.

## Was die App kann

- **Pläne zum Abhaken:** Fragt jemand „Wie fange ich an?“ oder „Gib mir einen Plan“, baut die KI eine Checkliste mit Phasen, Fortschrittsring und Häkchen. Jeder Plan wird automatisch unter **Pläne** gespeichert, im Browser des Nutzers, und lässt sich als Text kopieren.
- **Empfehlungs-Karten:** Verlinkt die KI eine deiner Seiten, erscheint unter der Antwort eine Karte mit Knopf. Links zu deinen Seiten bekommen `utm_source=room404`, so siehst du in deinen Shop-Statistiken, was Room 404 bringt.
- **Gratis-KIs hintereinander:** Ist ein Anbieter voll, springt automatisch der nächste ein (Gemini, dann OpenRouter, dann Groq, dann dein eigener Key).
- **Tageslimit:** 20 Fragen pro Nutzer und Tag, einstellbar.

## Einrichten: Gratis-Keys eintragen

Trag in Vercel unter **Settings → Environment Variables** die Keys ein, die du hast. Einer reicht, mehrere sind besser:

| Name | Woher | Gratis-Limit (ungefähr) |
| --- | --- | --- |
| `GEMINI_API_KEY` | Google AI Studio → „Get API key“ | ca. 500 Fragen am Tag |
| `OPENROUTER_API_KEY` | openrouter.ai → Keys | 50 am Tag, nach einmalig 10 $ Guthaben 1.000 |
| `GROQ_API_KEY` | console.groq.com → API Keys | knapp, wegen Token-Limits |

Danach **Deployments → ⋯ → Redeploy**, damit die neuen Variablen greifen.

Die alte Einstellung `AI_API_KEY` (mit `AI_BASE_URL` und `AI_MODEL`) funktioniert weiter. Sie wird als letzter Anbieter genutzt. Wenn du nur noch die Gratis-Keys willst, lösch sie.

Kurz prüfen: `dein-link/api/chat` im Browser öffnen. Dort stehen alle aktiven Anbieter.

## Weitere Einstellungen

| Name | Standard | Wofür |
| --- | --- | --- |
| `DAILY_LIMIT` | `20` | Fragen pro Nutzer und Tag (`0` = kein Limit) |
| `GEMINI_MODEL` | `gemini-3.5-flash-lite` | Modell bei Gemini |
| `OPENROUTER_MODEL` | `openrouter/free` | Modell bei OpenRouter (`openrouter/free` nimmt automatisch ein Gratis-Modell) |
| `GROQ_MODEL` | `openai/gpt-oss-120b` | Modell bei Groq |
| `AI_REIHENFOLGE` | `gemini,openrouter,groq,eigener` | Reihenfolge der Anbieter |
| `AI_MAX_TOKENS` | `3000` | Maximale Länge einer Antwort |
| `AI_REASONING_EFFORT` | `low` | Wie lange die Modelle nachdenken: `low`, `medium`, `high`, `off` |

## Wissen und Angebote pflegen

Direkt auf GitHub: Datei öffnen → Stift-Symbol → ändern → **Commit changes**. Vercel veröffentlicht automatisch neu (ca. 1 Minute).

- **Neues Angebot:** in `wissen/angebote.md` einen Block kopieren und anpassen. Soll dafür auch eine Karte erscheinen, in `public/config.js` unter `partner` eine Zeile ergänzen.
- **Telekom-Vertrieb und Copy Trading:** liegen in `wissen/angebote.md` pausiert bereit. Link eintragen und die Kommentar-Klammern `<!--` und `-->` um den Block entfernen.
- **Neues Wissen:** in `wissen/wissen.md` einfach eine neue Überschrift `# Thema` mit Stichpunkten anlegen.

## Fehlercodes in der App

| Meldung | Bedeutung | Was tun |
| --- | --- | --- |
| Fehler 429 | Alle Anbieter gerade voll | kurz warten, weiteren Gratis-Key eintragen oder Guthaben aufladen |
| Fehler 401 / 403 | Ein Key ist falsch | Key prüfen, neu deployen |
| Fehler 402 | Guthaben leer | Guthaben aufladen |
| Fehler 404 | Modellname falsch | Modell-Variable prüfen |
| „kein API-Key hinterlegt“ | Keine Keys gesetzt | auf Vercel eintragen, neu deployen |

Details zu jedem Fehler stehen auf Vercel unter **Logs**.

## Kosten

- **KI:** Mit den Gratis-Keys kostet es nichts, solange die Limits reichen. Bezahlt kostet Gemini 3.5 Flash-Lite grob 2 Cent für ein Gespräch mit 5 Fragen.
- **Hosting:** Der kostenlose Hobby-Plan von Vercel ist nur für private, nicht-kommerzielle Projekte gedacht. Sobald Room 404 Geld verdient, brauchst du Vercel Pro (20 $ im Monat).

## Design

Die Tür am Ende des Flurs: Petrol-Nacht als Raum, Türlicht-Amber als einziges Licht, die 404 als Leuchtschrift, die beim Betreten kurz flackert. Fira Sans für Text, JetBrains Mono für die Stimme des Raums. Die Schriften liegen direkt im Projekt (Lizenz: SIL Open Font License, siehe `public/fonts/LIZENZEN.txt`). Es werden keine externen Dienste geladen.

Texte der Startseite (Überschrift, leiser Satz, Beispielfragen) änderst du in `public/config.js`.

## Lokal testen (optional)

Voraussetzung: Node.js 20 oder neuer.

```bash
cp .env.example .env   # Keys eintragen
npm run dev            # http://localhost:3000
npm test               # automatische Tests, laufen ohne echte Keys
```

## Nächste Schritte

- Domain sichern (z. B. room404 mit .de oder .ai) und mit Vercel verbinden.
- Pläne und Tageslimit an ein Nutzerkonto binden (Login per E-Mail) – baut gleichzeitig deine E-Mail-Liste auf.
- Klicks auf Empfehlungs-Karten zählen.
