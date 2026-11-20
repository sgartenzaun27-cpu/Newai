// Lokaler Testserver für Room 404 – nur für Entwicklung. Start: npm run dev
// Zeigt die Seite aus /public und leitet /api/chat an dieselbe Funktion wie auf Vercel.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

// .env laden, falls vorhanden (ohne Zusatzpakete)
if (existsSync('.env')) {
  for (const zeile of readFileSync('.env', 'utf8').split(/\r?\n/)) {
    const treffer = zeile.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (treffer && !(treffer[1] in process.env)) process.env[treffer[1]] = treffer[2].replace(/^["']|["']$/g, '');
  }
}

const { bearbeiteAnfrage } = await import('./lib/ki.js');

const PORT = Number(process.env.PORT) || 3000;
const PUBLIC = path.resolve('public');
const TYPEN = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
};

async function api(req, res, url) {
  const teile = [];
  for await (const teil of req) teile.push(teil);
  const abbruch = new AbortController();
  res.on('close', () => {
    if (!res.writableEnded) abbruch.abort();
  });

  const header = new Headers();
  for (const [name, wert] of Object.entries(req.headers)) {
    for (const w of [].concat(wert)) header.append(name, w);
  }
  header.set('x-real-ip', req.socket.remoteAddress || 'lokal');

  const anfrage = new Request(url, {
    method: req.method,
    headers: header,
    body: ['GET', 'HEAD'].includes(req.method) ? undefined : Buffer.concat(teile),
    signal: abbruch.signal,
  });

  const antwort = await bearbeiteAnfrage(anfrage);
  res.writeHead(antwort.status, Object.fromEntries(antwort.headers));
  if (antwort.body) {
    for await (const stueck of antwort.body) res.write(stueck);
  }
  res.end();
}

async function statisch(res, url) {
  let pfad = decodeURIComponent(url.pathname);
  if (pfad.endsWith('/')) pfad += 'index.html';
  const datei = path.join(PUBLIC, path.normalize(pfad));
  if (!datei.startsWith(PUBLIC)) {
    res.writeHead(403).end();
    return;
  }
  try {
    const inhalt = await readFile(datei);
    res.writeHead(200, { 'Content-Type': TYPEN[path.extname(datei)] || 'application/octet-stream' });
    res.end(inhalt);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Nicht gefunden');
  }
}

http
  .createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    try {
      if (url.pathname === '/api/chat') await api(req, res, url);
      else await statisch(res, url);
    } catch (err) {
      console.error(err);
      if (!res.headersSent) res.writeHead(500);
      res.end();
    }
  })
  .listen(PORT, () => {
    console.log(`Room 404 läuft auf http://localhost:${PORT}`);
    const keys = ['GEMINI_API_KEY', 'OPENROUTER_API_KEY', 'GROQ_API_KEY', 'AI_API_KEY'];
    if (!keys.some((k) => process.env[k])) console.log('Hinweis: Kein API-Key – trag mindestens einen in .env ein (siehe .env.example).');
  });
