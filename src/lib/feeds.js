// Open data feeds for the Common Operating Picture.
//
// Every feed has more than one provider and falls back in order, so a rate limit or an outage at
// one source degrades the picture instead of removing it. The result of each attempt is recorded
// in the health registry and shown in Settings → Service health. If every provider fails the
// caller still has the synthetic exercise traffic below, which needs no network at all.

import { netJSON, netFetch, firstOk, health } from './net.js';
import { getKey, enabledConnections, authorize } from './connectors.js';

const BBOX = { lamin: 4.5, lomin: 77.0, lamax: 11.5, lomax: 84.5 }; // Sri Lanka + approaches & shipping lanes
const CENTRE = [7.8, 80.7];
const inBox = (lat, lon) => lat >= BBOX.lamin && lat <= BBOX.lamax && lon >= BBOX.lomin && lon <= BBOX.lomax;
// A user connection can stand in for any built-in feed: set opts.feed to 'aircraft', 'quakes', …
const userFeeds = kind => enabledConnections().filter(c => c.opts?.feed === kind);

/* ---------- aircraft: OpenSky, then the ADS-B community aggregators ---------- */
async function openSky() {
  const u = getKey('opensky_user'), p = getKey('opensky_pass');
  const q = new URLSearchParams(BBOX).toString();
  const headers = u ? { Authorization: 'Basic ' + btoa(`${u}:${p}`) } : {};
  const j = await netJSON('https://opensky-network.org/api/states/all?' + q, { headers, timeout: 20000 });
  return (j.states || []).filter(s => s[5] != null && s[6] != null).map(s => ({
    id: s[0], callsign: (s[1] || '').trim() || s[0], country: s[2], lon: s[5], lat: s[6],
    alt: s[7] ?? s[13], onGround: s[8], speed: s[9], heading: s[10] || 0, vrate: s[11], squawk: s[14]
  }));
}
async function adsbLol() {
  const j = await netJSON(`https://api.adsb.lol/v2/lat/${CENTRE[0]}/lon/${CENTRE[1]}/dist/250`, { timeout: 20000 });
  return (j.ac || []).filter(a => a.lat != null && a.lon != null).map(a => ({
    id: a.hex, callsign: (a.flight || a.r || a.hex || '').trim(), country: a.t || '', lon: a.lon, lat: a.lat,
    alt: (a.alt_baro === 'ground' ? 0 : a.alt_baro ?? a.alt_geom ?? 0) * 0.3048, onGround: a.alt_baro === 'ground',
    speed: (a.gs || 0) * 0.514444, heading: a.track ?? a.true_heading ?? 0, squawk: a.squawk || ''
  }));
}
export const fetchAircraft = () => firstOk('aircraft', [
  ...userFeeds('aircraft').map(c => ({ name: c.name, run: async () => { const { url, headers } = authorize(c.url, c); const j = await netJSON(url, { headers }); return j.states ? [] : j; } })),
  { name: 'OpenSky', run: openSky },
  { name: 'adsb.lol', run: adsbLol }
]);

/* ---------- ships: AISStream websocket (unchanged protocol, key now also from Settings) ---------- */
export function streamShips(key, onShip, onStatus) {
  key = key || getKey('aisstream');
  if (!key) { const m = 'No AISStream key — add one in Settings → API keys'; onStatus?.(m); health.set('ships', { state: 'down', error: m }); return () => {}; }
  let ws, closed = false, tries = 0;
  const open = () => {
    ws = new WebSocket('wss://stream.aisstream.io/v0/stream');
    ws.onopen = () => { tries = 0; onStatus?.('AIS connected'); health.ok('ships', 'AISStream');
      ws.send(JSON.stringify({ APIKey: key, BoundingBoxes: [[[BBOX.lamin, BBOX.lomin], [BBOX.lamax, BBOX.lomax]]], FilterMessageTypes: ['PositionReport', 'ShipStaticData', 'StandardClassBPositionReport'] })); };
    ws.onmessage = async ev => {
      try {
        const m = JSON.parse(typeof ev.data === 'string' ? ev.data : await ev.data.text());
        const md = m.MetaData || {}; const pr = m.Message?.PositionReport || m.Message?.StandardClassBPositionReport;
        const st = m.Message?.ShipStaticData;
        onShip({ id: md.MMSI, name: (md.ShipName || '').trim() || String(md.MMSI), lat: md.latitude, lon: md.longitude,
          sog: pr?.Sog, cog: pr?.Cog, heading: pr?.TrueHeading, nav: pr?.NavigationalStatus, type: st?.Type, dest: st?.Destination?.trim(), t: Date.now() });
      } catch {}
    };
    ws.onclose = () => { onStatus?.('AIS disconnected'); health.degraded('ships', 'reconnecting', 'socket closed');
      if (!closed) setTimeout(open, Math.min(30000, 5000 * ++tries)); };   // back off instead of hammering
    ws.onerror = () => { onStatus?.('AIS error'); health.degraded('ships', 'error', 'socket error'); };
  };
  open();
  return () => { closed = true; ws?.close(); };
}

