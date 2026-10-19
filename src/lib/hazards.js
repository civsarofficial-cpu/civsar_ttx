// Hazard simulation engine for MapLibre GL.
// Techniques adapted from "Disaster simulations on a real map" (freeCodeCamp / HazardSim):
//  - simulate in map (tile) coordinates on a Web-Mercator-aligned grid
//  - terrain-aware flood / tsunami spread over Terrarium DEM tiles (priority-flood from the source)
//  - render the grid into a <canvas> registered as an animated map source (draped on 3D terrain)
//  - building damage via GeoJSON copy of footprints + feature-state height multiplier
//  - camera shake via CSS transform on the canvas, not the map camera
// Every simulation is a pure function of exercise time since trigger, so all screens stay in sync.
// ILLUSTRATIVE ONLY — not an engineering or forecasting model.

export const TERRARIUM = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png';

export const HAZARD_TYPES = {
  flood: { label: 'River / flash flood', icon: '🌊', defaults: { riseM: 5, durationMin: 20, radiusKm: 6 } },
  tsunami: { label: 'Tsunami inundation', icon: '🌊', defaults: { runupM: 8, durationMin: 12, lossPerKm: 2.5, radiusKm: 6, waves: [0.6, 1, 0.7] } },
  cyclone: { label: 'Tropical cyclone track', icon: '🌀', defaults: { name: 'Cyclone', r34Km: 220, r64Km: 70, durationMin: 30, track: null } },
  landslide: { label: 'Landslide runout', icon: '⛰', defaults: { lengthM: 700, widthM: 90, durationMin: 4 } },
  quake: { label: 'Earthquake (building damage)', icon: '💥', defaults: { magnitude: 6.8, depthKm: 10 } },
  blast: { label: 'Explosion / structural collapse', icon: '💥', defaults: { radiusM: 350 } },
  plume: { label: 'Hazmat / smoke plume', icon: '☣', defaults: { windFromDeg: null, lengthKm: 6, halfAngleDeg: 18, isolationM: 500, durationMin: 15 } }
};

/* ---------- geo helpers ---------- */
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const ease = t => t * t * (3 - 2 * t);
const lon2x = (lon, z) => ((lon + 180) / 360) * 2 ** z;
const lat2y = (lat, z) => ((1 - Math.log(Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)) / Math.PI) / 2) * 2 ** z;
const x2lon = (x, z) => (x / 2 ** z) * 360 - 180;
const y2lat = (y, z) => { const n = Math.PI - (2 * Math.PI * y) / 2 ** z; return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n))); };
export function offset(lon, lat, dxKm, dyKm) { return [lon + dxKm / (111.32 * Math.cos((lat * Math.PI) / 180)), lat + dyKm / 110.57]; }
export function distKm(a, b) { const dx = (b[0] - a[0]) * 111.32 * Math.cos(((a[1] + b[1]) / 2) * Math.PI / 180), dy = (b[1] - a[1]) * 110.57; return Math.hypot(dx, dy); }
export function circle(lon, lat, rKm, n = 64) { const c = []; for (let i = 0; i <= n; i++) { const a = (i / n) * 2 * Math.PI; c.push(offset(lon, lat, rKm * Math.cos(a), rKm * Math.sin(a))); } return c; }
const poly = (coords, props = {}) => ({ type: 'Feature', properties: props, geometry: { type: 'Polygon', coordinates: [coords] } });
const line = (coords, props = {}) => ({ type: 'Feature', properties: props, geometry: { type: 'LineString', coordinates: coords } });
const fc = features => ({ type: 'FeatureCollection', features });
const hash = s => { let h = 2166136261; for (const c of String(s)) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return ((h >>> 0) % 100000) / 100000; };

