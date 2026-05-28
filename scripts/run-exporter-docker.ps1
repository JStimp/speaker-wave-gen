param(
  [Parameter(Mandatory = $true)]
  [string]$Config,

  [Parameter(Mandatory = $true)]
  [string]$Out,

  [string]$Image = "speaker-wave-exporter"
)

$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$configPath = (Resolve-Path $Config).Path
$outPath = if (Test-Path $Out) { (Resolve-Path $Out).Path } else { New-Item -ItemType Directory -Path $Out | Select-Object -ExpandProperty FullName }

docker image inspect $Image *> $null
if ($LASTEXITCODE -ne 0) {
  docker build -f (Join-Path $repoRoot "exporter/Dockerfile") -t $Image $repoRoot
}

$configDir = Split-Path -Parent $configPath
$configName = Split-Path -Leaf $configPath

docker run --rm `
  -v "${configDir}:/config" `
  -v "${outPath}:/out" `
  $Image `
  --config "/config/$configName" `
  --out "/out" `
  --format all `
  --panel-mode separated

