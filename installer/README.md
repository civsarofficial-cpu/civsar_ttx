# Windows installer

Builds `CIVSAR-TTX-Setup-1.0.0.exe` (~24 MB) — a standard wizard that installs the local version of CIVSAR TTX on Windows 10/11 (64-bit) with **no prerequisites at all**. A private copy of the Node.js runtime is bundled, so the machine needs no Node, no npm and no internet connection to install or to run an exercise.

## Build it

```powershell
powershell -ExecutionPolicy Bypass -File installer\build-installer.ps1
```

The script builds the web app, stages the runtime payload, downloads the Node runtime (cached in `installer\runtime\` between builds), draws the icon, **starts the staged app once to prove it serves**, and then compiles the wizard. Output lands in `installer\out\`.

Needs [Inno Setup 6](https://jrsoftware.org/isinfo.php): `winget install -e --id JRSoftware.InnoSetup`

| Option | Effect |
|---|---|
| `-SkipBuild` | reuse the existing `dist\` instead of rebuilding the web app |
| `-UseLocalNode` | bundle the `node.exe` already on this machine instead of downloading one |
| `-NodeVersion v24.22.0` | pin a different Node runtime |

## What the wizard does

1. **Information** — the training-tool notice and the "dial 117 in a real emergency" warning, which participants must be briefed on anyway.
2. **Install for all users or just me** — "just me" installs to `%LocalAppData%\Programs\CIVSAR TTX` and **never prompts for UAC**, which matters on locked-down organisational laptops. "All users" installs to Program Files and can add the firewall rule.
3. **Destination** and **Start Menu folder**.
4. **Tasks** — desktop shortcut; firewall rule (all-users installs only).
5. **Network port** — defaults to 5173, validated to 1024–65535. Change it only if something else already uses that port.
6. Installs, writes `app\.env` with the chosen port, and offers to start the app.

## What gets installed

```
CIVSAR TTX\
  CIVSAR-TTX.cmd        launcher — its console window is the server's status display
  stop-server.ps1       stops only this installation's server
  civsar-ttx.ico
  About CIVSAR TTX.txt
  app\                  dist\, server.js, api\ cores, package.json, .env
  node\node.exe         private Node runtime (nothing added to PATH)
```

No `node_modules`: `server.js` and the two API cores use only Node built-ins.

## Using it

Start **CIVSAR TTX** from the Start Menu. A console window opens, the browser follows automatically, and the console prints the LAN addresses to read out to players:

```
CIVSAR TTX running → http://localhost:5173
  LAN: http://192.168.0.227:5173
```

**Keep that window open for the whole exercise — closing it stops the server for everyone.** Players on the same Wi-Fi open the LAN address and join with the 6-character code.

To change the port or add a Claude API key, use **Start Menu → Exercise server settings**, which opens `app\.env` in Notepad. Restart the app afterwards. (On an all-users install that file lives under Program Files, so Notepad must be run as administrator to save it.)

Uninstall from **Settings → Apps**, or Add/Remove Programs. It stops a running server, removes the firewall rule and leaves nothing behind.

## Verified

Built, then installed silently per-user, exercised and uninstalled on Windows 11:

- install exit code 0 with no UAC prompt; `.env` written with the chosen port; Start Menu, desktop shortcut and Add/Remove Programs entry all correct
- the launcher served `index.html` and the 1.3 MB app bundle from the bundled runtime
- `/api/proxy` worked, and still refused loopback and cloud-metadata addresses (403)
- `/api/generate` returned a clear "key is not set" message rather than failing obscurely
- `stop-server.ps1` terminated that installation's server and left other Node processes alone
- uninstall removed the directory, both shortcuts and the registry entry, with no leftovers

The all-users (elevated) path and the firewall rule use the same code paths but were not exercised here, because testing them needs an interactive UAC prompt.

## Signing

The .exe is unsigned, so SmartScreen will warn on first run ("Windows protected your PC" → *More info* → *Run anyway*). For distribution beyond your own team, sign it with a code-signing certificate:

```powershell
signtool sign /fd SHA256 /tr http://timestamp.digicert.com /td SHA256 /f cert.pfx /p <password> installer\out\CIVSAR-TTX-Setup-1.0.0.exe
```

Inno Setup can also do this automatically for every build via its `SignTool` directive.
