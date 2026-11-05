$ErrorActionPreference = 'Stop'
$workspace = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$testEnv = Join-Path $workspace '.env.m2-test'
& node (Join-Path $PSScriptRoot 'prepare-identity-test.mjs')
if ($LASTEXITCODE -ne 0) { throw 'Unable to prepare isolated test credentials' }
& docker compose --env-file $testEnv -f (Join-Path $workspace 'infra/compose.m2-test.yml') up -d --wait
if ($LASTEXITCODE -ne 0) { throw 'Isolated M2 test infrastructure failed to start' }
Write-Output 'Dedicated ephemeral M2 cluster ready on loopback port 15433; credentials remain ignored.'
