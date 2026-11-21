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

# Community defaults (skip-intro script, Anime4K shaders, app settings)
Copy-Tree (Join-Path $Root 'utils\mpv\anime4k\portable_config\scripts') (Join-Path $cfg 'scripts')
if (-not (Test-Path (Join-Path $cfg 'shaders\Anime4K_Restore_CNN_VL.glsl'))) {
    $z = Find-SevenZip
    & $z e -y "-o$(Join-Path $cfg 'shaders')" (Join-Path $Root 'utils\mpv\anime4k\anime4k-High-end.zip') 'shaders\*.glsl' | Out-Null
}
Copy-IfMissing (Join-Path $Root 'utils\stremio\stremio-settings.ini') (Join-Path $cfg 'stremio-settings.ini')

# AnimeJaNai runtime. animejanai.conf is user state: only seeded once.
$ajn = Join-Path $Deps 'animejanai-runtime'
if (-not (Test-Path $ajn)) { throw 'AnimeJaNai runtime missing: run tools\fetch-deps.ps1' }
Get-ChildItem $ajn -File | Where-Object Name -notlike '.*' | Copy-Item -Force -Destination $Out
Copy-Tree (Join-Path $ajn 'licenses') (Join-Path $Out 'licenses')
Copy-Tree (Join-Path $ajn 'animejanai\inference') (Join-Path $Out 'animejanai\inference')
Copy-Tree (Join-Path $ajn 'animejanai\onnx') (Join-Path $Out 'animejanai\onnx')
Copy-IfMissing (Join-Path $ajn 'animejanai\animejanai.conf') (Join-Path $Out 'animejanai\animejanai.conf')
Copy-Tree (Join-Path $ajn 'portable_config') $cfg

# StremioZ overlay last: it owns mpv.conf / input.conf.
Copy-Tree (Join-Path $Root 'overlay\portable_config') $cfg

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
