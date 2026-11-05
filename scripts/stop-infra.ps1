$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root
docker compose --env-file .env -f infra/compose.yml down
if ($LASTEXITCODE -ne 0) { throw 'Docker compose shutdown failed.' }
Write-Host 'Local infrastructure stopped. Volumes retained.'
