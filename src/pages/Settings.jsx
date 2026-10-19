import React, { useEffect, useRef, useState } from 'react';
import { backendName, setSupabaseConfig } from '../lib/backend.js';
import { atakCatalog, importAtakXml, clearAtakImports } from '../lib/atak.js';
import { KINDS, listConnections, saveConnection, deleteConnection, exportConnections, importConnections, testConnection, getKeys, setKey, uid } from '../lib/connectors.js';
import { health, proxyAvailable } from '../lib/net.js';
import { fetchAircraft, fetchQuakes, fetchWeather, fetchGdacs, fetchRadar } from '../lib/feeds.js';
import { download } from '../lib/scenario.js';

export default function Settings() {
  const [tab, setTab] = useState('connections');
  return <div className="wrap" style={{ maxWidth: 1100 }}><h1>Settings</h1>
    <div className="tabs">{[['connections', 'Connections & GIS'], ['keys', 'API keys'], ['health', 'Service health'], ['sync', 'Sync backend'], ['atak', 'ATAK / MOBAC maps'], ['about', 'Data sources']].map(([k, l]) =>
      <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>)}</div>
    {tab === 'connections' && <Connections />}
    {tab === 'keys' && <Keys />}
    {tab === 'health' && <Health />}
    {tab === 'sync' && <Sync />}
    {tab === 'atak' && <AtakPanel />}
    {tab === 'about' && <About />}
  </div>;
}

/* ================= connections ================= */
// Which extra settings each protocol actually uses, so the form only shows what matters.
const FIELDS = {
  wms: ['layers', 'version', 'format', 'opacity'],
  wmts: ['minzoom', 'maxzoom', 'opacity'],
  xyz: ['minzoom', 'maxzoom', 'opacity', 'tileSize'],
  mvt: ['sourceLayer', 'minzoom', 'maxzoom', 'color'],
  tilejson: ['sourceLayer', 'color'],
  style: [],
  wfs: ['layers', 'version', 'limit', 'bboxRefresh', 'color', 'zoomTo'],
  ogcapi: ['layers', 'limit', 'bboxRefresh', 'color', 'zoomTo'],
  arcgis: ['where', 'outFields', 'limit', 'bboxRefresh', 'color', 'zoomTo'],
  geojson: ['color', 'zoomTo'],
  kml: ['color', 'zoomTo'],
  csv: ['latField', 'lonField', 'labelField', 'color', 'zoomTo'],
  sheets: ['sheet', 'gid', 'latField', 'lonField', 'labelField', 'color', 'zoomTo'],
  mymaps: ['color', 'zoomTo'],
  rest: ['path', 'latField', 'lonField', 'labelField', 'color', 'zoomTo']
};
const LABELS = { layers: 'Layer name(s)', version: 'Version', format: 'Format', opacity: 'Opacity (0–1)', tileSize: 'Tile size', minzoom: 'Min zoom', maxzoom: 'Max zoom',
  sourceLayer: 'Source layer (vector)', limit: 'Max features', bboxRefresh: 'Reload on map move', color: 'Colour', zoomTo: 'Zoom to it when enabled',
  where: 'WHERE clause', outFields: 'Out fields', latField: 'Latitude column', lonField: 'Longitude column', labelField: 'Label column', sheet: 'Tab name', gid: 'Tab gid', path: 'Array path in JSON' };
const BOOLS = ['bboxRefresh', 'zoomTo'];
const FEEDS = [['', '— none —'], ['aircraft', 'Aircraft'], ['quakes', 'Earthquakes'], ['weather', 'Weather'], ['alerts', 'Disaster alerts'], ['radar', 'Rain radar']];

