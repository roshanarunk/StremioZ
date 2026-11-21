<#
.SYNOPSIS
  Builds stremio.exe and assembles a runnable portable StremioZ folder (dist\StremioZ).

.DESCRIPTION
  Layout (paths in mpv-animejanai.conf are relative to portable_config, "~~/.."):
    stremio.exe, libmpv-2.dll (the-database fork), ajn-mvtools.dll
    server.js, stremio-runtime.exe, ffmpeg DLLs        (Stremio streaming server)
    animejanai\                                        (libaji, ONNX models, animejanai.conf)
    aji-runtime.exe, AnimeJaNaiManager.exe (+ its DLLs)
    portable_config\                                   (Community defaults + AnimeJaNai + overlay\)

  The folder is updated in place, so TensorRT engines built next to the ONNX models
  and the user's settings survive a re-assemble. Use -Clean to start over.

.PARAMETER SetupTensorRT
  Installs the TensorRT runtime + this GPU's builder pack into the shared per-user
  aji store (%LOCALAPPDATA%\the-database\aji) via aji-runtime (~0.7 GB download once).
#>
param(
    [string]$Out = '',
    [switch]$SkipBuild,
    [switch]$Clean,
    [switch]$SetupTensorRT,
    [string]$Vcpkg = $(if ($env:VCPKG_ROOT) { $env:VCPKG_ROOT } else { "$env:USERPROFILE\vcpkg" })
)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'common.ps1')
if (-not $Out) { $Out = Join-Path $Root 'dist\StremioZ' }
$Build = Join-Path $Root 'build-release'

