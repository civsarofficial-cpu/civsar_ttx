// Turning connections into map layers, and turning the exercise into GIS files.
//
// Vector sources are normalised to GeoJSON regardless of where they came from (WFS, OGC API,
// ArcGIS FeatureServer, KML, GPX, CSV, Google Sheets, Google My Maps), so one set of MapLibre
// layers draws all of them. Raster sources become a raster layer. That keeps the map code from
// growing a branch per vendor.

import { netFetch, netJSON, netText } from './net.js';
import { fromCSV } from './scenario.js';
import { authorize, arcgisKind, arcgisQueryUrl, arcgisTileUrl, wmsTileUrl, wfsUrl, ogcApiUrl, sheetCsvUrl, myMapsKmlUrl, KINDS } from './connectors.js';

export const LAYER_COLORS = ['#38bdf8', '#a78bfa', '#34d399', '#fbbf24', '#fb7185', '#22d3ee', '#f472b6', '#4ade80'];
const fc = features => ({ type: 'FeatureCollection', features });
const num = v => { const n = parseFloat(String(v).replace(',', '.')); return isFinite(n) ? n : null; };

/* ---------- KML / GPX ---------- */
const txt = (el, tag) => el.getElementsByTagName(tag)[0]?.textContent?.trim() || '';
const coordList = s => String(s).trim().split(/\s+/).map(p => p.split(',').map(Number)).filter(p => p.length >= 2 && isFinite(p[0]) && isFinite(p[1])).map(p => [p[0], p[1]]);

export function kmlToGeoJSON(text) {
  const doc = new DOMParser().parseFromString(text, 'text/xml');
  if (doc.querySelector('parsererror')) throw new Error('Not valid KML/XML');
  const out = [];
  for (const pm of doc.getElementsByTagName('Placemark')) {
    const props = { name: txt(pm, 'name'), description: txt(pm, 'description').replace(/<[^>]+>/g, ' ').trim().slice(0, 500) };
    for (const d of pm.getElementsByTagName('Data')) props[d.getAttribute('name')] = txt(d, 'value');
    for (const d of pm.getElementsByTagName('SimpleData')) props[d.getAttribute('name')] = d.textContent.trim();
    const geoms = [];
    for (const p of pm.getElementsByTagName('Point')) { const c = coordList(txt(p, 'coordinates')); if (c[0]) geoms.push({ type: 'Point', coordinates: c[0] }); }
    for (const l of pm.getElementsByTagName('LineString')) { const c = coordList(txt(l, 'coordinates')); if (c.length > 1) geoms.push({ type: 'LineString', coordinates: c }); }
    for (const g of pm.getElementsByTagName('Polygon')) {
      const rings = [...g.getElementsByTagName('coordinates')].map(c => coordList(c.textContent)).filter(r => r.length > 2);
      if (rings.length) geoms.push({ type: 'Polygon', coordinates: rings });
    }
    for (const g of geoms) out.push({ type: 'Feature', properties: props, geometry: g });
  }
  // GPX, since handheld GPS exports turn up in exercises as often as KML
  for (const w of doc.getElementsByTagName('wpt')) out.push({ type: 'Feature', properties: { name: txt(w, 'name'), description: txt(w, 'desc') }, geometry: { type: 'Point', coordinates: [+w.getAttribute('lon'), +w.getAttribute('lat')] } });
  for (const tag of ['trkseg', 'rte']) for (const seg of doc.getElementsByTagName(tag)) {
    const pts = [...seg.children].filter(p => /trkpt|rtept/.test(p.tagName)).map(p => [+p.getAttribute('lon'), +p.getAttribute('lat')]);
    if (pts.length > 1) out.push({ type: 'Feature', properties: { name: 'track' }, geometry: { type: 'LineString', coordinates: pts } });
  }
  if (!out.length) throw new Error('No placemarks or waypoints found');
  return fc(out);
}

