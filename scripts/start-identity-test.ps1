$ErrorActionPreference = 'Stop'
$workspace = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Push-Location $workspace
try {
  if ($IsLinux) { & pnpm dev:infra:up } else { & pnpm.cmd dev:infra:up }
  if ($LASTEXITCODE -ne 0) { throw 'Canonical development infrastructure command failed' }
} finally { Pop-Location }