/* ---------- DEM loading (Terrarium PNG: elev = R*256 + G + B/256 - 32768) ---------- */
const demCache = new Map();
export async function loadDEM(lat, lon, radiusKm, maxPx = 1280) {
  let z = 15;
  for (; z > 8; z--) {
    const tileKm = (40075.016 * Math.cos((lat * Math.PI) / 180)) / 2 ** z;
    if ((Math.ceil((2 * radiusKm) / tileKm) + 1) * 256 <= maxPx) break;
  }
  const cx = lon2x(lon, z), cy = lat2y(lat, z);
  const tileKm = (40075.016 * Math.cos((lat * Math.PI) / 180)) / 2 ** z, half = radiusKm / tileKm;
  const x0 = Math.floor(cx - half), x1 = Math.floor(cx + half), y0 = Math.floor(cy - half), y1 = Math.floor(cy + half);
  const key = [z, x0, x1, y0, y1].join('/');
  if (demCache.has(key)) return demCache.get(key);
  const tw = x1 - x0 + 1, th = y1 - y0 + 1, w = tw * 256, h = th * 256;
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h; const ctx = cv.getContext('2d', { willReadFrequently: true });
  const jobs = [];
  for (let tx = x0; tx <= x1; tx++) for (let ty = y0; ty <= y1; ty++) {
    jobs.push(new Promise(res => { const im = new Image(); im.crossOrigin = 'anonymous';
      im.onload = () => { ctx.drawImage(im, (tx - x0) * 256, (ty - y0) * 256); res(true); }; im.onerror = () => res(false);
      im.src = TERRARIUM.replace('{z}', z).replace('{x}', tx).replace('{y}', ty); }));
  }
  const ok = (await Promise.all(jobs)).filter(Boolean).length;
  if (!ok) throw new Error('Elevation tiles unavailable (offline?)');
  const px = ctx.getImageData(0, 0, w, h).data, elev = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) elev[i] = px[i * 4] * 256 + px[i * 4 + 1] + px[i * 4 + 2] / 256 - 32768;
  const dem = {
    z, x0, y0, w, h, elev, cellKm: tileKm / 256,
    coords: [[x2lon(x0, z), y2lat(y0, z)], [x2lon(x1 + 1, z), y2lat(y0, z)], [x2lon(x1 + 1, z), y2lat(y1 + 1, z)], [x2lon(x0, z), y2lat(y1 + 1, z)]],
    idxOf: (lo, la) => { const x = Math.floor((lon2x(lo, z) - x0) * 256), y = Math.floor((lat2y(la, z) - y0) * 256); return x < 0 || y < 0 || x >= w || y >= h ? -1 : y * w + x; },
    lonLatOf: i => [x2lon(x0 + ((i % w) + 0.5) / 256, z), y2lat(y0 + (Math.floor(i / w) + 0.5) / 256, z)]
  };
  demCache.set(key, dem); return dem;
}

/* ---------- priority-flood: minimum water level needed to reach each cell from the seeds ---------- */
class Heap { constructor() { this.k = []; this.v = []; }
  get size() { return this.k.length; }
  push(c, i) { const k = this.k, v = this.v; let n = k.length; k.push(c); v.push(i); while (n > 0) { const p = (n - 1) >> 1; if (k[p] <= c) break; k[n] = k[p]; v[n] = v[p]; n = p; } k[n] = c; v[n] = i; }
  pop() { const k = this.k, v = this.v, topC = k[0], topV = v[0], lc = k.pop(), lv = v.pop(), n = k.length;
    if (n) { let i = 0; while (true) { let l = 2 * i + 1, r = l + 1, m = i, mc = lc; if (l < n && k[l] < mc) { m = l; mc = k[l]; } if (r < n && k[r] < mc) { m = r; mc = k[r]; } if (m === i) break; k[i] = k[m]; v[i] = v[m]; i = m; } k[i] = lc; v[i] = lv; }
    this.c = topC; return topV; } }
function priorityFlood(dem, seeds, stepLoss = 0) {
  const { w, h, elev } = dem, cost = new Float32Array(w * h).fill(Infinity), H = new Heap();
  for (const [i, c] of seeds) { cost[i] = c; H.push(c, i); }
  while (H.size) {
    const i = H.pop(), c = H.c; if (c > cost[i]) continue;
    const x = i % w, y = (i / w) | 0;
    for (let d = 0; d < 4; d++) {
      const nx = x + (d === 0) - (d === 1), ny = y + (d === 2) - (d === 3);
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const j = ny * w + nx, nc = Math.max(c, elev[j]) + stepLoss;
      if (nc < cost[j]) { cost[j] = nc; H.push(nc, j); }
    }
  }
  return cost;
}

