// User-configurable connections: GIS services, data APIs, Google My Maps / Sheets.
//
// Everything here is added by the user in Settings and stored per device, so the app never
// depends on one bundled provider. A connection is protocol-first rather than product-first:
// QGIS Server, GeoServer, MapServer and "GeoLibre"-style stacks all speak WMS/WMTS/WFS/OGC API;
// Martin, pg_tileserv, Tegola and other Rust/Go tile servers all speak TileJSON/MVT; Esri speaks
// ArcGIS REST. Supporting the protocol supports every product that implements it.

import { netFetch, netJSON, netText } from './net.js';

export const KINDS = {
  xyz: { label: 'XYZ raster tiles ({z}/{x}/{y})', render: 'raster', hint: 'https://host/tiles/{z}/{x}/{y}.png' },
  tilejson: { label: 'TileJSON — Martin / pg_tileserv / tileserver-gl', render: 'auto', hint: 'https://host/catalog/table.json or /index.json' },
  mvt: { label: 'Vector tiles MVT ({z}/{x}/{y}.pbf)', render: 'vector', hint: 'https://host/layer/{z}/{x}/{y}.pbf' },
  style: { label: 'MapLibre / MapBox style JSON', render: 'style', hint: 'https://host/style.json' },
  wms: { label: 'OGC WMS — QGIS Server, GeoServer, ArcGIS', render: 'raster', hint: 'https://host/qgisserver?MAP=/p.qgs  (set Layers)' },
  wmts: { label: 'OGC WMTS', render: 'raster', hint: 'WMTS RESTful template or KVP endpoint' },
  wfs: { label: 'OGC WFS → GeoJSON', render: 'geojson', hint: 'https://host/geoserver/wfs  (set Layers)' },
  ogcapi: { label: 'OGC API — Features', render: 'geojson', hint: 'https://host/collections/<id>/items' },
  arcgis: { label: 'ArcGIS REST — Map/Feature/Image Server', render: 'auto', hint: '.../rest/services/Name/MapServer  or /FeatureServer/0' },
  geojson: { label: 'GeoJSON URL', render: 'geojson', hint: 'https://host/layer.geojson' },
  kml: { label: 'KML / GPX URL', render: 'geojson', hint: 'https://host/layer.kml' },
  csv: { label: 'CSV with lat/lon columns', render: 'geojson', hint: 'https://host/points.csv' },
  sheets: { label: 'Google Sheets (published or link-shared)', render: 'geojson', hint: 'Paste the sheet URL or its ID' },
  mymaps: { label: 'Google My Maps', render: 'geojson', hint: 'Paste the My Maps URL or its mid=' },
  rest: { label: 'Generic JSON API (map the fields)', render: 'geojson', hint: 'https://host/api/points' }
};
// Hosts that never send CORS headers, so go straight through the proxy.
export const FORCE_PROXY = /(^|\.)(google\.com|gdacs\.org|www\.gdacs\.org)$/i;

const LS = 'ttx:connections';
const read = () => { try { return JSON.parse(localStorage.getItem(LS) || '[]'); } catch { return []; } };
const write = c => localStorage.setItem(LS, JSON.stringify(c));

export const uid = () => 'c' + Math.random().toString(36).slice(2, 9);
export const listConnections = () => read();
export const enabledConnections = () => read().filter(c => c.enabled !== false);
export function saveConnection(c) {
  const all = read(); const i = all.findIndex(x => x.id === c.id);
  const rec = { enabled: true, opts: {}, auth: { type: 'none' }, ...c, id: c.id || uid() };
  if (i >= 0) all[i] = rec; else all.push(rec); write(all); return rec;
}
export const deleteConnection = id => write(read().filter(c => c.id !== id));
export const exportConnections = () => JSON.stringify(read(), null, 2);
export function importConnections(text, replace = false) {
  const inc = JSON.parse(text); if (!Array.isArray(inc)) throw new Error('Expected a JSON array of connections');
  const all = replace ? [] : read();
  for (const c of inc) { const rec = { ...c, id: c.id || uid() }; const i = all.findIndex(x => x.id === rec.id); if (i >= 0) all[i] = rec; else all.push(rec); }
  write(all); return inc.length;
}

/* ---------- API keys for the built-in feeds (kept apart from connections) ---------- */
const KS = 'ttx:apikeys';
export const getKeys = () => { try { return JSON.parse(localStorage.getItem(KS) || '{}'); } catch { return {}; } };
export const setKey = (k, v) => { const a = getKeys(); v ? (a[k] = v) : delete a[k]; localStorage.setItem(KS, JSON.stringify(a)); };
export const getKey = k => getKeys()[k] || '';

