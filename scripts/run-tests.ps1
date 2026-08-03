$ErrorActionPreference = 'Stop'

$RootDir = Resolve-Path (Join-Path $PSScriptRoot '..')
Set-Location $RootDir

if (-not (Test-Path -Path (Join-Path $RootDir 'node_modules') -PathType Container)) {
  Write-Host 'node_modules missing; running pnpm install...'
  pnpm install
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

pnpm run ci
exit $LASTEXITCODE