/* ---------- tabular (CSV / Google Sheets) ---------- */
const LAT_KEYS = /^(lat|latitude|y|lat_dd|lat_deg|wgs84_lat)$/i, LON_KEYS = /^(lon|lng|long|longitude|x|lon_dd|wgs84_lon)$/i;
export function rowsToGeoJSON(rows, opts = {}) {
  if (!rows.length) throw new Error('No rows');
  const keys = Object.keys(rows[0]);
  const latK = opts.latField || keys.find(k => LAT_KEYS.test(k.trim()));
  const lonK = opts.lonField || keys.find(k => LON_KEYS.test(k.trim()));
  if (!latK || !lonK) throw new Error(`No latitude/longitude columns found (saw: ${keys.slice(0, 8).join(', ')}). Set them in the connection.`);
  const feats = [];
  for (const r of rows) {
    const lat = num(r[latK]), lon = num(r[lonK]);
    if (lat == null || lon == null || Math.abs(lat) > 90 || Math.abs(lon) > 180) continue;
    feats.push({ type: 'Feature', properties: { ...r, name: r[opts.labelField] ?? r.name ?? r.Name ?? r.title ?? '' }, geometry: { type: 'Point', coordinates: [lon, lat] } });
  }
  if (!feats.length) throw new Error(`No usable coordinates in ${latK}/${lonK}`);
  return fc(feats);
}
export const csvToGeoJSON = (text, opts) => rowsToGeoJSON(fromCSV(text), opts);

/* ---------- generic JSON API ---------- */
function restToGeoJSON(json, opts = {}) {
  if (json?.type === 'FeatureCollection' || json?.type === 'Feature') return json.type === 'Feature' ? fc([json]) : json;
  const arr = opts.path ? opts.path.split('.').reduce((o, k) => o?.[k], json) : (Array.isArray(json) ? json : json.results || json.data || json.items || json.records);
  if (!Array.isArray(arr)) throw new Error('Could not find an array of records — set "Array path" in the connection');
  return rowsToGeoJSON(arr, opts);
}

/* ---------- load any vector connection ---------- */
/** Fetches a connection's features as GeoJSON. bbox = [w,s,e,n] in WGS84, used where supported. */
export async function loadVector(c, bbox) {
  const o = c.opts || {};
  switch (c.kind) {
    case 'geojson': return await netJSON(authorize(c.url, c).url, { headers: authorize(c.url, c).headers });
    case 'kml': return kmlToGeoJSON(await netText(authorize(c.url, c).url));
    case 'csv': return csvToGeoJSON(await netText(authorize(c.url, c).url), o);
    case 'sheets': return csvToGeoJSON(await netText(sheetCsvUrl(c), { proxy: 'always' }), o);
    case 'mymaps': return kmlToGeoJSON(await netText(myMapsKmlUrl(c), { proxy: 'always' }));
    case 'wfs': { const { url, headers } = wfsUrl(c, bbox); return await netJSON(url, { headers }); }
    case 'ogcapi': { const { url, headers } = ogcApiUrl(c, bbox); return await netJSON(url, { headers }); }
    case 'arcgis': { const { url, headers } = arcgisQueryUrl(c, bbox); const j = await netJSON(url, { headers }); if (j.error) throw new Error(j.error.message); return j; }
    case 'rest': { const { url, headers } = authorize(c.url, c); return restToGeoJSON(await netJSON(url, { headers }), o); }
    default: throw new Error(`${KINDS[c.kind]?.label || c.kind} is not a vector source`);
  }
}

/** What kind of map layer a connection produces: 'raster' | 'vector' | 'geojson' | 'style'. */
export function renderKind(c) {
  if (c.kind === 'arcgis') return arcgisKind(c);
  if (c.kind === 'tilejson') return c.opts?.vector === false ? 'raster' : 'vector';
  const r = KINDS[c.kind]?.render;
  return r === 'auto' ? 'raster' : r || 'geojson';
}

/** Tile URL template for raster connections. */
export function rasterTiles(c) {
  switch (c.kind) {
    case 'wms': return [wmsTileUrl(c)];
    case 'arcgis': return [arcgisTileUrl(c)];
    case 'xyz': case 'wmts': case 'mvt': return [authorize(c.url, c).url];
    default: return [authorize(c.url, c).url];
  }
}

