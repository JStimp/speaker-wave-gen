$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
Set-Location $repoRoot

function Find-Command {
  param(
    [Parameter(Mandatory = $true)]
    [string[]]$Names
  )

  foreach ($name in $Names) {
    $command = Get-Command $name -ErrorAction SilentlyContinue
    if ($command) {
      return $command.Source
    }
  }

  return $null
}

Write-Host ""
Write-Host "WaveGen3D Launcher" -ForegroundColor Cyan
Write-Host "Project: $repoRoot"
Write-Host ""

$node = Find-Command @("node.exe", "node")
$npm = Find-Command @("npm.cmd", "npm.exe", "npm")

if (-not $node) {
  Write-Host "Node.js was not found." -ForegroundColor Red
  Write-Host "Install the current LTS version from https://nodejs.org, then run Launch-WaveGen3D.bat again."
  exit 1
}

if (-not $npm) {
  Write-Host "npm was not found." -ForegroundColor Red
  Write-Host "npm normally installs with Node.js. Reinstall Node.js from https://nodejs.org and include npm."
  exit 1
}

$nodeVersion = (& $node --version).Trim()
$npmVersion = (& $npm --version).Trim()
Write-Host "Node: $nodeVersion"
Write-Host "npm:  $npmVersion"
Write-Host ""

if (-not (Test-Path -LiteralPath (Join-Path $repoRoot "node_modules"))) {
  Write-Host "Installing app dependencies. This can take a few minutes the first time..." -ForegroundColor Yellow
  & $npm install
  if ($LASTEXITCODE -ne 0) {
    Write-Host "Dependency install failed." -ForegroundColor Red
    exit $LASTEXITCODE
  }
  Write-Host ""
}

Write-Host "Starting WaveGen3D desktop app..." -ForegroundColor Green
Write-Host "Leave this window open while the app is running."
Write-Host ""

& $npm run dev
exit $LASTEXITCODE

