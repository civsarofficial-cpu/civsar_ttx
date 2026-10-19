import { handleProxy } from './_proxy-core.js';
export default async function handler(req, res) {
  const url = new URL(req.url, 'http://x').searchParams.get('url');
  const out = await handleProxy(url, process.env);
  res.status(out.status);
  for (const [k, v] of Object.entries(out.headers || {})) res.setHeader(k, v);
  res.setHeader('content-type', out.type);
  res.setHeader('access-control-allow-origin', '*');
  res.setHeader('cache-control', 'public, max-age=60');
  res.send(out.body);
}
