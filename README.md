# Business-KI – Prototyp

Kostenlose KI für Reselling, Supplier und Shopify. Sie antwortet nach **deinen** Regeln, mit **deinem** Wissen und empfiehlt nur **deine** Angebote und Partner-Links.

## Was wo liegt

| Datei | Was drin ist |
| --- | --- |
| `wissen/anweisungen.md` | Wie die KI antwortet: Ton, Format, Regeln |
| `wissen/angebote.md` | Deine Listen und Partner-Links – nur die empfiehlt die KI |
| `wissen/wissen.md` | Deine Erfahrung: Anleitungen, Zahlen, typische Fehler |
| `public/config.js` | Texte der Startseite: Name, Überschrift, Beispielfragen |
| `public/` | Die Chat-Seite (HTML, CSS, JavaScript, Schriften) |
| `api/chat.js`, `lib/ki.js` | Die Serverfunktion, die mit der KI spricht |

Alles in `wissen/` ist normales Deutsch – kein Code. Text in `<!-- … -->` ist nur für dich, die KI sieht ihn nicht.

## Live gehen in ca. 10 Minuten

### 1. API-Key holen (OpenRouter)

1. Auf [openrouter.ai](https://openrouter.ai) registrieren.
2. Unter **Keys** einen neuen Key erstellen. Tipp: Gib dem Key direkt ein Ausgabenlimit (z. B. 10 $) – dann kann nie mehr ausgegeben werden, auch wenn ein Video viral geht.
3. Guthaben aufladen (z. B. 10 $). Das Standard-Modell kostet Geld, aber sehr wenig (siehe Kosten).

Ganz ohne Guthaben testen: `AI_MODEL` auf ein Modell mit `:free` am Ende setzen (Liste auf openrouter.ai/models). Dann gilt das Gratis-Limit von OpenRouter (50 Anfragen am Tag, nach einmalig 10 $ Guthaben 1.000).

### 2. Auf Vercel veröffentlichen

1. Auf [vercel.com](https://vercel.com) mit GitHub anmelden.
2. **Add New → Project** → das Repo `newai` importieren.
3. Bei **Environment Variables** eintragen: Name `AI_API_KEY`, Wert = dein Key.
4. **Deploy** klicken. Nach ca. 1 Minute bekommst du deinen Link (z. B. `newai.vercel.app`).
5. Kurz prüfen: `dein-link/api/chat` im Browser öffnen. Dort muss `"apiKeyGesetzt": true` stehen.

Änderst du später eine Variable: **Deployments → ⋯ → Redeploy**, damit sie greift.

### 3. Dein Wissen eintragen

Direkt auf GitHub: Datei öffnen → Stift-Symbol → ändern → **Commit changes**. Vercel veröffentlicht automatisch neu (ca. 1 Minute).

- Ersetze in `wissen/angebote.md` alle Links mit `PLATZHALTER` durch deine echten Links. Solange noch Platzhalter drin sind, zeigt `dein-link/api/chat` `"platzhalterInAngeboten": true`.
- Schreib in `wissen/wissen.md` deine Erfahrung rein. Stichpunkte reichen – je konkreter, desto besser die Antworten.

## Einstellungen (Environment Variables auf Vercel)

| Name | Standard | Wofür |
| --- | --- | --- |
| `AI_API_KEY` | – (Pflicht) | Dein API-Key |
| `AI_MODEL` | `google/gemini-3.5-flash-lite` | Welches Modell antwortet |
| `DAILY_LIMIT` | `20` | Fragen pro Nutzer und Tag (`0` = kein Limit) |
| `AI_MAX_TOKENS` | `2000` | Maximale Länge einer Antwort |
| `AI_REASONING_EFFORT` | `low` | Wie lange das Modell nachdenkt (nur OpenRouter): `low`, `medium`, `high`, `off` |
| `AI_BASE_URL` | `https://openrouter.ai/api/v1` | Anderer Anbieter mit OpenAI-kompatibler Schnittstelle |

## Fehlercodes in der App

| Meldung | Bedeutung | Was tun |
| --- | --- | --- |
| Fehler 401 | Key falsch | `AI_API_KEY` prüfen, neu deployen |
| Fehler 402 | Guthaben leer oder Key-Limit erreicht | Guthaben aufladen oder Limit erhöhen |
| Fehler 404 | Modellname falsch | `AI_MODEL` prüfen |
| Fehler 429 | Anbieter überlastet oder Gratis-Limit voll | kurz warten oder Guthaben aufladen |
| „AI_API_KEY fehlt“ | Variable nicht gesetzt | auf Vercel eintragen, neu deployen |

Details zu jedem Fehler stehen auf Vercel unter **Logs**.

## Kosten

- **KI:** Das Standard-Modell kostet 0,30 $ pro Million Input-Tokens und 2,50 $ pro Million Output-Tokens. Grob sind das ca. 2 Cent für ein Gespräch mit 5 Fragen.
- **Hosting:** Der kostenlose Hobby-Plan von Vercel ist nur für private, nicht-kommerzielle Projekte gedacht. Sobald die KI Geld verdient, brauchst du Vercel Pro (20 $ im Monat).
- **Schriften:** Archivo Black und Fira Sans liegen direkt im Projekt (Lizenz: SIL Open Font License, siehe `public/fonts/`). Es werden keine externen Dienste geladen.

## Wie es funktioniert

1. Die Chat-Seite schickt die Frage (plus die letzten Nachrichten) an `/api/chat`.
2. Die Serverfunktion baut aus `wissen/` die Anweisungen für die KI, prüft das Tageslimit und fragt das Modell.
3. Die Antwort kommt Wort für Wort zurück und wird direkt angezeigt. Stoppt der Nutzer, stoppt auch die KI – das spart Kosten.

Das Tageslimit zählt pro IP-Adresse im Speicher der Serverfunktion. Für den Test reicht das, wirklich dicht ist es erst mit einer Datenbank (siehe unten). Die Ausgabengrenze am API-Key ist deine harte Sicherung.

## Lokal testen (optional)

Voraussetzung: Node.js 20 oder neuer.

```bash
cp .env.example .env   # Key eintragen
npm run dev            # http://localhost:3000
npm test               # automatische Tests, laufen ohne echten Key
```

## Nächste Schritte

- Echtes Limit pro Nutzer mit Datenbank (z. B. Login per E-Mail) – baut gleichzeitig deine E-Mail-Liste auf.
- Klicks auf Partner-Links zählen, damit du siehst, welche Empfehlung Geld bringt.
- Eigene Domain verbinden.
