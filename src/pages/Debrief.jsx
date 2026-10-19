import React, { useState } from 'react';
import { useSession, me } from '../lib/useSession.js';
import { fmtDur, download, slug } from '../lib/scenario.js';
import EventFeed from '../components/EventFeed.jsx';
// Hot-wash + after-action report (WHO SimEx evaluation; TTx_09/22/24 templates).
export default function Debrief({ code }) {
  const { rec, err, ctl } = useSession(code); const [hw, setHw] = useState({ well: '', improve: '', action: '' });
  if (err) return <div className="wrap">{err}</div>; if (!rec) return <div className="wrap">Loading…</div>;
  const s = rec.scenario, st = rec.state, ev = rec.events;
  const resp = ev.filter(e => e.kind === 'response'), evals = ev.filter(e => e.kind === 'eval'), hws = ev.filter(e => e.kind === 'hotwash');
  const rows = s.injects.filter(i => st.released?.[i.id] != null).map(i => { const rs = resp.filter(r => r.inject_id === i.id).sort((a, b) => a.payload.elapsed - b.payload.elapsed);
    return { i, rel: st.released[i.id], first: rs[0] ? rs[0].payload.elapsed - st.released[i.id] : null, n: rs.length, by: [...new Set(rs.map(r => r.role))] }; });
  const objs = s.objectives.filter(Boolean).map((o, k) => { const id = 'O' + (k + 1); const sc = evals.filter(e => e.payload.objective === id);
    return { id, o, avg: sc.length ? sc.reduce((a, e) => a + e.payload.score, 0) / sc.length : null, notes: sc.map(e => `${e.author}: ${e.payload.note}`).filter(x => !x.endsWith(': ')), injects: s.injects.filter(i => i.objective === id).length }; });
  const answered = rows.filter(r => r.n).length, needed = rows.filter(r => r.i.requiresResponse).length;
  const avgResp = rows.filter(r => r.first != null).reduce((a, r, _, arr) => a + r.first / arr.length, 0);
  const report = () => { const L = [`# After-Action Report — ${s.title}`, `Session ${code} · ${s.hazard} · ${s.location} · mode: ${s.mode}`, '', `## Aim`, s.aim, '', '## Objectives & evaluation',
    ...objs.map(o => `- **${o.id}** ${o.o} — score ${o.avg ? o.avg.toFixed(1) + '/5' : 'not evaluated'}${o.notes.length ? '\n  - ' + o.notes.join('\n  - ') : ''}`), '', '## Inject performance', '| Inject | Released | First response | Responses | Roles |', '|---|---|---|---|---|',
    ...rows.map(r => `| ${r.i.id} ${r.i.title} | T+${fmtDur(r.rel)} | ${r.first != null ? fmtDur(r.first) : '—'} | ${r.n} | ${r.by.join(', ')} |`), '', '## Hot-wash',
    ...hws.map(h => `- ${h.author} (${h.role}): ✔ ${h.payload.well} / △ ${h.payload.improve} / → ${h.payload.action}`), '', '## Timeline',
    ...[...ev].sort((a, b) => (a.payload?.elapsed ?? 0) - (b.payload?.elapsed ?? 0)).map(e => `- ${e.payload?.elapsed != null ? 'T+' + fmtDur(e.payload.elapsed) : ''} ${e.kind} ${e.author || ''} ${e.inject_id || ''} ${e.payload?.decision || e.payload?.text || ''}`)];
    download(slug(s.title) + '-AAR-' + code + '.md', L.join('\n'), 'text/markdown'); };
  const who = me();
  return <div className="wrap"><h1>Debrief — {s.title}</h1>
    <div className="kpis card"><div><div className="stat">{rows.length}/{s.injects.length}</div><div className="small mut">injects released</div></div><div><div className="stat">{answered}/{needed}</div><div className="small mut">answered</div></div>
      <div><div className="stat">{fmtDur(avgResp)}</div><div className="small mut">avg first response</div></div><div><div className="stat">{ev.filter(e => e.kind === 'join').length}</div><div className="small mut">participants</div></div>
      <span className="sp" /><button className="pri" onClick={report}>Download after-action report (.md)</button><button onClick={() => download(slug(s.title) + '-' + code + '.json', JSON.stringify(rec, null, 2))}>Session JSON</button></div>
    <div className="grid g2" style={{ marginTop: 12 }}>
      <div className="card"><h3>Objectives</h3>{objs.map(o => <div key={o.id} className="ev"><b>{o.id}</b> {o.o}<div className="small">{o.avg ? <span style={{ color: o.avg >= 4 ? 'var(--grn)' : o.avg >= 3 ? 'var(--acc)' : 'var(--red)' }}>{'★'.repeat(Math.round(o.avg))} {o.avg.toFixed(1)}/5</span> : <span className="mut">not evaluated</span>} <span className="mut">· {o.injects} injects</span></div>{o.notes.map((n, k) => <div key={k} className="small mut">{n}</div>)}</div>)}</div>
      <div className="card"><h3>Inject performance</h3><table><thead><tr><th>Inject</th><th>Released</th><th>1st response</th><th>#</th></tr></thead><tbody>{rows.map(r => <tr key={r.i.id}><td>{r.i.id} {r.i.title}</td><td className="mono">{fmtDur(r.rel)}</td><td className="mono" style={{ color: r.first == null && r.i.requiresResponse ? 'var(--red)' : '' }}>{r.first != null ? fmtDur(r.first) : '—'}</td><td>{r.n}</td></tr>)}</tbody></table></div>
      <div className="card"><h3>Hot-wash</h3>{ctl && <><label>What went well</label><input value={hw.well} onChange={e => setHw({ ...hw, well: e.target.value })} /><label>What to improve</label><input value={hw.improve} onChange={e => setHw({ ...hw, improve: e.target.value })} /><label>Action / owner</label><input value={hw.action} onChange={e => setHw({ ...hw, action: e.target.value })} />
        <button className="pri" style={{ marginTop: 6 }} onClick={async () => { await ctl.emit({ kind: 'hotwash', role: who?.role || 'control', author: who?.name || 'Facilitator', payload: hw }); setHw({ well: '', improve: '', action: '' }); }}>Add</button></>}
        {hws.map(h => <div key={h.id} className="ev small"><b>{h.author}</b>: ✔ {h.payload.well} · △ {h.payload.improve} · → {h.payload.action}</div>)}</div>
      <div className="card"><h3>Full timeline</h3><EventFeed rec={rec} all /></div></div></div>;
}
