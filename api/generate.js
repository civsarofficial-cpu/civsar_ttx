import { handleGenerate } from './_generate-core.js';
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
  const out = await handleGenerate(body, process.env);
  res.status(out.status).json(out.body);
}
