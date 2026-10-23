# IQ POS print bridge installer — Windows.
#
#   Open PowerShell and run:
#   irm https://pos.luvder.com/downloads/install-print-bridge.ps1 | iex
#
# Installs Node.js if it's missing (via winget), downloads iq-print-bridge.js to
# %USERPROFILE%\iq-print-bridge, makes it start (hidden) when you sign in, starts it now and checks
# it answers on http://127.0.0.1:9200. Safe to run again to update or repair.
# Set $env:IQ_BRIDGE_PORT first to use a different port.

$ErrorActionPreference = "Stop"
$Base = "https://pos.luvder.com/downloads"
$Dir = Join-Path $env:USERPROFILE "iq-print-bridge"
$Port = if ($env:IQ_BRIDGE_PORT) { $env:IQ_BRIDGE_PORT } else { "9200" }

Write-Host "IQ POS print bridge - installing for Windows"

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  if (Get-Command winget -ErrorAction SilentlyContinue) {
    Write-Host "Installing Node.js LTS..."
    winget install -e --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements | Out-Null
    $env:Path = [Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [Environment]::GetEnvironmentVariable("Path", "User")
  }
  if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "Node.js is needed first. Install the LTS version from https://nodejs.org, then run this again." -ForegroundColor Yellow
    return
  }
}

New-Item -ItemType Directory -Force -Path $Dir | Out-Null
$Script = Join-Path $Dir "iq-print-bridge.js"
Invoke-WebRequest "$Base/iq-print-bridge.js" -OutFile $Script -UseBasicParsing
$Node = (Get-Command node).Source
Write-Host "Downloaded to $Script (bridge $(& $Node $Script --version))"

# Stop a copy that's already running (an older version, or one started by hand).
Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
  Where-Object { $_.CommandLine -like "*iq-print-bridge.js*" } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force }

# A tiny VBScript in the Startup folder runs the bridge with no window each time you sign in.
$Startup = [Environment]::GetFolderPath("Startup")
$Launcher = Join-Path $Startup "IQ POS print bridge.vbs"
$Vbs = "Set sh = CreateObject(""WScript.Shell"")`r`nsh.Run """"""$Node"""" """"$Script"""" $Port"", 0, False"
Set-Content -Path $Launcher -Value $Vbs -Encoding ASCII
Start-Process wscript.exe -ArgumentList "`"$Launcher`""

Start-Sleep -Seconds 2
try {
  Invoke-RestMethod "http://127.0.0.1:$Port/" | Out-Null
  Write-Host ""
  Write-Host "OK - the print bridge is running on http://127.0.0.1:$Port" -ForegroundColor Green
  Write-Host "It starts by itself (hidden) whenever you sign in to Windows."
} catch {
  Write-Host ""
  Write-Host "The bridge didn't answer on http://127.0.0.1:$Port. Try running it by hand to see why:" -ForegroundColor Yellow
  Write-Host "  node `"$Script`""
  return
}
Write-Host ""
Write-Host "Next:"
Write-Host "  Find your printer's IP:   node `"$Script`" find"
Write-Host "  Print a test page:        node `"$Script`" test <printer-ip>"
Write-Host "  Then add the printer in IQ POS (Settings -> Printers) with that IP and turn on 'Use for Till auto-print'."
