$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
Set-Location $repoRoot
$runtimeRoot = Join-Path $repoRoot ".runtime"
$portableNodeMarker = Join-Path $runtimeRoot "node-path.txt"

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

function Get-PortableNodeBin {
  $candidateDirs = @()

  if (Test-Path -LiteralPath $portableNodeMarker) {
    $markerValue = (Get-Content -LiteralPath $portableNodeMarker -Raw).Trim()
    if ($markerValue) {
      if ([System.IO.Path]::IsPathRooted($markerValue)) {
        $candidateDirs += $markerValue
      } else {
        $candidateDirs += (Join-Path $runtimeRoot $markerValue)
      }
    }
  }

  if (Test-Path -LiteralPath $runtimeRoot) {
    $candidateDirs += Get-ChildItem -LiteralPath $runtimeRoot -Directory -Filter "node-*-win-*" |
      Select-Object -ExpandProperty FullName
  }

  foreach ($nodeDir in $candidateDirs) {
    $nodeExe = Join-Path $nodeDir "node.exe"
    $npmCmd = Join-Path $nodeDir "npm.cmd"

    if ((Test-Path -LiteralPath $nodeExe) -and (Test-Path -LiteralPath $npmCmd)) {
      Set-Content -LiteralPath $portableNodeMarker -Value (Split-Path -Leaf $nodeDir) -Encoding UTF8
      return @{
        Node = $nodeExe
        Npm = $npmCmd
        Bin = $nodeDir
      }
    }
  }

  return $null
}

function Install-PortableNode {
  New-Item -ItemType Directory -Force -Path $runtimeRoot | Out-Null

  [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

  Write-Host "Node.js was not found on this PC." -ForegroundColor Yellow
  Write-Host "Downloading a portable Node.js LTS runtime into .runtime..."

  $index = Invoke-RestMethod -Uri "https://nodejs.org/dist/index.json"
  $release = $index | Where-Object { $_.lts -ne $false } | Select-Object -First 1

  if (-not $release) {
    throw "Could not find a Node.js LTS release from nodejs.org."
  }

  $arch = if ($env:PROCESSOR_ARCHITECTURE -eq "ARM64") { "arm64" } else { "x64" }
  $version = $release.version
  $zipName = "node-$version-win-$arch.zip"
  $downloadUrl = "https://nodejs.org/dist/$version/$zipName"
  $zipPath = Join-Path $runtimeRoot $zipName

  Write-Host "Download: $downloadUrl"
  Invoke-WebRequest -Uri $downloadUrl -OutFile $zipPath

  Write-Host "Extracting portable runtime..."
  Expand-Archive -LiteralPath $zipPath -DestinationPath $runtimeRoot -Force
  Remove-Item -LiteralPath $zipPath -Force

  $nodeDir = Join-Path $runtimeRoot "node-$version-win-$arch"
  if (-not (Test-Path -LiteralPath (Join-Path $nodeDir "node.exe"))) {
    throw "Portable Node.js extraction did not produce node.exe."
  }

  Set-Content -LiteralPath $portableNodeMarker -Value (Split-Path -Leaf $nodeDir) -Encoding UTF8

  return @{
    Node = Join-Path $nodeDir "node.exe"
    Npm = Join-Path $nodeDir "npm.cmd"
    Bin = $nodeDir
  }
}

Write-Host ""
Write-Host "WaveGen3D Launcher" -ForegroundColor Cyan
Write-Host "Project: $repoRoot"
Write-Host ""

$portable = Get-PortableNodeBin

if ($portable) {
  $node = $portable.Node
  $npm = $portable.Npm
  $env:Path = "$($portable.Bin);$env:Path"
} else {
  $node = Find-Command @("node.exe", "node")
  $npm = Find-Command @("npm.cmd", "npm.exe", "npm")
}

if (-not $node -or -not $npm) {
  try {
    $portable = Install-PortableNode
    $node = $portable.Node
    $npm = $portable.Npm
    $env:Path = "$($portable.Bin);$env:Path"
  } catch {
    Write-Host ""
    Write-Host "Automatic Node.js setup failed." -ForegroundColor Red
    Write-Host $_.Exception.Message
    Write-Host ""
    Write-Host "Install the current LTS version from https://nodejs.org, then run Launch-WaveGen3D.bat again."
    exit 1
  }
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
