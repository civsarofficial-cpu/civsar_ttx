<#
.SYNOPSIS
  Builds CIVSAR-TTX-Setup-<version>.exe — the Windows installer wizard for the local version.

.DESCRIPTION
  1. Builds the web app          (npm ci + npm run build)
  2. Stages the runtime payload  (dist, server.js, api cores, package.json)
  3. Fetches a private Node.js runtime, cached between builds
  4. Draws the icon              (installer\make-icon.mjs)
  5. Compiles the wizard         (Inno Setup's ISCC)

  The installed server uses only Node built-ins, so no node_modules are shipped.

.PARAMETER NodeVersion
  Node.js version to bundle. Default is the current LTS line.

.PARAMETER SkipBuild
  Reuse the existing dist\ instead of rebuilding the web app.

.PARAMETER UseLocalNode
  Copy the node.exe already on this machine instead of downloading one.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File installer\build-installer.ps1
#>
[CmdletBinding()]
param(
  [string]$NodeVersion = 'v24.22.0',
  [switch]$SkipBuild,
  [switch]$UseLocalNode
)

$ErrorActionPreference = 'Stop'
$ProgressPreference    = 'SilentlyContinue'   # a visible progress bar makes the download far slower

$Here = Split-Path -Parent $MyInvocation.MyCommand.Path
$Root = Split-Path -Parent $Here
$Build = Join-Path $Here 'build'
$Runtime = Join-Path $Here 'runtime'

function Step($m) { Write-Host "`n==> $m" -ForegroundColor Cyan }
function Note($m) { Write-Host "    $m" -ForegroundColor DarkGray }

# ---------------------------------------------------------------- 1. build the web app
if ($SkipBuild) {
  Step 'Skipping web build (-SkipBuild)'
  if (-not (Test-Path (Join-Path $Root 'dist\index.html'))) { throw 'dist\index.html is missing — run without -SkipBuild.' }
} else {
  Step 'Building the web app'
  Push-Location $Root
  try {
    if (Test-Path 'package-lock.json') { npm ci } else { npm install }
    if ($LASTEXITCODE -ne 0) { throw "npm install failed ($LASTEXITCODE)" }
    npm run build
    if ($LASTEXITCODE -ne 0) { throw "npm run build failed ($LASTEXITCODE)" }
  } finally { Pop-Location }
}

# ---------------------------------------------------------------- 2. stage the payload
Step 'Staging the application'
if (Test-Path $Build) { Remove-Item $Build -Recurse -Force }
$AppDir = Join-Path $Build 'app'
New-Item -ItemType Directory -Force -Path $AppDir, (Join-Path $AppDir 'api'), (Join-Path $Build 'node') | Out-Null

Copy-Item (Join-Path $Root 'dist') -Destination $AppDir -Recurse
Copy-Item (Join-Path $Root 'server.js') -Destination $AppDir
Copy-Item (Join-Path $Root 'api\_generate-core.js') -Destination (Join-Path $AppDir 'api')
Copy-Item (Join-Path $Root 'api\_proxy-core.js')    -Destination (Join-Path $AppDir 'api')
Copy-Item (Join-Path $Here 'files\app-package.json') -Destination (Join-Path $AppDir 'package.json')

$staged = (Get-ChildItem $AppDir -Recurse -File | Measure-Object -Property Length -Sum)
Note ("{0} files, {1:N1} MB" -f $staged.Count, ($staged.Sum / 1MB))

# A .env in the repo must never travel into the installer — it would ship your keys to everyone.
if (Test-Path (Join-Path $AppDir '.env')) { Remove-Item (Join-Path $AppDir '.env') -Force; Note 'Removed a stray .env from the staged app.' }

# ---------------------------------------------------------------- 3. Node runtime
Step 'Preparing the Node.js runtime'
$NodeExe = Join-Path $Runtime "node-$NodeVersion.exe"
if ($UseLocalNode) {
  $local = (Get-Command node -ErrorAction SilentlyContinue).Source
  if (-not $local) { throw 'No node.exe on PATH to copy (-UseLocalNode).' }
  Copy-Item $local (Join-Path $Build 'node\node.exe')
  Note "Copied $local ($(& $local -v))"
} else {
  New-Item -ItemType Directory -Force -Path $Runtime | Out-Null
  if (-not (Test-Path $NodeExe)) {
    $url = "https://nodejs.org/dist/$NodeVersion/win-x64/node.exe"
    Note "Downloading $url"
    try { Invoke-WebRequest -Uri $url -OutFile $NodeExe -UseBasicParsing }
    catch { throw "Could not download the Node runtime: $($_.Exception.Message)`nUse -UseLocalNode to bundle the node.exe on this machine instead." }
  } else { Note "Using cached $NodeExe" }
  Copy-Item $NodeExe (Join-Path $Build 'node\node.exe')
}
$nodeSize = (Get-Item (Join-Path $Build 'node\node.exe')).Length
Note ("node.exe {0:N0} MB" -f ($nodeSize / 1MB))

# Prove the staged app actually starts under the bundled runtime before wrapping it in an installer.
Step 'Smoke-testing the staged application'
$port = 51734
# Start-Process has no portable way to pass one variable (-Environment is PowerShell 7 only), and
# a child inherits this process's environment, so set it here and clear it in the finally block.
$env:PORT = "$port"
$p = Start-Process -FilePath (Join-Path $Build 'node\node.exe') -ArgumentList 'server.js' -WorkingDirectory $AppDir -PassThru -WindowStyle Hidden
try {
  $ok = $false
  foreach ($i in 1..20) {
    Start-Sleep -Milliseconds 400
    try { if ((Invoke-WebRequest "http://127.0.0.1:$port/" -UseBasicParsing -TimeoutSec 3).StatusCode -eq 200) { $ok = $true; break } } catch { }
  }
  if (-not $ok) { throw "The staged app did not answer on port $port." }
  Note 'Served index.html from the bundled runtime.'
} finally {
  if ($p -and -not $p.HasExited) { Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue }
  Remove-Item Env:\PORT -ErrorAction SilentlyContinue
}

# ---------------------------------------------------------------- 4. icon
Step 'Drawing the icon'
& node (Join-Path $Here 'make-icon.mjs')
if ($LASTEXITCODE -ne 0) { throw 'make-icon.mjs failed' }

# ---------------------------------------------------------------- 5. compile
Step 'Compiling the installer'
$iscc = @(
  "$env:LOCALAPPDATA\Programs\Inno Setup 6\ISCC.exe",
  "${env:ProgramFiles(x86)}\Inno Setup 6\ISCC.exe",
  "$env:ProgramFiles\Inno Setup 6\ISCC.exe"
) | Where-Object { Test-Path $_ } | Select-Object -First 1

if (-not $iscc) {
  Write-Host @"

Inno Setup is not installed, so the .exe was not produced.
Everything else is staged and tested in installer\build\.

  winget install -e --id JRSoftware.InnoSetup

then run this script again.
"@ -ForegroundColor Yellow
  exit 2
}
Note "Using $iscc"
& $iscc (Join-Path $Here 'civsar-ttx.iss')
if ($LASTEXITCODE -ne 0) { throw "ISCC failed ($LASTEXITCODE)" }

$out = Get-ChildItem (Join-Path $Here 'out\*.exe') | Sort-Object LastWriteTime | Select-Object -Last 1
Write-Host ("`nBuilt {0} ({1:N1} MB)" -f $out.FullName, ($out.Length / 1MB)) -ForegroundColor Green
Write-Host "Hand this single file to anyone running Windows 10 or 11 (64-bit). Nothing else is needed.`n"
