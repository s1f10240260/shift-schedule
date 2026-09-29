# Shift Schedule — production build & start (Windows / PowerShell)
# Usage: powershell -ExecutionPolicy Bypass -File scripts\deploy.ps1
#        powershell -ExecutionPolicy Bypass -File scripts\deploy.ps1 -StartOnly

param(
  [switch]$StartOnly
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$node = if ($env:MIMO_NODE) { $env:MIMO_NODE } else { 'node' }
$npm  = if ($env:MIMO_NPM)  { $env:MIMO_NPM }  else { 'npm' }

function Run($args, $wd) {
  Write-Host ">> $args  (in $wd)" -ForegroundColor Cyan
  Push-Location $wd
  try {
    & $node @args
    if ($LASTEXITCODE -ne 0) { throw "command failed: $args" }
  } finally {
    Pop-Location
  }
}

if (-not $StartOnly) {
  Write-Host '=== Build client ===' -ForegroundColor Green
  Run @($npm, 'run', 'build') (Join-Path $root 'client')

  Write-Host '=== Build server ===' -ForegroundColor Green
  Run @($npm, 'run', 'build') (Join-Path $root 'server')
}

Write-Host '=== Start production server ===' -ForegroundColor Green
$serverDir = Join-Path $root 'server'
$entry = Join-Path $serverDir 'dist\index.js'
if (-not (Test-Path $entry)) { throw "missing $entry" }

# stop previous instance on 3001
Get-NetTCPConnection -LocalPort 3001 -ErrorAction SilentlyContinue | ForEach-Object {
  try { Stop-Process -Id $_.OwningProcess -Force } catch {}
}

Write-Host "Starting $entry ..."
Write-Host 'Open the LAN URL printed below on a phone to verify QR access.'
& $node $entry