# ------------------------------------------------------------------ build
if (-not $SkipBuild) {
    if (-not (Test-Path (Join-Path $Deps 'thedatabase-mpv\x86_64\mpv.lib'))) {
        & (Join-Path $PSScriptRoot 'fetch-deps.ps1')
    }
    Add-CMakeToPath
    $toolchain = Join-Path $Vcpkg 'scripts\buildsystems\vcpkg.cmake'
    if (-not (Test-Path $toolchain)) { throw "vcpkg not found at $Vcpkg (pass -Vcpkg or set VCPKG_ROOT)" }
    Invoke-VcVars ("cmake -S `"$Root`" -B `"$Build`" -G Ninja -DCMAKE_BUILD_TYPE=Release " +
                   "-DCMAKE_C_COMPILER=cl -DCMAKE_CXX_COMPILER=cl " +
                   "-DCMAKE_TOOLCHAIN_FILE=`"$toolchain`" -DVCPKG_TARGET_TRIPLET=x64-windows-static " +
                   "&& cmake --build `"$Build`"")
}
$exe = Join-Path $Build 'stremio.exe'
if (-not (Test-Path $exe)) { throw "stremio.exe not built ($exe)" }

# ------------------------------------------------------------------ server.js
$comp = Get-Content (Join-Path $PSScriptRoot 'components.json') -Raw | ConvertFrom-Json
$srv = $comp.streamingServer
$serverJs = Get-Download $srv.url "server-$($srv.version).js" $srv.sha256

# ------------------------------------------------------------------ stage
if ($Clean -and (Test-Path $Out)) { Remove-Item -Recurse -Force $Out }
New-Item -ItemType Directory -Force $Out | Out-Null
$cfg = Join-Path $Out 'portable_config'

function Copy-Tree($from, $to) {
    # robocopy: copy everything, never delete extras (keeps engines/settings).
    robocopy $from $to /E /NFL /NDL /NJH /NJS /NP /R:1 /W:1 | Out-Null
    if ($LASTEXITCODE -ge 8) { throw "robocopy $from -> $to failed ($LASTEXITCODE)" }
    $global:LASTEXITCODE = 0
}
function Copy-IfMissing($from, $to) {
    if (-not (Test-Path $to)) { New-Item -ItemType Directory -Force (Split-Path $to) | Out-Null; Copy-Item $from $to }
}

Write-Host "Assembling $Out"
Copy-Item -Force $exe, (Join-Path $Build 'libmpv-2.dll'), (Join-Path $Build 'ajn-mvtools.dll') $Out
Copy-Item -Force $serverJs (Join-Path $Out 'server.js')
Copy-Item -Force (Join-Path $Root 'utils\windows\stremio-runtime.exe') $Out
Get-ChildItem (Join-Path $Root 'utils\windows\ffmpeg') -File | Copy-Item -Force -Destination $Out

# Files earlier StremioZ builds or upstream configs placed that must not linger
# (Copy-Tree never deletes): Community's skip-intro (Kai's notify_skip replaces
# it) and Kai's SVP pieces.
foreach ($stale in 'scripts\skip-intro.lua', 'scripts\svp_cleanup.lua', 'scripts\reactive_vf_bypass.lua',
                   'script-opts\svp.conf', 'svp_anime.vpy', 'svp_cinema.vpy',
                   'webmods\UI\update-notification.js', 'webmods\UI\update-notification.css',
                   'webmods\UI\donation-manager.js') {
    Remove-Item -Force -ErrorAction SilentlyContinue (Join-Path $cfg $stale)
}
# Phase 3's DirectML copy of animejanai.conf (no longer used).
Remove-Item -Force -ErrorAction SilentlyContinue (Join-Path $Out 'animejanai/animejanai-stremioz-directml.conf')

# Pinned Stremio web UI (tools/build-webui.ps1). Mirrored, so an old build's
# asset folder does not linger.
$webui = Join-Path $Deps 'webui'
if (Test-Path (Join-Path $webui 'index.html')) {
    robocopy $webui (Join-Path $Out 'webui') /MIR /XF .commit /NFL /NDL /NJH /NJS /NP /R:1 /W:1 | Out-Null
    if ($LASTEXITCODE -ge 8) { throw "robocopy webui failed ($LASTEXITCODE)" }
    $global:LASTEXITCODE = 0
} else { Write-Warning 'local web UI missing (run tools/build-webui.ps1); the hosted one will be used' }

# Stremio Kai: UI webmods, scripts, script-opts, shaders, fonts (vendored).
Copy-Tree (Join-Path $Root 'vendor\kai\portable_config') $cfg
$player = Join-Path $Deps 'thedatabase-mpv\player\mpv.exe'
if (Test-Path $player) {
    New-Item -ItemType Directory -Force (Join-Path $cfg 'mpv') | Out-Null
    Copy-Item -Force $player (Join-Path $cfg 'mpv\mpv.exe')
} else { Write-Warning 'mpv.exe for thumbfast missing: run tools\fetch-deps.ps1' }

# AnimeJaNai runtime. animejanai.conf is user state: only seeded once.
$ajn = Join-Path $Deps 'animejanai-runtime'
if (-not (Test-Path $ajn)) { throw 'AnimeJaNai runtime missing: run tools\fetch-deps.ps1' }
Get-ChildItem $ajn -File | Where-Object Name -notlike '.*' | Copy-Item -Force -Destination $Out
Copy-Tree (Join-Path $ajn 'licenses') (Join-Path $Out 'licenses')
Copy-Tree (Join-Path $ajn 'animejanai\inference') (Join-Path $Out 'animejanai\inference')
# StremioZ's aji_trt.dll (TensorRT on D3D11 frames, tools/build-libaji.ps1) over the package's.
$patchedTrt = Join-Path $Deps 'libaji\aji_trt.dll'
if (Test-Path $patchedTrt) {
    Copy-Item -Force $patchedTrt (Join-Path $Out 'animejanai\inference\aji_trt.dll')
} else { Write-Warning 'patched aji_trt.dll missing (tools/build-libaji.ps1): TensorRT will not take D3D11 frames' }
Copy-Tree (Join-Path $ajn 'animejanai\onnx') (Join-Path $Out 'animejanai\onnx')
Copy-IfMissing (Join-Path $ajn 'animejanai\animejanai.conf') (Join-Path $Out 'animejanai\animejanai.conf')
Copy-Tree (Join-Path $ajn 'portable_config') $cfg

# StremioZ overlay last: it owns mpv.conf / input.conf. stremio-settings.ini
# is user state (the app writes it), so it is only seeded.
$overlay = Join-Path $Root 'overlay\portable_config'
robocopy $overlay $cfg /E /XF stremio-settings.ini /NFL /NDL /NJH /NJS /NP /R:1 /W:1 | Out-Null
if ($LASTEXITCODE -ge 8) { throw "robocopy overlay failed ($LASTEXITCODE)" }
$global:LASTEXITCODE = 0
Copy-IfMissing (Join-Path $overlay 'stremio-settings.ini') (Join-Path $cfg 'stremio-settings.ini')

# ------------------------------------------------------------------ TensorRT
if ($SetupTensorRT) {
    $man = Get-Content (Join-Path $ajn 'manifest.json') -Raw | ConvertFrom-Json
    $inf = Join-Path $Out 'animejanai\inference'
    & (Join-Path $Out 'aji-runtime.exe') ensure --app-id stremioz --per-copy --app-path (Join-Path $Out 'stremio.exe') `
        --app-version (Get-Content (Join-Path $ajn 'version.txt')).Trim() `
        --index $man.runtime.index_url --index-sha256 $man.runtime.index_sha256 `
        --want trt --gpus auto --aji-dir $inf --adopt-from $inf --progress lines
    if ($LASTEXITCODE -ne 0) { throw "aji-runtime ensure failed ($LASTEXITCODE)" }
}

Write-Host "Done: $Out\stremio.exe"
