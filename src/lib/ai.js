export async function generateScenario(prompt, seed) {
  const r = await fetch('/api/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt, seed }) });
  let j; try { j = await r.json(); } catch { throw new Error('Generator endpoint not reachable (run via `npm run dev`, `npm start` or Vercel).'); }
  if (!r.ok) throw new Error(j.error || 'Generation failed');
  return j.scenario;
}
// Prompt users can paste into claude.ai if no API key is configured.
export const COPY_PROMPT = `Design a tabletop exercise (TTX) for a Sri Lankan Emergency Operations Centre and return ONLY JSON with keys:
title, hazard, location, aim, objectives[], mode ("physical"|"online"|"hybrid"), durationMin, timeScale (sim minutes per real minute), simStart (ISO),
center {lat,lon,zoom}, background, roles[{id,name,kind:"control"|"player"|"evaluator"|"observer",brief}],
injects[{id,stage,atMin (real minutes after start),simTime,from,to[role ids],mode,title,body,expectedAction,objective,notes,lat,lon,severity:"info"|"low"|"medium"|"high"|"critical",requiresResponse}].
12–25 injects, escalating Alert→Response→Escalation→Recovery, include misinformation, comms failure, airport/port logistics.
Scenario: `;
