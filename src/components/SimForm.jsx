import React from 'react';
import { HAZARD_TYPES } from '../lib/hazards.js';
const HELP = { riseM: 'water rise above channel (m)', runupM: 'max run-up (m)', lossPerKm: 'run-up loss per km inland (m)', radiusKm: 'model radius (km)', durationMin: 'duration (exercise min)', r34Km: 'gale-force radius (km)', r64Km: 'hurricane-force radius (km)', lengthM: 'runout length (m)', widthM: 'width (m)', magnitude: 'magnitude', depthKm: 'depth (km)', radiusM: 'severe-damage radius (m)', windFromDeg: 'wind from (°) — blank = live wind', lengthKm: 'plume length (km)', halfAngleDeg: 'plume half-angle (°)', isolationM: 'isolation radius (m)', waves: 'wave amplitudes (relative, comma list)', track: 'track [[lon,lat],…] — blank = auto', name: 'name' };
/** value = {type, params, label?, lat?, lon?}; showLoc → lat/lon inputs */
export default function SimForm({ value, onChange, showLoc }) {
  const def = HAZARD_TYPES[value.type] || HAZARD_TYPES.flood, p = { ...def.defaults, ...(value.params || {}) };
  const setP = (k, v) => onChange({ ...value, params: { ...value.params, [k]: v } });
  const field = k => { const v = p[k];
    if (k === 'waves') return <input value={(v || []).join(', ')} onChange={e => setP(k, e.target.value.split(',').map(Number).filter(x => !isNaN(x) && x > 0))} />;
    if (k === 'track') return <input className="mono" value={v ? JSON.stringify(v) : ''} placeholder="auto" onChange={e => { try { setP(k, e.target.value ? JSON.parse(e.target.value) : null); } catch {} }} />;
    if (k === 'name') return <input value={v} onChange={e => setP(k, e.target.value)} />;
    return <input type="number" value={v ?? ''} placeholder={k === 'windFromDeg' ? 'live' : ''} onChange={e => setP(k, e.target.value === '' ? null : +e.target.value)} />; };
  return <div>
    <div className="row"><div className="f"><label>Hazard</label><select value={value.type} onChange={e => onChange({ ...value, type: e.target.value, params: {} })}>{Object.entries(HAZARD_TYPES).map(([k, t]) => <option key={k} value={k}>{t.icon} {t.label}</option>)}</select></div>
      {showLoc && <><div className="f"><label>Label</label><input value={value.label || ''} onChange={e => onChange({ ...value, label: e.target.value })} /></div>
        <div style={{ width: 110 }}><label>Lat</label><input value={value.lat ?? ''} onChange={e => onChange({ ...value, lat: +e.target.value })} /></div><div style={{ width: 110 }}><label>Lon</label><input value={value.lon ?? ''} onChange={e => onChange({ ...value, lon: +e.target.value })} /></div></>}</div>
    <div className="row">{Object.keys(def.defaults).map(k => <div key={k} className="f" style={{ minWidth: k === 'track' ? 280 : 120 }}><label>{HELP[k] || k}</label>{field(k)}</div>)}</div>
    {value.type === 'tsunami' && <p className="small mut">Place the point on the coast. Shows the sea pulling back first, then several waves. The first wave is not the largest.</p>}
    {(value.type === 'quake' || value.type === 'blast') && <p className="small mut">Building damage uses 3D footprints at street zoom (the map flies there). Damage estimates are illustrative only.</p>}
    {(value.type === 'flood' || value.type === 'tsunami') && <p className="small mut">Water spreads over real terrain (AWS Terrarium DEM): low ground floods first and higher ground stays dry.</p>}
  </div>;
}
