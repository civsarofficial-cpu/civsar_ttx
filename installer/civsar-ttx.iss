; CIVSAR TTX — Windows installer wizard (Inno Setup 6)
;
; Build it with installer\build-installer.ps1, which stages the app, fetches the Node runtime
; and then calls ISCC on this file. Compiling this file on its own will fail until build\ exists.
;
; The installed layout is deliberately self-contained:
;   {app}\CIVSAR-TTX.cmd   launcher — the console window is the server's status display
;   {app}\app\             dist\, server.js, api\ cores, package.json, .env (written at install)
;   {app}\node\node.exe    private Node runtime; nothing is added to PATH and no system Node is used
; The server needs no npm packages at all: it uses only Node built-ins.

#define AppName        "CIVSAR TTX"
#define AppVersion     "1.0.0"
#define AppPublisher   "CIVSAR"
#define AppURL         "https://github.com/civsar/civsar-ttx"
#define AppExe         "CIVSAR-TTX.cmd"

[Setup]
; Changing AppId would make Windows treat a new build as a separate product; keep it stable.
AppId={{8F3C21D4-5B7A-4E29-9C64-1A0D7E6B52C8}
AppName={#AppName}
AppVersion={#AppVersion}
AppVerName={#AppName} {#AppVersion}
AppPublisher={#AppPublisher}
AppPublisherURL={#AppURL}
AppSupportURL={#AppURL}
VersionInfoVersion={#AppVersion}
VersionInfoDescription={#AppName} — tabletop exercise planner and runner

DefaultDirName={autopf}\{#AppName}
DefaultGroupName={#AppName}
DisableProgramGroupPage=auto
AllowNoIcons=yes
OutputDir=out
OutputBaseFilename=CIVSAR-TTX-Setup-{#AppVersion}
SetupIconFile=civsar-ttx.ico
UninstallDisplayIcon={app}\civsar-ttx.ico
UninstallDisplayName={#AppName} {#AppVersion}
InfoBeforeFile=files\INFO.txt
WizardStyle=modern
Compression=lzma2/max
SolidCompression=yes
; The bundled Node runtime is 64-bit, so refuse 32-bit Windows rather than install something broken.
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
; Works without administrator rights, which matters on locked-down organisational laptops: the
; wizard offers "for all users" (Program Files, needs elevation, can add the firewall rule) or
; "for me only" (%LocalAppData%\Programs, no UAC prompt at all). {autopf}, {group} and
; {autodesktop} follow whichever was chosen. /ALLUSERS or /CURRENTUSER force it for silent installs.
PrivilegesRequired=lowest
PrivilegesRequiredOverridesAllowed=dialog commandline
MinVersion=10.0

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "Create a &desktop shortcut"; GroupDescription: "Shortcuts:"
; Adding a firewall rule needs elevation, so this is only offered on an all-users install. Without
; it the server still runs; Windows just asks to allow it the first time, or players cannot connect.
Name: "firewall"; Description: "Allow players on this &network to join (adds a Windows Firewall rule)"; GroupDescription: "Network:"; Check: IsAdminInstallMode

[Files]
Source: "build\app\*";     DestDir: "{app}\app";  Flags: ignoreversion recursesubdirs createallsubdirs
Source: "build\node\node.exe"; DestDir: "{app}\node"; Flags: ignoreversion
Source: "files\{#AppExe}"; DestDir: "{app}";      Flags: ignoreversion
Source: "files\stop-server.ps1"; DestDir: "{app}"; Flags: ignoreversion
Source: "civsar-ttx.ico";  DestDir: "{app}";      Flags: ignoreversion
Source: "files\INFO.txt";  DestDir: "{app}";      DestName: "About CIVSAR TTX.txt"; Flags: ignoreversion isreadme

[Icons]
Name: "{group}\{#AppName}";                   Filename: "{app}\{#AppExe}"; WorkingDir: "{app}"; IconFilename: "{app}\civsar-ttx.ico"; Comment: "Start the exercise server and open CIVSAR TTX"
Name: "{group}\Exercise server settings";     Filename: "notepad.exe"; Parameters: """{app}\app\.env"""; IconFilename: "{app}\civsar-ttx.ico"; Comment: "Port and API keys for this installation"
Name: "{group}\About CIVSAR TTX";             Filename: "{app}\About CIVSAR TTX.txt"
Name: "{autodesktop}\{#AppName}";             Filename: "{app}\{#AppExe}"; WorkingDir: "{app}"; IconFilename: "{app}\civsar-ttx.ico"; Tasks: desktopicon

[Run]
; One inbound rule for the chosen port so phones and laptops in the room can reach the server.
Filename: "{sys}\netsh.exe"; Parameters: "advfirewall firewall add rule name=""CIVSAR TTX"" dir=in action=allow protocol=TCP localport={code:GetPort} program=""{app}\node\node.exe"" description=""CIVSAR TTX exercise server"""; Flags: runhidden waituntilterminated; Tasks: firewall; StatusMsg: "Adding the firewall rule..."
Filename: "{app}\{#AppExe}"; Description: "Start {#AppName} now"; WorkingDir: "{app}"; Flags: postinstall nowait skipifsilent shellexec

[UninstallRun]
; Stop a server still running from this folder, then drop the firewall rule. The kill logic lives
; in stop-server.ps1 so it stays readable: a PowerShell block inline here would collide with Inno's
; own use of braces for constants.
Filename: "powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{app}\stop-server.ps1"" -ExePath ""{app}\node\node.exe"""; Flags: runhidden waituntilterminated; RunOnceId: "StopServer"
Filename: "{sys}\netsh.exe"; Parameters: "advfirewall firewall delete rule name=""CIVSAR TTX"""; Flags: runhidden waituntilterminated; RunOnceId: "DelFirewall"

[UninstallDelete]
; .env is written by this installer rather than shipped, so remove it explicitly.
Type: files; Name: "{app}\app\.env"
Type: dirifempty; Name: "{app}\app"
Type: dirifempty; Name: "{app}"

[Code]
var
  PortPage: TInputQueryWizardPage;

procedure InitializeWizard;
begin
  PortPage := CreateInputQueryPage(wpSelectTasks,
    'Network port',
    'Which port should the exercise server listen on?',
    'Players reach the exercise at http://<this computer>:<port>/ . The default suits almost' + #13#10 +
    'everyone — change it only if another program on this computer already uses port 5173.');
  PortPage.Add('Port (1024-65535):', False);
  PortPage.Values[0] := '5173';
end;

function GetPort(Param: String): String;
begin
  Result := PortPage.Values[0];
end;

function NextButtonClick(CurPageID: Integer): Boolean;
var
  P: Integer;
begin
  Result := True;
  if CurPageID = PortPage.ID then begin
    P := StrToIntDef(Trim(PortPage.Values[0]), -1);
    if (P < 1024) or (P > 65535) then begin
      MsgBox('Please enter a port number between 1024 and 65535.' + #13#10 +
             'Ports below 1024 are reserved by Windows.', mbError, MB_OK);
      Result := False;
    end;
  end;
end;

procedure CurStepChanged(CurStep: TSetupStep);
var
  Env: TArrayOfString;
begin
  if CurStep = ssPostInstall then begin
    // Written here rather than shipped so it carries the port chosen in the wizard. The app also
    // accepts keys entered in its own Settings page; these are only the server-side ones.
    SetArrayLength(Env, 12);
    Env[0]  := '# CIVSAR TTX — local server settings. Restart the app after editing.';
    Env[1]  := '';
    Env[2]  := 'PORT=' + GetPort('');
    Env[3]  := '';
    Env[4]  := '# Claude scenario generator. Server-side only — never add a VITE_ prefix.';
    Env[5]  := '# Get a key at console.anthropic.com, paste it after the = sign.';
    Env[6]  := 'ANTHROPIC_API_KEY=';
    Env[7]  := 'ANTHROPIC_MODEL=claude-sonnet-5-5';
    Env[8]  := '';
    Env[9]  := '# Hosts the built-in proxy may fetch (Google My Maps, GDACS, your GIS servers).';
    Env[10] := '# Empty = any public host, which is fine on a single machine or a closed LAN.';
    Env[11] := 'PROXY_ALLOW_HOSTS=';
    SaveStringsToFile(ExpandConstant('{app}\app\.env'), Env, False);
  end;
end;
