$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
Set-Location $repoRoot
$runtimeRoot = Join-Path $repoRoot ".runtime"
$portableNodeMarker = Join-Path $runtimeRoot "node-path.txt"
$preferredNodeMajor = 20

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

function Get-NodeMajor {
  param(
    [Parameter(Mandatory = $true)]
    [string]$NodePath
  )

  try {
    $version = (& $NodePath --version).Trim()
    return [int](($version -replace "^v", "").Split(".")[0])
  } catch {
    return $null
  }
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
      $major = Get-NodeMajor -NodePath $nodeExe
      if ($major -ne $preferredNodeMajor) {
        continue
      }

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
  Write-Host "Downloading a portable Node.js $preferredNodeMajor runtime into .runtime..."

  $index = Invoke-RestMethod -Uri "https://nodejs.org/dist/index.json"
  $release = $index | Where-Object { $_.version -like "v$preferredNodeMajor.*" } | Select-Object -First 1

  if (-not $release) {
    throw "Could not find a Node.js $preferredNodeMajor release from nodejs.org."
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

function Clear-NpmInstallBlockers {
  foreach ($name in @(
    "ELECTRON_SKIP_BINARY_DOWNLOAD",
    "electron_skip_binary_download",
    "npm_config_electron_skip_binary_download",
    "npm_config_ELECTRON_SKIP_BINARY_DOWNLOAD",
    "NPM_CONFIG_IGNORE_SCRIPTS",
    "npm_config_ignore_scripts"
  )) {
    if (Test-Path -LiteralPath "Env:\$name") {
      Remove-Item -LiteralPath "Env:\$name" -ErrorAction SilentlyContinue
    }
  }

  $env:npm_config_ignore_scripts = "false"
  $env:npm_config_package_lock = "false"
  $env:npm_config_audit = "false"
  $env:npm_config_fund = "false"
  $env:ELECTRON_CACHE = Join-Path $runtimeRoot "electron-cache"
  New-Item -ItemType Directory -Force -Path $env:ELECTRON_CACHE | Out-Null
}

function Get-ElectronPackageDirs {
  return @(
    (Join-Path $repoRoot "node_modules\electron"),
    (Join-Path $repoRoot "apps\desktop\node_modules\electron")
  )
}

function Test-ElectronInstall {
  $electronDirs = Get-ElectronPackageDirs

  foreach ($electronDir in $electronDirs) {
    $electronExe = Join-Path $electronDir "dist\electron.exe"
    if (Test-Path -LiteralPath $electronExe) {
      return $true
    }
  }

  return $false
}

function Test-ElectronPackagePresent {
  foreach ($electronDir in Get-ElectronPackageDirs) {
    if (Test-Path -LiteralPath (Join-Path $electronDir "install.js")) {
      return $true
    }
  }

  return $false
}

function Remove-BrokenElectronInstall {
  $paths = @(
    (Join-Path $repoRoot "node_modules\.bin\electron"),
    (Join-Path $repoRoot "node_modules\.bin\electron.cmd"),
    (Join-Path $repoRoot "node_modules\.bin\electron.ps1")
  )

  foreach ($path in $paths) {
    if (Test-Path -LiteralPath $path) {
      Remove-Item -LiteralPath $path -Recurse -Force
    }
  }
}

function Install-AppDependencies {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Reason
  )

  Clear-NpmInstallBlockers
  Write-Host $Reason -ForegroundColor Yellow
  & $npm install --ignore-scripts=false --foreground-scripts --package-lock=false --audit=false --fund=false
  if ($LASTEXITCODE -ne 0) {
    Write-Host "Dependency install failed." -ForegroundColor Red
    exit $LASTEXITCODE
  }
  Write-Host ""
}

function Repair-ElectronInstall {
  Clear-NpmInstallBlockers
  Remove-BrokenElectronInstall

  Write-Host "Running npm rebuild for Electron..." -ForegroundColor Yellow
  & $npm rebuild electron --ignore-scripts=false --foreground-scripts
  if ($LASTEXITCODE -ne 0 -or -not (Test-ElectronPackagePresent)) {
    Write-Host "Electron rebuild did not restore the package; retrying npm install..." -ForegroundColor Yellow
    & $npm install --ignore-scripts=false --foreground-scripts --package-lock=false --audit=false --fund=false
    if ($LASTEXITCODE -ne 0) {
      Write-Host "Dependency install failed." -ForegroundColor Red
      exit $LASTEXITCODE
    }
  }

  if (Test-ElectronInstall) {
    return
  }

  foreach ($electronDir in Get-ElectronPackageDirs) {
    $installer = Join-Path $electronDir "install.js"
    if (Test-Path -LiteralPath $installer) {
      Write-Host "Running Electron binary installer directly..." -ForegroundColor Yellow
      & $node $installer
      if ($LASTEXITCODE -ne 0) {
        Write-Host "Electron binary installer failed." -ForegroundColor Red
        exit $LASTEXITCODE
      }
    }
  }
}

function Start-BrowserPreview {
  Write-Host "Starting browser preview mode instead." -ForegroundColor Yellow
  Write-Host "This runs the same React/Three.js UI in your browser without Electron file dialogs."
  Write-Host "Leave this window open while the preview is running."
  Write-Host ""
  & $npm run web
  exit $LASTEXITCODE
}

Write-Host ""
Write-Host "WaveGen3D Launcher" -ForegroundColor Cyan
Write-Host "Project: $repoRoot"
Write-Host ""

$systemNode = Find-Command @("node.exe", "node")
$systemNpm = Find-Command @("npm.cmd", "npm.exe", "npm")
$systemNodeMajor = if ($systemNode) { Get-NodeMajor -NodePath $systemNode } else { $null }
$portable = Get-PortableNodeBin

if ($systemNode -and $systemNpm -and $systemNodeMajor -eq $preferredNodeMajor) {
  $node = $systemNode
  $npm = $systemNpm
} elseif ($portable) {
  $node = $portable.Node
  $npm = $portable.Npm
  $env:Path = "$($portable.Bin);$env:Path"
} else {
  try {
    $portable = Install-PortableNode
    $node = $portable.Node
    $npm = $portable.Npm
    $env:Path = "$($portable.Bin);$env:Path"
  } catch {
    if ($systemNode -and $systemNpm) {
      Write-Host "Portable Node.js $preferredNodeMajor setup failed; falling back to system Node." -ForegroundColor Yellow
      Write-Host $_.Exception.Message
      $node = $systemNode
      $npm = $systemNpm
    } else {
      Write-Host ""
      Write-Host "Automatic Node.js setup failed." -ForegroundColor Red
      Write-Host $_.Exception.Message
      Write-Host ""
      Write-Host "Install Node.js $preferredNodeMajor LTS from https://nodejs.org, then run Launch-WaveGen3D.bat again."
      exit 1
    }
  }
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
    Write-Host "Install Node.js $preferredNodeMajor LTS from https://nodejs.org, then run Launch-WaveGen3D.bat again."
    exit 1
  }
}

$nodeVersion = (& $node --version).Trim()
$npmVersion = (& $npm --version).Trim()
Write-Host "Node: $nodeVersion"
Write-Host "npm:  $npmVersion"
Write-Host ""

if (-not (Test-Path -LiteralPath (Join-Path $repoRoot "node_modules"))) {
  Install-AppDependencies -Reason "Installing app dependencies. This can take a few minutes the first time..."
}

if (-not (Test-ElectronInstall)) {
  Write-Host "Electron is installed incompletely or its executable is missing." -ForegroundColor Yellow
  Write-Host "Repairing Electron dependency..."
  Repair-ElectronInstall
}

if (-not (Test-ElectronInstall)) {
  Write-Host "Electron still did not install correctly." -ForegroundColor Red
  Write-Host "This usually means the Electron binary download was blocked or skipped."
  Write-Host "The most stable app path is the portable packaged app artifact from GitHub Actions."
  Start-BrowserPreview
}

Write-Host "Starting WaveGen3D desktop app..." -ForegroundColor Green
Write-Host "Leave this window open while the app is running."
Write-Host ""

& $npm run dev
exit $LASTEXITCODE