/* ---------- auth ---------- */
/** Applies the connection's credentials, returning the URL to call and any headers. */
export function authorize(url, conn) {
  const a = conn?.auth || {}; const headers = {};
  let u = url;
  if (a.type === 'key-query' && a.param && a.value) u += (u.includes('?') ? '&' : '?') + encodeURIComponent(a.param) + '=' + encodeURIComponent(a.value);
  else if (a.type === 'key-header' && a.param && a.value) headers[a.param] = a.value;
  else if (a.type === 'bearer' && a.value) headers.Authorization = 'Bearer ' + a.value;
  else if (a.type === 'basic' && a.user) headers.Authorization = 'Basic ' + btoa(`${a.user}:${a.pass || ''}`);
  return { url: u, headers };
}
// Header auth cannot survive a tile URL, so those connections must use a query key.
export const tileAuthOk = c => !c.auth || c.auth.type === 'none' || c.auth.type === 'key-query';

/* ---------- Google helpers ---------- */
export const sheetId = s => (String(s).match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/) || [, String(s).trim()])[1];
export const myMapsId = s => (String(s).match(/[?&]mid=([^&]+)/) || [, String(s).trim()])[1];
export const sheetCsvUrl = c => {
  const id = sheetId(c.url), o = c.opts || {};
  const q = o.gid ? `gid=${encodeURIComponent(o.gid)}` : o.sheet ? `sheet=${encodeURIComponent(o.sheet)}` : '';
  return `https://docs.google.com/spreadsheets/d/${id}/gviz/tq?tqx=out:csv${q ? '&' + q : ''}`;
};
export const myMapsKmlUrl = c => `https://www.google.com/maps/d/kml?mid=${encodeURIComponent(myMapsId(c.url))}&forcekml=1`;

/* ---------- service URL building ---------- */
export function wmsTileUrl(c) {
  const o = c.opts || {}, v = o.version || '1.3.0', base = c.url.split('?')[0];
  const extra = c.url.includes('?') ? '&' + c.url.split('?')[1] : '';   // keeps QGIS Server's MAP=… parameter
  const { url } = authorize(base, c);
  return `${url}?${url.includes('?') ? '' : ''}SERVICE=WMS&REQUEST=GetMap&VERSION=${v}&LAYERS=${encodeURIComponent(o.layers || '')}` +
    `&STYLES=${encodeURIComponent(o.styles || '')}&FORMAT=${o.format || 'image/png'}&TRANSPARENT=TRUE` +
    `&${parseFloat(v) >= 1.3 ? 'CRS' : 'SRS'}=EPSG:3857&WIDTH=256&HEIGHT=256&BBOX={bbox-epsg-3857}${extra}`;
}
export function wfsUrl(c, bboxWgs84) {
  const o = c.opts || {}, base = c.url.split('?')[0], v = o.version || '2.0.0';
  // WFS 2.0.0 renamed these: strict servers (QGIS Server among them) reject the wrong spelling.
  const v2 = parseFloat(v) >= 2;
  const q = new URLSearchParams({ SERVICE: 'WFS', REQUEST: 'GetFeature', VERSION: v,
    [v2 ? 'typeNames' : 'typeName']: o.layers || '', outputFormat: o.format || 'application/json',
    srsName: 'EPSG:4326', [v2 ? 'count' : 'maxFeatures']: String(o.limit || 2000) });
  // Short-form "EPSG:4326" keeps the bbox in lon,lat order; the urn form would mean lat,lon.
  if (bboxWgs84) q.set('bbox', bboxWgs84.join(',') + ',EPSG:4326');
  return authorize(`${base}?${q}`, c);
}
export function ogcApiUrl(c, bboxWgs84) {
  const o = c.opts || {}; let u = c.url.replace(/\/$/, '');
  if (!/\/items/.test(u) && o.layers) u += `/collections/${encodeURIComponent(o.layers)}/items`;
  const q = new URLSearchParams({ f: 'json', limit: String(o.limit || 2000) });
  if (bboxWgs84) q.set('bbox', bboxWgs84.join(','));
  return authorize(`${u}${u.includes('?') ? '&' : '?'}${q}`, c);
}
/** ArcGIS REST: tiled/dynamic MapServer and ImageServer render as raster, FeatureServer as GeoJSON. */
export const arcgisKind = c => /\/FeatureServer\/\d+|\/MapServer\/\d+$/i.test(c.url) ? 'geojson' : 'raster';
export function arcgisQueryUrl(c, bboxWgs84) {
  const o = c.opts || {}; const base = c.url.replace(/\/$/, '');
  const q = new URLSearchParams({ where: o.where || '1=1', outFields: o.outFields || '*', f: 'geojson',
    returnGeometry: 'true', outSR: '4326', resultRecordCount: String(o.limit || 2000) });
  if (bboxWgs84) { q.set('geometry', bboxWgs84.join(',')); q.set('geometryType', 'esriGeometryEnvelope'); q.set('inSR', '4326'); q.set('spatialRel', 'esriSpatialRelIntersects'); }
  return authorize(`${base}/query?${q}`, c);
}
export const arcgisTileUrl = c => {
  const base = c.url.replace(/\/$/, '');
  const { url } = authorize(base, c);
  return /ImageServer$/i.test(base)
    ? `${url}/exportImage?bbox={bbox-epsg-3857}&bboxSR=3857&imageSR=3857&size=256,256&format=png32&transparent=true&f=image`
    : `${url}/tile/{z}/{y}/{x}`;
};

