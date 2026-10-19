import React from 'react';
import { fmtDur, roleName } from '../lib/scenario.js';
const LBL = { release: '📣 Inject', response: '✅ Action', log: '📝 Log', sitrep: '📊 Sitrep', resource: '🚚 Request', eval: '🧭 Eval', join: '👤 Joined', marker: '📍 Marker', hotwash: '💬 Hot-wash', file: '📎 File' };
export default function EventFeed({ rec, all, filter }) {
  const role = id => roleName(rec.scenario, id);
  let ev = [...rec.events].reverse(); if (!all) ev = ev.filter(e => e.kind !== 'eval' && e.kind !== 'join'); if (filter) ev = ev.filter(filter);
  return <div className="feed">{ev.map(e => { const p = e.payload || {}; const inj = e.inject_id && rec.scenario.injects.find(i => i.id === e.inject_id);
    return <div key={e.id} className="ev small"><span className="mono mut">{p.elapsed != null ? 'T+' + fmtDur(p.elapsed) : new Date(e.created_at).toLocaleTimeString()}</span> {LBL[e.kind] || e.kind} <b>{e.author}</b> <span className="mut">{role(e.role)}</span>
      {inj && <span className="mut"> · {inj.id} {inj.title}</span>}
      {p.status && <span className="pill" style={{ marginLeft: 4 }}>{p.status}</span>}
      {(p.text || p.decision) && <div>{p.text || p.decision}</div>}
      {e.kind === 'eval' && <div>{p.objective}: {'★'.repeat(p.score || 0)} {p.note}</div>}
      {e.kind === 'resource' && <div>{p.qty} × {p.item} → {p.dest} ({p.priority})</div>}
      {e.kind === 'marker' && <div>{p.label} ({p.lat}, {p.lon})</div>}
      {e.kind === 'file' && <div><a href={p.dataUrl || p.url} download={p.type === 'link' ? undefined : p.name} target="_blank" rel="noreferrer">{p.name}</a> {p.note && <span className="mut">— {p.note}</span>}</div>}</div>; })}</div>;
}
