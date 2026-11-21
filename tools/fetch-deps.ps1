<#
.SYNOPSIS
  Downloads the pinned third-party components listed in tools/components.json:
    - the-database libmpv fork (carries vf_animejanai)  -> deps/thedatabase-mpv/x86_64
    - discord-rpc static lib                              -> deps/discord-rpc
    - AnimeJaNai runtime (models, libaji, scripts)        -> deps/animejanai-runtime
  Also generates an MSVC import library (mpv.lib) for the libmpv DLL, and builds a
  patched discord-rpc. Needs Visual Studio (C++ + CMake tools), git and 7-Zip.
  Safe to re-run: finished steps are skipped unless -Force is given.
#>
param([switch]$Force)
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

. (Join-Path $PSScriptRoot 'common.ps1')
$Comp  = Get-Content (Join-Path $PSScriptRoot 'components.json') -Raw | ConvertFrom-Json
$SevenZip = Find-SevenZip

function Get-Asset($repo, $tag, $asset, $sha256) {
    Get-Download "https://github.com/$repo/releases/download/$tag/$asset" $asset $sha256 -Force:$Force
}

# ---------------------------------------------------------------- libmpv fork
$mpvDir = Join-Path $Deps 'thedatabase-mpv\x86_64'
$stamp  = Join-Path $mpvDir '.tag'
if ($Force -or -not (Test-Path $stamp) -or (Get-Content $stamp) -ne $Comp.libmpv.tag) {
    $c = $Comp.libmpv
    $archive = Get-Asset $c.repo $c.tag $c.asset $c.sha256
    if (Test-Path $mpvDir) { Remove-Item -Recurse -Force $mpvDir }
    & $SevenZip x -y "-o$mpvDir" $archive | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'extracting libmpv failed' }

    # MSVC import library from the DLL's export table.
    $dll = Join-Path $mpvDir 'libmpv-2.dll'
    $exports = Join-Path $mpvDir 'exports.txt'
    Invoke-VcVars "dumpbin /nologo /exports `"$dll`" > `"$exports`""
    $names = Get-Content $exports | ForEach-Object {
        if ($_ -match '^\s+\d+\s+[0-9A-Fa-f]+\s+[0-9A-Fa-f]+\s+(\S+)') { $Matches[1] }
    }
    if (-not ($names -contains 'mpv_create')) { throw 'libmpv export table looks wrong (no mpv_create)' }
    $def = Join-Path $mpvDir 'mpv.def'
    (@('LIBRARY libmpv-2', 'EXPORTS') + $names) | Set-Content -Encoding ascii $def
    Invoke-VcVars "lib /nologo /def:`"$def`" /machine:x64 /out:`"$mpvDir\mpv.lib`""
    Remove-Item $exports
    Set-Content $stamp $c.tag
    Write-Host "libmpv fork ready: $mpvDir ($($names.Count) exports)"
} else { Write-Host 'libmpv fork: up to date' }

# Standalone mpv.exe from the same release, for Kai's thumbfast seek previews
# (script-opts/thumbfast.conf: mpv_path=portable_config/mpv/mpv.exe).
$playerDir = Join-Path $Deps 'thedatabase-mpv\player'
if ($Force -or -not (Test-Path (Join-Path $playerDir 'mpv.exe')) -or (Get-Content (Join-Path $playerDir '.tag') -ErrorAction SilentlyContinue) -ne $Comp.libmpv.tag) {
    $c = $Comp.libmpv
    $archive = Get-Asset $c.repo $c.tag $c.playerAsset $c.playerSha256
    if (Test-Path $playerDir) { Remove-Item -Recurse -Force $playerDir }
    & $SevenZip e -y "-o$playerDir" $archive 'mpv.exe' | Out-Null
    if ($LASTEXITCODE -ne 0 -or -not (Test-Path (Join-Path $playerDir 'mpv.exe'))) { throw 'extracting mpv.exe failed' }
    Set-Content (Join-Path $playerDir '.tag') $c.tag
    Write-Host "mpv.exe ready: $playerDir"
} else { Write-Host 'mpv.exe: up to date' }