/* ---------- base class ---------- */
class Sim {
  constructor(map, def) { this.map = map; this.def = def; this.p = { ...HAZARD_TYPES[def.type].defaults, ...(def.params || {}) }; this.ids = []; this.info = `${HAZARD_TYPES[def.type].icon} ${def.label || HAZARD_TYPES[def.type].label}: preparing…`; this.ready = false; }
  t(el, durMin) { return clamp((el - this.def.at) / ((durMin || this.p.durationMin || 10) * 60000)); }
  addSrc(id, src) { this.map.addSource(id, src); this.ids.push(['s', id]); }
  addLyr(l, before) { const b = before && this.map.getLayer(before) ? before : undefined; this.map.addLayer(l, b); this.ids.push(['l', l.id]); }
  set(id, data) { this.map.getSource(id)?.setData(data); }
  remove() { for (const [k, id] of [...this.ids].reverse()) { try { k === 'l' ? this.map.removeLayer(id) : this.map.removeSource(id); } catch {} } }
  get uid() { return 'hz-' + this.def.id.replace(/[^a-z0-9]/gi, ''); }
}

/* ---------- flood & tsunami (canvas source on DEM grid) ---------- */
class GridWater extends Sim {
  async init() {
    const { lat, lon } = this.def, d = (this.dem = await loadDEM(lat, lon, this.p.radiusKm));
    if (this.def.type === 'flood') {
      // Seed the whole river channel, not one cell. Coarse DEMs are full of one-cell pits, and a pit
      // seed traps the water behind its sill: nothing floods, then the sill tops and the whole valley
      // floods at once. The 10th-percentile elevation in a window around the point is a robust stand-in
      // for the valley floor; every cell at or below it is channel/floodplain the river rises from.
      const i0 = d.idxOf(lon, lat); if (i0 < 0) throw new Error('Point is outside the model area');
      const cx = i0 % d.w, cy = (i0 / d.w) | 0, R = Math.max(2, Math.round(Math.min(2.5, this.p.radiusKm / 2) / d.cellKm));
      const x0 = Math.max(0, cx - R), x1 = Math.min(d.w - 1, cx + R), y0 = Math.max(0, cy - R), y1 = Math.min(d.h - 1, cy + R);
      const win = new Float32Array((x1 - x0 + 1) * (y1 - y0 + 1)); let n = 0;
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) win[n++] = d.elev[y * d.w + x];
      this.base = win.sort()[Math.floor(n * 0.1)];
      const seeds = [];
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { const j = y * d.w + x; if (d.elev[j] <= this.base) seeds.push([j, d.elev[j]]); }
      if (!seeds.length) throw new Error('No low ground near the point');
      this.cost = priorityFlood(d, seeds);
    } else {
      const seeds = []; for (let i = 0; i < d.elev.length; i++) if (d.elev[i] <= 0) seeds.push([i, 0]);
      if (!seeds.length) throw new Error('No sea within the tsunami area — move the point to the coast');
      this.base = 0; this.cost = priorityFlood(d, seeds, this.p.lossPerKm * d.cellKm);
    }
    this.cv = document.createElement('canvas'); this.cv.width = d.w; this.cv.height = d.h; this.ctx = this.cv.getContext('2d'); this.img = this.ctx.createImageData(d.w, d.h); this.u32 = new Uint32Array(this.img.data.buffer);
    this.addSrc(this.uid, { type: 'image', url: this.cv.toDataURL(), coordinates: d.coords }); // image source refreshed from the canvas (reliable on all GPUs)
    this.addLyr({ id: this.uid, type: 'raster', source: this.uid, paint: { 'raster-opacity': 0.82, 'raster-fade-duration': 0 } }, this.map.getLayer('bldg') ? 'bldg' : 'radar');
    // Cells already under water at the starting level are the channel itself, not flooding:
    // computed here (not on the first frame) so a screen joining mid-exercise reports the same figure.
    this.wet0 = 0; if (this.def.type === 'flood') for (let i = 0; i < this.cost.length; i++) if (this.cost[i] < this.base) this.wet0++;
    this.cellKm2 = d.cellKm ** 2; this.ready = true; this.last = -1;
  }
  level(el) {
    if (this.def.type === 'flood') return this.base + this.p.riseM * ease(this.t(el));
    // tsunami: drawdown first, then a series of waves; the first is not the largest
    const P = this.p.durationMin * 60000 / (this.p.waves.length + 0.5), dt = el - this.def.at;
    if (dt < P * 0.5) return -4 * Math.sin(Math.PI * dt / (P * 0.5)); // sea pulls back
    let L = 0; this.p.waves.forEach((a, k) => { const s = (dt - P * 0.5 - k * P) / P; if (s > 0 && s < 1) L = Math.max(L, a * this.p.runupM * Math.sin(Math.PI * s) ** 0.7); });
    return L;
  }
  update(el) {
    if (!this.ready || this.busy) return; const L = this.level(el); if (Math.abs(L - this.last) < 0.03) return; this.last = L;
    const { elev } = this.dem, c = this.cost, u = this.u32, tsu = this.def.type === 'tsunami'; let wet = 0;
    this.foam = Math.min(0.35, 0.2 * Math.max(0.05, L - this.base));
    for (let i = 0; i < u.length; i++) {
      const e = elev[i];
      if (tsu && e <= 0) { u[i] = L < 0 && e > L ? 0xc06fa8d2 /* exposed seabed (ABGR) */ : 0; continue; }
      if (c[i] < L) { const depth = L - e; wet++;
        if (L - c[i] < this.foam) u[i] = 0xf0f5f0e8; // foam at the advancing front
        else { const k = clamp(depth / 4); const r = 90 - 70 * k, g = 170 - 90 * k, b = 235 - 60 * k; u[i] = (230 << 24) | (b << 16) | (g << 8) | r; }
      } else u[i] = 0;
    }
    this.ctx.putImageData(this.img, 0, 0);
    if (!this.busy) { this.busy = true; this.cv.toBlob(bl => { const u = URL.createObjectURL(bl), old = this.url; this.url = u;
      try { this.map.getSource(this.uid)?.updateImage({ url: u, coordinates: this.dem.coords }); } catch {} setTimeout(() => { if (old) URL.revokeObjectURL(old); this.busy = false; }, 250); }); }
    const area = (Math.max(0, wet - this.wet0) * this.cellKm2).toFixed(2), lbl = this.def.label || HAZARD_TYPES[this.def.type].label;
    this.info = tsu ? `🌊 ${lbl}: ${L < 0 ? 'SEA RECEDING — natural warning' : `run-up ${L.toFixed(1)} m`} · ${area} km² inundated`
      : `🌊 ${lbl}: +${(L - this.base).toFixed(1)} m above channel · ${area} km² inundated`;
  }
}

