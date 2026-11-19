$ErrorActionPreference = 'Stop'

$Repo = 'max38tech/CloudTerm'
$InstallDir = Join-Path $env:LOCALAPPDATA 'CloudTerm'
$BinPath = Join-Path $InstallDir 'cloudterm-relay.exe'
$Addr = if ($env:CLOUDTERM_RELAY_ADDR) { $env:CLOUDTERM_RELAY_ADDR } else { '127.0.0.1:8022' }
$HealthUrl = "http://$Addr/health"

Write-Host '==> CloudTerm SSH Relay Installer' -ForegroundColor Cyan

try {
  $resp = Invoke-WebRequest -Uri $HealthUrl -TimeoutSec 2 -UseBasicParsing
  if ($resp.StatusCode -eq 200) {
    Write-Host "✓ cloudterm-relay is already running at $Addr" -ForegroundColor Green
    exit 0
  }
} catch {}

$Arch = if ([System.Runtime.InteropServices.RuntimeInformation]::OSArchitecture -eq 'Arm64') { 'arm64' } else { 'amd64' }
New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null

if (-not (Test-Path $BinPath)) {
  $ReleaseUrl = "https://github.com/$Repo/releases/latest/download/cloudterm-relay-windows-$Arch.exe"
  Write-Host "==> Downloading cloudterm-relay (windows/$Arch)..."
  try {
    Invoke-WebRequest -Uri $ReleaseUrl -OutFile $BinPath -UseBasicParsing
    Write-Host "✓ Installed prebuilt binary to $BinPath" -ForegroundColor Green
  } catch {
    if (Get-Command go -ErrorAction SilentlyContinue) {
      Write-Host '==> No prebuilt release found; building from GitHub source with Go...'
      $TmpSrc = Join-Path ([System.IO.Path]::GetTempPath()) ("cloudterm-relay-" + [System.Guid]::NewGuid().ToString('N'))
      New-Item -ItemType Directory -Force -Path $TmpSrc | Out-Null
      try {
        $RawBase = "https://raw.githubusercontent.com/$Repo/main/relay"
        Invoke-WebRequest -Uri "$RawBase/go.mod" -OutFile (Join-Path $TmpSrc 'go.mod') -UseBasicParsing
        Invoke-WebRequest -Uri "$RawBase/go.sum" -OutFile (Join-Path $TmpSrc 'go.sum') -UseBasicParsing
        Invoke-WebRequest -Uri "$RawBase/main.go" -OutFile (Join-Path $TmpSrc 'main.go') -UseBasicParsing
        Push-Location $TmpSrc
        go build -trimpath -ldflags="-s -w" -o $BinPath .
        Pop-Location
        Write-Host "✓ Built and installed to $BinPath" -ForegroundColor Green
      } finally {
        Remove-Item -Recurse -Force $TmpSrc -ErrorAction SilentlyContinue
      }
    } else {
      Write-Error "Could not download prebuilt binary from $ReleaseUrl and Go is not installed. Install Go (https://go.dev/dl/) or publish a GitHub Release."
      exit 1
    }
  }
} else {
  Write-Host "✓ Found existing binary at $BinPath" -ForegroundColor Green
}

# Add Startup shortcut so it auto-starts on login
$StartupDir = [Environment]::GetFolderPath('Startup')
$ShortcutPath = Join-Path $StartupDir 'CloudTerm Relay.lnk'
try {
  $WshShell = New-Object -ComObject WScript.Shell
  $Shortcut = $WshShell.CreateShortcut($ShortcutPath)
  $Shortcut.TargetPath = $BinPath
  $Shortcut.Arguments = "-addr $Addr"
  $Shortcut.WindowStyle = 7
  $Shortcut.Save()
  Write-Host "✓ Added Startup shortcut ($ShortcutPath)" -ForegroundColor Green
} catch {
  Write-Warning "Could not create Startup shortcut: $_"
}

Start-Process -FilePath $BinPath -ArgumentList "-addr $Addr" -WindowStyle Hidden

for ($i = 0; $i -lt 10; $i++) {
  Start-Sleep -Milliseconds 500
  try {
    $resp = Invoke-WebRequest -Uri $HealthUrl -TimeoutSec 1 -UseBasicParsing
    if ($resp.StatusCode -eq 200) {
      Write-Host "✓ CloudTerm SSH Relay is online at ws://$Addr" -ForegroundColor Green
      exit 0
    }
  } catch {}
}

Write-Warning "Relay started, but $HealthUrl did not respond yet."
