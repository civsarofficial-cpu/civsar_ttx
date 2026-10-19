import React, { useRef, useState } from 'react';
import { roleName } from '../lib/scenario.js';
import { kmlToGeoJSON, csvToGeoJSON } from '../lib/gis.js';

// Files players pass to each other during play: a photo from the field, a damage sketch, a
// spreadsheet of shelter numbers, a KML of road closures. Small files ride the session event
// stream so they work with no backend at all; larger ones are shared as links instead, and
// images are downscaled first so a phone photo does not fill the local-storage quota.

const INLINE_MAX = 1024 * 1024;        // 1 MB after downscaling — safely inside Realtime limits
const IMG_MAX_PX = 1600;
export const fmtSize = n => n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB';
const isImg = t => /^image\//.test(t || '');
const isGeo = f => /\.(kml|gpx|geojson|json|csv)$/i.test(f.name || '');
/** Who a shared file reaches: everyone if unaddressed, the named sections, the sender, control
 *  and solo players (who are standing in for every section at once). */
export const visibleTo = (f, me, seeAll) =>
  seeAll || !f.payload?.to?.length || !me?.role || f.payload.to.includes(me.role) || f.author === me?.name;

/** Shrink a photo until it fits inline; returns a data URL. */
async function shrinkImage(file) {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, IMG_MAX_PX / Math.max(bmp.width, bmp.height));
  const cv = document.createElement('canvas');
  cv.width = Math.round(bmp.width * scale); cv.height = Math.round(bmp.height * scale);
  cv.getContext('2d').drawImage(bmp, 0, 0, cv.width, cv.height);
  for (const q of [0.82, 0.7, 0.55, 0.4]) { const d = cv.toDataURL('image/jpeg', q); if (d.length * 0.75 <= INLINE_MAX) return d; }
  throw new Error('Image is too large even after resizing — share it as a link');
}
const readDataUrl = f => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(new Error('Could not read the file')); r.readAsDataURL(f); });

/**
 * props: rec, emit(kind, payload) → Promise, me {role,name}, readOnly, seeAll
 * onGeo(name, geojson) — optional: lets the host plot a shared KML/GeoJSON/CSV on its map.
 */
export default function FileShare({ rec, emit, me, readOnly, onGeo, seeAll }) {
  const s = rec.scenario;
  const [note, setNote] = useState(''); const [to, setTo] = useState([]); const [link, setLink] = useState('');
  const [busy, setBusy] = useState(''); const [err, setErr] = useState(''); const inp = useRef();
  const players = s.roles.filter(r => r.kind === 'player');
  const files = rec.events.filter(e => e.kind === 'file').slice().reverse();
  const mine = f => visibleTo(f, me, seeAll);

  const send = async list => {
    setErr(''); const arr = [...list];
    for (const f of arr) {
      try {
        setBusy(`Preparing ${f.name}…`);
        let dataUrl = null, size = f.size, note2 = '';
        if (f.size > INLINE_MAX && isImg(f.type)) { dataUrl = await shrinkImage(f); size = Math.round(dataUrl.length * 0.75); note2 = ' (resized)'; }
        else if (f.size > INLINE_MAX) throw new Error(`${f.name} is ${fmtSize(f.size)} — over the ${fmtSize(INLINE_MAX)} limit. Upload it somewhere and share the link instead.`);
        else dataUrl = await readDataUrl(f);
        setBusy(`Sharing ${f.name}…`);
        await emit('file', { name: f.name, type: f.type || 'application/octet-stream', size, dataUrl, note: (note + note2).trim(), to });
      } catch (e) { setErr(String(e.message || e)); }
    }
    setBusy(''); setNote(''); if (inp.current) inp.current.value = '';
  };
  const sendLink = async () => {
    setErr(''); try { new URL(link); } catch { return setErr('That is not a valid URL'); }
    try { await emit('file', { name: link.split('/').pop() || link, url: link, type: 'link', size: 0, note, to }); setLink(''); setNote(''); }
    catch (e) { setErr(String(e.message || e)); }
  };
  const plot = async f => {
    try {
      const text = f.payload.dataUrl ? atob(f.payload.dataUrl.split(',')[1]) : await (await fetch(f.payload.url)).text();
      const gj = /\.csv$/i.test(f.payload.name) ? csvToGeoJSON(text) : /\.(geo)?json$/i.test(f.payload.name) ? JSON.parse(text) : kmlToGeoJSON(text);
      onGeo(f.payload.name, gj);
    } catch (e) { setErr('Could not plot ' + f.payload.name + ': ' + e.message); }
  };

  return <div>
    {!readOnly && <div className="card tight" style={{ background: 'var(--panel2)' }}>
      <div className="row"><input ref={inp} type="file" multiple style={{ width: 'auto' }} onChange={e => e.target.files.length && send(e.target.files)} />
        {busy && <span className="small mut">{busy}</span>}</div>
      <label>Note (optional)</label><input value={note} onChange={e => setNote(e.target.value)} placeholder="What this is, and what you want done with it" />
      <label>Share with</label>
      <div className="row"><label style={{ display: 'flex', gap: 4, color: 'var(--tx)' }}><input type="checkbox" style={{ width: 'auto' }} checked={!to.length} onChange={() => setTo([])} />Everyone</label>
        {players.map(r => <label key={r.id} style={{ display: 'flex', gap: 4, color: 'var(--tx)' }}>
          <input type="checkbox" style={{ width: 'auto' }} checked={to.includes(r.id)} onChange={e => setTo(e.target.checked ? [...to, r.id] : to.filter(x => x !== r.id))} />{r.name}</label>)}</div>
      <div className="row" style={{ marginTop: 8 }}><input className="f" value={link} onChange={e => setLink(e.target.value)} placeholder="…or paste a link (Drive, SharePoint, a GIS service, anything too big to attach)" />
        <button onClick={sendLink} disabled={!link}>Share link</button></div>
      <div className="small mut" style={{ marginTop: 6 }}>Up to {fmtSize(INLINE_MAX)} per file; photos are resized automatically. Files reach every screen in the session.</div>
      {err && <div className="small" style={{ color: 'var(--red)', marginTop: 6 }}>{err}</div>}
    </div>}

    <div className="feed" style={{ marginTop: 10, maxHeight: '55vh' }}>
      {!files.length && <p className="mut small">Nothing shared yet.</p>}
      {files.filter(mine).map(f => { const p = f.payload; return <div key={f.id} className="ev">
        <div className="row"><b>{p.name}</b><span className="small mut">{p.type === 'link' ? 'link' : fmtSize(p.size)}</span>
          <span className="small mut">{f.author} · {roleName(s, f.role)}</span>
          {!!p.to?.length && <span className="pill">to {p.to.map(t => roleName(s, t)).join(', ')}</span>}
          <span className="sp" />
          <a className="btn" style={{ padding: '2px 8px' }} href={p.dataUrl || p.url} download={p.type === 'link' ? undefined : p.name} target="_blank" rel="noreferrer">{p.type === 'link' ? 'Open' : 'Download'}</a>
          {onGeo && isGeo(p) && <button style={{ padding: '2px 8px' }} onClick={() => plot(f)} title="Draw this file on the map">Plot on map</button>}</div>
        {p.note && <div className="small">{p.note}</div>}
        {isImg(p.type) && p.dataUrl && <img src={p.dataUrl} alt={p.name} style={{ maxWidth: 320, maxHeight: 220, borderRadius: 6, marginTop: 6, border: '1px solid var(--line)' }} />}
        <div className="small mut">{new Date(f.created_at).toLocaleTimeString()}</div>
      </div>; })}
    </div>
  </div>;
}