/* ---------- test a connection ---------- */
/** Probes the endpoint and returns a short human verdict. Never throws. */
export async function testConnection(c) {
  const force = FORCE_PROXY.test(new URL(c.url.startsWith('http') ? c.url : 'https://x').hostname) ? 'always' : 'auto';
  const t0 = Date.now(); const ms = () => Date.now() - t0 + ' ms';
  try {
    switch (c.kind) {
      case 'sheets': {
        const txt = await netText(sheetCsvUrl(c), { proxy: 'always' });
        if (/^<|<!DOCTYPE/i.test(txt.trim())) throw new Error('Got HTML, not CSV — share the sheet as "anyone with the link"');
        const rows = txt.trim().split('\n').length; return { ok: true, msg: `OK — ${rows} rows (${ms()})` };
      }
      case 'mymaps': {
        const txt = await netText(myMapsKmlUrl(c), { proxy: 'always' });
        const n = (txt.match(/<Placemark/g) || []).length;
        if (!n && !/<kml/i.test(txt)) throw new Error('No KML returned — is the map shared publicly?');
        return { ok: true, msg: `OK — ${n} placemarks (${ms()})` };
      }
      case 'tilejson': { const j = await netJSON(authorize(c.url, c).url, { proxy: force }); return { ok: true, msg: `OK — ${j.name || 'tileset'} z${j.minzoom ?? 0}–${j.maxzoom ?? 14}, ${(j.vector_layers || []).length || 'raster'} layers (${ms()})` }; }
      case 'style': { const j = await netJSON(authorize(c.url, c).url, { proxy: force }); return { ok: true, msg: `OK — style "${j.name || '?'}", ${(j.layers || []).length} layers (${ms()})` }; }
      case 'arcgis': { const j = await netJSON(authorize(c.url, c).url + '?f=json', { proxy: force }); if (j.error) throw new Error(j.error.message); return { ok: true, msg: `OK — ${j.name || j.mapName || 'service'} (${arcgisKind(c)}, ${ms()})` }; }
      case 'wfs': { const { url, headers } = wfsUrl(c); const j = await netJSON(url, { headers, proxy: force }); return { ok: true, msg: `OK — ${(j.features || []).length} features (${ms()})` }; }
      case 'ogcapi': { const { url, headers } = ogcApiUrl(c); const j = await netJSON(url, { headers, proxy: force }); return { ok: true, msg: `OK — ${(j.features || []).length} features (${ms()})` }; }
      case 'geojson': { const j = await netJSON(authorize(c.url, c).url, { proxy: force }); return { ok: true, msg: `OK — ${(j.features || [j]).length} features (${ms()})` }; }
      case 'kml': case 'csv': case 'rest': { const r = await netFetch(authorize(c.url, c).url, { proxy: force }); const txt = (await r.text()).slice(0, 400); return { ok: true, msg: `OK — ${txt.length ? 'data received' : 'empty'} via ${r.via} (${ms()})` }; }
      case 'wms': { const u = wmsTileUrl(c).replace('{bbox-epsg-3857}', '8800000,700000,9000000,900000'); const r = await netFetch(u, { proxy: force }); const ct = r.headers.get('content-type') || '';
        if (/xml|text/.test(ct)) throw new Error('Server returned an exception — check the Layers name'); return { ok: true, msg: `OK — ${ct} (${ms()})` }; }
      default: { // xyz, wmts, mvt: fetch one tile over Sri Lanka
        const u = authorize(c.url, c).url.replace('{z}', '7').replace('{x}', '91').replace('{y}', '58').replace('{-y}', '69');
        const r = await netFetch(u, { proxy: force }); return { ok: true, msg: `OK — ${r.headers.get('content-type') || 'tile'} via ${r.via} (${ms()})` };
      }
    }
  } catch (e) { return { ok: false, msg: String(e.message || e).slice(0, 200) }; }
}
