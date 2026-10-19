# Stops only the exercise server belonging to this installation.
# Called by the uninstaller, and usable by hand if a server is left running:
#   powershell -ExecutionPolicy Bypass -File stop-server.ps1 -ExePath "C:\Program Files\CIVSAR TTX\node\node.exe"
# Matching on the full path means any other Node process on the machine is left alone.
param([Parameter(Mandatory = $true)][string]$ExePath)

Get-CimInstance Win32_Process -Filter "Name='node.exe'" -ErrorAction SilentlyContinue |
  Where-Object -Property ExecutablePath -EQ -Value $ExePath |
  Invoke-CimMethod -MethodName Terminate -ErrorAction SilentlyContinue |
  Out-Null
