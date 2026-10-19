# CIVSAR TTX — Planner & Runner

Plan, run and evaluate **tabletop exercises** for an Emergency Operations Centre: **physical** (one room plus a projector), **online** (everyone on their own device) or **hybrid**. The map shows a live picture of the area with **air and sea traffic**.

It follows the exercise cycle in the WHO Simulation Exercise Manual (2017) and the ETC/EdOS and SimEx TTX toolkits: concept note → objectives → roles → inject matrix (MSEL) → STARTEX → injects and responses → ENDEX → hot-wash → after-action report.

## What it does
| Area | Features |
|---|---|
| **Planner** | Concept and objectives, editable roles (exercise control, EOC/ICS sections and clusters, evaluator, observer), inject matrix editor with map-pick locations, a planning checklist, a JSON editor, MSEL CSV import and export |
| **Scenario input** | (1) Write it by hand. (2) Paste or upload **JSON**. A partial file is enough, for example just the scenario line and a few injects; the app fills in the rest. (3) **Claude**: generate a full TTX from a prompt, or extend the current one. (4) No API key? "Copy prompt for claude.ai" gives you a prompt to paste there, then import the JSON it returns. |
| **Control console** | Join code, STARTEX/pause/ENDEX, ±5 min jumps, **skip to the next inject**, speed (0.5–10×), auto-release by timeline or manual release/withdraw, operational-period banner, SimCell ad-hoc injects, response tracking for each inject, participant list |
| **Player view** | Pick a role, a role-filtered inbox, actions (actioned / acknowledged / escalated / need info), significant-event log, resource requests, sitreps, team map markers |
| **Solo play** | Join as **All roles (solo)** to run the whole EOC by yourself: every inject reaches you, tagged with the section it was addressed to, and you can action all of them. With **⏭ Next inject** on the console you skip the waiting between injects |
| **Evaluator** | Sees expected actions and scores each objective from 1 to 5 with notes |
| **Projector display** | A big-screen view of the in-scenario clock, latest injects, map and log (expected actions hidden) |
| **Common operating picture** | Airports and seaports (CFE-DM 2024, Tables 2–3). Click one to **close** it and the exercise traffic diverts (CMB→Mattala, Colombo Port→Hambantota). Simulated flights and vessels work offline. Live layers: **OpenSky** aircraft, **AISStream** ships, **USGS** quakes, **Open-Meteo** weather, **GDACS** alerts |
| **Live 3D map (MapLibre GL)** | Free keyless layers: CARTO dark, OSM streets, Esri satellite, AWS Terrarium 3D terrain plus hillshade, and OpenFreeMap 3D buildings. Live overlays: RainViewer rain radar, OpenSky aircraft, AISStream ships, USGS, Open-Meteo and GDACS. 2D/3D toggle and fullscreen |
| **Hazard simulator** | Simulated events animate on the real map on **every screen**, synced to the exercise clock: they pause, jump and speed up with it. **Flood**: water rises from the river channel and spreads over real terrain, with a live km² figure. **Tsunami**: the sea pulls back first, then several waves, and the first is not the largest. **Cyclone**: moving track, wind radii and rotating rain bands. **Landslide**: runout follows the steepest downhill path. **Earthquake** and **explosion/collapse**: 3D buildings collapse or are damaged with distance, wave rings, intensity zones and screen shake. **Hazmat plume**: cone driven by live wind, with an isolation zone. Attach a simulation to any inject in the planner (with preview at 1–60×) or trigger one ad hoc from the control console |
| **File sharing** | Players and SimCell pass files to each other mid-exercise — photos, sketches, spreadsheets, documents, KML — addressed to everyone or to named sections. Photos are resized automatically; anything over 1 MB is shared as a link. A shared **KML, GPX, GeoJSON or CSV can be drawn straight onto the map** |
| **Connections (bring your own GIS/API)** | Settings → Connections adds your own services, by protocol rather than by product: **ArcGIS REST** (Map/Feature/Image Server), **QGIS Server**, **GeoServer** and anything else speaking **WMS / WMTS / WFS / OGC API — Features**, **vector tiles** from Rust and Go tile servers (Martin, pg_tileserv, Tegola) or any TileJSON/MVT endpoint, MapLibre styles, **Google My Maps**, **Google Sheets**, GeoJSON, KML/GPX, CSV and any JSON API. Per-connection auth (query key, header key, bearer, basic), a **Test** button, and export/import so a facilitator can hand the same service list to the whole room |
| **GIS export** | The live picture (injects, team markers, running simulations) exports as **GeoJSON or KML** for QGIS, ArcGIS or Google My Maps |
| **Debrief** | Response-time metrics, objective scores, hot-wash, downloadable after-action report (.md) and full session JSON |

Four sample exercises are included, each with attached simulations: a Kelani flood (hybrid, with port and BIA logistics), an east-coast cyclone (air and sea operations), a no-notice southern tsunami, and a **man-made** Colombo Port container fire, explosion and toxic plume.