/* ---------- cyclone ---------- */
class Cyclone extends Sim {
  async init() {
    const { lat, lon } = this.def; this.track = this.p.track || [offset(lon, lat, 520, 160), offset(lon, lat, 260, 70), [lon, lat], offset(lon, lat, -180, 60)];
    this.seg = []; let tot = 0; for (let i = 1; i < this.track.length; i++) { const d = distKm(this.track[i - 1], this.track[i]); this.seg.push(d); tot += d; } this.tot = tot;
    const u = this.uid;
    this.addSrc(u, { type: 'geojson', data: fc([]) });
    this.addLyr({ id: u + '-r34', type: 'fill', source: u, filter: ['==', 'k', 'r34'], paint: { 'fill-color': '#38bdf8', 'fill-opacity': 0.12 } });
    this.addLyr({ id: u + '-r64', type: 'fill', source: u, filter: ['==', 'k', 'r64'], paint: { 'fill-color': '#ef4444', 'fill-opacity': 0.18 } });
    this.addLyr({ id: u + '-arm', type: 'line', source: u, filter: ['==', 'k', 'arm'], paint: { 'line-color': '#e2e8f0', 'line-opacity': 0.55, 'line-width': 6, 'line-blur': 5 } });
    this.addLyr({ id: u + '-trk', type: 'line', source: u, filter: ['==', 'k', 'trk'], paint: { 'line-color': '#f59e0b', 'line-width': 2, 'line-dasharray': [2, 2] } });
    this.addLyr({ id: u + '-past', type: 'line', source: u, filter: ['==', 'k', 'past'], paint: { 'line-color': '#f59e0b', 'line-width': 3 } });
    this.addLyr({ id: u + '-eye', type: 'circle', source: u, filter: ['==', 'k', 'eye'], paint: { 'circle-radius': 7, 'circle-color': '#0b1118', 'circle-stroke-color': '#f59e0b', 'circle-stroke-width': 3 } });
    this.ready = true;
  }
  at(t) { let d = t * this.tot; for (let i = 0; i < this.seg.length; i++) { if (d <= this.seg[i]) { const f = d / this.seg[i], a = this.track[i], b = this.track[i + 1]; return { pos: [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f], i }; } d -= this.seg[i]; } return { pos: this.track.at(-1), i: this.seg.length - 1 }; }
  update(el) {
    if (!this.ready) return; const t = this.t(el), { pos, i } = this.at(t), [lo, la] = pos, rot = -(el - this.def.at) / 1500; // counter-clockwise (N. hemisphere)
    const arms = [0, 1, 2, 3].map(k => { const pts = []; for (let s = 0; s < 40; s++) { const th = s * 0.12, r = 15 * Math.exp(0.3 * th); if (r > this.p.r34Km) break; const a = rot + k * Math.PI / 2 - th; pts.push(offset(lo, la, r * Math.cos(a), r * Math.sin(a))); } return line(pts, { k: 'arm' }); });
    this.set(this.uid, fc([poly(circle(lo, la, this.p.r34Km), { k: 'r34' }), poly(circle(lo, la, this.p.r64Km), { k: 'r64' }), ...arms,
      line(this.track, { k: 'trk' }), line([...this.track.slice(0, i + 1), pos], { k: 'past' }), { type: 'Feature', properties: { k: 'eye' }, geometry: { type: 'Point', coordinates: pos } }]));
    this.info = `🌀 ${this.p.name}: ${t >= 1 ? 'dissipated / past' : `${Math.round(t * 100)}% along track`} · gale radius ${this.p.r34Km} km · hurricane-force ${this.p.r64Km} km`;
  }
}

