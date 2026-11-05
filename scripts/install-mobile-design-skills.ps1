# Optional third-party agent skills installer. Read design/MOBILE-AGENT-REPOS.md first.
# Requires network access; review third-party source and licenses prior to running.
# This does NOT install a TRISSEA app or modify backend dispatch rules.
param([switch]$IncludeCommunitySkills)

$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Push-Location $repoRoot
try {
    if (-not (Get-Command npx -ErrorAction SilentlyContinue)) {
        throw 'npx is required. Install a supported Node.js version and try again.'
    }
    Write-Host 'Installing official Expo agent design skills in the current project...' -ForegroundColor Cyan
    & npx skills@latest add expo/skills --skill expo-design-system --skill expo-native-ui --skill expo-router
    if ($LASTEXITCODE -ne 0) { throw 'Expo skills install failed.' }

    if ($IncludeCommunitySkills) {
        Write-Host 'Installing reviewed community design/performance skills...' -ForegroundColor Cyan
        & npx skills@latest add RubenGlez/mobile-design
        if ($LASTEXITCODE -ne 0) { throw 'Mobile Design skills install failed.' }
        & npx skills@latest add vercel-labs/agent-skills --skill react-native-guidelines
        if ($LASTEXITCODE -ne 0) { throw 'React Native guidelines install failed.' }
    }
    Write-Host 'Completed external skill installation. TRISSEA local design rules take precedence.' -ForegroundColor Green
} finally {
    Pop-Location
}
