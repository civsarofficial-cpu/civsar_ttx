import React from 'react';
import { useSession, releasedInjects } from '../lib/useSession.js';
import { simClock, fmtDur } from '../lib/scenario.js';
import GLMap from '../components/GLMap.jsx';
import EventFeed from '../components/EventFeed.jsx';
// Projector / big-screen view for physical & hybrid rooms. Shows injects without expected actions.
export default function Display({ code }) {
  const { rec, err, elapsed, getElapsed } = useSession(code);
  if (err) return <div className="wrap">{err}</div>; if (!rec) return <div className="wrap">Connecting…</div>;
  const s = rec.scenario, st = rec.state, rel = releasedInjects(rec);
  const role = id => s.roles.find(r => r.id === id)?.name || id;
  return <div className="display" style={{ padding: 14 }}>
    <div className="row"><div><div className="small mut">EXERCISE · EXERCISE · EXERCISE</div><b style={{ fontSize: 26 }}>{s.title}</b></div><span className="sp" />
      {st.phase && <span className="pill" style={{ fontSize: 16, color: 'var(--acc)' }}>{st.phase}</span>}
      <div style={{ textAlign: 'right' }}><div className="clock" style={{ fontSize: 40 }}>{simClock(s, elapsed)}</div><div className="small mut">Exercise time {fmtDur(elapsed)} · {st.status.toUpperCase()} · join: <b className="mono" style={{ color: 'var(--acc)' }}>{code}</b></div></div></div>
    <div className="grid" style={{ gridTemplateColumns: '1.4fr 1fr', marginTop: 10 }}>
      <GLMap tall center={s.center} getElapsed={getElapsed} sims={st.sims || []} closed={st.closed || {}} injects={rel.map(i => ({ ...i, released: true }))} markers={rec.events.filter(e => e.kind === 'marker').map(e => ({ ...e.payload, by: e.author }))} />
      <div className="feed" style={{ maxHeight: 'calc(100vh - 120px)' }}>
        {st.status === 'ready' && <div className="card"><h2>Situation</h2><p>{s.background}</p></div>}
        {rel.slice(0, 6).map((i, k) => <div key={i.id} className={'inj rel' + (i.severity === 'critical' ? ' crit' : '')} style={{ opacity: k ? .75 : 1 }}>
          <div className="row"><span className={'sev ' + i.severity}>{i.severity}</span><span className="small mut">{i.simTime} · {i.mode} · {i.from} → {i.to.map(role).join(', ')}</span></div>
          <div style={{ fontWeight: 700 }}>{i.title}</div>{k === 0 && <div style={{ fontSize: 18 }}>{i.body}</div>}</div>)}
        <div className="card tight" style={{ fontSize: 14 }}><EventFeed rec={rec} filter={e => e.kind !== 'release'} /></div>
      </div></div></div>;
}
