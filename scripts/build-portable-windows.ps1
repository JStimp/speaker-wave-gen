param(
  [string]$OutputRoot = "dist",
  [switch]$NoZip
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
Set-Location $repoRoot
$preferredNodeMajor = 20

function Assert-ChildPath {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Parent,

    [Parameter(Mandatory = $true)]
    [string]$Child
  )

  $parentPath = (Resolve-Path $Parent).Path.TrimEnd("\")
  $childPath = if (Test-Path -LiteralPath $Child) {
    (Resolve-Path $Child).Path
  } else {
    [System.IO.Path]::GetFullPath($Child)
  }

  if (-not $childPath.StartsWith($parentPath, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing to write outside repo: $childPath"
  }
}

function Get-LatestNodeLts {
  [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
  $index = Invoke-RestMethod -Uri "https://nodejs.org/dist/index.json"
  $release = $index | Where-Object { $_.version -like "v$preferredNodeMajor.*" } | Select-Object -First 1
  if (-not $release) {
    throw "Could not find a Node.js $preferredNodeMajor release from nodejs.org."
  }
  return $release.version
}

function Install-PortableNode {
  param(
    [Parameter(Mandatory = $true)]
    [string]$RuntimeRoot
  )

  New-Item -ItemType Directory -Force -Path $RuntimeRoot | Out-Null
  $arch = if ($env:PROCESSOR_ARCHITECTURE -eq "ARM64") { "arm64" } else { "x64" }
  $version = Get-LatestNodeLts
  $zipName = "node-$version-win-$arch.zip"
  $downloadUrl = "https://nodejs.org/dist/$version/$zipName"
  $zipPath = Join-Path $RuntimeRoot $zipName
  $nodeDir = Join-Path $RuntimeRoot "node-$version-win-$arch"

  Write-Host "Downloading portable Node.js $version ($arch)..."
  Invoke-WebRequest -Uri $downloadUrl -OutFile $zipPath
  Expand-Archive -LiteralPath $zipPath -DestinationPath $RuntimeRoot -Force
  Remove-Item -LiteralPath $zipPath -Force

  if (-not (Test-Path -LiteralPath (Join-Path $nodeDir "node.exe"))) {
    throw "Portable Node.js extraction did not produce node.exe."
  }

  Set-Content -LiteralPath (Join-Path $RuntimeRoot "node-path.txt") -Value (Split-Path -Leaf $nodeDir) -Encoding UTF8

  return @{
    Bin = $nodeDir
    Node = Join-Path $nodeDir "node.exe"
    Npm = Join-Path $nodeDir "npm.cmd"
  }
}

$outputRootPath = [System.IO.Path]::GetFullPath((Join-Path $repoRoot $OutputRoot))
Assert-ChildPath -Parent $repoRoot -Child $outputRootPath

$buildRoot = Join-Path $outputRootPath "portable-build"
$bundleRoot = Join-Path $buildRoot "WaveGen3D"
$zipPath = Join-Path $outputRootPath "WaveGen3D-windows-portable.zip"

Assert-ChildPath -Parent $repoRoot -Child $buildRoot
Assert-ChildPath -Parent $repoRoot -Child $zipPath

if (Test-Path -LiteralPath $buildRoot) {
  Remove-Item -LiteralPath $buildRoot -Recurse -Force
}

New-Item -ItemType Directory -Force -Path $bundleRoot | Out-Null

$itemsToCopy = @(
  "apps",
  "docs",
  "examples",
  "exporter",
  "packages",
  "scripts",
  "Launch-WaveGen3D.bat",
  "package.json",
  "README.md"
)

foreach ($item in $itemsToCopy) {
  $source = Join-Path $repoRoot $item
  $destination = Join-Path $bundleRoot $item
  if (Test-Path -LiteralPath $source -PathType Container) {
    Copy-Item -LiteralPath $source -Destination $destination -Recurse
  } else {
    Copy-Item -LiteralPath $source -Destination $destination
  }
}

$runtime = Install-PortableNode -RuntimeRoot (Join-Path $bundleRoot ".runtime")
$env:Path = "$($runtime.Bin);$env:Path"

Write-Host "Installing app dependencies into portable bundle..."
Push-Location $bundleRoot
try {
  & $runtime.Npm install --omit=optional --package-lock=false --audit=false --fund=false
  if ($LASTEXITCODE -ne 0) {
    throw "npm install failed with exit code $LASTEXITCODE"
  }
} finally {
  Pop-Location
}

$readme = @"
WaveGen3D portable Windows bundle
=================================

Double-click Launch-WaveGen3D.bat to start the app.

This bundle already includes:
- portable Node.js in .runtime/
- npm dependencies in node_modules/
- the WaveGen3D desktop source and exporter scripts

No Node.js install is required on the target PC.

Internet is only needed later if you delete .runtime/ or node_modules/, or if you use exporter features that need Docker/WSL setup.
"@

Set-Content -LiteralPath (Join-Path $bundleRoot "START_HERE.txt") -Value $readme -Encoding UTF8

if (-not $NoZip) {
  if (Test-Path -LiteralPath $zipPath) {
    Remove-Item -LiteralPath $zipPath -Force
  }

  Write-Host "Creating portable zip..."
  Compress-Archive -LiteralPath $bundleRoot -DestinationPath $zipPath -Force
}

Write-Host ""
Write-Host "Portable bundle created:" -ForegroundColor Green
Write-Host $bundleRoot
if (-not $NoZip) {
  Write-Host $zipPath
}