const PRESETS = [
  { name: 'ArcGIS — World Imagery (basemap)', kind: 'arcgis', url: 'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer' },
  { name: 'ArcGIS — feature layer', kind: 'arcgis', url: 'https://services.arcgis.com/ORG/arcgis/rest/services/LAYER/FeatureServer/0', opts: { bboxRefresh: true, zoomTo: true } },
  { name: 'QGIS Server — WMS', kind: 'wms', url: 'https://your-host/qgisserver?MAP=/projects/exercise.qgs', opts: { layers: 'layer-name' } },
  { name: 'QGIS Server / GeoServer — WFS', kind: 'wfs', url: 'https://your-host/geoserver/wfs', opts: { layers: 'workspace:layer', bboxRefresh: true } },
  { name: 'Martin / pg_tileserv — vector tiles', kind: 'tilejson', url: 'http://localhost:3000/your_table' },
  { name: 'OGC API — Features', kind: 'ogcapi', url: 'https://your-host/collections/COLLECTION/items', opts: { bboxRefresh: true } },
  { name: 'MapLibre style JSON', kind: 'style', url: 'https://your-host/style.json' },
  { name: 'Google My Maps', kind: 'mymaps', url: 'https://www.google.com/maps/d/edit?mid=YOUR_MAP_ID' },
  { name: 'Google Sheets — points', kind: 'sheets', url: 'https://docs.google.com/spreadsheets/d/YOUR_SHEET_ID/edit', opts: { zoomTo: true } },
  { name: 'XYZ raster tiles', kind: 'xyz', url: 'https://your-host/tiles/{z}/{x}/{y}.png' }
];
const blank = () => ({ id: '', name: '', kind: 'geojson', url: '', enabled: true, auth: { type: 'none' }, opts: {} });

