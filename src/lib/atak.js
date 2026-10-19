// ATAK / MOBAC custom map source support (<customMapSource>, <customWmsMapSource>).
// Bundled catalogue = the atak-maps 1.5.0 pack in src/data/atak; users can import more XML files in Settings.
import maplibregl from 'maplibre-gl';

const OVERLAY = /overlay|seamark|flood hazard|cycle routes/i;
const RESTRICTED = /^(google|bing|michelin)/i; // unofficial tile endpoints: check the provider's terms before use
const COVERAGE = [[/usgs|naip|fema|usda|usa topo/i, 'USA'], [/canada/i, 'Canada'], [/finland/i, 'Finland'], [/poland|^pl /i, 'Poland'], [/mtb map europe/i, 'Europe']];
const tag = (t, k) => { const m = t.match(new RegExp(`<${k}>([\\s\\S]*?)</${k}>`, 'i')); return m ? m[1].replace(/<!\[CDATA\[|\]\]>/g, '').replace(/&amp;/g, '&').trim() : ''; };

export function parseAtakXml(xml, group = 'Imported') {
  const wms = /<customWmsMapSource/i.test(xml); if (!wms && !/<customMapSource/i.test(xml)) throw new Error('Not an ATAK/MOBAC map source XML');
  const name = tag(xml, 'name') || 'Unnamed source', minzoom = +tag(xml, 'minZoom') || 0, maxzoom = Math.min(22, +tag(xml, 'maxZoom') || 19);
  let url = tag(xml, 'url'); const parts = tag(xml, 'serverParts').split(/[\s,]+/).filter(Boolean);
  const fmt = (tag(xml, 'tileType') || 'png').toLowerCase().replace('jpg', 'jpeg');
  url = url.replace(/^http:\/\/(mt\d\.google\.com|clarity\.maptiles\.arcgis\.com)/, 'https://$1'); // upgrade where https exists (Vercel serves https)
  let tiles;
  if (wms) {
    const v = tag(xml, 'version') || '1.1.1', layers = tag(xml, 'layers'), extra = tag(xml, 'aditionalparameters') || tag(xml, 'additionalparameters');
    const styles = /STYLES=/i.test(extra) ? '' : `&STYLES=${tag(xml, 'styles')}`;
    tiles = [`${url}${/[?&]$/.test(url) ? '' : url.includes('?') ? '&' : '?'}SERVICE=WMS&REQUEST=GetMap&VERSION=${v}&LAYERS=${layers}${styles}&FORMAT=image/${fmt}&${parseFloat(v) >= 1.3 ? 'CRS' : 'SRS'}=EPSG:3857&WIDTH=256&HEIGHT=256&BBOX={bbox-epsg-3857}${/TRANSPARENT/i.test(extra) ? '' : '&TRANSPARENT=TRUE'}${extra.startsWith('&') ? extra : extra ? '&' + extra : ''}`];
  } else {
    const t = url.replace(/\{\$z\}/g, '{z}').replace(/\{\$x\}/g, '{x}').replace(/\{\$y\}/g, '{y}');
    const expand = s => (s.includes('{$serverpart}') ? (parts.length ? parts : ['']).map(p => s.replace('{$serverpart}', p)) : [s]);
    tiles = t.includes('{$q}') ? expand(t).map(s => `atakq://{z}/{x}/{y}/${encodeURIComponent(s)}`) : expand(t);
  }
  return { id: 'atak-' + name.toLowerCase().replace(/[^a-z0-9]+/g, '-'), name, group, kind: wms ? 'wms' : tiles[0].startsWith('atakq') ? 'quadkey' : 'xyz',
    tiles, minzoom, maxzoom, overlay: OVERLAY.test(name), restricted: RESTRICTED.test(name), coverage: (COVERAGE.find(([r]) => r.test(name)) || [, 'Global'])[1],
    insecure: tiles.some(u => u.startsWith('http://')), background: tag(xml, 'backgroundColor') };
}

// Bing-style quadkey tiles via a MapLibre custom protocol.
let qkRegistered = false;
export function registerQuadkey() {
  if (qkRegistered) return; qkRegistered = true;
  maplibregl.addProtocol('atakq', async (params, ac) => {
    const [, , z, x, y, ...rest] = params.url.split('/'); const tpl = decodeURIComponent(rest.join('/'));
    let q = ''; for (let i = +z; i > 0; i--) { const m = 1 << (i - 1); q += ((+x & m) ? 1 : 0) + ((+y & m) ? 2 : 0); }
    const r = await fetch(tpl.replace('{$q}', q).replace('{z}', z).replace('{x}', x).replace('{y}', y), { signal: ac.signal });
    if (!r.ok) throw new Error('tile ' + r.status); return { data: await r.arrayBuffer() };
  });
}

const bundled = import.meta.glob('../data/atak/**/*.xml', { query: '?raw', import: 'default', eager: true });
export function atakCatalog() {
  const out = [];
  for (const [path, xml] of Object.entries(bundled)) { try { out.push(parseAtakXml(xml, path.split('/').at(-2))); } catch {} }
  let custom = []; try { custom = JSON.parse(localStorage.getItem('ttx:atakCustom') || '[]'); } catch {}
  for (const xml of custom) { try { out.push(parseAtakXml(xml, 'Imported')); } catch {} }
  return out.sort((a, b) => a.group.localeCompare(b.group) || a.name.localeCompare(b.name));
}
export function importAtakXml(texts) {
  const ok = [], bad = []; let custom = []; try { custom = JSON.parse(localStorage.getItem('ttx:atakCustom') || '[]'); } catch {}
  for (const t of texts) { try { const s = parseAtakXml(t); custom = custom.filter(x => parseAtakXml(x).id !== s.id); custom.push(t); ok.push(s.name); } catch (e) { bad.push(e.message); } }
  localStorage.setItem('ttx:atakCustom', JSON.stringify(custom)); return { ok, bad };
}
export const clearAtakImports = () => localStorage.removeItem('ttx:atakCustom');
export const rasterSource = s => ({ type: 'raster', tiles: s.tiles, tileSize: 256, minzoom: s.minzoom, maxzoom: s.maxzoom, attribution: s.name });
