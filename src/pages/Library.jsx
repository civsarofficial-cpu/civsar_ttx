import React, { useEffect, useRef, useState } from 'react';
import { listExercises, saveExercise, deleteExercise, mySessions, createSession } from '../lib/backend.js';
import { normalize, blankScenario, fromCSV } from '../lib/scenario.js';
import { generateScenario, COPY_PROMPT } from '../lib/ai.js';
import { sheetCsvUrl } from '../lib/connectors.js';
import { netText } from '../lib/net.js';
import { SAMPLES } from '../data/samples.js';
import { go } from '../App.jsx';

export default function Library() {
  const [list, setList] = useState([]); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const [prompt, setPrompt] = useState('Landslide early warning in Ratnapura district, NBRO Level 1→3 overnight, with road closures affecting relief from Colombo Port.');
  const [paste, setPaste] = useState(''); const file = useRef(); const [sheet, setSheet] = useState('');
  const load = () => listExercises().then(setList).catch(e => setErr(e.message));
  useEffect(() => { load(); }, []);
  const add = async s => { const n = normalize(s); await saveExercise(n); go('/plan/' + n.id); };
  const importText = async (t, name = '') => {
    try { if (name.endsWith('.csv') || /^\s*id,|^\s*"id"/.test(t)) return add({ title: name.replace(/\.csv$/, '') || 'Imported MSEL', injects: fromCSV(t) });
      await add(JSON.parse(t)); } catch (e) { setErr('Import failed: ' + e.message); }
  };
  const gen = async () => { setBusy(true); setErr(''); try { await add(await generateScenario(prompt)); } catch (e) { setErr(e.message); } setBusy(false); };
  const quickRun = async s => { const n = normalize(s); await saveExercise(n); go('/control/' + await createSession(n)); };

  return <div className="wrap">
    <h1>TTX Planner & Runner</h1>
    <p className="mut">Plan an exercise (concept → objectives → roles → inject matrix/MSEL), then run it live as a physical, online or hybrid TTX with a shared Emergency Operations Centre picture, live air/sea traffic and evaluation. Built on the WHO Simulation Exercise Manual and the ETC/EdOS TTX toolkit.</p>
    {err && <div className="card" style={{ borderColor: 'var(--red)' }}>{err}</div>}
    <div className="grid g3">
      <div className="card"><h3>1 · Start blank</h3><p className="small mut">Write the scenario line by hand in the planner.</p><button className="pri" onClick={() => add(blankScenario())}>New exercise</button></div>
      <div className="card"><h3>2 · Import JSON / MSEL CSV / Sheets</h3><p className="small mut">Paste scenario JSON (or just an inject array), load a .json/.csv file, or pull the inject matrix straight from a Google Sheet. Missing fields are filled in.</p>
        <textarea value={paste} onChange={e => setPaste(e.target.value)} placeholder='{"title":"…","injects":[{"atMin":0,"title":"…","to":["operations"]}]}' />
        <div className="row" style={{ marginTop: 6 }}><button onClick={() => importText(paste)} disabled={!paste}>Import pasted</button>
          <button onClick={() => file.current.click()}>Load file…</button>
          <input ref={file} type="file" accept=".json,.csv" hidden onChange={async e => { const f = e.target.files[0]; if (f) importText(await f.text(), f.name); }} /></div>
        <div className="row" style={{ marginTop: 6 }}><input className="f" value={sheet} onChange={e => setSheet(e.target.value)} placeholder="Google Sheet URL or ID (columns = the MSEL export)" />
          <button disabled={!sheet || busy} onClick={async () => { setBusy(true); setErr('');
            try { const csv = await netText(sheetCsvUrl({ url: sheet, opts: {} }), { proxy: 'always' });
              if (/^\s*</.test(csv)) throw new Error('The sheet is not readable — share it as "anyone with the link"');
              await add({ title: 'Imported from Google Sheets', injects: fromCSV(csv) });
            } catch (e) { setErr('Sheets import failed: ' + e.message); } setBusy(false); }}>Import from Sheets</button></div></div>
      <div className="card"><h3>3 · Generate with Claude</h3><p className="small mut">Describe the hazard, place and focus; Claude builds the full TTX (roles, objectives, injects with map points).</p>
        <textarea value={prompt} onChange={e => setPrompt(e.target.value)} />
        <div className="row" style={{ marginTop: 6 }}><button className="pri" onClick={gen} disabled={busy}>{busy ? 'Building…' : 'Generate & open'}</button>
          <button onClick={() => navigator.clipboard.writeText(COPY_PROMPT + prompt)} title="No API key? Paste this into claude.ai, then import the JSON it returns.">Copy prompt for claude.ai</button></div></div>
    </div>

    <h2 style={{ marginTop: 22 }}>Sample exercises</h2>
    <div className="grid g3">{SAMPLES.map(s => <div className="card tight" key={s.id}><b>{s.title}</b><div className="small mut">{s.hazard} · {s.injects.length} injects · {s.mode}</div>
      <div className="row" style={{ marginTop: 8 }}><button onClick={() => add({ ...s, id: undefined })}>Copy to my exercises</button><button className="pri" onClick={() => quickRun({ ...s, id: undefined })}>Run now</button></div></div>)}</div>

    <h2 style={{ marginTop: 22 }}>My exercises</h2>
    {!list.length ? <p className="mut">None yet.</p> : <table><thead><tr><th>Title</th><th>Hazard</th><th>Mode</th><th>Injects</th><th>Updated</th><th /></tr></thead><tbody>
      {list.map(s => <tr key={s.id}><td><a href={'#/plan/' + s.id}>{s.title}</a></td><td>{s.hazard}</td><td>{s.mode}</td><td>{s.injects.length}</td><td className="small mut">{new Date(s.updatedAt).toLocaleString()}</td>
        <td className="row"><button onClick={() => quickRun(s)}>Run</button><button onClick={async () => { if (confirm('Delete ' + s.title + '?')) { await deleteExercise(s.id); load(); } }}>Delete</button></td></tr>)}</tbody></table>}

    <h2 style={{ marginTop: 22 }}>Recent sessions on this device</h2>
    <div className="row">{mySessions().map(s => <a key={s.code} className="btn" href={'#/control/' + s.code}><span className="mono">{s.code}</span> {s.title}</a>)}</div>
  </div>;
}
