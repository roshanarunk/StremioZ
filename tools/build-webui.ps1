<#
.SYNOPSIS
  Builds the pinned Stremio web UI (tools/components.json "webui") into deps\webui.

.DESCRIPTION
  Zaarrg's build of Stremio Web (the one stremio.zarg.me serves and Stremio Kai's
  theme targets) is only published on that server, so StremioZ builds it from the
  same commit. Dependencies come from the fork's frozen pnpm lockfile and are
  installed with --ignore-scripts (no package install scripts run; the build does
  not need them). Verified against the hosted build: identical CSS, worker and
  stremio-core wasm; main.js has the same modules with different numeric ids.

  Needs Node.js (npx) and git. Safe to re-run; -Force rebuilds.
#>
param([switch]$Force)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'common.ps1')
$c = (Get-Content (Join-Path $PSScriptRoot 'components.json') -Raw | ConvertFrom-Json).webui

$out = Join-Path $Deps 'webui'
$stamp = Join-Path $out '.commit'
if (-not $Force -and (Test-Path $stamp) -and (Get-Content $stamp) -eq $c.commit) {
    Write-Host 'web UI: up to date'
    return
}
if (-not (Get-Command npx -ErrorAction SilentlyContinue)) { throw 'Node.js (npx) is required to build the web UI.' }

$src = Join-Path $Cache 'webui-src'
if (-not (Test-Path (Join-Path $src '.git'))) {
    git clone -q "https://github.com/$($c.repo).git" $src
    if ($LASTEXITCODE -ne 0) { throw 'cloning the web UI failed' }
}
git -C $src fetch -q origin $c.commit 2>$null
git -C $src checkout -q --force $c.commit
if ($LASTEXITCODE -ne 0) { throw "checking out $($c.commit) failed" }

Push-Location $src
try {
    & npx -y "pnpm@$($c.pnpm)" install --frozen-lockfile --ignore-scripts
    if ($LASTEXITCODE -ne 0) { throw 'pnpm install failed' }
    & npx -y "pnpm@$($c.pnpm)" build
    if ($LASTEXITCODE -ne 0) { throw 'web UI build failed' }
} finally { Pop-Location }

$build = Join-Path $src 'build'
if (-not (Test-Path (Join-Path $build "$($c.commit)\scripts\main.js"))) { throw 'build output missing the pinned asset folder' }
if (Test-Path $out) { Remove-Item -Recurse -Force $out }
Copy-Item -Recurse $build $out
Get-ChildItem $out -Recurse -Filter '*.map' | Remove-Item -Force
Set-Content $stamp $c.commit
Write-Host "web UI ready: $out"
