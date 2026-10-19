import React, { useEffect, useState } from 'react';
import { useSession, releasedInjects } from '../lib/useSession.js';
import { simClock, fmtDur, download, slug, roleName, MODES, SEVERITIES } from '../lib/scenario.js';
import { elapsedOf } from '../lib/backend.js';
import GLMap from '../components/GLMap.jsx';
import SimForm from '../components/SimForm.jsx';
import { simFromInject, HAZARD_TYPES } from '../lib/hazards.js';
import EventFeed from '../components/EventFeed.jsx';
import FileShare from '../components/FileShare.jsx';
import { sessionGeoJSON, geoJSONtoKML } from '../lib/gis.js';

export default function Control({ code }) {
  const { rec, err, ctl, elapsed, getElapsed } = useSession(code);
  const [sim, setSim] = useState({ type: 'flood', params: {}, label: '', lat: null, lon: null });
  const [tab, setTab] = useState('msel'); const [adhoc, setAdhoc] = useState({ title: '', body: '', to: [], mode: 'phone', severity: 'medium', from: 'SimCell' });
  const [geo, setGeo] = useState([]);
  // Auto-release injects whose time has come (only the control console does this).
  useEffect(() => {
    if (!rec || !ctl || rec.state.status !== 'running' || !rec.state.auto) return;
    const due = rec.scenario.injects.filter(i => rec.state.released?.[i.id] == null && i.atMin * 60000 <= elapsed);
    if (due.length) release(due.map(d => d.id));
  }, [Math.floor(elapsed / 1000), rec?.state.status]);
  if (err) return <div className="wrap">{err} — <a href="#/">back</a></div>;
  if (!rec || !ctl) return <div className="wrap">Connecting to session {code}…</div>;
  const { scenario: s, state, events } = rec;
  const release = ids => { const el = elapsedOf(ctl.get().state); const sc = ctl.get().scenario; const newSims = ids.map(i => sc.injects.find(x => x.id === i)).filter(i => i?.sim?.type && (i.sim.lat ?? i.lat) != null).map(i => simFromInject(i, el));
    ctl.setState(st => ({ released: { ...st.released, ...Object.fromEntries(ids.map(i => [i, el])) }, sims: [...(st.sims || []), ...newSims] })); ids.forEach(i => ctl.emit({ kind: 'release', inject_id: i, author: 'Control', payload: { elapsed: el } })); };
  const unrelease = id => ctl.setState(st => { const r = { ...st.released }; delete r[id]; return { released: r }; });
  const start = () => ctl.setState({ status: 'running', startedAt: Date.now() }).then(() => ctl.emit({ kind: 'log', author: 'Control', payload: { text: 'STARTEX — EXERCISE EXERCISE EXERCISE' } }));
  const pause = () => ctl.setState(st => ({ status: 'paused', offsetMs: elapsedOf(st), startedAt: null }));
  const endex = () => { if (confirm('ENDEX — end the exercise?')) ctl.setState(st => ({ status: 'ended', offsetMs: elapsedOf(st), startedAt: null })).then(() => ctl.emit({ kind: 'log', author: 'Control', payload: { text: 'ENDEX — EXERCISE EXERCISE EXERCISE' } })); };
  const jump = min => ctl.setState(st => ({ offsetMs: Math.max(0, elapsedOf(st) + min * 60000), startedAt: st.status === 'running' ? Date.now() : null }));
  // Wind the clock straight to the next inject rather than sitting out the gap (solo play, or a room that is ready early).
  const skipToNext = () => next && ctl.setState(st => ({ offsetMs: Math.max(elapsedOf(st), next.atMin * 60000), startedAt: st.status === 'running' ? Date.now() : null }));
  const toggleClosed = k => ctl.setState(st => ({ closed: { ...(st.closed || {}), [k]: !(st.closed || {})[k] } })).then(() => ctl.emit({ kind: 'log', author: 'Control', payload: { text: `${k} ${(ctl.get().state.closed || {})[k] ? 'CLOSED' : 'REOPENED'} (exercise)` } }));
  const sendAdhoc = async () => { const id = 'X' + (s.injects.filter(i => i.id.startsWith('X')).length + 1); const inj = { ...adhoc, id, atMin: Math.round(elapsed / 60000), simTime: simClock(s, elapsed), stage: 'Ad-hoc', expectedAction: '', objective: '', notes: '', lat: null, lon: null, requiresResponse: true };
    await ctl.setScenario({ ...s, injects: [...s.injects, inj] }); release([id]); setAdhoc({ ...adhoc, title: '', body: '' }); };
  const resp = events.filter(e => e.kind === 'response'); const joins = events.filter(e => e.kind === 'join');
  const next = s.injects.find(i => state.released?.[i.id] == null);
  const base = location.origin + location.pathname;
  const players = s.roles.filter(r => r.kind === 'player');

  return <div className="wrap">
    <div className="grid" style={{ gridTemplateColumns: 'auto 1fr auto', alignItems: 'center' }}>
      <div><div className="small mut">Join code</div><div className="big-code">{code}</div></div>
      <div><h2 style={{ margin: 0 }}>{s.title}</h2><div className="small mut">{s.hazard} · {s.location} · {s.mode} · {state.status.toUpperCase()}</div>
        <div className="small">Players: <a href={`#/play/${code}`} target="_blank">{base}#/play/{code}</a> · Projector: <a href={`#/display/${code}`} target="_blank">open display</a> · <a href={`#/debrief/${code}`}>Debrief</a></div></div>
      <div style={{ textAlign: 'right' }}><div className="clock">{fmtDur(elapsed)}<span className="mut small"> / {s.durationMin}′</span></div><div className="clock sim">{simClock(s, elapsed)}</div></div>
    </div>
    <div className="row card tight" style={{ margin: '10px 0' }}>
      {state.status !== 'running' ? <button className="grn" onClick={start} disabled={state.status === 'ended'}>▶ {state.status === 'paused' ? 'Resume' : 'STARTEX'}</button> : <button onClick={pause}>⏸ Pause</button>}
      <button className="red" onClick={endex} disabled={state.status === 'ended'}>■ ENDEX</button>
      <button onClick={() => jump(-5)}>−5′</button><button onClick={() => jump(5)}>+5′</button>
      <button onClick={skipToNext} disabled={!next} title={next ? `Jump the clock to ${next.id} at T+${next.atMin}′` : 'All injects released'}>⏭ Next inject</button>
      <label style={{ display: 'flex', gap: 4, margin: 0, color: 'var(--tx)' }}><input type="checkbox" style={{ width: 'auto' }} checked={state.auto} onChange={e => ctl.setState({ auto: e.target.checked })} />Auto-release by timeline</label>
      <label style={{ margin: 0 }}>Speed <select style={{ width: 70 }} value={state.speed || 1} onChange={e => ctl.setState(st => ({ offsetMs: elapsedOf(st), startedAt: st.status === 'running' ? Date.now() : null, speed: +e.target.value }))}>{[0.5, 1, 2, 4, 10].map(x => <option key={x} value={x}>{x}×</option>)}</select></label>
      <input className="f" placeholder="Operational period / phase banner (shown to all)" value={state.phase || ''} onChange={e => ctl.setState({ phase: e.target.value })} />
      <span className="pill">{joins.length} joined · {Object.keys(state.released || {}).length}/{s.injects.length} released · {resp.length} responses</span>
      {next && <span className="small mut">Next: <b>{next.id}</b> at T+{next.atMin}′</span>}
    </div>
    <div className="tabs">{[['msel', 'MSEL / injects'], ['cop', 'Common operating picture'], ['hazard', `Hazard simulator (${(state.sims || []).length})`], ['simcell', 'SimCell ad-hoc'], ['files', `Files (${events.filter(e => e.kind === 'file').length})`], ['log', `Log (${events.length})`], ['people', `Participants (${joins.length})`]].map(([k, l]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>)}</div>

    {tab === 'msel' && <div className="grid g2"><div className="card feed" style={{ maxHeight: '70vh' }}>
      {s.injects.map(i => { const r = state.released?.[i.id]; const rs = resp.filter(e => e.inject_id === i.id);
        return <div key={i.id} className={'inj' + (r != null ? ' rel' : next?.id === i.id ? ' next' : '') + (i.severity === 'critical' ? ' crit' : '')}>
          <div className="row"><span className="mono small">T+{i.atMin}′</span><span className={'sev ' + i.severity}>{i.severity}</span><b>{i.id}</b><span className="small mut">{i.stage} · {i.simTime}</span><span className="sp" />
            {r == null ? <button className="pri" onClick={() => release([i.id])}>Release</button> : <><span className="small" style={{ color: 'var(--acc)' }}>released {fmtDur(r)}</span><button onClick={() => unrelease(i.id)} title="Withdraw">↺</button></>}</div>
          <div><b>{i.title}</b> <span className="small mut">— {i.from} → {i.to.map(t => s.roles.find(x => x.id === t)?.name || t).join(', ')} ({i.mode})</span></div>
          <div className="small">{i.body}</div>
          {i.expectedAction && <div className="small" style={{ color: '#a7f3d0' }}>Expected: {i.expectedAction}</div>}
          {i.notes && <div className="small mut">Notes: {i.notes}</div>}
          {r != null && i.requiresResponse && <div className="small" style={{ color: rs.length ? 'var(--grn)' : 'var(--red)' }}>{rs.length ? `${rs.length} response(s); first after ${fmtDur(rs[0].payload.elapsed - r)}` : 'Awaiting response'}</div>}
        </div>; })}</div>
      <div className="card"><h3>Live EOC log</h3><EventFeed rec={rec} /></div></div>}

    {tab === 'cop' && <div className="card"><p className="small mut">Click an airport/port to close it — exercise traffic diverts (CMB → Mattala, Colombo Port → Hambantota). Live layers fall back between providers; your own GIS services are under <b>Data &amp; GIS</b>.</p>
      <GLMap center={s.center} getElapsed={getElapsed} sims={state.sims || []} closed={state.closed || {}} onToggleClosed={toggleClosed} injects={s.injects.map(i => ({ ...i, released: state.released?.[i.id] != null }))} markers={events.filter(e => e.kind === 'marker').map(e => ({ ...e.payload, by: e.author + ' · ' + e.role }))} geo={geo} />
      <div className="row" style={{ marginTop: 8 }}><span className="small mut">Export the picture for QGIS / ArcGIS / Google My Maps:</span>
        <button onClick={() => download(slug(s.title) + '-' + code + '.geojson', JSON.stringify(sessionGeoJSON(rec), null, 2), 'application/geo+json')}>GeoJSON</button>
        <button onClick={() => download(slug(s.title) + '-' + code + '.kml', geoJSONtoKML(sessionGeoJSON(rec), s.title), 'application/vnd.google-earth.kml+xml')}>KML</button></div></div>}

    {tab === 'hazard' && <div className="grid" style={{ gridTemplateColumns: 'minmax(320px,1fr) 2fr' }}>
      <div className="card"><h3>Trigger a simulated event</h3><p className="small mut">Runs on every screen (players, projector), synced to the exercise clock: pauses with the exercise and speeds up with it. Click the map to set the location.</p>
        <SimForm value={sim} onChange={setSim} showLoc />
        <button className="pri" style={{ marginTop: 8 }} disabled={sim.lat == null || sim.lon == null} onClick={async () => { const at = elapsedOf(ctl.get().state); const def = { id: 'S' + Date.now().toString(36), type: sim.type, lat: sim.lat, lon: sim.lon, params: sim.params, label: sim.label || HAZARD_TYPES[sim.type].label, at };
          await ctl.setState(st => ({ sims: [...(st.sims || []), def] })); ctl.emit({ kind: 'log', author: 'Control', payload: { text: `SIMULATION: ${def.label} at ${def.lat}, ${def.lon}`, elapsed: at } }); }}>▶ Trigger now</button>
        <h3 style={{ marginTop: 14 }}>Active simulations</h3>
        {(state.sims || []).map(x => <div key={x.id} className="row small" style={{ marginBottom: 4 }}><span>{HAZARD_TYPES[x.type]?.icon} {x.label}</span><span className="mut">from T+{fmtDur(x.at)}</span><span className="sp" />
          <button onClick={() => ctl.setState(st => ({ sims: (st.sims || []).map(y => y.id === x.id ? { ...y, at: elapsedOf(st) } : y) }))}>↺ Restart</button>
          <button onClick={() => ctl.setState(st => ({ sims: (st.sims || []).filter(y => y.id !== x.id) }))}>✕</button></div>)}
        {(state.sims || []).length > 0 && <button onClick={() => ctl.setState({ sims: [] })}>Clear all</button>}
        {state.status !== 'running' && <p className="small" style={{ color: 'var(--acc)' }}>The exercise clock is not running, so simulations are frozen. Press STARTEX or Resume.</p>}</div>
      <div className="card"><GLMap center={s.center} getElapsed={getElapsed} sims={state.sims || []} closed={state.closed || {}} onToggleClosed={toggleClosed} onPick={(lat, lon) => setSim(v => ({ ...v, lat, lon }))}
        injects={sim.lat != null ? [{ id: 'NEW', title: 'New simulation', lat: sim.lat, lon: sim.lon, released: true, severity: 'critical', body: '', from: '' }] : []} /></div></div>}

    {tab === 'simcell' && <div className="card"><h3>Send an ad-hoc inject (SimCell)</h3><p className="small mut">Role-play a caller, journalist, ministry or rumour in response to what teams are doing.</p>
      <div className="row"><div className="f"><label>From</label><input value={adhoc.from} onChange={e => setAdhoc({ ...adhoc, from: e.target.value })} /></div>
        <div className="f"><label>Mode</label><select value={adhoc.mode} onChange={e => setAdhoc({ ...adhoc, mode: e.target.value })}>{MODES.map(m => <option key={m}>{m}</option>)}</select></div>
        <div className="f"><label>Severity</label><select value={adhoc.severity} onChange={e => setAdhoc({ ...adhoc, severity: e.target.value })}>{SEVERITIES.map(m => <option key={m}>{m}</option>)}</select></div></div>
      <label>To</label><div className="row">{players.map(r => <label key={r.id} style={{ display: 'flex', gap: 4, color: 'var(--tx)' }}><input type="checkbox" style={{ width: 'auto' }} checked={adhoc.to.includes(r.id)} onChange={e => setAdhoc({ ...adhoc, to: e.target.checked ? [...adhoc.to, r.id] : adhoc.to.filter(x => x !== r.id) })} />{r.name}</label>)}</div>
      <label>Title</label><input value={adhoc.title} onChange={e => setAdhoc({ ...adhoc, title: e.target.value })} />
      <label>Message</label><textarea value={adhoc.body} onChange={e => setAdhoc({ ...adhoc, body: e.target.value })} />
      <button className="pri" style={{ marginTop: 8 }} disabled={!adhoc.title} onClick={sendAdhoc}>Send now</button></div>}

    {tab === 'files' && <div className="card"><h3>Files in this exercise</h3>
      <p className="small mut">Push annexes, maps, forms and imagery to players, and see what they share with each other. Geo files can be drawn on the COP.</p>
      <FileShare rec={rec} me={{ name: 'Control', role: 'control' }} seeAll emit={(kind, payload) => ctl.emit({ kind, author: 'Control', role: 'control', payload: { ...payload, elapsed } })}
        onGeo={(name, data) => { setGeo(g => [...g.filter(x => x.name !== name), { name, data }]); setTab('cop'); }} /></div>}

    {tab === 'log' && <div className="card"><EventFeed rec={rec} all /><button style={{ marginTop: 8 }} onClick={() => download(slug(s.title) + '-' + code + '-log.json', JSON.stringify(rec, null, 2))}>Export full session JSON</button></div>}
    {tab === 'people' && <div className="card"><table><thead><tr><th>Name</th><th>Role</th><th>Location</th><th>Joined</th></tr></thead><tbody>
      {joins.map(j => <tr key={j.id}><td>{j.author}</td><td>{roleName(s, j.role)}</td><td>{j.payload.where}</td><td className="small mut">{new Date(j.created_at).toLocaleTimeString()}</td></tr>)}</tbody></table></div>}
  </div>;
}
