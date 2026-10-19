import { DEFAULT_ROLES, SL_CENTER } from './refdata.js';
export const uid = (p = '') => p + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-3);
export const SEVERITIES = ['info', 'low', 'medium', 'high', 'critical'];
export const MODES = ['bulletin', 'radio', 'phone', 'email', 'SMS', 'media', 'social', 'face-to-face', 'map', 'video'];

export function blankScenario() {
  return normalize({ title: 'New exercise', hazard: '', location: 'Sri Lanka', roles: DEFAULT_ROLES, injects: [] });
}

// Accepts anything roughly scenario-shaped (our JSON, Claude output, or a bare inject list) and returns a valid scenario.
export function normalize(raw) {
  if (Array.isArray(raw)) raw = { injects: raw };
  const s = { ...raw };
  s.id = s.id || uid('ex_');
  s.title = s.title || 'Untitled exercise';
  s.hazard = s.hazard || ''; s.location = s.location || ''; s.aim = s.aim || ''; s.background = s.background || '';
  s.objectives = (s.objectives || []).map(String);
  s.mode = ['physical', 'online', 'hybrid'].includes(s.mode) ? s.mode : 'hybrid';
  s.durationMin = Number(s.durationMin) || 120;
  s.timeScale = Number(s.timeScale) || 6;
  s.simStart = s.simStart || new Date().toISOString().slice(0, 16);
  s.center = s.center && isFinite(s.center.lat) ? s.center : SL_CENTER;
  s.roles = (s.roles && s.roles.length ? s.roles : DEFAULT_ROLES).map((r, i) => ({
    id: r.id || slug(r.name) || 'role' + i, name: r.name || r.id, kind: r.kind || 'player', brief: r.brief || ''
  }));
  s.resources = s.resources || [];
  s.injects = (s.injects || []).map((x, i) => ({
    id: x.id || 'I' + (i + 1),
    stage: x.stage || '', atMin: Number(x.atMin ?? x.offset ?? i * 5) || 0,
    simTime: x.simTime || '', from: x.from || 'SimCell',
    to: Array.isArray(x.to) ? x.to : x.to ? String(x.to).split(/[,;]/).map(t => t.trim()).filter(Boolean) : [],
    mode: x.mode || 'bulletin', title: x.title || x.summary || 'Inject ' + (i + 1),
    body: x.body || x.inject || x.summary || '', expectedAction: x.expectedAction || '',
    objective: x.objective || '', notes: x.notes || '',
    lat: x.lat == null || x.lat === '' ? null : Number(x.lat), lon: x.lon == null || x.lon === '' ? null : Number(x.lon),
    severity: SEVERITIES.includes(x.severity) ? x.severity : 'medium',
    requiresResponse: x.requiresResponse ?? true,
    ...(x.sim?.type ? { sim: x.sim } : {})
  })).sort((a, b) => a.atMin - b.atMin);
  s.updatedAt = new Date().toISOString();
  return s;
}
export const slug = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// One person running the whole EOC alone: sees every inject and can action all of them.
// Not a scenario role, so it is resolved here rather than looked up in scenario.roles.
export const SOLO_ROLE = 'all-roles';
export const SOLO_NAME = 'All roles (solo)';
export const roleName = (s, id) => id === SOLO_ROLE ? SOLO_NAME : s.roles.find(r => r.id === id)?.name || id || '';

export function simClock(s, elapsedMs) {
  const t = new Date(new Date(s.simStart).getTime() + elapsedMs * s.timeScale);
  return isNaN(t) ? '' : t.toLocaleString([], { weekday: 'short', hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' });
}
export const fmtDur = ms => { const t = Math.max(0, Math.floor(ms / 1000)); const h = Math.floor(t / 3600), m = Math.floor(t / 60) % 60, sec = t % 60; return `${h ? h + ':' : ''}${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`; };

// MSEL CSV (compatible with the EdOS / WHO inject-matrix columns)
const COLS = ['id', 'stage', 'atMin', 'simTime', 'from', 'to', 'mode', 'title', 'body', 'expectedAction', 'objective', 'notes', 'lat', 'lon', 'severity', 'requiresResponse'];
export function toCSV(s) {
  const esc = v => `"${String(Array.isArray(v) ? v.join('; ') : v ?? '').replace(/"/g, '""')}"`;
  return [COLS.join(','), ...s.injects.map(i => COLS.map(c => esc(i[c])).join(','))].join('\n');
}
export function fromCSV(text) {
  const rows = []; let row = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"' && text[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') q = false; else cur += ch; }
    else if (ch === '"') q = true; else if (ch === ',') { row.push(cur); cur = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cur); rows.push(row); row = []; cur = ''; }
    else cur += ch;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  const [h, ...data] = rows.filter(r => r.some(c => c.trim()));
  const key = h.map(x => x.trim());
  return data.map(r => Object.fromEntries(key.map((k, i) => [k, k === 'requiresResponse' ? r[i] !== 'false' : r[i]])));
}
export function download(name, text, type = 'application/json') {
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; a.click();
}
