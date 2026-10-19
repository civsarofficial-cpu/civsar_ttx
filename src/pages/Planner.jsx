import React, { useEffect, useState } from 'react';
import { listExercises, saveExercise, createSession } from '../lib/backend.js';
import { normalize, uid, SEVERITIES, MODES, toCSV, download, slug } from '../lib/scenario.js';
import { generateScenario } from '../lib/ai.js';
import GLMap from '../components/GLMap.jsx';
import SimForm from '../components/SimForm.jsx';
import { go } from '../App.jsx';

const CHECKLIST = ['Concept note agreed & signed off (aim, scope, objectives, participants, budget)', 'Exercise Director & Lead Facilitator appointed', 'Scenario & problem statements brainstormed with SMEs', 'MSEL / inject matrix complete; every inject mapped to an objective', 'Roles assigned; pre-reading circulated', 'Venue / online room & projector tested (polling, breakout rooms)', 'Evaluators briefed with evaluation guide', 'Safety & "No Duff" (real-emergency stop) procedure briefed', 'Media/PR guidance agreed', 'Hot-wash, debrief and report owners named'];

export default function Planner({ id }) {
  const [s, setS] = useState(null); const [tab, setTab] = useState('overview'); const [sel, setSel] = useState(null);
  const [preview, setPreview] = useState(null); const [pspeed, setPspeed] = useState(20);
  const [dirty, setDirty] = useState(false); const [json, setJson] = useState(''); const [msg, setMsg] = useState(''); const [ai, setAi] = useState(''); const [busy, setBusy] = useState(false);
  useEffect(() => { listExercises().then(l => setS(l.find(x => x.id === id) || null)); }, [id]);
  useEffect(() => { if (tab === 'json' && s) setJson(JSON.stringify(s, null, 2)); }, [tab]);
  if (!s) return <div className="wrap">Loading… (or exercise not found — <a href="#/">back</a>)</div>;
  const up = p => { setS({ ...s, ...p }); setDirty(true); };
  const upInj = (iid, p) => up({ injects: s.injects.map(i => (i.id === iid ? { ...i, ...p } : i)) });
  const save = async () => { const n = normalize(s); await saveExercise(n); setS(n); setDirty(false); setMsg('Saved'); setTimeout(() => setMsg(''), 1500); };
  const inj = s.injects.find(i => i.id === sel);
  const players = s.roles.filter(r => r.kind === 'player');
  const run = async () => { const n = normalize(s); await saveExercise(n); go('/control/' + await createSession(n)); };
  const aiFill = async () => { setBusy(true); try { const out = await generateScenario(ai || 'Complete and enrich this exercise.', s); setS(normalize({ ...out, id: s.id })); setDirty(true); setMsg('Claude merged its draft — review, then Save.'); } catch (e) { setMsg(e.message); } setBusy(false); };

  return <div className="wrap">
    <div className="row"><input className="f" style={{ fontSize: 18, fontWeight: 650 }} value={s.title} onChange={e => up({ title: e.target.value })} />
      <button onClick={save} className={dirty ? 'pri' : ''}>{dirty ? 'Save' : 'Saved'}</button><button className="grn" onClick={run}>▶ Start live session</button><span className="mut small">{msg}</span></div>
    <div className="tabs" style={{ marginTop: 10 }}>{[['overview', 'Concept & objectives'], ['roles', 'Roles'], ['msel', `Inject matrix (${s.injects.length})`], ['map', 'Map'], ['ai', 'Claude assist'], ['json', 'JSON'], ['check', 'Checklist']].map(([k, l]) =>
      <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>)}</div>

    {tab === 'overview' && <div className="grid g2">
      <div className="card">
        <div className="row"><div className="f"><label>Hazard</label><input value={s.hazard} onChange={e => up({ hazard: e.target.value })} /></div><div className="f"><label>Location</label><input value={s.location} onChange={e => up({ location: e.target.value })} /></div></div>
        <label>Aim</label><textarea value={s.aim} onChange={e => up({ aim: e.target.value })} />
        <label>Background / situation (read at STARTEX)</label><textarea style={{ minHeight: 120 }} value={s.background} onChange={e => up({ background: e.target.value })} />
      </div>
      <div className="card">
        <label>Delivery mode</label>
        <div className="row">{['physical', 'online', 'hybrid'].map(m => <button key={m} className={s.mode === m ? 'pri' : ''} onClick={() => up({ mode: m })}>{m}</button>)}</div>
        <p className="small mut">{s.mode === 'physical' ? 'One room: facilitator console + projector display; teams can use paper or shared devices.' : s.mode === 'online' ? 'Everyone joins by code on their own device; injects arrive in role inboxes.' : 'Room teams on the projector + remote players joining by code.'}</p>
        <div className="row"><div className="f"><label>Duration (real minutes)</label><input type="number" value={s.durationMin} onChange={e => up({ durationMin: +e.target.value })} /></div>
          <div className="f"><label>Time scale (sim min / real min)</label><input type="number" value={s.timeScale} onChange={e => up({ timeScale: +e.target.value })} /></div>
          <div className="f"><label>Scenario start (in-world)</label><input type="datetime-local" value={s.simStart?.slice(0, 16)} onChange={e => up({ simStart: e.target.value })} /></div></div>
        <label>Objectives (one per line — reference as O1, O2…)</label>
        <textarea style={{ minHeight: 140 }} value={s.objectives.join('\n')} onChange={e => up({ objectives: e.target.value.split('\n') })} />
      </div></div>}

    {tab === 'roles' && <div className="card"><table><thead><tr><th>ID</th><th>Name</th><th>Kind</th><th>Brief / responsibilities</th><th /></tr></thead><tbody>
      {s.roles.map((r, i) => <tr key={i}><td style={{ width: 130 }}><input value={r.id} onChange={e => up({ roles: s.roles.map((x, j) => j === i ? { ...x, id: slug(e.target.value) } : x) })} /></td>
        <td><input value={r.name} onChange={e => up({ roles: s.roles.map((x, j) => j === i ? { ...x, name: e.target.value } : x) })} /></td>
        <td style={{ width: 120 }}><select value={r.kind} onChange={e => up({ roles: s.roles.map((x, j) => j === i ? { ...x, kind: e.target.value } : x) })}>{['control', 'player', 'evaluator', 'observer'].map(k => <option key={k}>{k}</option>)}</select></td>
        <td><input value={r.brief} onChange={e => up({ roles: s.roles.map((x, j) => j === i ? { ...x, brief: e.target.value } : x) })} /></td>
        <td><button onClick={() => up({ roles: s.roles.filter((_, j) => j !== i) })}>✕</button></td></tr>)}</tbody></table>
      <button style={{ marginTop: 8 }} onClick={() => up({ roles: [...s.roles, { id: 'role-' + (s.roles.length + 1), name: 'New role', kind: 'player', brief: '' }] })}>+ Add role</button></div>}

    {tab === 'msel' && <div className="grid" style={{ gridTemplateColumns: 'minmax(300px,1fr) minmax(340px,1.3fr)' }}>
      <div className="card feed" style={{ maxHeight: '75vh' }}>
        <div className="row"><button className="pri" onClick={() => { const n = { id: 'I' + (s.injects.length + 1) + '-' + uid().slice(0, 3), stage: '', atMin: (s.injects.at(-1)?.atMin || 0) + 5, simTime: '', from: 'SimCell', to: [], mode: 'bulletin', title: 'New inject', body: '', expectedAction: '', objective: '', notes: '', lat: null, lon: null, severity: 'medium', requiresResponse: true }; up({ injects: [...s.injects, n] }); setSel(n.id); }}>+ Inject</button>
          <button onClick={() => download(slug(s.title) + '-MSEL.csv', toCSV(s), 'text/csv')}>Export MSEL CSV</button></div>
        {s.injects.map(i => <div key={i.id} className={'inj' + (sel === i.id ? ' next' : '')} onClick={() => setSel(i.id)} style={{ cursor: 'pointer' }}>
          <div className="row"><span className="mono small">T+{i.atMin}′</span><span className={'sev ' + i.severity}>{i.severity}</span><b>{i.id}</b><span className="mut small">{i.stage}</span></div>
          <div>{i.title}</div><div className="small mut">{i.from} → {i.to.join(', ') || '—'} · {i.mode} {i.objective && '· ' + i.objective}</div></div>)}
      </div>
      <div className="card">{!inj ? <p className="mut">Select an inject to edit.</p> : <>
        <div className="row"><div className="f"><label>ID</label><input value={inj.id} onChange={e => { upInj(inj.id, { id: e.target.value }); setSel(e.target.value); }} /></div>
          <div className="f"><label>Stage</label><input list="stages" value={inj.stage} onChange={e => upInj(inj.id, { stage: e.target.value })} /><datalist id="stages">{['Preparedness', 'Alert', 'Response', 'Escalation', 'Recovery'].map(x => <option key={x} value={x} />)}</datalist></div>
          <div className="f"><label>Release at T+ (real min)</label><input type="number" value={inj.atMin} onChange={e => upInj(inj.id, { atMin: +e.target.value })} /></div>
          <div className="f"><label>Simulated time</label><input value={inj.simTime} onChange={e => upInj(inj.id, { simTime: e.target.value })} /></div></div>
        <div className="row"><div className="f"><label>From</label><input value={inj.from} onChange={e => upInj(inj.id, { from: e.target.value })} /></div>
          <div className="f"><label>Mode</label><select value={inj.mode} onChange={e => upInj(inj.id, { mode: e.target.value })}>{MODES.map(m => <option key={m}>{m}</option>)}</select></div>
          <div className="f"><label>Severity</label><select value={inj.severity} onChange={e => upInj(inj.id, { severity: e.target.value })}>{SEVERITIES.map(m => <option key={m}>{m}</option>)}</select></div>
          <div className="f"><label>Objective</label><select value={inj.objective} onChange={e => upInj(inj.id, { objective: e.target.value })}><option value="">—</option>{s.objectives.filter(Boolean).map((o, k) => <option key={k} value={'O' + (k + 1)}>{'O' + (k + 1)} {o.replace(/^O\d+\s*/, '').slice(0, 50)}</option>)}</select></div></div>
        <label>To (player roles)</label><div className="row">{players.map(r => <label key={r.id} style={{ display: 'flex', gap: 4, color: 'var(--tx)' }}><input type="checkbox" style={{ width: 'auto' }} checked={inj.to.includes(r.id)} onChange={e => upInj(inj.id, { to: e.target.checked ? [...inj.to, r.id] : inj.to.filter(x => x !== r.id) })} />{r.name}</label>)}</div>
        <label>Title</label><input value={inj.title} onChange={e => upInj(inj.id, { title: e.target.value })} />
        <label>Message (what players receive)</label><textarea value={inj.body} onChange={e => upInj(inj.id, { body: e.target.value })} />
        <label>Expected action (facilitator/evaluator only)</label><textarea value={inj.expectedAction} onChange={e => upInj(inj.id, { expectedAction: e.target.value })} />
        <label>Facilitator notes</label><textarea value={inj.notes} onChange={e => upInj(inj.id, { notes: e.target.value })} />
        <div className="row"><div className="f"><label>Lat</label><input value={inj.lat ?? ''} onChange={e => upInj(inj.id, { lat: e.target.value === '' ? null : +e.target.value })} /></div><div className="f"><label>Lon</label><input value={inj.lon ?? ''} onChange={e => upInj(inj.id, { lon: e.target.value === '' ? null : +e.target.value })} /></div>
          <label style={{ display: 'flex', gap: 5, color: 'var(--tx)' }}><input type="checkbox" style={{ width: 'auto' }} checked={inj.requiresResponse} onChange={e => upInj(inj.id, { requiresResponse: e.target.checked })} />Requires response</label></div>
        <div className="card tight" style={{ marginTop: 8, background: 'var(--panel2)' }}>
          <label style={{ display: 'flex', gap: 6, color: 'var(--tx)', margin: 0 }}><input type="checkbox" style={{ width: 'auto' }} checked={!!inj.sim} onChange={e => upInj(inj.id, { sim: e.target.checked ? { type: 'flood', params: {} } : undefined })} />Run a hazard simulation on the live map when this inject is released</label>
          {inj.sim && <><SimForm value={inj.sim} onChange={v => upInj(inj.id, { sim: v })} />
            <div className="row" style={{ marginTop: 6 }}><button disabled={inj.lat == null} onClick={() => setPreview({ t0: Date.now(), sims: [{ id: 'pv' + Date.now(), type: inj.sim.type, lat: inj.lat, lon: inj.lon, params: inj.sim.params, label: inj.title, at: 0 }] })}>▶ Preview</button>
              <select style={{ width: 'auto' }} value={pspeed} onChange={e => setPspeed(+e.target.value)}>{[1, 5, 20, 60].map(x => <option key={x} value={x}>{x}× speed</option>)}</select>
              {preview && <button onClick={() => setPreview(null)}>Stop</button>}{inj.lat == null && <span className="small mut">Set a location first.</span>}</div></>}</div>
        <div style={{ marginTop: 8 }}><GLMap key={inj.id} center={inj.lat ? { lat: inj.lat, lon: inj.lon, zoom: 11 } : s.center} injects={[{ ...inj, released: true }]} onPick={(lat, lon) => upInj(inj.id, { lat, lon })}
          sims={preview?.sims || []} getElapsed={() => (preview ? (Date.now() - preview.t0) * pspeed : 0)} /></div>
        <div className="row" style={{ marginTop: 8 }}><button onClick={() => { const c = { ...inj, id: inj.id + '-' + uid().slice(0, 3) }; up({ injects: [...s.injects, c] }); setSel(c.id); }}>Duplicate</button><button className="red" onClick={() => { up({ injects: s.injects.filter(x => x.id !== inj.id) }); setSel(null); }}>Delete</button></div>
      </>}</div></div>}

    {tab === 'map' && <div className="card"><p className="small mut">Exercise area. Use "Set centre" after panning to define the starting view for players.</p>
      <GLMap center={s.center} injects={s.injects.map(i => ({ ...i, released: true }))} onPick={(lat, lon) => up({ center: { ...s.center, lat, lon } })} />
      <div className="small mut">Centre: {s.center.lat}, {s.center.lon} (click to move) · Zoom <input type="number" style={{ width: 70 }} value={s.center.zoom} onChange={e => up({ center: { ...s.center, zoom: +e.target.value } })} /></div></div>}

    {tab === 'ai' && <div className="card"><h3>Claude assist</h3><p className="small mut">Claude keeps what you've written and fills gaps: objectives, roles, more injects, coordinates, expected actions. Examples: "add 6 injects on port congestion and a fuel shortage", "translate player messages into Sinhala and Tamil", "make it a 3-hour hybrid exercise for 40 people".</p>
      <textarea value={ai} onChange={e => setAi(e.target.value)} placeholder="Instructions for Claude…" /><button className="pri" style={{ marginTop: 8 }} disabled={busy} onClick={aiFill}>{busy ? 'Working…' : 'Build / extend with Claude'}</button></div>}

    {tab === 'json' && <div className="card"><p className="small mut">The full scenario as JSON — edit directly or paste a new scenario line. Apply validates and fills defaults.</p>
      <textarea className="mono" style={{ minHeight: '60vh', fontSize: 12 }} value={json} onChange={e => setJson(e.target.value)} />
      <div className="row" style={{ marginTop: 8 }}><button className="pri" onClick={() => { try { setS(normalize({ ...JSON.parse(json), id: s.id })); setDirty(true); setMsg('Applied'); } catch (e) { setMsg('JSON error: ' + e.message); } }}>Apply</button>
        <button onClick={() => download(slug(s.title) + '.ttx.json', JSON.stringify(s, null, 2))}>Download JSON</button></div></div>}

    {tab === 'check' && <div className="card"><h3>Planning checklist (WHO SimEx / ETC TTX toolkit)</h3>
      {CHECKLIST.map((c, k) => <label key={k} style={{ display: 'flex', gap: 8, color: 'var(--tx)', fontSize: 14 }}><input type="checkbox" style={{ width: 'auto' }} checked={!!s.checklist?.[k]} onChange={e => up({ checklist: { ...(s.checklist || {}), [k]: e.target.checked } })} />{c}</label>)}</div>}
  </div>;
}
