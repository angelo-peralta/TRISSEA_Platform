$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  throw 'Docker not installed. Install Docker Desktop and start it.'
}
if (-not (Test-Path '.env')) {
  Copy-Item '.env.example' '.env'
  Write-Host 'Created .env. Update POSTGRES_PASSWORD and DATABASE_URL before real use.'
}
docker compose --env-file .env -f infra/compose.yml up -d --wait
if ($LASTEXITCODE -ne 0) { throw 'Docker compose startup failed.' }
Write-Host 'Local PostGIS (127.0.0.1:5432) and Redis (127.0.0.1:6379) requested.'
Write-Host 'Infrastructure health checks passed. Next: pnpm.cmd db:up, then pnpm.cmd db:verify.'
