// Shared Claude scenario generator used by Vercel (/api/generate), local server.js and vite dev.
const SCHEMA_HINT = `Return ONLY JSON (no prose, no markdown fences) matching:
{
 "title": string, "hazard": string, "location": string, "aim": string,
 "objectives": [string], "mode": "physical"|"online"|"hybrid",
 "durationMin": number, "timeScale": number,   // timeScale = simulated minutes per real minute
 "simStart": "ISO datetime of scenario start (in-world)",
 "center": {"lat": number, "lon": number, "zoom": number},
 "background": string,
 "roles": [{"id": "kebab-id", "name": string, "kind": "control"|"player"|"evaluator"|"observer", "brief": string}],
 "injects": [{
   "id": "I1", "stage": "Alert|Response|Escalation|Recovery…", "atMin": number,  // real minutes after STARTEX
   "simTime": string, "from": string, "to": ["role-id"], "mode": "radio|phone|email|SMS|bulletin|media|social|face-to-face|map",
   "title": string, "body": string, "expectedAction": string, "objective": string, "notes": string,
   "lat": number|null, "lon": number|null, "severity": "info"|"low"|"medium"|"high"|"critical",
   "requiresResponse": boolean
 }]
}`;

const SYSTEM = `You are an exercise designer for CIVSAR (Civilian Search and Rescue, Sri Lanka), following WHO Simulation Exercise Manual (2017) TTX guidance and the ETC/EdOS inject-matrix method. Build realistic tabletop exercises for an Emergency Operations Centre. Use real Sri Lankan structures (DMC national EOC, District DMCU, DS divisions, GN divisions, NBRO landslide levels, Irrigation Dept river gauges, Met Dept advisories, SLN/SLAF/Army support, Bandaranaike Intl Airport CMB, Mattala HRI, Colombo/Hambantota/Trincomalee ports). Keep households and people fictional. Never invent medical protocol specifics. Escalate across stages, include rumours/misinformation, resource conflicts, comms failure and a recovery stage. 12–25 injects, each mapped to an objective and targeted to player roles. ${SCHEMA_HINT}`;

export async function handleGenerate(input, env) {
  const key = env.ANTHROPIC_API_KEY;
  if (!key) return { status: 501, body: { error: 'ANTHROPIC_API_KEY is not set on the server. Add it to .env (local) or Vercel project env vars.' } };
  const { prompt = '', seed = null } = input || {};
  const user = seed
    ? `Expand and complete this partial scenario (keep what is given, fill gaps, add injects):\n${JSON.stringify(seed).slice(0, 60000)}\n\nExtra instructions: ${prompt}`
    : `Design a TTX: ${prompt}`;
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: env.ANTHROPIC_MODEL || 'claude-sonnet-5-5', max_tokens: 16000, system: SYSTEM, messages: [{ role: 'user', content: user }] })
    });
    const j = await r.json();
    if (!r.ok) return { status: r.status, body: { error: j?.error?.message || 'Claude API error' } };
    const text = (j.content || []).map(c => c.text || '').join('');
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) return { status: 502, body: { error: 'Model did not return JSON', raw: text.slice(0, 2000) } };
    return { status: 200, body: { scenario: JSON.parse(m[0]) } };
  } catch (e) {
    return { status: 500, body: { error: String(e.message || e) } };
  }
}