/* ---------- landslide (steepest-descent runout on DEM) ---------- */
class Landslide extends Sim {
  async init() {
    const { lat, lon } = this.def, d = await loadDEM(lat, lon, Math.max(1, this.p.lengthM / 1000 + 0.4), 512);
    let i = d.idxOf(lon, lat); const path = [d.lonLatOf(i)], seen = new Set([i]); let dist = 0, dir = null;
    while (dist < this.p.lengthM / 1000 && path.length < 2000) {
      const x = i % d.w, y = (i / d.w) | 0; let best = -1, be = Infinity;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { if (!dx && !dy) continue; const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= d.w || ny >= d.h) continue; const j = ny * d.w + nx; if (seen.has(j)) continue;
        const e = d.elev[j] - (dir && dx === dir[0] && dy === dir[1] ? 0.5 : 0); if (e < be) { be = e; best = j; } } // momentum bias
      if (best < 0) break; dir = [(best % d.w) - x, ((best / d.w) | 0) - y]; dist += d.cellKm * Math.hypot(dir[0], dir[1]); i = best; seen.add(i); path.push(d.lonLatOf(i));
    }
    this.path = path; this.drop = d.elev[d.idxOf(lon, lat)] - d.elev[i]; const u = this.uid;
    this.addSrc(u, { type: 'geojson', data: fc([]) });
    this.addLyr({ id: u + '-x', type: 'fill-extrusion', source: u, paint: { 'fill-extrusion-color': '#7c4a1e', 'fill-extrusion-height': 4, 'fill-extrusion-opacity': 0.9 } });
    this.addLyr({ id: u + '-l', type: 'line', source: u, paint: { 'line-color': '#fbbf24', 'line-width': 1.5 } });
    this.ready = true;
  }
  update(el) {
    if (!this.ready) return; const t = ease(this.t(el)), n = Math.max(2, Math.ceil(this.path.length * t)), pts = this.path.slice(0, n), W = this.p.widthM / 1000;
    if (pts.length < 2) return; const L = [], R = [];
    pts.forEach((p, k) => { const a = pts[Math.max(0, k - 1)], b = pts[Math.min(pts.length - 1, k + 1)]; const dx = (b[0] - a[0]) * 111.32 * Math.cos(p[1] * Math.PI / 180), dy = (b[1] - a[1]) * 110.57, m = Math.hypot(dx, dy) || 1;
      const half = W / 2 * (0.6 + 0.9 * (k / this.path.length)); L.push(offset(p[0], p[1], -dy / m * half, dx / m * half)); R.push(offset(p[0], p[1], dy / m * half, -dx / m * half)); });
    this.set(this.uid, fc([poly([...L, ...R.reverse(), L[0]])]));
    this.info = `⛰ ${this.def.label || 'Landslide'}: runout ${Math.round(this.p.lengthM * t)} m · vertical drop ~${Math.round(this.drop * t)} m`;
  }
}

