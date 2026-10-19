import React, { useState } from 'react';
import { useSession, releasedInjects, me } from '../lib/useSession.js';
import { simClock, fmtDur, roleName, SOLO_ROLE, SOLO_NAME } from '../lib/scenario.js';
import { HOTLINES } from '../lib/refdata.js';
import GLMap from '../components/GLMap.jsx';
import EventFeed from '../components/EventFeed.jsx';
import FileShare, { visibleTo } from '../components/FileShare.jsx';

function Join({ code }) {
  const [c, setC] = useState(code || ''); return <div className="wrap" style={{ maxWidth: 420 }}><div className="card"><h2>Join an exercise</h2>
    <label>Session code</label><input className="mono" style={{ fontSize: 24, letterSpacing: '.2em', textTransform: 'uppercase' }} value={c} onChange={e => setC(e.target.value.toUpperCase())} maxLength={6} />
    <button className="pri" style={{ marginTop: 10 }} disabled={c.length !== 6} onClick={() => (location.hash = '/play/' + c)}>Continue</button></div></div>;
}

export default function Player({ code }) { return code ? <PlayerIn code={code} /> : <Join />; }

function PlayerIn({ code }) {
  const { rec, err, ctl, elapsed, getElapsed } = useSession(code);
  const [who, setWho] = useState(me()); const [form, setForm] = useState({ name: '', role: '', where: 'In the room' });
  const [tab, setTab] = useState('inbox'); const [drafts, setDrafts] = useState({}); const [log, setLog] = useState('');
  const [resq, setResq] = useState({ item: '', qty: 1, dest: '', priority: 'urgent' }); const [sitrep, setSitrep] = useState('');
  const [ev, setEv] = useState({ objective: 'O1', score: 3, note: '' }); const [pick, setPick] = useState(null);
  const [geo, setGeo] = useState([]);   // shared GIS files the player chose to plot
  if (err) return <div className="wrap">{err}<Join code={code} /></div>;
  if (!rec || !ctl) return <div className="wrap">Connecting to {code}…</div>;
  const s = rec.scenario, st = rec.state;
  if (!who) return <div className="wrap" style={{ maxWidth: 560 }}><div className="card"><h2>{s.title}</h2><p className="small mut">{s.hazard} · {s.location}</p>
    <label>Your name or call-sign</label><input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
    <label>Role</label><select value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}><option value="">Choose…</option>
      <option value={SOLO_ROLE}>{SOLO_NAME} — play on your own</option>
      {s.roles.map(r => <option key={r.id} value={r.id}>{r.name} ({r.kind})</option>)}</select>
    {form.role === SOLO_ROLE ? <p className="small mut">Every inject reaches you, whichever section it is addressed to, and you can action all of them. Use this to run the exercise by yourself.</p>
      : form.role && <p className="small mut">{s.roles.find(r => r.id === form.role)?.brief}</p>}
    <label>Where are you?</label><select value={form.where} onChange={e => setForm({ ...form, where: e.target.value })}><option>In the room</option><option>Remote / online</option></select>
    <button className="pri" style={{ marginTop: 10 }} disabled={!form.name || !form.role} onClick={async () => {
      const r = s.roles.find(x => x.id === form.role); if (r?.kind === 'control') { location.hash = '/control/' + code; return; }
      const w = { ...form, code }; sessionStorage.setItem('ttx:me', JSON.stringify(w)); setWho(w); await ctl.emit({ kind: 'join', role: form.role, author: form.name, payload: { where: form.where } }); }}>Join</button></div></div>;

  const solo = who.role === SOLO_ROLE;
  const role = solo ? { name: SOLO_NAME, kind: 'player', brief: 'You are running every EOC section yourself.' } : s.roles.find(r => r.id === who.role) || { name: who.role, kind: 'player' };
  const isEval = role.kind === 'evaluator', isObs = role.kind === 'observer';
  const rel = releasedInjects(rec); const mine = rel.filter(i => solo || isEval || isObs || !i.to.length || i.to.includes(who.role));
  const myResp = id => rec.events.filter(e => e.kind === 'response' && e.inject_id === id);
  // Count only what this role can actually open, so the tab badge matches the list.
  const myFiles = rec.events.filter(e => e.kind === 'file' && visibleTo(e, who, solo || isEval || isObs));
  const emit = (kind, payload, inject_id) => ctl.emit({ kind, role: who.role, author: who.name, inject_id, payload: { ...payload, elapsed } });
  const respond = async (i, status) => { await emit('response', { status, decision: drafts[i.id] || '' }, i.id); setDrafts({ ...drafts, [i.id]: '' }); };

  return <div className="wrap">
    <div className="row card tight"><div><b>{role.name}</b> <span className="small mut">· {who.name} · {who.where}</span></div><span className="sp" />
      <span className="pill">{st.status.toUpperCase()}</span>{st.phase && <span className="pill" style={{ color: 'var(--acc)' }}>{st.phase}</span>}
      <span className="clock" style={{ fontSize: 18 }}>{fmtDur(elapsed)}</span><span className="clock sim">{simClock(s, elapsed)}</span>
      <button onClick={() => { sessionStorage.removeItem('ttx:me'); setWho(null); }}>Switch role</button></div>
    {st.status === 'ready' && <div className="card" style={{ marginTop: 10 }}><h3>Situation briefing</h3><p>{s.background}</p><p className="small mut">Your role: {role.brief}</p><p className="small">Waiting for the facilitator to start (STARTEX)…</p></div>}
    {st.status === 'ended' && <div className="card" style={{ marginTop: 10, borderColor: 'var(--acc)' }}>ENDEX — the exercise has ended. <a href={'#/debrief/' + code}>Go to debrief / hot-wash</a></div>}
    <div className="tabs" style={{ marginTop: 10 }}>{[['inbox', `Inbox (${mine.length})`], ['map', 'Map / COP'], ['files', `Files (${myFiles.length})`], ['log', 'EOC log'], ...(isObs ? [] : [['actions', 'Log · Requests · Sitrep']]), ...(isEval ? [['eval', 'Evaluate']] : []), ['ref', 'Reference']].map(([k, l]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>)}</div>

    {tab === 'inbox' && <div>{!mine.length && <p className="mut">No messages for your role yet.</p>}
      {mine.map(i => { const rs = myResp(i.id); return <div key={i.id} className={'inj rel' + (i.severity === 'critical' ? ' crit' : '')}>
        <div className="row"><span className={'sev ' + i.severity}>{i.severity}</span><b>{i.id}</b><span className="small mut">{i.simTime} · {i.mode} · from {i.from}{solo && i.to.length ? ' → ' + i.to.map(t => roleName(s, t)).join(', ') : ''}</span><span className="sp" /><span className="small mut">released {fmtDur(st.released[i.id])}</span></div>
        <div style={{ fontSize: 16, fontWeight: 650, marginTop: 4 }}>EXERCISE · {i.title}</div><div>{i.body}</div>
        {isEval && <div className="small" style={{ color: '#a7f3d0' }}>Expected: {i.expectedAction} {i.objective && `(${i.objective})`}</div>}
        {rs.map(r => <div key={r.id} className="small" style={{ color: 'var(--grn)' }}>↳ {r.author} ({roleName(s, r.role)}): [{r.payload.status}] {r.payload.decision}</div>)}
        {!isEval && !isObs && i.requiresResponse && st.status !== 'ended' && <div style={{ marginTop: 6 }}><textarea placeholder="Decision / action taken / who you tasked…" value={drafts[i.id] || ''} onChange={e => setDrafts({ ...drafts, [i.id]: e.target.value })} style={{ minHeight: 50 }} />
          <div className="row" style={{ marginTop: 4 }}><button className="pri" onClick={() => respond(i, 'actioned')}>Actioned</button><button onClick={() => respond(i, 'acknowledged')}>Acknowledge</button><button onClick={() => respond(i, 'escalated')}>Escalate to EOC Manager</button><button onClick={() => respond(i, 'need-info')}>Request info</button></div></div>}
      </div>; })}</div>}

    {tab === 'map' && <div className="card"><GLMap center={s.center} getElapsed={getElapsed} sims={st.sims || []} closed={st.closed || {}} injects={s.injects.filter(i => st.released?.[i.id] != null).map(i => ({ ...i, released: true }))}
      markers={rec.events.filter(e => e.kind === 'marker').map(e => ({ ...e.payload, by: e.author }))} geo={geo} onPick={isObs ? null : (lat, lon) => setPick({ lat, lon, label: '' })} />
      {!!geo.length && <div className="row small" style={{ marginTop: 6 }}><span className="mut">Plotted from shared files:</span>
        {geo.map(g => <span key={g.name} className="pill">{g.name} <button style={{ padding: '0 4px', border: 0, background: 'none' }} onClick={() => setGeo(x => x.filter(y => y.name !== g.name))}>✕</button></span>)}</div>}
      {pick && <div className="row" style={{ marginTop: 6 }}><span className="small mono">{pick.lat}, {pick.lon}</span><input className="f" placeholder="Marker label (e.g. Safety centre #2, road closed, ICP)" value={pick.label} onChange={e => setPick({ ...pick, label: e.target.value })} />
        <button className="pri" disabled={!pick.label} onClick={async () => { await emit('marker', pick); setPick(null); }}>Place for team</button></div>}</div>}

    {tab === 'files' && <div className="card"><h3>Shared files</h3>
      <p className="small mut">Pass photos, sketches, spreadsheets, KML and documents to the other sections. A KML, GeoJSON or CSV can be drawn straight onto the map.</p>
      <FileShare rec={rec} me={who} readOnly={isObs} seeAll={solo || isEval || isObs} emit={(kind, payload) => emit(kind, payload)}
        onGeo={(name, data) => { setGeo(g => [...g.filter(x => x.name !== name), { name, data }]); setTab('map'); }} /></div>}

    {tab === 'log' && <div className="card"><EventFeed rec={rec} /></div>}

    {tab === 'actions' && <div className="grid g3">
      <div className="card"><h3>Significant event log</h3><textarea value={log} onChange={e => setLog(e.target.value)} placeholder="What happened, decision made, by whom" /><button className="pri" style={{ marginTop: 6 }} disabled={!log} onClick={async () => { await emit('log', { text: log }); setLog(''); }}>Add to EOC log</button></div>
      <div className="card"><h3>Resource request</h3><label>Item</label><input value={resq.item} onChange={e => setResq({ ...resq, item: e.target.value })} placeholder="Boats, water bowser, tarpaulins…" />
        <div className="row"><div className="f"><label>Qty</label><input type="number" value={resq.qty} onChange={e => setResq({ ...resq, qty: +e.target.value })} /></div><div className="f"><label>Priority</label><select value={resq.priority} onChange={e => setResq({ ...resq, priority: e.target.value })}><option>life-safety</option><option>urgent</option><option>routine</option></select></div></div>
        <label>Deliver to</label><input value={resq.dest} onChange={e => setResq({ ...resq, dest: e.target.value })} /><button className="pri" style={{ marginTop: 6 }} disabled={!resq.item} onClick={async () => { await emit('resource', resq); setResq({ ...resq, item: '', dest: '' }); }}>Submit request</button></div>
      <div className="card"><h3>Situation report</h3><textarea style={{ minHeight: 120 }} value={sitrep} onChange={e => setSitrep(e.target.value)} placeholder={'Situation:\nAffected (people / DS divisions):\nActions taken:\nNeeds / gaps:\nNext period objectives:'} /><button className="pri" style={{ marginTop: 6 }} disabled={!sitrep} onClick={async () => { await emit('sitrep', { text: sitrep }); setSitrep(''); }}>Publish sitrep</button></div>
    </div>}

    {tab === 'eval' && <div className="grid g2"><div className="card"><h3>Score against objectives</h3>
      <label>Objective</label><select value={ev.objective} onChange={e => setEv({ ...ev, objective: e.target.value })}>{s.objectives.filter(Boolean).map((o, k) => <option key={k} value={'O' + (k + 1)}>{o.slice(0, 90)}</option>)}</select>
      <label>Score (1 = not met … 5 = fully met)</label><div className="row">{[1, 2, 3, 4, 5].map(n => <button key={n} className={ev.score === n ? 'pri' : ''} onClick={() => setEv({ ...ev, score: n })}>{n}</button>)}</div>
      <label>Observation / evidence</label><textarea value={ev.note} onChange={e => setEv({ ...ev, note: e.target.value })} /><button className="pri" style={{ marginTop: 6 }} onClick={async () => { await emit('eval', ev); setEv({ ...ev, note: '' }); }}>Record</button></div>
      <div className="card"><h3>My evaluations</h3><EventFeed rec={rec} all filter={e => e.kind === 'eval'} /></div></div>}

    {tab === 'ref' && <div className="grid g2"><div className="card"><h3>Exercise</h3><p><b>Aim:</b> {s.aim}</p><ol>{s.objectives.filter(Boolean).map((o, k) => <li key={k}>{o}</li>)}</ol><p className="small">{s.background}</p></div>
      <div className="card"><h3>Roles</h3>{s.roles.map(r => <div key={r.id} className="small"><b>{r.name}</b> — {r.brief}</div>)}<h3 style={{ marginTop: 12 }}>Real hotlines (not for exercise play)</h3>{HOTLINES.map(([n, l]) => <div key={n} className="small"><b className="mono">{n}</b> {l}</div>)}</div></div>}
  </div>;
}
