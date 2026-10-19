// Resilient fetch + service health.
//
// The exercise must not stop because one provider is down, rate-limited, or blocked by CORS.
// Every outside call goes through here so it gets: a timeout, an automatic retry through the
// server proxy when the browser refuses the response, an ordered list of alternative providers,
// and a health entry the Settings page can show. Nothing here ever throws at the caller unless
// every option failed.

export const PROXY_PATH = '/api/proxy?url=';
export const viaProxy = url => PROXY_PATH + encodeURIComponent(url);

/* ---------- health registry ---------- */
const state = new Map(); const subs = new Set();
export const health = {
  set(key, patch) { state.set(key, { key, at: Date.now(), ...(state.get(key) || {}), ...patch }); subs.forEach(f => f()); },
  ok: (key, detail, via) => health.set(key, { state: 'ok', detail, via, error: '' }),
  down: (key, error) => health.set(key, { state: 'down', error: String(error && error.message || error || 'failed') }),
  degraded: (key, detail, error) => health.set(key, { state: 'degraded', detail, error: String(error && error.message || error || '') }),
  get: key => state.get(key),
  all: () => [...state.values()].sort((a, b) => a.key.localeCompare(b.key)),
  subscribe(f) { subs.add(f); return () => subs.delete(f); },
  clear: () => { state.clear(); subs.forEach(f => f()); }
};

/* ---------- fetch with timeout, and proxy fallback for CORS-less endpoints ---------- */
const withTimeout = async (url, opt = {}, ms = 15000) => {
  const ac = new AbortController(); const t = setTimeout(() => ac.abort(), ms);
  try { return await fetch(url, { ...opt, signal: ac.signal }); } finally { clearTimeout(t); }
};

/**
 * fetch that falls back to the server proxy. `proxy`: 'auto' (default — direct, then proxy on
 * failure), 'always' (known CORS-less hosts) or 'never'. Returns the Response; `res.via` says
 * which route served it.
 */
export async function netFetch(url, { timeout = 15000, proxy = 'auto', ...opt } = {}) {
  const tryOne = async (u, via) => { const r = await withTimeout(u, opt, timeout); if (!r.ok) throw new Error(`${r.status} ${r.statusText}`); r.via = via; return r; };
  if (proxy === 'always') return tryOne(viaProxy(url), 'proxy');
  try { return await tryOne(url, 'direct'); }
  catch (e) {
    if (proxy === 'never') throw e;
    // A CORS rejection and a dead host look the same from here, so just try the other route.
    try { return await tryOne(viaProxy(url), 'proxy'); } catch { throw e; }
  }
}
export const netJSON = async (url, o) => { const r = await netFetch(url, o); return r.json(); };
export const netText = async (url, o) => { const r = await netFetch(url, o); return r.text(); };

/**
 * Run providers in order until one succeeds, recording the outcome under `key`.
 * providers: [{ name, run: () => Promise<result>, enabled? }]
 */
export async function firstOk(key, providers) {
  const tried = [];
  for (const p of providers.filter(x => x && x.enabled !== false)) {
    try {
      const out = await p.run();
      if (out == null) throw new Error('empty response');
      if (tried.length) health.degraded(key, `${p.name} (after ${tried.join(', ')} failed)`, tried.join('; '));
      else health.ok(key, p.name);
      return out;
    } catch (e) { tried.push(`${p.name}: ${String(e.message || e).slice(0, 80)}`); }
  }
  const err = new Error(tried.length ? tried.join(' | ') : 'no provider configured');
  health.down(key, err); throw err;
}

/** Is the server-side proxy actually available? (It is not on a static host.) */
let proxyOk = null;
export async function proxyAvailable() {
  if (proxyOk != null) return proxyOk;
  try { const r = await withTimeout(PROXY_PATH + encodeURIComponent('https://example.com'), {}, 8000); proxyOk = r.status < 500; }
  catch { proxyOk = false; }
  health.set('proxy', proxyOk ? { state: 'ok', detail: 'server proxy reachable' } : { state: 'down', error: 'no /api/proxy — CORS-less sources unavailable' });
  return proxyOk;
}
