# Deploying CIVSAR TTX

Three ways to run it, smallest first:

| | What you get | Needs |
|---|---|---|
| **Windows installer** | One machine or a LAN room; no internet needed for the exercise itself | Nothing — see `installer/README.md` |
| **Vercel + Supabase** (this guide) | Public URL, multi-device play, Claude generator, GIS proxy | GitHub + Vercel + Supabase accounts (all free tiers) |
| **Any Node host** | Same, self-hosted | `npm ci && npm run build && node server.js` behind a reverse proxy |

---

## 1 · What to upload

Upload **the whole `civsar-ttx` folder**. `.gitignore` already excludes everything that must not be published:

| Uploaded | Never uploaded |
|---|---|
| `src/`, `api/`, `public/`, `docs/`, `supabase/`, `installer/` | `node_modules/` (rebuilt by the host) |
| `index.html`, `package.json`, `package-lock.json` | `dist/` (built by the host) |
| `vite.config.js`, `vercel.json`, `server.js` | `.env` — **your real keys** |
| `README.md`, `DEPLOY.md`, `.env.example`, `.gitignore` | `credentials.json`, `*.pem`, `*.key` |
| | connection exports (they contain API keys) |

> **Before your first push**, run `git status` and read the list. If you see `.env`, any `credentials.json`, or a connections export, stop and fix `.gitignore` first. A secret pushed to GitHub is public the moment it lands, even if you delete it in the next commit — it stays in the history and in GitHub's caches, so it must be **rotated**, not just removed.

### Create the repository

```bash
cd civsar-ttx
git init
git add .
git status            # read this list before continuing
git commit -m "CIVSAR TTX — exercise planner and runner"
git branch -M main
git remote add origin https://github.com/<you>/civsar-ttx.git
git push -u origin main
```

Or with the GitHub CLI, which creates the repo for you:

```bash
gh repo create civsar-ttx --private --source=. --remote=origin --push
```

Start **private**. Make it public later if you want; `README.md` and `DEPLOY.md` are written for either.

---

## 2 · Supabase (optional, but needed for multi-device play)

Without it the app still runs — sessions just sync between tabs on one device. With it, players join from their own phones and laptops.

1. Create a project at [supabase.com](https://supabase.com) (free tier is enough for a TTX).
2. **SQL Editor → New query**, paste all of `supabase/schema.sql`, run it. That creates the three tables, the row-level-security policies and the realtime publication.
3. **Project Settings → API**, copy:
   - *Project URL* → `VITE_SUPABASE_URL`
   - *anon public* key → `VITE_SUPABASE_ANON_KEY`

The anon key is meant to be public — it ships in the browser bundle. What protects a session is the 6-character join code. **Never** put the `service_role` key anywhere near this app.

> The default policies are a join-code model: anyone with the URL and a code can read and write that session. That is right for training and wrong for anything real. For organisational use add Supabase Auth and restrict the policies by org or session membership.

---

## 3 · Deploy to Vercel

1. [vercel.com](https://vercel.com) → **Add New → Project** → import your GitHub repo.
2. Vercel detects Vite and reads `vercel.json`; leave the build settings alone.
3. **Environment Variables** — add before the first deploy:

| Name | Value | Why |
|---|---|---|
| `VITE_SUPABASE_URL` | your project URL | multi-device sync |
| `VITE_SUPABASE_ANON_KEY` | anon public key | multi-device sync |
| `VITE_AISSTREAM_KEY` | key from aisstream.io | live ship traffic (optional) |
| `ANTHROPIC_API_KEY` | your Claude key | scenario generator — **server-side only** |
| `ANTHROPIC_MODEL` | `claude-sonnet-5-5` | optional |
| `PROXY_ALLOW_HOSTS` | see below | **set this on a public deployment** |

   Anything prefixed `VITE_` is compiled into the browser bundle and is therefore **public**. `ANTHROPIC_API_KEY` has no prefix on purpose: it stays on the server, used only by `api/generate.js`. Putting it in a `VITE_` variable would hand your Claude billing to every visitor.

4. **Deploy.** First build takes a couple of minutes.

### Lock down the proxy

`api/proxy.js` fetches CORS-less sources (Google My Maps, GDACS, many GIS servers) server-side. Private, loopback, link-local and cloud-metadata addresses are always refused, but on a public URL you should also limit which public hosts it will reach — otherwise strangers can use your deployment to fetch arbitrary URLs:

```
PROXY_ALLOW_HOSTS = www.google.com,docs.google.com,www.gdacs.org,api.met.no,your-gis-host.example.org
```

Subdomains of a listed host are allowed. Leave it empty only for local use.

### Check it worked

- Open the URL → **Settings → Service health → Test all feeds now**. Expect green for aircraft, quakes, weather, alerts, radar, and "Server proxy: available".
- **Settings → Connections → Import…** `docs/connections-example.json`, then **Test** the ArcGIS and OGC API entries.
- Library → **Run now** on a sample → **STARTEX** → open the Players link on a phone and join. If the phone cannot see the session, Supabase is not configured.

Pushing to `main` redeploys automatically. Pull requests get their own preview URLs.

---

## 4 · Other hosts

- **Netlify / Cloudflare Pages** — the Vite build works unchanged (`npm run build`, publish `dist`), but `api/generate.js` and `api/proxy.js` are Vercel-shaped functions. Port them to Netlify Functions / Cloudflare Workers by calling the same `handleGenerate` / `handleProxy` cores in `api/_*-core.js`; the cores are deliberately framework-free. Note `handleProxy` uses `node:dns`, so it needs a Node runtime, not an Edge one.
- **GitHub Pages / any static host** — serves the app fine, but there is no `/api`, so the Claude generator is unavailable (use "Copy prompt for claude.ai") and CORS-less sources (Google My Maps, GDACS) will not load. Everything else, including the exercise, maps and hazard simulations, still works.
- **Your own server** — `npm ci && npm run build && PORT=8080 node server.js` behind nginx/Caddy with TLS. Set the same environment variables in the service's environment or a `.env` file next to `server.js`.

---

## 5 · Running an exercise on the deployed app

1. Facilitator opens the URL → a sample or your own exercise → **Run now**.
2. Share the **join code** (and the `/#/play/CODE` link) with players; open **Projector** on the room screen.
3. **STARTEX**. Injects release on the timeline; use **⏭ Next inject** or the speed control to pace it.
4. **ENDEX** → **Debrief** → download the after-action report.

Serve it over **https** (Vercel does by default): a browser on an insecure origin blocks geolocation and some map features, and `http://`-only ATAK sources are blocked on an https page.
