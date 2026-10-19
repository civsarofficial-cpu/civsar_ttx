// Local install server: serves the built app + /api/generate. `npm start` → http://localhost:5173
// Other devices on the same LAN can join at http://<this-computer-ip>:5173 (physical/hybrid rooms).
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'; import os from 'node:os'; import { spawn } from 'node:child_process';
import { handleGenerate } from './api/_generate-core.js';
import { handleProxy, proxyAllowList } from './api/_proxy-core.js';
const env = { ...process.env };
try { for (const l of fs.readFileSync('.env', 'utf8').split('\n')) { const m = l.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/); if (m && !env[m[1]]) env[m[1]] = m[2]; } } catch {}
const dist = path.resolve('dist'); const PORT = env.PORT || 5173;
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png' };
// A facilitator's laptop is the single machine a whole room depends on, so no one request may be
// able to take the server down: every handler is wrapped, stream errors answer 500 instead of
// raising an unhandled 'error' event, and the process survives anything that still escapes.
const fail = (res, code, msg) => { try { if (!res.headersSent) res.writeHead(code, { 'Content-Type': 'text/plain' }); res.end(msg); } catch {} };
const server = http.createServer(async (req, res) => {
  try {
    if (req.url.startsWith('/api/generate') && req.method === 'POST') {
      let b = ''; req.on('data', c => (b += c)); req.on('end', async () => {
        try {
          const out = await handleGenerate(JSON.parse(b || '{}'), env);
          res.writeHead(out.status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(out.body));
        } catch (e) { fail(res, 500, JSON.stringify({ error: String(e.message || e) })); }
      }); return;
    }
    if (req.url.startsWith('/api/proxy')) {
      const out = await handleProxy(new URL(req.url, 'http://x').searchParams.get('url'), env);
      res.writeHead(out.status, { ...(out.headers || {}), 'Content-Type': out.type, 'Access-Control-Allow-Origin': '*' });
      res.end(out.body); return;
    }
    let p = path.join(dist, decodeURIComponent(req.url.split('?')[0]));
    if (!p.startsWith(dist) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) p = path.join(dist, 'index.html');
    // Headers go out on 'open', so a file that vanishes mid-request still gets a real 500.
    const s = fs.createReadStream(p);
    s.on('open', () => { res.writeHead(200, { 'Content-Type': types[path.extname(p)] || 'application/octet-stream' }); s.pipe(res); });
    s.on('error', e => { console.warn('static:', e.message); fail(res, 500, 'File unavailable — has the app been built? (npm run build)'); });
  } catch (e) { console.warn('request:', e.message); fail(res, 500, 'Server error'); }
});
// A busy port must say so plainly: the Windows build runs this in a console the facilitator reads.
server.on('error', e => {
  if (e.code === 'EADDRINUSE') {
    console.error(`\n  Port ${PORT} is already in use.`);
    console.error('  CIVSAR TTX may already be running — try http://localhost:' + PORT + '/');
    console.error('  Otherwise set another port (PORT=5174) in the .env file next to this app.\n');
  } else console.error('\n  Could not start the server:', e.message, '\n');
  process.exit(1);
});
server.listen(PORT, '0.0.0.0', () => {
  console.log(`CIVSAR TTX running → http://localhost:${PORT}`);
  const allow = proxyAllowList(env);
  console.log(allow.length ? `  /api/proxy restricted to: ${allow.join(', ')}` : '  /api/proxy open to any public host (set PROXY_ALLOW_HOSTS to restrict)');
  if (!fs.existsSync(path.join(dist, 'index.html'))) console.warn('  ⚠ dist/index.html is missing — run `npm run build` first.');
  for (const i of Object.values(os.networkInterfaces()).flat()) if (i.family === 'IPv4' && !i.internal) console.log(`  LAN: http://${i.address}:${PORT}`);
  // The Windows build sets this so the facilitator gets a browser without typing a URL.
  if (env.OPEN_BROWSER === '1') {
    const url = `http://localhost:${PORT}/`;
    try {
      if (process.platform === 'win32') spawn('cmd', ['/c', 'start', '""', url], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
      else spawn(process.platform === 'darwin' ? 'open' : 'xdg-open', [url], { detached: true, stdio: 'ignore' }).unref();
    } catch (e) { console.warn('  (could not open a browser automatically — open', url, 'yourself)'); }
  }
});
// Last resort: log and keep serving rather than dropping the room mid-exercise.
process.on('uncaughtException', e => console.error('uncaught:', e.message));
process.on('unhandledRejection', e => console.error('unhandled rejection:', e?.message || e));
