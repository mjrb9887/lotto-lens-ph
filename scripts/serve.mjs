// Local static server plus the same JavaScript lookup handler used in Workers.
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import worker from '../worker/index.mjs';

const root = new URL('../', import.meta.url);
const allowed = new Set(['index.html', 'styles.css', 'app.js', 'archive-lookup.js', 'config.js',
  'sw.js', 'manifest.webmanifest', 'methodology.html', 'privacy.html', 'responsible-play.html',
  'about.html', 'robots.txt', 'data/history.json', 'data/results.json', 'data/coverage.json']);
const types = {html: 'text/html', css: 'text/css', js: 'text/javascript', json: 'application/json', webmanifest: 'application/manifest+json'};
const port = Number(process.env.PORT || 8080);
createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${port}`);
  try {
    if (url.pathname === '/api/archive') {
      const response = await worker.fetch(new Request(url, {method: req.method, headers: req.headers}),
        {ALLOWED_ORIGINS: `http://localhost:${port},http://127.0.0.1:${port}`});
      res.writeHead(response.status, Object.fromEntries(response.headers));
      const reader = response.body.getReader();
      res.on('close', () => { void reader.cancel().catch(() => {}); });
      while (true) {
        const {value, done} = await reader.read();
        if (done) break;
        res.write(value);
      }
      return res.end();
    }
    const path = decodeURIComponent(url.pathname).replace(/^\//, '') || 'index.html';
    if (req.method !== 'GET' || !allowed.has(path)) { res.writeHead(404); return res.end('Not found'); }
    const body = await readFile(fileURLToPath(new URL(path, root)));
    res.writeHead(200, {'Content-Type': `${types[path.split('.').pop()] || 'text/plain'}; charset=utf-8`});
    res.end(body);
  } catch {
    if (!res.headersSent) res.writeHead(500);
    res.end('Request failed.');
  }
}).listen(port, '127.0.0.1', () => console.log(`LottoLens: http://localhost:${port}`));