/* ---------- earthquake / blast: building damage with feature-state ---------- */
class Quake extends Sim {
  async init() {
    const u = this.uid, { lon, lat } = this.def;
    this.addSrc(u + '-w', { type: 'geojson', data: fc([]) });
    this.addLyr({ id: u + '-mmi', type: 'fill', source: u + '-w', filter: ['==', 'k', 'mmi'], paint: { 'fill-color': ['get', 'c'], 'fill-opacity': 0.12 } });
    this.addLyr({ id: u + '-wave', type: 'line', source: u + '-w', filter: ['==', 'k', 'wave'], paint: { 'line-color': ['get', 'c'], 'line-width': 2.5, 'line-opacity': ['get', 'o'] } });
    this.addSrc(u + '-b', { type: 'geojson', data: fc([]), promoteId: 'id' });
    this.addLyr({ id: u + '-bx', type: 'fill-extrusion', source: u + '-b', paint: {
      'fill-extrusion-height': ['*', ['get', 'h'], ['coalesce', ['feature-state', 'm'], 1]], 'fill-extrusion-base': 0, 'fill-extrusion-opacity': 0.95,
      'fill-extrusion-color': ['case', ['==', ['coalesce', ['feature-state', 'd'], 0], 2], '#7f1d1d', ['==', ['coalesce', ['feature-state', 'd'], 0], 1], '#f59e0b', '#9aa7b4'] } });
    this.blast = this.def.type === 'blast'; this.R = this.blast ? this.p.radiusM / 1000 * 3 : Math.min(150, 10 ** (0.5 * this.p.magnitude - 1.8) * 10);
    this.ready = true; this.built = false; this.center = [lon, lat];
  }
  mmi(rKm) { if (this.blast) return 10 * clamp(1 - rKm / (this.p.radiusM / 1000 * 2)); const R = Math.hypot(rKm, this.p.depthKm); return 1.5 * this.p.magnitude + 1.5 - 3 * Math.log10(R); }
  buildBuildings() {
    const m = this.map; if (m.getZoom() < 13.5 || distKm(this.center, m.getCenter().toArray()) > this.R + 2) return;
    let fs = []; try { fs = m.querySourceFeatures('omt', { sourceLayer: 'building' }); } catch {}
    if (!fs.length) return; const seen = new Set(), out = []; this.b = [];
    for (const f of fs) {
      if (f.geometry.type !== 'Polygon') continue; const c0 = f.geometry.coordinates[0][0], key = c0[0].toFixed(6) + c0[1].toFixed(6); if (seen.has(key)) continue; seen.add(key);
      const r = distKm(this.center, c0); if (r > this.R) continue; const h = f.properties.render_height || 6, id = out.length + 1;
      const I = this.mmi(r), rnd = hash(key), p = 1 / (1 + Math.exp(-1.8 * (I - (this.blast ? 6 : 8.2) + (h > 30 ? 0.6 : 0))));
      const collapse = rnd < p, damaged = !collapse && rnd < p * 2.2;
      this.b.push({ id, r, collapse, damaged, mode: Math.floor(hash(key + 'm') * 3), resid: 0.12 + 0.3 * hash(key + 'r') });
      out.push({ type: 'Feature', properties: { id, h }, geometry: f.geometry });
    }
    m.getSource(this.uid + '-b').setData(fc(out)); if (m.getLayer('bldg')) m.setLayoutProperty('bldg', 'visibility', 'none');
    this.built = true; this.nCol = this.b.filter(b => b.collapse).length; this.nDam = this.b.filter(b => b.damaged).length;
  }
  update(el) {
    if (!this.ready) return; const s = (el - this.def.at) / 1000, [lo, la] = this.center, m = this.map;
    if (!this.built && s >= 0) this.buildBuildings();
    const vP = this.blast ? 0.34 : 6, vS = this.blast ? 0.34 : 3.5, feats = [];
    const bands = this.blast ? [[9, '#7f1d1d'], [7, '#ef4444'], [5, '#f59e0b']] : [[8, '#7f1d1d'], [7, '#ef4444'], [6, '#f97316'], [5, '#f59e0b']];
    for (const [I, c] of bands) { let r = 0.05; while (r < 300 && this.mmi(r) > I) r *= 1.15; if (r > 0.06) feats.push(poly(circle(lo, la, r), { k: 'mmi', c })); }
    for (const [v, c] of [[vP, '#38bdf8'], [vS, '#ef4444']]) { const r = v * s; if (r > 0 && r < this.R * 1.5) feats.push(line(circle(lo, la, r), { k: 'wave', c, o: clamp(1 - r / (this.R * 1.5)) })); }
    this.set(this.uid + '-w', fc(feats));
    if (this.built && this.b) for (const b of this.b) {
      const ta = s - b.r / vS; let mult = 1, d = 0;
      if (ta > 0) { if (b.collapse) { const k = clamp(ta / (1.2 + b.mode)); mult = b.mode === 0 ? 1 - (1 - b.resid) * k * k : b.mode === 1 ? (k < 0.5 ? 1 - 0.4 * k : 0.8 - (0.8 - b.resid) * (k - 0.5) * 2) : 1 - (1 - 0.65) * ease(k); d = 2; } else if (b.damaged) d = 1; }
      if (b.lm !== mult || b.ld !== d) { m.setFeatureState({ source: this.uid + '-b', id: b.id }, { m: mult, d }); b.lm = mult; b.ld = d; }
    }
    // camera shake — envelope at the current view centre
    const rv = distKm(this.center, m.getCenter().toArray()), ts = s - rv / vS, I = this.mmi(rv);
    const amp = ts > 0 && ts < 12 && I > 4 ? (I - 4) * 2.2 * Math.min(1, ts / 1.2) * Math.exp(-ts / 3) : 0;
    m.getCanvas().style.transform = amp > 0.3 ? `translate(${(Math.random() - 0.5) * amp}px,${(Math.random() - 0.5) * amp}px)` : '';
    this.info = `💥 ${this.def.label || HAZARD_TYPES[this.def.type].label}: ${this.blast ? `blast radius ${this.p.radiusM} m` : `M${this.p.magnitude}`} · ${this.built ? `${this.nCol} buildings collapsed, ${this.nDam} damaged (in view)` : 'zoom in to see building damage'}`;
  }
  remove() { super.remove(); try { this.map.setLayoutProperty('bldg', 'visibility', 'visible'); this.map.getCanvas().style.transform = ''; } catch {} }
}