/* ---------- earthquakes: USGS, then EMSC ---------- */
const inRegion = (lat, lon) => lat > -15 && lat < 30 && lon > 60 && lon < 110;
async function usgsQuakes() {
  const j = await netJSON('https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_week.geojson');
  return j.features.filter(f => inRegion(f.geometry.coordinates[1], f.geometry.coordinates[0]))
    .map(f => ({ id: f.id, mag: f.properties.mag, place: f.properties.place, time: f.properties.time, lon: f.geometry.coordinates[0], lat: f.geometry.coordinates[1], tsunami: f.properties.tsunami }));
}
async function emscQuakes() {
  const since = new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10);
  const j = await netJSON(`https://www.seismicportal.eu/fdsnws/event/1/query?format=json&minmag=2.5&start=${since}&minlat=-15&maxlat=30&minlon=60&maxlon=110&limit=500`);
  return (j.features || []).map(f => ({ id: f.id, mag: f.properties.mag, place: f.properties.flynn_region || f.properties.region || 'EMSC event', time: Date.parse(f.properties.time), lon: f.geometry.coordinates[0], lat: f.geometry.coordinates[1] }));
}
export const fetchQuakes = () => firstOk('quakes', [
  ...userFeeds('quakes').map(c => ({ name: c.name, run: () => netJSON(authorize(c.url, c).url) })),
  { name: 'USGS', run: usgsQuakes }, { name: 'EMSC', run: emscQuakes }
]);

