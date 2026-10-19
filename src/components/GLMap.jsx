import React, { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl'; import 'maplibre-gl/dist/maplibre-gl.css';
import { AIRPORTS, SEAPORTS } from '../lib/refdata.js';
import { fetchAircraft, streamShips, fetchQuakes, fetchWeather, fetchGdacs, fetchRadar, synthTraffic } from '../lib/feeds.js';
import { HazardEngine, TERRARIUM } from '../lib/hazards.js';
import { atakCatalog, registerQuadkey, rasterSource } from '../lib/atak.js';
import { enabledConnections, tileAuthOk, authorize, getKey, KINDS } from '../lib/connectors.js';
import { loadVector, renderKind, rasterTiles, vectorLayers, LAYER_COLORS } from '../lib/gis.js';
import { netJSON } from '../lib/net.js';
const ATAK = atakCatalog(); registerQuadkey();

const SEVC = { info: '#38bdf8', low: '#22c55e', medium: '#f59e0b', high: '#f97316', critical: '#ef4444' };
const aisKey = () => import.meta.env.VITE_AISSTREAM_KEY || getKey('aisstream') || localStorage.getItem('ttx:aiskey') || '';
const fc = f => ({ type: 'FeatureCollection', features: f });
const pt = (lon, lat, p) => ({ type: 'Feature', properties: p, geometry: { type: 'Point', coordinates: [lon, lat] } });
const BASES = { dark: 'Dark', streets: 'Streets (OSM)', sat: 'Satellite' };

// Free, keyless sources: CARTO/OSM/Esri rasters, OpenFreeMap vector buildings, AWS Terrarium DEM.
const STYLE = {
  version: 8, glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
  sources: {
    dark: { type: 'raster', tiles: ['a', 'b', 'c'].map(s => `https://${s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png`), tileSize: 256, attribution: '© OpenStreetMap © CARTO' },
    streets: { type: 'raster', tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'], tileSize: 256, maxzoom: 19, attribution: '© OpenStreetMap contributors' },
    sat: { type: 'raster', tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'], tileSize: 256, maxzoom: 19, attribution: 'Imagery © Esri, Maxar, Earthstar Geographics' },
    satlbl: { type: 'raster', tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}'], tileSize: 256, maxzoom: 19 },
    dem: { type: 'raster-dem', tiles: [TERRARIUM], encoding: 'terrarium', tileSize: 256, maxzoom: 15, attribution: 'Terrain: Mapzen/AWS Terrain Tiles' },
    hs: { type: 'raster-dem', tiles: [TERRARIUM], encoding: 'terrarium', tileSize: 256, maxzoom: 15 }
  },
  layers: [
    { id: 'base-dark', type: 'raster', source: 'dark' },
    { id: 'base-streets', type: 'raster', source: 'streets', layout: { visibility: 'none' } },
    { id: 'base-sat', type: 'raster', source: 'sat', layout: { visibility: 'none' } },
    { id: 'base-satlbl', type: 'raster', source: 'satlbl', layout: { visibility: 'none' } },
    { id: 'hillshade', type: 'hillshade', source: 'hs', paint: { 'hillshade-exaggeration': 0.35, 'hillshade-shadow-color': '#000000' } }
  ]
};

function icon(draw) { const c = document.createElement('canvas'); c.width = c.height = 48; const x = c.getContext('2d'); x.fillStyle = '#fff'; draw(x); return x.getImageData(0, 0, 48, 48); }
const PLANE = icon(x => { x.beginPath(); x.moveTo(24, 2); x.lineTo(28, 18); x.lineTo(46, 28); x.lineTo(46, 32); x.lineTo(28, 27); x.lineTo(27, 40); x.lineTo(33, 45); x.lineTo(33, 47); x.lineTo(24, 44); x.lineTo(15, 47); x.lineTo(15, 45); x.lineTo(21, 40); x.lineTo(20, 27); x.lineTo(2, 32); x.lineTo(2, 28); x.lineTo(20, 18); x.closePath(); x.fill(); });
const SHIP = icon(x => { x.beginPath(); x.moveTo(24, 3); x.lineTo(36, 22); x.lineTo(34, 45); x.lineTo(14, 45); x.lineTo(12, 22); x.closePath(); x.fill(); });

/**
 * Live 3D common operating picture + hazard simulation.
 * props: center, getElapsed() → exercise ms, sims[], closed{}, onToggleClosed(k), injects[{…,released}], markers[], onPick(lat,lon), tall
 */
export default function GLMap({ center, getElapsed = () => 0, sims = [], closed = {}, onToggleClosed, injects = [], markers = [], onPick, tall, fly = true, geo = [] }) {
  const el = useRef(), map = useRef(), eng = useRef(), ready = useRef(false), ge = useRef(getElapsed), cbs = useRef({});
  ge.current = getElapsed; cbs.current = { onToggleClosed, onPick };
  const [loaded, setLoaded] = useState(false);
  const [conns, setConns] = useState(() => enabledConnections().filter(c => KINDS[c.kind]));
  const [onConn, setOnConn] = useState({}); const [connStatus, setConnStatus] = useState({});
  const added = useRef(new Map()); // connection id → { layers:[], sources:[] }
  const extra = useRef([]);        // ad-hoc GeoJSON plotted from shared files
  const [on, setOn] = useState({ infra: true, injects: true, user: true, simAir: true, simSea: true, liveAir: false, liveSea: false, radar: false, quakes: false, wx: false, gdacs: false });
  const [base, setBase] = useState('dark'); const [ovs, setOvs] = useState([]); const [terrain, setTerrain] = useState(true); const [status, setStatus] = useState({}); const [hud, setHud] = useState([]);
  const st = (k, v) => setStatus(s => ({ ...s, [k]: v }));

  useEffect(() => {
    const m = new maplibregl.Map({ container: el.current, style: STYLE, center: [center?.lon || 80.7, center?.lat || 7.8], zoom: center?.zoom || 7, pitch: 45, maxPitch: 80, attributionControl: { compact: true } });
    m.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right'); m.addControl(new maplibregl.ScaleControl(), 'bottom-left'); m.addControl(new maplibregl.FullscreenControl(), 'top-right');
    // Watchdog: if tile requests fail (offline / LAN-only room) MapLibre may never schedule its first frame.
    const kick = setInterval(() => { if (ready.current) clearInterval(kick); else m.triggerRepaint(); }, 800);
    m.on('load', () => { try { onLoad(); } catch (e) { console.error('map load handler:', e); } });
    const onLoad = () => {
      m.addImage('plane', PLANE, { sdf: true }); m.addImage('ship', SHIP, { sdf: true });
      m.setTerrain({ source: 'dem', exaggeration: 1.4 }); m.setSky?.({ 'sky-color': '#0b1118', 'horizon-color': '#1e293b', 'fog-color': '#0b1118', 'sky-horizon-blend': 0.6 });
      const src = id => m.addSource(id, { type: 'geojson', data: fc([]) });
      ['infra', 'injects', 'user', 'simAir', 'simSea', 'liveAir', 'liveSea', 'quakes', 'wx', 'gdacs'].forEach(src);
      const label = (id, s, field = 'name', extra = {}) => m.addLayer({ id, type: 'symbol', source: s, layout: { 'text-field': ['get', field], 'text-font': ['Noto Sans Regular'], 'text-size': 11, 'text-offset': [0, 1.3], 'text-anchor': 'top', ...extra }, paint: { 'text-color': '#e6edf3', 'text-halo-color': '#000', 'text-halo-width': 1.2 } });
      m.addLayer({ id: 'radar', type: 'raster', source: { type: 'raster', tiles: ['data:,'], tileSize: 256 }, layout: { visibility: 'none' }, paint: { 'raster-opacity': 0.65 } });
      m.addLayer({ id: 'quakes', type: 'circle', source: 'quakes', paint: { 'circle-radius': ['*', ['get', 'mag'], 3], 'circle-color': '#f43f5e', 'circle-opacity': 0.35, 'circle-stroke-color': '#f43f5e', 'circle-stroke-width': 1 } });
      m.addLayer({ id: 'gdacs', type: 'circle', source: 'gdacs', paint: { 'circle-radius': 11, 'circle-color': ['match', ['get', 'level'], 'Red', '#ef4444', 'Orange', '#f97316', '#22c55e'], 'circle-opacity': 0.5 } });
      m.addLayer({ id: 'injects', type: 'circle', source: 'injects', paint: { 'circle-radius': ['case', ['get', 'released'], 10, 6], 'circle-color': ['get', 'c'], 'circle-opacity': ['case', ['get', 'released'], 0.55, 0.1], 'circle-stroke-color': ['get', 'c'], 'circle-stroke-width': 2 } });
      label('injects-l', 'injects', 'id');
      m.addLayer({ id: 'infra', type: 'circle', source: 'infra', paint: { 'circle-radius': 7, 'circle-color': ['case', ['get', 'closed'], '#ef4444', ['==', ['get', 'kind'], 'air'], '#38bdf8', '#22c55e'], 'circle-stroke-color': '#0b1118', 'circle-stroke-width': 2 } });
      label('infra-l', 'infra', 'label', { 'text-size': 10 });
      m.addLayer({ id: 'user', type: 'circle', source: 'user', paint: { 'circle-radius': 7, 'circle-color': '#e879f9', 'circle-stroke-color': '#fff', 'circle-stroke-width': 1.5 } }); label('user-l', 'user', 'label');
      const traffic = (id, img, color) => m.addLayer({ id, type: 'symbol', source: id, layout: { 'icon-image': img, 'icon-size': 0.42, 'icon-rotate': ['get', 'h'], 'icon-rotation-alignment': 'map', 'icon-allow-overlap': true, 'text-field': ['step', ['zoom'], '', 8, ['get', 'name']], 'text-font': ['Noto Sans Regular'], 'text-size': 10, 'text-offset': [0, 1.4], 'text-optional': true }, paint: { 'icon-color': color, 'text-color': '#cbd5e1', 'text-halo-color': '#000', 'text-halo-width': 1 } });
      traffic('simAir', 'plane', ['case', ['get', 'div'], '#f97316', '#fde68a']); traffic('simSea', 'ship', ['case', ['get', 'div'], '#f97316', '#86efac']);
      traffic('liveAir', 'plane', ['case', ['==', ['get', 'sq'], '7700'], '#ef4444', '#60a5fa']); traffic('liveSea', 'ship', '#34d399');
      label('wx', 'wx', 'txt', { 'text-offset': [0, 0], 'text-size': 11 });
      const pop = (layer, html) => { m.on('click', layer, e => { const f = e.features[0]; new maplibregl.Popup({ maxWidth: '300px' }).setLngLat(e.lngLat).setHTML(html(f.properties)).addTo(m); e.preventDefault?.(); }); m.on('mouseenter', layer, () => (m.getCanvas().style.cursor = 'pointer')); m.on('mouseleave', layer, () => (m.getCanvas().style.cursor = '')); };
      pop('infra', p => `<b>${p.name}</b><br>${p.code}<br>${p.note}<br><b>${p.closed ? 'CLOSED (exercise)' : 'OPEN'}</b>${cbs.current.onToggleClosed ? `<br><button class="tgl" data-k="${p.key}">Toggle closure</button>` : ''}`);
      pop('injects', p => `<b>${p.id} · ${p.title}</b><br>${p.simTime || ''} · ${p.from}<br>${p.released ? p.body : '<i>not yet released</i>'}`);
      pop('simAir', p => `<b>${p.name}</b> (EXERCISE)${p.div ? '<br>DIVERTED' : ''}`); pop('simSea', p => `<b>${p.name}</b> (EXERCISE)${p.div ? '<br>DIVERTED' : ''}`);
      pop('liveAir', p => `<b>${p.name}</b> · ${p.country}<br>${p.alt} m · ${p.spd} km/h${p.sq ? '<br>squawk ' + p.sq : ''}`); pop('liveSea', p => `<b>${p.name}</b><br>MMSI ${p.mmsi} · ${p.sog} kn${p.dest ? '<br>→ ' + p.dest : ''}`);
      pop('quakes', p => `M${p.mag} ${p.place}<br>${new Date(p.time).toLocaleString()}`); pop('gdacs', p => `GDACS ${p.type}: ${p.name} (${p.level})`); pop('user', p => `<b>${p.label}</b><br>${p.by || ''}`);
      m.on('popupopen', () => {}); document.addEventListener('click', tgl);
      // Attributes of whatever a user connection drew (GIS feature, Sheets row, My Maps placemark).
      const connLayers = () => [...added.current.values()].flatMap(r => r.layers).filter(l => m.getLayer(l));
      m.on('click', e => {
        const ids = connLayers(); if (!ids.length) return;
        const f = m.queryRenderedFeatures(e.point, { layers: ids })[0]; if (!f) return;
        const rows = Object.entries(f.properties || {}).filter(([, v]) => v !== '' && v != null).slice(0, 14)
          .map(([k, v]) => `<b>${k}</b>: ${String(v).slice(0, 180)}`).join('<br>');
        new maplibregl.Popup({ maxWidth: '340px' }).setLngLat(e.lngLat).setHTML(rows || '<i>no attributes</i>').addTo(m);
      });
      m.on('click', e => { if (!cbs.current.onPick) return; const hit = m.queryRenderedFeatures(e.point, { layers: ['infra', 'injects', 'user', ...connLayers()] }); if (!hit.length) cbs.current.onPick(+e.lngLat.lat.toFixed(5), +e.lngLat.lng.toFixed(5)); });
      // 3D buildings (OpenFreeMap) are added after load so an offline/LAN exercise never blocks on them
      fetch('https://tiles.openfreemap.org/planet').then(r => r.json()).then(tj => {
        m.addSource('omt', { type: 'vector', tiles: tj.tiles, minzoom: tj.minzoom || 0, maxzoom: tj.maxzoom || 14, attribution: 'OpenFreeMap © OpenMapTiles' });
        const firstHz = m.getStyle().layers.find(l => l.id.startsWith('hz-'))?.id;
        m.addLayer({ id: 'bldg', type: 'fill-extrusion', source: 'omt', 'source-layer': 'building', minzoom: 13,
          paint: { 'fill-extrusion-color': '#8a96a3', 'fill-extrusion-height': ['coalesce', ['get', 'render_height'], 6], 'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0], 'fill-extrusion-opacity': 0.85 } }, firstHz || 'radar');
      }).catch(() => console.warn('3D buildings unavailable (offline)'));
      eng.current = new HazardEngine(m); window.__ttxEng = eng.current; ready.current = true; setLoaded(true);
    };
    const tgl = ev => { const b = ev.target.closest?.('.tgl'); if (b && cbs.current.onToggleClosed) { cbs.current.onToggleClosed(b.dataset.k); document.querySelectorAll('.maplibregl-popup').forEach(p => p.remove()); } };
    // animation loop: hazards every frame, HUD 2×/s
    let raf, lastHud = 0;
    const loop = t => { if (eng.current) { eng.current.update(ge.current()); if (t - lastHud > 500) { lastHud = t; setHud(eng.current.infos()); } } raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
    map.current = m; window.__ttxMap = m; m.on('error', e => console.warn('map:', e.error?.message || e));
    return () => { clearInterval(kick); cancelAnimationFrame(raf); document.removeEventListener('click', tgl); eng.current?.destroy(); m.remove(); };
  }, []);

  const S = (id, d) => loaded && map.current.getSource(id)?.setData(d);
  useEffect(() => { if (loaded) eng.current.sync(sims, ge.current(), fly); }, [loaded, JSON.stringify(sims.map(s => s.id))]);
  useEffect(() => { if (!loaded) return; const m = map.current;
    Object.entries(on).forEach(([k, v]) => [k, k + '-l'].forEach(id => m.getLayer(id) && m.setLayoutProperty(id, 'visibility', v ? 'visible' : 'none'))); }, [loaded, on]);
  useEffect(() => { if (!loaded) return; const m = map.current; Object.keys(BASES).forEach(b => m.setLayoutProperty('base-' + b, 'visibility', b === base ? 'visible' : 'none')); m.setLayoutProperty('base-satlbl', 'visibility', base === 'sat' ? 'visible' : 'none');
    if (m.getLayer('atak-base')) m.removeLayer('atak-base'); if (m.getSource('atak-base')) m.removeSource('atak-base');
    const s = ATAK.find(x => x.id === base); if (s) { m.addSource('atak-base', rasterSource(s)); m.addLayer({ id: 'atak-base', type: 'raster', source: 'atak-base' }, 'hillshade'); } }, [loaded, base]);
  // ATAK overlays (seamarks, flood hazard zones, road/terrain overlays…)
  useEffect(() => { if (!loaded) return; const m = map.current;
    m.getStyle().layers.filter(l => l.id.startsWith('atakov-') && !ovs.includes(l.id.slice(7))).forEach(l => { m.removeLayer(l.id); m.removeSource(l.id); });
    ovs.forEach(id => { const s = ATAK.find(x => x.id === id); if (s && !m.getLayer('atakov-' + id)) { m.addSource('atakov-' + id, rasterSource(s)); m.addLayer({ id: 'atakov-' + id, type: 'raster', source: 'atakov-' + id, paint: { 'raster-opacity': 0.85 } }, 'radar'); } }); }, [loaded, ovs.join()]);
  /* ---------- user connections: GIS services, Google My Maps / Sheets, any JSON API ---------- */
  // One add/remove path for every protocol: raster tiles, vector tiles, a whole style, or GeoJSON
  // normalised from WFS / OGC API / ArcGIS / KML / CSV.
  const bboxOf = m => { const b = m.getBounds(); return [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()].map(v => +v.toFixed(4)); };
  const removeConn = (m, cid) => {
    const rec = added.current.get(cid); if (!rec) return;
    for (const l of rec.layers) { try { m.getLayer(l) && m.removeLayer(l); } catch {} }
    for (const s of rec.sources) { try { m.getSource(s) && m.removeSource(s); } catch {} }
    added.current.delete(cid);
  };
  const addConn = async (m, c, i) => {
    const id = 'conn-' + c.id, color = c.opts?.color || LAYER_COLORS[i % LAYER_COLORS.length];
    const rec = { layers: [], sources: [] }; added.current.set(c.id, rec);
    const put = (sid, src) => { m.addSource(sid, src); rec.sources.push(sid); };
    const before = m.getLayer('injects') ? 'injects' : undefined;   // exercise symbology stays on top
    const lay = def => { m.addLayer(def, before); rec.layers.push(def.id); };
    const st = v => setConnStatus(s => ({ ...s, [c.id]: v }));
    const kind = renderKind(c);
    st('loading…');
    try {
      if (kind === 'raster') {
        if (!tileAuthOk(c)) throw new Error('Tile services need "API key in query string" auth');
        put(id, { type: 'raster', tiles: rasterTiles(c), tileSize: +c.opts?.tileSize || 256, minzoom: +c.opts?.minzoom || 0, maxzoom: +c.opts?.maxzoom || 22, attribution: c.name });
        lay({ id, type: 'raster', source: id, paint: { 'raster-opacity': c.opts?.opacity ?? 0.85 } });
        st('raster layer');
      } else if (kind === 'vector') {
        let sls = [c.opts?.sourceLayer].filter(Boolean);
        if (c.kind === 'tilejson') {
          const tj = await netJSON(authorize(c.url, c).url);
          put(id, { type: 'vector', tiles: tj.tiles, minzoom: tj.minzoom || 0, maxzoom: tj.maxzoom || 14, attribution: tj.attribution || c.name });
          if (!sls.length) sls = (tj.vector_layers || []).map(v => v.id).slice(0, 6);
        } else put(id, { type: 'vector', tiles: rasterTiles(c), minzoom: +c.opts?.minzoom || 0, maxzoom: +c.opts?.maxzoom || 14, attribution: c.name });
        if (!sls.length) throw new Error('Set "Source layer" — the tileset does not advertise one');
        sls.forEach((sl, k) => vectorLayers(`${id}-${k}`, id, c.opts?.color || LAYER_COLORS[(i + k) % LAYER_COLORS.length], sl).forEach(lay));
        st(`vector · ${sls.join(', ')}`);
      } else if (kind === 'style') {
        // Borrow another style's sources and layers rather than replacing ours, so the exercise
        // layers survive. Sprite-dependent layers are skipped: our style has no matching sprite.
        const sj = await netJSON(authorize(c.url, c).url); let n = 0;
        for (const [sid, src] of Object.entries(sj.sources || {})) put(`${id}-${sid}`, src);
        for (const l of sj.layers || []) {
          if (!l.source || l.type === 'background' || l.layout?.['icon-image']) continue;
          lay({ ...l, id: `${id}-${l.id}`, source: `${id}-${l.source}` }); n++;
        }
        st(`style · ${n} layers`);
      } else {
        const gj = await loadVector(c, c.opts?.bbox === false ? null : bboxOf(m));
        const feats = gj.features || []; put(id, { type: 'geojson', data: gj, attribution: c.name });
        vectorLayers(id, id, color).forEach(lay);
        st(`${feats.length} features`);
        if (c.opts?.zoomTo && feats.length) {
          const cs = feats.flatMap(f => f.geometry?.type === 'Point' ? [f.geometry.coordinates] : (f.geometry?.coordinates || []).flat(3).reduce((a, _, k, arr) => k % 2 ? a : [...a, [arr[k], arr[k + 1]]], []));
          const lons = cs.map(p => p[0]).filter(isFinite), lats = cs.map(p => p[1]).filter(isFinite);
          if (lons.length) m.fitBounds([[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]], { padding: 60, maxZoom: 14, duration: 1200 });
        }
      }
    } catch (e) { st('✕ ' + String(e.message || e).slice(0, 90)); removeConn(m, c.id); }
  };
  useEffect(() => { if (!loaded) return; const m = map.current;
    const want = conns.filter(c => onConn[c.id]);
    for (const cid of [...added.current.keys()]) if (!want.some(c => c.id === cid)) { removeConn(m, cid); setConnStatus(s => ({ ...s, [cid]: '' })); }
    want.forEach((c, i) => { if (!added.current.has(c.id)) addConn(m, c, i); });
  }, [loaded, JSON.stringify(onConn), conns]);
  // Refresh bbox-driven sources (WFS / OGC API / ArcGIS) after the view settles.
  useEffect(() => { if (!loaded) return; const m = map.current;
    const onEnd = async () => { for (const c of conns.filter(x => onConn[x.id] && x.opts?.bboxRefresh && renderKind(x) === 'geojson')) {
      try { const gj = await loadVector(c, bboxOf(m)); m.getSource('conn-' + c.id)?.setData(gj); setConnStatus(s => ({ ...s, [c.id]: `${(gj.features || []).length} features` })); } catch {} } };
    m.on('moveend', onEnd); return () => m.off('moveend', onEnd); }, [loaded, JSON.stringify(onConn), conns]);

  // GeoJSON handed in directly (a KML/CSV/GeoJSON a player shared and asked to see on the map).
  useEffect(() => { if (!loaded) return; const m = map.current;
    for (const { layers, source } of extra.current) { for (const l of layers) { try { m.getLayer(l) && m.removeLayer(l); } catch {} } try { m.getSource(source) && m.removeSource(source); } catch {} }
    extra.current = [];
    geo.forEach((g, i) => { if (!g?.data) return; const id = 'geo-' + i;
      try {
        m.addSource(id, { type: 'geojson', data: g.data, attribution: g.name });
        const defs = vectorLayers(id, id, g.color || LAYER_COLORS[(i + 3) % LAYER_COLORS.length]);
        defs.forEach(d => m.addLayer(d, m.getLayer('injects') ? 'injects' : undefined));
        extra.current.push({ source: id, layers: defs.map(d => d.id) });
      } catch (e) { console.warn('plot', g.name, e.message); } });
  }, [loaded, JSON.stringify(geo.map(g => g?.name))]);

  useEffect(() => { if (!loaded) return; map.current.setTerrain(terrain ? { source: 'dem', exaggeration: 1.4 } : null); }, [loaded, terrain]);
  useEffect(() => { S('infra', fc([...AIRPORTS.map(a => { const key = a.code.split(' ')[0]; return pt(a.lon, a.lat, { ...a, key, kind: 'air', closed: !!closed[key], label: key }); }),
    ...SEAPORTS.map(p => pt(p.lon, p.lat, { ...p, key: p.code, kind: 'sea', closed: !!closed[p.code], label: p.name.replace(' International', '').replace(' Port', '') }))])); }, [loaded, JSON.stringify(closed)]);
  useEffect(() => { S('injects', fc(injects.filter(i => i.lat != null && i.lon != null).map(i => pt(i.lon, i.lat, { id: i.id, title: i.title, body: i.body, from: i.from, simTime: i.simTime, released: !!i.released, c: SEVC[i.severity] || '#f59e0b' })))); },
    [loaded, JSON.stringify(injects.map(i => [i.id, i.released, i.lat, i.lon, i.title]))]);
  useEffect(() => { S('user', fc(markers.map(k => pt(k.lon, k.lat, k)))); }, [loaded, JSON.stringify(markers)]);

  // exercise traffic (deterministic from exercise clock)
  useEffect(() => { if (!loaded) return; const tick = () => { const { air, sea } = synthTraffic(ge.current(), closed);
    S('simAir', fc(air.map(a => pt(a.lon, a.lat, { name: a.callsign, h: a.heading, div: a.diverted })))); S('simSea', fc(sea.map(s => pt(s.lon, s.lat, { name: s.name, h: s.cog, div: s.diverted })))); };
    tick(); const t = setInterval(tick, 1500); return () => clearInterval(t); }, [loaded, JSON.stringify(closed)]);

  // live feeds
  useEffect(() => { if (!loaded || !on.liveAir) return; let t, dead = false;
    const pull = async () => { try { const a = await fetchAircraft(); if (dead) return; S('liveAir', fc(a.map(p => pt(p.lon, p.lat, { name: p.callsign, country: p.country, h: p.heading, alt: Math.round(p.alt || 0), spd: Math.round((p.speed || 0) * 3.6), sq: p.squawk || '' })))); st('liveAir', `${a.length} · ${new Date().toLocaleTimeString()}`); }
      catch (e) { st('liveAir', 'unavailable'); } t = setTimeout(pull, 20000); }; pull(); return () => { dead = true; clearTimeout(t); }; }, [loaded, on.liveAir]);
  useEffect(() => { if (!loaded || !on.liveSea) return; const ships = new Map();
    const stop = streamShips(aisKey(), s => { if (s.lat == null) return; ships.set(s.id, { ...(ships.get(s.id) || {}), ...Object.fromEntries(Object.entries(s).filter(([, x]) => x != null)) }); }, m => st('liveSea', m));
    const t = setInterval(() => { S('liveSea', fc([...ships.values()].map(v => pt(v.lon, v.lat, { name: v.name, mmsi: v.id, h: v.cog || 0, sog: v.sog ?? '?', dest: v.dest || '' })))); if (ships.size) st('liveSea', ships.size + ' vessels'); }, 2000);
    return () => { stop(); clearInterval(t); }; }, [loaded, on.liveSea]);
  useEffect(() => { if (!loaded || !on.radar) return; const m = map.current; let t, dead = false;
    const pull = async () => { try { const r = await fetchRadar(); if (dead) return;
      if (m.getLayer('radar')) m.removeLayer('radar'); if (m.getSource('radar-src')) m.removeSource('radar-src');
      m.addSource('radar-src', { type: 'raster', tiles: r.tiles, tileSize: 256, maxzoom: 7, attribution: r.attribution });
      m.addLayer({ id: 'radar', type: 'raster', source: 'radar-src', paint: { 'raster-opacity': 0.65 } }, 'quakes'); st('radar', new Date(r.time).toLocaleTimeString()); } catch { st('radar', 'unavailable'); } t = setTimeout(pull, 300000); };
    pull(); return () => { dead = true; clearTimeout(t); if (m.getLayer('radar')) m.setLayoutProperty('radar', 'visibility', 'none'); }; }, [loaded, on.radar]);
  useEffect(() => { if (loaded && on.quakes) fetchQuakes().then(q => { S('quakes', fc(q.map(e => pt(e.lon, e.lat, e)))); st('quakes', q.length + ' (7d)'); }).catch(() => st('quakes', 'unavailable')); }, [loaded, on.quakes]);
  useEffect(() => { if (loaded && on.wx) fetchWeather().then(w => { S('wx', fc(w.map(p => pt(p.lon, p.lat, { txt: `${p.name} ${Math.round(p.temp)}° · ${p.rain24 ?? 0} mm · ${Math.round(p.wind)} km/h` })))); st('wx', 'live'); }).catch(() => st('wx', 'unavailable')); }, [loaded, on.wx]);
  useEffect(() => { if (loaded && on.gdacs) fetchGdacs().then(g => { S('gdacs', fc(g.map(e => pt(e.lon, e.lat, e)))); st('gdacs', g.length + ' alerts'); }).catch(() => st('gdacs', 'unavailable')); }, [loaded, on.gdacs]);

  const T = (k, l) => <label key={k}><input type="checkbox" checked={on[k]} onChange={e => setOn({ ...on, [k]: e.target.checked })} />{l}{status[k] && <span className="mut"> ({status[k]})</span>}</label>;
  return <div>
    <div className="legend" style={{ marginBottom: 6 }}>
      <select style={{ width: 'auto', maxWidth: 230, padding: '3px 6px' }} value={base} onChange={e => setBase(e.target.value)} title="Basemap">
        <optgroup label="Built-in">{Object.entries(BASES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</optgroup>
        {[...new Set(ATAK.filter(s => !s.overlay).map(s => s.group))].map(g => <optgroup key={g} label={'ATAK · ' + g}>{ATAK.filter(s => !s.overlay && s.group === g).map(s => <option key={s.id} value={s.id}>{s.name}{s.coverage !== 'Global' ? ` (${s.coverage})` : ''}{s.restricted ? ' ⚠' : ''}</option>)}</optgroup>)}</select>
      <details style={{ position: 'relative' }}><summary className="small" style={{ cursor: 'pointer' }}>ATAK overlays ({ovs.length})</summary>
        <div className="card tight" style={{ position: 'absolute', zIndex: 5, minWidth: 300 }}>{ATAK.filter(s => s.overlay).map(s => <label key={s.id}><input type="checkbox" checked={ovs.includes(s.id)} onChange={e => setOvs(e.target.checked ? [...ovs, s.id] : ovs.filter(x => x !== s.id))} />{s.name}{s.coverage !== 'Global' ? ` (${s.coverage})` : ''}{s.restricted ? ' ⚠' : ''}</label>)}
          <div className="small mut" style={{ marginTop: 6 }}>⚠ = unofficial endpoint: check the provider's terms. Regional sources only cover their region.</div></div></details>
      <details style={{ position: 'relative' }}><summary className="small" style={{ cursor: 'pointer', color: conns.length ? 'var(--blu)' : 'var(--mut)' }}>
        Data &amp; GIS ({Object.values(onConn).filter(Boolean).length}/{conns.length})</summary>
        <div className="card tight" style={{ position: 'absolute', zIndex: 5, minWidth: 340, maxHeight: '60vh', overflow: 'auto' }}>
          {!conns.length ? <div className="small mut">No connections yet. Add ArcGIS, QGIS Server, GeoServer, a Rust/Go vector tile server, Google My Maps or Google Sheets in <a href="#/settings">Settings → Connections</a>.</div>
            : conns.map(c => <div key={c.id}>
              <label><input type="checkbox" checked={!!onConn[c.id]} onChange={e => setOnConn({ ...onConn, [c.id]: e.target.checked })} />
                {c.name} <span className="mut">· {renderKind(c)}</span></label>
              {connStatus[c.id] && <div className="small mut" style={{ marginLeft: 22, color: String(connStatus[c.id]).startsWith('✕') ? 'var(--red)' : 'var(--mut)' }}>{connStatus[c.id]}</div>}
            </div>)}
          <div className="row" style={{ marginTop: 8 }}><button style={{ padding: '2px 8px' }} onClick={() => setConns(enabledConnections().filter(c => KINDS[c.kind]))}>↻ Reload list</button>
            <a className="btn" style={{ padding: '2px 8px' }} href="#/settings">Manage…</a></div></div></details>
      <label><input type="checkbox" checked={terrain} onChange={e => setTerrain(e.target.checked)} />3D terrain</label>
      <button style={{ padding: '2px 8px' }} onClick={() => map.current.easeTo({ pitch: map.current.getPitch() > 10 ? 0 : 60, duration: 800 })}>2D/3D</button>
      {T('infra', 'Airports/ports')}{T('injects', 'Injects')}{T('user', 'Team markers')}{T('simAir', 'Exercise flights')}{T('simSea', 'Exercise vessels')}
      {T('liveAir', 'LIVE aircraft')}{T('liveSea', 'LIVE ships (AIS)')}{T('radar', 'LIVE rain radar')}{T('quakes', 'USGS quakes')}{T('wx', 'Weather')}{T('gdacs', 'GDACS')}
    </div>
    <div style={{ position: 'relative' }}>
      <div ref={el} className={'map' + (tall ? ' tall' : '')} />
      {hud.length > 0 && <div className="hud">{hud.map((h, k) => <div key={k}>{h}</div>)}<div className="mut" style={{ fontSize: 10 }}>Simulation — illustrative, not a forecast</div></div>}
    </div>
    {onPick && <div className="small mut">Click the map to set a location.</div>}
  </div>;
}