The simulation technique (simulate on a tile-aligned grid in map coordinates, spread water over the elevation data from its source, show building damage with feature-state, shake the screen with a CSS transform) follows *Disaster simulations on a real map* (freeCodeCamp), rebuilt on MapLibre GL with open data. **The simulations are illustrative training visuals, not forecasts or engineering models.**

## Install on Windows
A double-click installer for the local version, with nothing to set up first — no Node, no npm, no internet needed to install or to run an exercise:

```powershell
powershell -ExecutionPolicy Bypass -File installer\build-installer.ps1
```

produces `installer\out\CIVSAR-TTX-Setup-1.0.0.exe` (~24 MB). It installs for all users or just you (the "just me" option never prompts for UAC), asks which port to listen on, optionally adds the firewall rule so players on the same Wi-Fi can join, and uninstalls cleanly. See [`installer/README.md`](installer/README.md).

## Hosting
[`DEPLOY.md`](DEPLOY.md) covers putting it on GitHub and deploying to Vercel + Supabase for multi-device play, including which files must never be committed and how to lock down the proxy on a public URL.

## Run locally from source
```bash
npm install
cp .env.example .env      # optional: add Supabase / AISStream / Anthropic keys
npm start                 # builds, then serves on http://localhost:5173 and prints LAN URLs
```
- Other devices on the same Wi-Fi can open the printed LAN URL. This suits a physical or hybrid room with no internet, as long as Supabase is configured or everyone uses the facilitator laptop's browser windows.
- In Chrome or Edge, use **Install app** in the address bar. The app shell works offline.
- Developer mode: `npm run dev`.
- `PORT=5195 npm run serve` serves an existing build on another port, without rebuilding.

### Playing it on your own
1. `npm start`, then open the printed URL.
2. On a sample exercise, click **Run now** — that opens the facilitator console and shows the join code.
3. Press **STARTEX**, then open the **Players** link in a second tab and join as **All roles (solo)**.
4. Back on the console, use **⏭ Next inject** (or **Speed 10×**) to move through the MSEL at your own pace; the **Common operating picture** tab shows the map and the hazard simulations.
5. **ENDEX** when done, then **Debrief** for the metrics and the after-action report.

**Without Supabase**, sessions sync only between tabs and windows on the same device, for example the facilitator console plus a projector window. For multi-device play, configure Supabase.

## Deploy to Vercel + Supabase
1. Create a Supabase project. In the SQL editor, run `supabase/schema.sql`. This creates the tables and policies and turns on realtime.
2. Push this folder to GitHub, then import it in Vercel (it detects Vite; `vercel.json` is included).
3. Set these Vercel environment variables: `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. Optional: `VITE_AISSTREAM_KEY`, plus `ANTHROPIC_API_KEY` (server-side only, used by `api/generate.js`) and `ANTHROPIC_MODEL`.
4. Deploy. The facilitator opens a sample and clicks **Run now**, then shares the join code. Players go to `/#/play/CODE`.

## Scenario JSON
Minimal example: `docs/scenario-example.json`. Full field list:
`title, hazard, location, aim, objectives[], mode, durationMin, timeScale, simStart, center{lat,lon,zoom}, background, roles[{id,name,kind,brief}], injects[{id,stage,atMin,simTime,from,to[],mode,title,body,expectedAction,objective,notes,lat,lon,severity,requiresResponse}]`.
A bare array of injects also imports. CSV columns match the MSEL export.

## ATAK / MOBAC map sources
The 34 sources in the **atak-maps 1.5.0** pack are bundled in `src/data/atak/` as the original XML files. They appear in every map's basemap menu, and the overlays have their own **ATAK overlays** menu.
- **Basemaps:** Esri, USGS, NAIP, OpenTopo, CyclOSM, Google, Bing, Michelin, Canada, Finland and Poland.
- **Overlays:** OpenSeaMap seamarks, FEMA flood zones, Google road/terrain, USDA FSTopo and Waymarked Trails.
- **Formats:** `{$x}/{$y}/{$z}` tiles, `{$serverpart}` mirrors, Bing `{$q}` quadkeys (through a custom MapLibre protocol) and WMS (`customWmsMapSource`, requested in EPSG:3857) are all supported.
- **Importing more:** add further ATAK XML files in **Settings → ATAK / MOBAC map sources**.
- ⚠ The Google, Bing and Michelin entries use unofficial tile endpoints, so check those providers' terms before relying on them.
- Some sources only cover one region: USGS, NAIP and FEMA cover the USA; Canada, Finland and Poland cover those countries.
- `http://`-only sources (MTBMap) are blocked by browsers when the app is served over https, as it is on Vercel.

## Offline and LAN rooms
The map, simulations and exercise traffic keep running when tile servers can't be reached. Flood, tsunami and landslide simulations need the elevation tiles, so load the area once while online and the browser cache will hold them. Building damage needs the OpenFreeMap building tiles at street zoom.

## No single fault line
Nothing in the exercise depends on one provider being up. Each live feed tries providers in order and records the outcome in **Settings → Service health**, which also has a "Test all feeds now" button.