/* ---------- weather: Open-Meteo, then MET Norway (through the proxy, which sets a UA) ---------- */
export const WX_POINTS = [['Colombo', 6.93, 79.85], ['Ratnapura', 6.68, 80.4], ['Kandy', 7.29, 80.63], ['Trincomalee', 8.57, 81.23], ['Batticaloa', 7.72, 81.7], ['Jaffna', 9.66, 80.02], ['Hambantota', 6.12, 81.12], ['Badulla', 6.99, 81.06]];
async function openMeteo() {
  const lat = WX_POINTS.map(p => p[1]).join(','), lon = WX_POINTS.map(p => p[2]).join(',');
  const j = await netJSON(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,precipitation,wind_speed_10m,wind_direction_10m,weather_code&daily=precipitation_sum&forecast_days=2&timezone=Asia%2FColombo`);
  const arr = Array.isArray(j) ? j : [j];
  return arr.map((w, i) => ({ name: WX_POINTS[i][0], lat: WX_POINTS[i][1], lon: WX_POINTS[i][2], temp: w.current?.temperature_2m, rain: w.current?.precipitation, wind: w.current?.wind_speed_10m, windDir: w.current?.wind_direction_10m, rain24: w.daily?.precipitation_sum?.[0], rainTomorrow: w.daily?.precipitation_sum?.[1] }));
}
async function metNo() {
  const out = await Promise.all(WX_POINTS.map(async ([name, lat, lon]) => {
    const j = await netJSON(`https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=${lat}&lon=${lon}`, { proxy: 'always' });
    const t = j.properties?.timeseries?.[0], d = t?.data?.instant?.details || {};
    return { name, lat, lon, temp: d.air_temperature, rain: t?.data?.next_1_hours?.details?.precipitation_amount ?? 0,
      wind: (d.wind_speed || 0) * 3.6, windDir: d.wind_from_direction, rain24: t?.data?.next_6_hours?.details?.precipitation_amount };
  }));
  return out;
}
export const fetchWeather = () => firstOk('weather', [
  ...userFeeds('weather').map(c => ({ name: c.name, run: () => netJSON(authorize(c.url, c).url) })),
  { name: 'Open-Meteo', run: openMeteo }, { name: 'MET Norway', run: metNo }
]);

/* ---------- disaster alerts: GDACS (no CORS headers, so straight through the proxy) ---------- */
export const fetchGdacs = () => firstOk('alerts', [
  ...userFeeds('alerts').map(c => ({ name: c.name, run: () => netJSON(authorize(c.url, c).url) })),
  // The /MAP endpoint now answers "Eventtype is required" whatever you pass it; /SEARCH returns
  // the same FeatureCollection and still works. Events are filtered to the Indian Ocean basin,
  // so "0 alerts" genuinely means none nearby rather than a broken feed.
  { name: 'GDACS', run: async () => {
    const j = await netJSON('https://www.gdacs.org/gdacsapi/api/events/geteventlist/SEARCH?eventlist=EQ;TC;FL;TS', { proxy: 'always' });
    return (j.features || []).filter(f => { const [lon, lat] = f.geometry.coordinates; return lat > -20 && lat < 35 && lon > 55 && lon < 110; })
      .map(f => ({ id: f.properties.eventid + f.properties.eventtype, type: f.properties.eventtype, name: f.properties.name || f.properties.eventname, level: f.properties.alertlevel, lon: f.geometry.coordinates[0], lat: f.geometry.coordinates[1], url: f.properties.url?.report }));
  } }
]);

/* ---------- rain radar: RainViewer, then the Met Office-style fallback is left to connections ---------- */
export const fetchRadar = () => firstOk('radar', [
  { name: 'RainViewer', run: async () => { const j = await netJSON('https://api.rainviewer.com/public/weather-maps.json'); const f = j.radar?.past?.at(-1); if (!f) throw new Error('no frames'); return { tiles: [`${j.host}${f.path}/256/{z}/{x}/{y}/2/1_1.png`], time: f.time * 1000, attribution: 'Radar © RainViewer' }; } },
  ...userFeeds('radar').map(c => ({ name: c.name, run: async () => ({ tiles: [authorize(c.url, c).url], time: Date.now(), attribution: c.name }) }))
]);

/* ---------- basemap reachability, so a dead tile host is visible rather than a blank map ---------- */
export async function probeTiles(url) {
  const u = url.replace('{z}', '7').replace('{x}', '91').replace('{y}', '58').replace(/\{s\}|\{a-c\}/, 'a');
  const r = await netFetch(u, { timeout: 8000, proxy: 'never' }); return r.ok;
}

/* ---------- exercise-mode synthetic traffic (no network, no keys, always available) ---------- */
export function synthTraffic(elapsedMs, closed = {}) {
  const t = elapsedMs / 1000;
  const routes = [
    ['UL504', [7.18, 79.88], [10.8, 76.2]], ['UL306', [7.18, 79.88], [10.9, 83.9]], ['EK650', [10.5, 77.0], [7.18, 79.88]],
    ['QR668', [11.2, 77.5], [7.18, 79.88]], ['6E1171', [11.3, 79.6], [7.18, 79.88]], ['SQ468', [5.0, 84.3], [7.18, 79.88]],
    ['UL225', [6.29, 81.12], [4.6, 77.3]], ['SLAF-Y12', [6.82, 79.89], [8.55, 81.19]]
  ];
  const lanes = [
    ['MSC ELENA', [5.6, 77.2], [5.75, 84.4]], ['EVER GLORY', [5.8, 84.4], [5.55, 77.1]], ['CMA CGM INDUS', [6.94, 79.84], [5.7, 79.3]],
    ['MAERSK KOLKATA', [9.5, 84.0], [6.94, 79.84]], ['SLNS SAYURA', [8.55, 81.22], [7.3, 82.2]], ['TANKER ARJUNA', [6.12, 81.1], [5.7, 83.8]],
    ['DHONI LAKSHMI', [6.03, 80.23], [5.88, 80.6]]
  ];
  const lerp = (a, b, f) => [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
  const hdg = (a, b) => (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180 / Math.PI + 360) % 360;
  const air = routes.map(([cs, a, b], i) => {
    let to = b; if (closed.CMB && Math.abs(b[0] - 7.18) < .01) to = [6.29, 81.12]; // divert to Mattala
    const f = ((t / 900 + i * 0.137) % 1); const [lat, lon] = lerp(a, to, f);
    return { id: 'sim-' + cs, callsign: cs, lat, lon, heading: hdg(a, to), alt: 10000 * Math.sin(Math.PI * f), speed: 230, sim: true, diverted: to !== b };
  });
  const sea = lanes.map(([n, a, b], i) => {
    let to = b; if (closed.LKCMB && Math.abs(b[0] - 6.94) < .01) to = [6.12, 81.1];
    const f = ((t / 5400 + i * 0.21) % 1); const [lat, lon] = lerp(a, to, f);
    return { id: 'sim-' + n, name: n, lat, lon, cog: hdg(a, to), sog: 14, sim: true, diverted: to !== b };
  });
  return { air, sea };
}
