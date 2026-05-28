param(
  [Parameter(Mandatory = $true)]
  [string]$Config,

  [Parameter(Mandatory = $true)]
  [string]$Out
)

$ErrorActionPreference = "Stop"

if (Get-Command docker -ErrorAction SilentlyContinue) {
  & (Join-Path $PSScriptRoot "run-exporter-docker.ps1") -Config $Config -Out $Out
  exit $LASTEXITCODE
}

if (-not (Get-Command wsl -ErrorAction SilentlyContinue)) {
  throw "Neither Docker nor WSL is available. Install Docker Desktop or run the exporter in a Linux environment."
}

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$configPath = (Resolve-Path $Config).Path
$outPath = if (Test-Path $Out) { (Resolve-Path $Out).Path } else { New-Item -ItemType Directory -Path $Out | Select-Object -ExpandProperty FullName }

$linuxRepo = (wsl wslpath -a "$repoRoot").Trim()
$linuxConfig = (wsl wslpath -a "$configPath").Trim()
$linuxOut = (wsl wslpath -a "$outPath").Trim()

wsl bash -lc "cd '$linuxRepo' && PYTHONPATH='$linuxRepo/exporter' python3 -m wavecad_exporter --config '$linuxConfig' --out '$linuxOut' --format all --panel-mode separated"