/* ---------- hazmat / smoke plume ---------- */
class Plume extends Sim {
  async init() {
    if (this.p.windFromDeg == null) {
      try { const j = await (await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${this.def.lat}&longitude=${this.def.lon}&current=wind_direction_10m,wind_speed_10m`)).json();
        this.p.windFromDeg = j.current.wind_direction_10m; this.wind = `live wind ${Math.round(j.current.wind_speed_10m)} km/h from ${Math.round(j.current.wind_direction_10m)}°`; }
      catch { this.p.windFromDeg = 225; this.wind = 'wind assumed SW (live wind unavailable)'; }
    } else this.wind = `wind from ${this.p.windFromDeg}°`;
    const u = this.uid; this.addSrc(u, { type: 'geojson', data: fc([]) });
    this.addLyr({ id: u + '-f', type: 'fill', source: u, paint: { 'fill-color': ['get', 'c'], 'fill-opacity': ['get', 'o'] } });
    this.addLyr({ id: u + '-l', type: 'line', source: u, paint: { 'line-color': ['get', 'c'], 'line-width': 1.5, 'line-dasharray': [3, 2] } });
    this.ready = true;
  }
  update(el) {
    if (!this.ready) return; const t = ease(this.t(el)), { lon, lat } = this.def, brg = this.p.windFromDeg + 180 + 6 * Math.sin((el - this.def.at) / 25000);
    const sector = (len, ha) => { const pts = [[lon, lat]]; for (let a = -ha; a <= ha; a += ha / 8) { const r = (brg + a) * Math.PI / 180; pts.push(offset(lon, lat, len * Math.sin(r), len * Math.cos(r))); } pts.push([lon, lat]); return pts; };
    const L = this.p.lengthKm * t, ha = this.p.halfAngleDeg;
    this.set(this.uid, fc([poly(sector(L, ha), { c: '#facc15', o: 0.18 }), poly(sector(L * 0.6, ha * 0.8), { c: '#f97316', o: 0.25 }), poly(sector(L * 0.3, ha * 0.6), { c: '#dc2626', o: 0.35 }),
      poly(circle(lon, lat, this.p.isolationM / 1000), { c: '#e879f9', o: 0.12 })]));
    this.info = `☣ ${this.def.label || 'Plume'}: ${L.toFixed(1)} km downwind · ${this.wind} · isolation ${this.p.isolationM} m`;
  }
}

const CLASSES = { flood: GridWater, tsunami: GridWater, cyclone: Cyclone, landslide: Landslide, quake: Quake, blast: Quake, plume: Plume };
const FLY = { flood: 12.5, tsunami: 12.5, cyclone: 6.5, landslide: 14.5, quake: 15.5, blast: 16, plume: 12 };

export class HazardEngine {
  constructor(map) { this.map = map; this.sims = new Map(); }
  sync(defs = [], elapsed = 0, fly = true) {
    const want = new Set(defs.map(d => d.id));
    for (const [id, s] of this.sims) if (!want.has(id)) { s.remove(); this.sims.delete(id); }
    for (const d of defs) if (!this.sims.has(d.id) && CLASSES[d.type]) {
      const s = new CLASSES[d.type](this.map, d); this.sims.set(d.id, s);
      s.init().catch(e => (s.info = `${HAZARD_TYPES[d.type].icon} ${d.label || d.type}: ${e.message}`));
      if (fly && elapsed - d.at < 90000) this.map.flyTo({ center: [d.lon, d.lat], zoom: FLY[d.type], pitch: d.type === 'cyclone' ? 0 : 58, bearing: d.type === 'cyclone' ? 0 : -20, duration: 3500, essential: true });
    }
  }
  update(elapsed) { for (const s of this.sims.values()) { try { s.update(elapsed); } catch (e) { s.info = e.message; } } }
  infos() { return [...this.sims.values()].map(s => s.info); }
  destroy() { for (const s of this.sims.values()) s.remove(); this.sims.clear(); }
}

// Build a sim definition from an inject (planner attaches inject.sim = {type, params}).
export const simFromInject = (inj, at) => ({ id: inj.id + '-' + Math.round(at), type: inj.sim.type, lat: inj.sim.lat ?? inj.lat, lon: inj.sim.lon ?? inj.lon, params: inj.sim.params || {}, at, label: inj.title });