# ---------------------------------------------------------------- discord-rpc
$discordDir = Join-Path $Deps 'discord-rpc'
if ($Force -or -not (Test-Path (Join-Path $discordDir 'win64-static\lib\discord-rpc.lib'))) {
    $c = $Comp.discordRpc
    # Community's discord.cpp needs activity "type" and buttons, which upstream
    # discord-rpc 3.4.0 lacks: build it from source with our patch.
    $src = Join-Path $Cache 'discord-rpc-src'
    if (Test-Path $src) { Remove-Item -Recurse -Force $src }
    git clone -q --depth 1 -b $c.tag "https://github.com/$($c.repo).git" $src
    if ($LASTEXITCODE -ne 0) { throw 'cloning discord-rpc failed' }
    git -C $src apply (Join-Path $PSScriptRoot 'patches\discord-rpc-3.4.0-type-buttons.patch')
    if ($LASTEXITCODE -ne 0) { throw 'patching discord-rpc failed' }
    if (Test-Path $discordDir) { Remove-Item -Recurse -Force $discordDir }
    $out = Join-Path $discordDir 'win64-static'
    Add-CMakeToPath
    Invoke-VcVars ("cmake -S `"$src`" -B `"$src\build`" -G Ninja -DCMAKE_BUILD_TYPE=Release -DCMAKE_C_COMPILER=cl -DCMAKE_CXX_COMPILER=cl " +
                   "-DBUILD_EXAMPLES=OFF -DUSE_STATIC_CRT=ON -DCMAKE_POLICY_VERSION_MINIMUM=3.5 -DCMAKE_INSTALL_PREFIX=`"$out`" " +
                   "&& cmake --build `"$src\build`" && cmake --install `"$src\build`"")
    Write-Host "discord-rpc ready: $out"
} else { Write-Host 'discord-rpc: up to date' }

# ---------------------------------------------------------------- AnimeJaNai runtime
# Takes only what StremioZ needs from the full package: libaji + DirectML/ORT, the
# models, aji-runtime (installs TensorRT into a per-copy store at first setup), the
# Manager (Ctrl+E settings editor) and the mpv-side config/scripts. mpvnet, mpv.exe,
# yt-dlp, the benchmark and the AnimeJaNai self-updater are left out.
$ajnDir = Join-Path $Deps 'animejanai-runtime'
$ajnStamp = Join-Path $ajnDir '.tag'
if ($Force -or -not (Test-Path $ajnStamp) -or (Get-Content $ajnStamp) -ne $Comp.animejanai.tag) {
    $c = $Comp.animejanai
    $archive = Get-Asset $c.repo $c.tag $c.fullPackage $c.sha256
    $tmp = Join-Path $Cache 'animejanai-x'
    if (Test-Path $tmp) { Remove-Item -Recurse -Force $tmp }
    & $SevenZip x -y "-o$tmp" $archive | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'extracting AnimeJaNai failed' }
    $src = Get-ChildItem $tmp -Directory | Select-Object -First 1
    if (Test-Path $ajnDir) { Remove-Item -Recurse -Force $ajnDir }
    New-Item -ItemType Directory -Force $ajnDir | Out-Null
    $keep = @(
        'animejanai\inference', 'animejanai\onnx', 'animejanai\animejanai.conf',
        'aji-runtime.exe', '7za.exe', 'manifest.json', 'version.txt', 'License.txt',
        'AnimeJaNaiManager.exe', 'av_libglesv2.dll', 'libHarfBuzzSharp.dll', 'libSkiaSharp.dll',
        'licenses',
        'portable_config\mpv-animejanai.conf', 'portable_config\input-animejanai.conf',
        'portable_config\scripts', 'portable_config\shaders'
    )
    foreach ($k in $keep) {
        $from = Join-Path $src.FullName $k
        if (-not (Test-Path $from)) { Write-Warning "AnimeJaNai package has no $k"; continue }
        $to = Join-Path $ajnDir $k
        New-Item -ItemType Directory -Force (Split-Path $to) | Out-Null
        Copy-Item -Recurse -Force $from $to
    }
    # AnimeJaNai's own updater targets an mpvnet install; StremioZ updates it as a whole.
    Remove-Item -Force -ErrorAction SilentlyContinue (Join-Path $ajnDir 'portable_config\scripts\animejanai_update.lua')
    Remove-Item -Recurse -Force $tmp
    Set-Content $ajnStamp $c.tag
    Write-Host "AnimeJaNai runtime ready: $ajnDir"
} else { Write-Host 'AnimeJaNai runtime: up to date' }

# ---------------------------------------------------------------- patched aji_trt
# TensorRT on D3D11 frames (tools/build-libaji.ps1; downloads ~2.2 GB of SDKs once).
& (Join-Path $PSScriptRoot 'build-libaji.ps1') -Force:$Force

# ---------------------------------------------------------------- Stremio web UI
# Built from source (pinned commit); without Node.js StremioZ falls back to the
# hosted copy at runtime.
if (Get-Command npx -ErrorAction SilentlyContinue) {
    & (Join-Path $PSScriptRoot 'build-webui.ps1') -Force:$Force
} else {
    Write-Warning 'Node.js not found: skipping the local web UI build (StremioZ will load the hosted web UI).'
}