| If this fails | What happens |
|---|---|
| Aircraft | OpenSky → adsb.lol → your own connection → simulated exercise flights |
| Ships | AISStream (reconnects with back-off) → simulated exercise vessels |
| Earthquakes | USGS → EMSC → your own connection |
| Weather | Open-Meteo → MET Norway → your own connection |
| Alerts | GDACS → your own connection |
| Basemap | CARTO / OSM / Esri / 34 ATAK sources / your own — switch in the basemap menu |
| Session sync | Supabase → localStorage + BroadcastChannel on this device |
| Scenario writing | Claude API → "Copy prompt for claude.ai" → hand-written or imported JSON/CSV/Sheets |
| Hazard simulations | Cached elevation tiles; a running simulation keeps going with no network |
| The server itself | One bad request can no longer take it down; stream and handler errors answer 500 and the process stays up |

Any connection can be set as a **fallback for** a built-in feed (Settings → Connections → "Use as a fallback for"), so an organisation can put its own aircraft, weather or alert service in front of the public ones.

With no network at all the exercise clock, injects, responses, role inboxes, file sharing, simulated air and sea traffic and the hazard simulations all still run.

## Server proxy (`/api/proxy`)
Google My Maps, GDACS and many institutional GIS servers send no CORS headers, so the browser cannot read them even though the data is public. The app fetches those server-side instead.
- Private, loopback, link-local and cloud-metadata addresses are **always refused**, so the proxy cannot reach the host's own network.
- Responses are capped at 25 MB with a 25 s timeout; cookies and auth headers are not passed back.
- By default any *public* host is allowed, which is what makes "add your own API" usable. On a public deployment set `PROXY_ALLOW_HOSTS` to a comma-separated list of hosts to lock it down.
- The proxy is optional: everything that already sends CORS headers is fetched directly, and the app says so in Settings → Service health if the proxy is unavailable.

## Connecting your GIS
Settings → Connections, or start from one of the built-in templates.

| You run | Add it as | Notes |
|---|---|---|
| ArcGIS Online / Enterprise | **ArcGIS REST** | `.../MapServer` draws as raster tiles; `.../FeatureServer/0` is queried as GeoJSON. Set a WHERE clause, out fields and a feature cap |
| QGIS Server | **WMS** (keep the `MAP=` parameter in the URL) or **WFS** | WFS 1.1.0 vs 2.0.0 parameter names are handled for you |
| GeoServer / MapServer | **WMS**, **WMTS** or **WFS** | |
| Martin, pg_tileserv, Tegola, tileserver-gl | **TileJSON** | Source layers are read from the TileJSON; no need to name them |
| Anything OGC API — Features | **OGC API** | Optionally reloads as you pan |
| Google My Maps | **My Maps** | Paste the map URL; the map must be shared publicly. Fetched through the proxy |
| Google Sheets | **Sheets** | Paste the sheet URL or ID; share it as "anyone with the link". Point rows need latitude/longitude columns. A sheet whose columns match the MSEL export can also be imported as a whole inject matrix from the Library |
| A plain JSON API | **Generic JSON** | Name the array path and the lat/lon fields |

A GIS server on `localhost` works too, as long as it sends CORS headers (Martin does): the browser reaches it directly, while the proxy — correctly — will not.

`docs/connections-example.json` is a ready-made set to import from **Settings → Connections → Import…**. The ArcGIS, OGC API, WFS, WMS, vector-tile and GeoJSON entries point at live public services and work as-is; the QGIS Server, Martin, My Maps and Sheets entries are templates to point at your own.

## Security notes
- The default Supabase policies use a **join-code model**: anyone with the app URL and a session code can read and write that session. That is fine for training. For organisational use, add Supabase Auth and restrict policies by org or session membership.
- Never put `ANTHROPIC_API_KEY` in a `VITE_` variable. It must stay server-side.
- Connection credentials and API keys entered in Settings live in that browser's localStorage only. They are sent to the service they belong to and nowhere else — but a connections **export file contains them**, so treat it as a secret.
- On a public deployment, set `PROXY_ALLOW_HOSTS` so `/api/proxy` is not an open relay.
- Shared files travel inside the session event stream, which anyone holding the join code can read. Do not put real personal or casualty data in an exercise.
- OpenSky's anonymous API is rate-limited (the app polls every 20 s). AISStream needs a free key. If a live feed fails, the app reports it and the exercise traffic keeps running.
- A standing banner on every screen reminds players that this is training and to dial **117** in a real emergency.

## Structure
```
api/            Claude generator + CORS/SSRF-guarded proxy (Vercel functions + shared cores)
server.js       local install server (static + /api), hardened against one request killing it
supabase/       schema.sql
src/lib         scenario model, backend (Supabase | local), net (failover + health), feeds,
                connectors (user GIS/API services), gis (parsers, layers, export), hazards, atak
src/pages       Library, Planner, Control, Player, Display, Debrief, Settings
src/components  GLMap (MapLibre COP + hazard sims + GIS layers), EventFeed, SimForm, FileShare
src/data        sample scenarios, bundled ATAK map sources
```