function Connections() {
  const [list, setList] = useState(listConnections());
  const [draft, setDraft] = useState(null);
  const [res, setRes] = useState({}); const [busy, setBusy] = useState(''); const [msg, setMsg] = useState('');
  const file = useRef();
  const reload = () => setList(listConnections());
  const save = () => { const c = saveConnection(draft); reload(); setDraft(null); setMsg(`Saved "${c.name}".`); };
  const test = async c => { setBusy(c.id || 'draft'); const r = await testConnection(c); setRes(x => ({ ...x, [c.id || 'draft']: r })); setBusy(''); };

  return <>
    <div className="card"><h3>Connections — bring your own GIS and data services</h3>
      <p className="small mut">Protocol-first, so it works with the product you actually run: <b>ArcGIS REST</b> (Map/Feature/Image Server), <b>QGIS Server</b>, <b>GeoServer</b> and anything else speaking <b>WMS / WMTS / WFS / OGC API — Features</b>, <b>vector tiles</b> from Rust and Go tile servers (Martin, pg_tileserv, Tegola) or any TileJSON/MVT endpoint, plus <b>Google My Maps</b>, <b>Google Sheets</b>, GeoJSON, KML/GPX, CSV and any JSON API. Enabled connections appear in every map under <b>Data &amp; GIS</b>.</p>
      <div className="row"><button className="pri" onClick={() => { setDraft(blank()); setRes({}); }}>+ Add connection</button>
        <select style={{ width: 'auto', maxWidth: 320 }} value="" onChange={e => { const p = PRESETS[+e.target.value]; if (p) { setDraft({ ...blank(), ...p, opts: { ...p.opts } }); setRes({}); } }}>
          <option value="">Start from a template…</option>{PRESETS.map((p, i) => <option key={p.name} value={i}>{p.name}</option>)}</select>
        <span className="sp" />
        <button onClick={() => download('civsar-ttx-connections.json', exportConnections())} disabled={!list.length}>Export</button>
        <button onClick={() => file.current.click()}>Import…</button>
        <input ref={file} type="file" accept=".json" hidden onChange={async e => { const f = e.target.files[0]; if (!f) return;
          try { const n = importConnections(await f.text()); reload(); setMsg(`Imported ${n} connection(s).`); } catch (err) { setMsg('Import failed: ' + err.message); } e.target.value = ''; }} />
        <span className="small mut">{msg}</span></div>
      <p className="small mut" style={{ marginTop: 6 }}>Export/import is how a facilitator hands the same service list to everyone in the room. Credentials are stored in this browser only — treat the export file as a secret.</p>
    </div>

    {draft && <div className="card" style={{ marginTop: 12, borderColor: 'var(--acc)' }}>
      <h3>{draft.id ? 'Edit connection' : 'New connection'}</h3>
      <div className="row"><div className="f"><label>Name</label><input value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} placeholder="District flood zones (QGIS Server)" /></div>
        <div className="f"><label>Type</label><select value={draft.kind} onChange={e => setDraft({ ...draft, kind: e.target.value })}>{Object.entries(KINDS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></div></div>
      <label>URL <span className="mut">— {KINDS[draft.kind]?.hint}</span></label>
      <input className="mono" value={draft.url} onChange={e => setDraft({ ...draft, url: e.target.value })} />

      <div className="row"><div className="f"><label>Authentication</label>
        <select value={draft.auth?.type || 'none'} onChange={e => setDraft({ ...draft, auth: { ...draft.auth, type: e.target.value } })}>
          <option value="none">None / public</option><option value="key-query">API key in query string</option><option value="key-header">API key in a header</option>
          <option value="bearer">Bearer token</option><option value="basic">Username &amp; password</option></select></div>
        {['key-query', 'key-header'].includes(draft.auth?.type) && <div className="f"><label>{draft.auth.type === 'key-query' ? 'Parameter name' : 'Header name'}</label>
          <input value={draft.auth.param || ''} onChange={e => setDraft({ ...draft, auth: { ...draft.auth, param: e.target.value } })} placeholder={draft.auth.type === 'key-query' ? 'token' : 'X-API-Key'} /></div>}
        {draft.auth?.type === 'basic'
          ? <><div className="f"><label>Username</label><input value={draft.auth.user || ''} onChange={e => setDraft({ ...draft, auth: { ...draft.auth, user: e.target.value } })} /></div>
            <div className="f"><label>Password</label><input type="password" value={draft.auth.pass || ''} onChange={e => setDraft({ ...draft, auth: { ...draft.auth, pass: e.target.value } })} /></div></>
          : draft.auth?.type !== 'none' && <div className="f"><label>Key / token</label><input type="password" value={draft.auth.value || ''} onChange={e => setDraft({ ...draft, auth: { ...draft.auth, value: e.target.value } })} /></div>}</div>

      <div className="row">{(FIELDS[draft.kind] || []).map(k => <div key={k} className="f" style={{ maxWidth: 220 }}>
        {BOOLS.includes(k)
          ? <label style={{ display: 'flex', gap: 6, color: 'var(--tx)', marginTop: 18 }}><input type="checkbox" style={{ width: 'auto' }} checked={!!draft.opts?.[k]} onChange={e => setDraft({ ...draft, opts: { ...draft.opts, [k]: e.target.checked } })} />{LABELS[k]}</label>
          : <><label>{LABELS[k] || k}</label><input type={k === 'color' ? 'color' : 'text'} value={draft.opts?.[k] ?? ''} onChange={e => setDraft({ ...draft, opts: { ...draft.opts, [k]: e.target.value } })} /></>}
      </div>)}
        <div className="f" style={{ maxWidth: 220 }}><label>Use as a fallback for</label>
          <select value={draft.opts?.feed || ''} onChange={e => setDraft({ ...draft, opts: { ...draft.opts, feed: e.target.value } })}>{FEEDS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div></div>

      <div className="row" style={{ marginTop: 10 }}><button className="pri" disabled={!draft.name || !draft.url} onClick={save}>Save</button>
        <button disabled={!draft.url || busy === 'draft'} onClick={() => test(draft)}>{busy === 'draft' ? 'Testing…' : 'Test'}</button>
        <button onClick={() => setDraft(null)}>Cancel</button>
        {res.draft && <span className="small" style={{ color: res.draft.ok ? 'var(--grn)' : 'var(--red)' }}>{res.draft.msg}</span>}</div>
    </div>}

    <div className="card" style={{ marginTop: 12 }}>
      {!list.length ? <p className="mut small">No connections yet.</p> :
        <table><thead><tr><th>On</th><th>Name</th><th>Type</th><th>URL</th><th>Fallback for</th><th /></tr></thead><tbody>
          {list.map(c => <tr key={c.id}>
            <td><input type="checkbox" style={{ width: 'auto' }} checked={c.enabled !== false} onChange={e => { saveConnection({ ...c, enabled: e.target.checked }); reload(); }} /></td>
            <td>{c.name}{c.auth?.type !== 'none' && <span className="mut small"> 🔑</span>}</td>
            <td className="small">{KINDS[c.kind]?.label || c.kind}</td>
            <td className="small mono mut" style={{ maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.url}</td>
            <td className="small">{(FEEDS.find(f => f[0] === c.opts?.feed) || [, '—'])[1]}</td>
            <td><div className="row">
              <button onClick={() => test(c)} disabled={busy === c.id}>{busy === c.id ? '…' : 'Test'}</button>
              <button onClick={() => { setDraft(JSON.parse(JSON.stringify(c))); setRes({}); }}>Edit</button>
              <button className="red" onClick={() => { if (confirm('Delete ' + c.name + '?')) { deleteConnection(c.id); reload(); } }}>✕</button>
              {res[c.id] && <span className="small" style={{ color: res[c.id].ok ? 'var(--grn)' : 'var(--red)' }}>{res[c.id].msg}</span>}</div></td></tr>)}
        </tbody></table>}
    </div>
  </>;
}

/* ================= API keys ================= */
const KEY_DEFS = [
  ['aisstream', 'AISStream key — live ship traffic', 'Free key from aisstream.io'],
  ['opensky_user', 'OpenSky username (optional)', 'Raises the aircraft rate limit; anonymous works without it'],
  ['opensky_pass', 'OpenSky password (optional)', ''],
  ['maptiler', 'MapTiler key (optional)', 'For MapTiler styles added as a connection'],
  ['thunderforest', 'Thunderforest key (optional)', 'For Thunderforest tiles added as a connection']
];
function Keys() {
  const [vals, setVals] = useState(getKeys()); const [msg, setMsg] = useState('');
  const [extra, setExtra] = useState({ k: '', v: '' });
  const save = () => { for (const [k, v] of Object.entries(vals)) setKey(k, v); setMsg('Saved to this browser.'); setTimeout(() => setMsg(''), 2000); };
  const custom = Object.keys(vals).filter(k => !KEY_DEFS.some(d => d[0] === k));
  return <div className="card"><h3>API keys</h3>
    <p className="small mut">Stored in this browser only, never sent anywhere except the service they belong to. The Claude key is deliberately not here — it stays server-side in <code>.env</code> as <code>ANTHROPIC_API_KEY</code>, so it is never exposed to players.</p>
    {KEY_DEFS.map(([k, label, hint]) => <div key={k}><label>{label} {hint && <span className="mut">— {hint}</span>}</label>
      <input type={/pass|key/.test(k) ? 'password' : 'text'} value={vals[k] || ''} onChange={e => setVals({ ...vals, [k]: e.target.value })} /></div>)}
    {custom.map(k => <div key={k}><label>{k}</label><input value={vals[k]} onChange={e => setVals({ ...vals, [k]: e.target.value })} /></div>)}
    <div className="row" style={{ marginTop: 10 }}><input className="f" style={{ maxWidth: 200 }} placeholder="Other key name" value={extra.k} onChange={e => setExtra({ ...extra, k: e.target.value })} />
      <input className="f" placeholder="Value" value={extra.v} onChange={e => setExtra({ ...extra, v: e.target.value })} />
      <button onClick={() => { if (extra.k) { setVals({ ...vals, [extra.k]: extra.v }); setExtra({ k: '', v: '' }); } }}>Add</button>
      <span className="sp" /><button className="pri" onClick={save}>Save keys</button><span className="small mut">{msg}</span></div>
  </div>;
}

/* ================= health ================= */
const DOT = { ok: 'var(--grn)', degraded: 'var(--acc)', down: 'var(--red)' };
function Health() {
  const [, bump] = useState(0); const [busy, setBusy] = useState(false); const [proxy, setProxy] = useState(null);
  useEffect(() => health.subscribe(() => bump(n => n + 1)), []);
  useEffect(() => { proxyAvailable().then(setProxy); }, []);
  const testAll = async () => { setBusy(true);
    await Promise.allSettled([fetchAircraft(), fetchQuakes(), fetchWeather(), fetchGdacs(), fetchRadar(), proxyAvailable().then(setProxy)]);
    setBusy(false); };
  const rows = health.all();
  return <>
    <div className="card"><h3>Service health</h3>
      <p className="small mut">Each live feed has more than one provider and falls back in order, so one outage degrades the picture instead of stopping the exercise. Everything here is optional: with no network at all, the exercise clock, injects, responses, simulated air and sea traffic and the hazard simulations still run.</p>
      <div className="row"><button className="pri" onClick={testAll} disabled={busy}>{busy ? 'Testing…' : 'Test all feeds now'}</button>
        <span className="pill" style={{ color: proxy === null ? 'var(--mut)' : proxy ? 'var(--grn)' : 'var(--red)' }}>
          Server proxy: {proxy === null ? 'checking…' : proxy ? 'available' : 'unavailable (CORS-less sources will fail)'}</span></div>
      {!rows.length ? <p className="small mut" style={{ marginTop: 10 }}>Nothing tried yet this session.</p> :
        <table style={{ marginTop: 10 }}><thead><tr><th>Service</th><th>State</th><th>Serving</th><th>Last error</th><th>Checked</th></tr></thead><tbody>
          {rows.map(r => <tr key={r.key}><td><b>{r.key}</b></td>
            <td style={{ color: DOT[r.state] || 'var(--mut)' }}>● {r.state}</td>
            <td className="small">{r.detail || '—'}</td>
            <td className="small mut" style={{ maxWidth: 420 }}>{r.error || ''}</td>
            <td className="small mut">{new Date(r.at).toLocaleTimeString()}</td></tr>)}
        </tbody></table>}
    </div>
    <div className="card" style={{ marginTop: 12 }}><h3>What happens when something fails</h3>
      <table className="small"><tbody>
        <tr><td>Aircraft</td><td>OpenSky → adsb.lol → your own connection → simulated exercise flights</td></tr>
        <tr><td>Ships</td><td>AISStream (reconnects with back-off) → simulated exercise vessels</td></tr>
        <tr><td>Earthquakes</td><td>USGS → EMSC → your own connection</td></tr>
        <tr><td>Weather</td><td>Open-Meteo → MET Norway (via proxy) → your own connection</td></tr>
        <tr><td>Alerts</td><td>GDACS (via proxy) → your own connection</td></tr>
        <tr><td>Basemap</td><td>CARTO / OSM / Esri / 34 ATAK sources / your own — switch in the map's basemap menu</td></tr>
        <tr><td>Session sync</td><td>Supabase → localStorage + BroadcastChannel on this device</td></tr>
        <tr><td>Scenario writing</td><td>Claude API → "Copy prompt for claude.ai" → hand-written or imported JSON/CSV</td></tr>
        <tr><td>Hazard simulations</td><td>Cached elevation tiles; already-running simulations keep going offline</td></tr>
      </tbody></table></div>
  </>;
}

/* ================= the original panels ================= */
function Sync() {
  const c = JSON.parse(localStorage.getItem('ttx:supabase') || 'null') || {};
  const [u, setU] = useState(c.url || ''); const [k, setK] = useState(c.key || '');
  return <div className="card"><h3>Sync backend — currently: {backendName}</h3>
    <p className="small mut">Normally set via VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY at build time. You can override per-device here (e.g. a local laptop joining the cloud exercise). Run supabase/schema.sql first. Without it the app still runs: sessions sync between tabs and windows on this device.</p>
    <label>Supabase URL</label><input value={u} onChange={e => setU(e.target.value)} /><label>Anon key</label><input value={k} onChange={e => setK(e.target.value)} />
    <div className="row" style={{ marginTop: 8 }}><button className="pri" onClick={() => setSupabaseConfig({ url: u, key: k })}>Save &amp; reload</button><button onClick={() => setSupabaseConfig(null)}>Use build default / local</button></div></div>;
}

function AtakPanel() {
  const [cat, setCat] = useState(atakCatalog()); const [msg, setMsg] = useState('');
  return <div className="card"><h3>ATAK / MOBAC map sources ({cat.length})</h3>
    <p className="small mut">Bundled: atak-maps 1.5.0 pack. Import more ATAK <code>customMapSource</code> / <code>customWmsMapSource</code> XML files and they appear in every map's basemap and overlay menus on this device.</p>
    <div className="row"><input type="file" accept=".xml" multiple style={{ width: 'auto' }} onChange={async e => { const r = importAtakXml(await Promise.all([...e.target.files].map(f => f.text()))); setCat(atakCatalog()); setMsg(`Imported ${r.ok.length}${r.bad.length ? `, ${r.bad.length} failed` : ''}. Reload maps to see them.`); }} />
      <button onClick={() => { clearAtakImports(); setCat(atakCatalog()); setMsg('Imported sources cleared.'); }}>Clear imported</button><span className="small mut">{msg}</span></div>
    <table style={{ marginTop: 8 }}><thead><tr><th>Source</th><th>Group</th><th>Type</th><th>Use</th><th>Coverage</th><th>Zoom</th><th>Notes</th></tr></thead><tbody>
      {cat.map(s => <tr key={s.id}><td>{s.name}</td><td>{s.group}</td><td>{s.kind}</td><td>{s.overlay ? 'overlay' : 'basemap'}</td><td>{s.coverage}</td><td>{s.minzoom}–{s.maxzoom}</td>
        <td className="small">{s.restricted && <span style={{ color: 'var(--acc)' }}>⚠ unofficial endpoint, check terms. </span>}{s.insecure && <span className="mut">http only, blocked on https hosting.</span>}</td></tr>)}</tbody></table></div>;
}

function About() {
  return <div className="card"><h3>Data sources</h3><ul className="small">
    <li>Aircraft: OpenSky Network REST API, adsb.lol</li><li>Ships: AISStream.io websocket</li><li>Earthquakes: USGS GeoJSON feed, EMSC seismicportal</li>
    <li>Weather: Open-Meteo, MET Norway</li><li>Disaster alerts: GDACS</li><li>Rain radar: RainViewer</li><li>Basemap: OpenStreetMap / CARTO / Esri / OpenFreeMap; elevation: AWS Terrain Tiles</li>
    <li>Airports &amp; ports: CFE-DM Sri Lanka Disaster Management Reference Handbook (Oct 2024), Tables 2–3</li>
    <li>Exercise method: WHO Simulation Exercise Manual (2017); ETC/EdOS TTX annexes; SimEx TTX toolkit</li></ul>
    <p className="small mut">GIS interoperability is by open protocol — WMS, WMTS, WFS, OGC API — Features, TileJSON/MVT, ArcGIS REST, GeoJSON, KML/GPX and CSV — so it is not tied to any one vendor's product or release.</p></div>;
}
