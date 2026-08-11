$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$siteRoot = Split-Path -Parent $projectRoot
$publishDirectory = Join-Path $siteRoot 'live'

Push-Location $projectRoot
try {
  $env:VITE_BASE_PATH = '/live/'
  $env:VITE_ROUTER = 'hash'
  npm.cmd run build

  if (Test-Path $publishDirectory) {
    Remove-Item -LiteralPath $publishDirectory -Recurse -Force
  }
  New-Item -ItemType Directory -Force $publishDirectory | Out-Null
  Copy-Item -Path (Join-Path $projectRoot 'dist\*') -Destination $publishDirectory -Recurse -Force
  New-Item -ItemType File -Path (Join-Path $publishDirectory '.nojekyll') -Force | Out-Null
  Write-Output "MR FIESTA LIVE listo en $publishDirectory"
} finally {
  Pop-Location
}
