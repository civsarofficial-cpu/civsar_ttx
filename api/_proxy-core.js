// Shared CORS proxy used by Vercel (/api/proxy), local server.js and vite dev.
//
// Why this exists: Google My Maps KML, GDACS, many WFS/ArcGIS endpoints and most institutional
// GIS servers send no Access-Control-Allow-Origin header, so the browser cannot read them even
// though the data is public. Fetching server-side removes that single point of failure.
//
// SSRF: private, loopback, link-local and multicast addresses are always refused, so this cannot
// be used to reach the host's own network. By default any *public* host is allowed (what makes
// "add your own API" usable); set PROXY_ALLOW_HOSTS to a comma-separated list to lock a public
// deployment down to named hosts.
import dns from 'node:dns/promises';

const MAX_BYTES = 25 * 1024 * 1024;
const TIMEOUT_MS = 25000;
// Headers worth passing through to the client; everything else (cookies, auth echo) is dropped.
const PASS = ['content-type', 'content-length', 'last-modified', 'etag'];

const v4Private = ip => {
  const p = ip.split('.').map(Number); if (p.length !== 4 || p.some(n => !isFinite(n))) return true;
  const [a, b] = p;
  return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
};
const v6Private = ip => {
  const s = ip.toLowerCase().replace(/^\[|\]$/g, '');
  if (s === '::1' || s === '::' ) return true;
  if (/^(fc|fd|fe8|fe9|fea|feb|ff)/.test(s)) return true;          // ULA, link-local, multicast
  const m = s.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/); if (m) return v4Private(m[1]);  // IPv4-mapped
  return false;
};
const isPrivateAddr = (ip, family) => (family === 6 || ip.includes(':')) ? v6Private(ip) : v4Private(ip);

export function proxyAllowList(env) {
  return String(env.PROXY_ALLOW_HOSTS || '').split(/[\s,]+/).map(s => s.trim().toLowerCase()).filter(Boolean);
}

/** Returns { status, type, body: Buffer|string, error? }. Never throws. */
export async function handleProxy(rawUrl, env = {}) {
  let u;
  try { u = new URL(rawUrl); } catch { return { status: 400, type: 'application/json', body: JSON.stringify({ error: 'Missing or invalid ?url=' }) }; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return err(400, 'Only http(s) URLs can be proxied');

  const allow = proxyAllowList(env);
  const host = u.hostname.toLowerCase();
  if (allow.length && !allow.some(h => host === h || host.endsWith('.' + h)))
    return err(403, `Host ${host} is not in PROXY_ALLOW_HOSTS`);

  // Refuse anything that resolves into this machine's own network.
  try {
    const addrs = await dns.lookup(host, { all: true });
    if (!addrs.length) return err(502, `Cannot resolve ${host}`);
    if (addrs.some(a => isPrivateAddr(a.address, a.family))) return err(403, `${host} resolves to a private address`);
  } catch (e) {
    if (/^\d+\.\d+\.\d+\.\d+$/.test(host) || host.includes(':')) { if (isPrivateAddr(host)) return err(403, 'Private address'); }
    else return err(502, `DNS lookup failed for ${host}`);
  }

  const ac = new AbortController(); const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(u, { signal: ac.signal, redirect: 'follow', headers: { 'user-agent': 'CIVSAR-TTX/1.0 (+exercise tool)', accept: '*/*' } });
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length > MAX_BYTES) return err(413, 'Response too large (limit 25 MB)');
    const headers = {};
    for (const k of PASS) { const v = r.headers.get(k); if (v) headers[k] = v; }
    return { status: r.status, type: headers['content-type'] || 'application/octet-stream', body: buf, headers };
  } catch (e) {
    return err(502, e.name === 'AbortError' ? 'Upstream timed out after 25 s' : String(e.message || e));
  } finally { clearTimeout(timer); }
}

const err = (status, message) => ({ status, type: 'application/json', body: JSON.stringify({ error: message }), headers: {} });