/** MapLibre layer definitions that draw a GeoJSON/vector source, split by geometry type. */
export function vectorLayers(id, source, color, sourceLayer) {
  const sl = sourceLayer ? { 'source-layer': sourceLayer } : {};
  return [
    { id: id + '-fill', type: 'fill', source, ...sl, filter: ['match', ['geometry-type'], ['Polygon', 'MultiPolygon'], true, false], paint: { 'fill-color': color, 'fill-opacity': 0.25 } },
    { id: id + '-line', type: 'line', source, ...sl, filter: ['match', ['geometry-type'], ['LineString', 'MultiLineString', 'Polygon', 'MultiPolygon'], true, false], paint: { 'line-color': color, 'line-width': 2 } },
    { id: id + '-pt', type: 'circle', source, ...sl, filter: ['match', ['geometry-type'], ['Point', 'MultiPoint'], true, false], paint: { 'circle-radius': 6, 'circle-color': color, 'circle-opacity': 0.85, 'circle-stroke-color': '#0b1118', 'circle-stroke-width': 1.5 } },
    { id: id + '-lbl', type: 'symbol', source, ...sl, layout: { 'text-field': ['coalesce', ['get', 'name'], ['get', 'Name'], ['get', 'title'], ''], 'text-font': ['Noto Sans Regular'], 'text-size': 11, 'text-offset': [0, 1.2], 'text-anchor': 'top', 'text-optional': true }, paint: { 'text-color': '#e6edf3', 'text-halo-color': '#000', 'text-halo-width': 1.2 } }
  ];
}

/* ---------- export the exercise for QGIS / ArcGIS / My Maps ---------- */
/** The live exercise picture as GeoJSON: injects, team markers and running simulations. */
export function sessionGeoJSON(rec) {
  const s = rec.scenario, st = rec.state || {}, feats = [];
  for (const i of s.injects) if (i.lat != null && i.lon != null) feats.push({ type: 'Feature',
    properties: { layer: 'inject', id: i.id, name: `${i.id} ${i.title}`, stage: i.stage, simTime: i.simTime, from: i.from, to: (i.to || []).join('; '), severity: i.severity, body: i.body, expectedAction: i.expectedAction, released: st.released?.[i.id] != null },
    geometry: { type: 'Point', coordinates: [i.lon, i.lat] } });
  for (const e of (rec.events || []).filter(e => e.kind === 'marker')) { const p = e.payload || {};
    if (p.lat != null) feats.push({ type: 'Feature', properties: { layer: 'team-marker', name: p.label, by: e.author, role: e.role, at: e.created_at }, geometry: { type: 'Point', coordinates: [p.lon, p.lat] } }); }
  for (const x of (st.sims || [])) feats.push({ type: 'Feature', properties: { layer: 'simulation', name: x.label, hazard: x.type, params: JSON.stringify(x.params || {}) }, geometry: { type: 'Point', coordinates: [x.lon, x.lat] } });
  return fc(feats);
}
const xml = s => String(s ?? '').replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
/** KML, which is what Google My Maps imports and QGIS/ArcGIS both read. */
export function geoJSONtoKML(gj, name = 'CIVSAR TTX') {
  const pm = f => {
    const g = f.geometry, p = f.properties || {};
    const body = g.type === 'Point' ? `<Point><coordinates>${g.coordinates[0]},${g.coordinates[1]}</coordinates></Point>`
      : g.type === 'LineString' ? `<LineString><coordinates>${g.coordinates.map(c => c.join(',')).join(' ')}</coordinates></LineString>`
      : g.type === 'Polygon' ? `<Polygon><outerBoundaryIs><LinearRing><coordinates>${g.coordinates[0].map(c => c.join(',')).join(' ')}</coordinates></LinearRing></outerBoundaryIs></Polygon>` : '';
    if (!body) return '';
    const data = Object.entries(p).filter(([k]) => k !== 'name').map(([k, v]) => `<Data name="${xml(k)}"><value>${xml(v)}</value></Data>`).join('');
    return `<Placemark><name>${xml(p.name || '')}</name><description>${xml(p.body || p.description || '')}</description><ExtendedData>${data}</ExtendedData>${body}</Placemark>`;
  };
  return `<?xml version="1.0" encoding="UTF-8"?>\n<kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>${xml(name)}</name>${(gj.features || []).map(pm).join('')}</Document></kml>`;
}
