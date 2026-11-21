<#
.SYNOPSIS
  Builds StremioZ's aji_trt.dll: libaji (the-database/animejanai-inference) at the
  pinned tag plus tools/patches/libaji-*-d3d11-bridge.patch, which lets the
  TensorRT backend take D3D11 frames (so AnimeJaNai on TensorRT can feed mpv's
  d3d11vpp: NVIDIA RTX Video HDR / Super Resolution). Output: deps\libaji\aji_trt.dll,
  which assemble.ps1 puts over the AnimeJaNai package's copy.

  Needs Visual Studio (C++ + CMake tools), git, and the CUDA 13.4 / TensorRT 11.4
  SDKs from tools\fetch-libaji-sdk.ps1 (run automatically if missing).
  The release architecture list takes ~10-20 minutes; -DevArch 120 builds only
  the given one (fast, for local testing).
#>
param([switch]$Force, [string]$DevArch = '')
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'common.ps1')
$c = (Get-Content (Join-Path $PSScriptRoot 'components.json') -Raw | ConvertFrom-Json).libaji
$patch = Join-Path $PSScriptRoot $c.patch
$AjiWin = if ($env:AJI_WIN) { $env:AJI_WIN } else { "$env:USERPROFILE\aji-win" }
$out = Join-Path $Deps 'libaji'
$stampFile = Join-Path $out '.stamp'
$stamp = "$($c.tag) $((Get-FileHash $patch -Algorithm SHA256).Hash) $(if ($DevArch) { "dev$DevArch" } else { 'release' })"
if (-not $Force -and (Test-Path $stampFile) -and (Get-Content $stampFile) -eq $stamp) {
    Write-Host 'aji_trt (patched): up to date'
    return
}

if (-not (Test-Path "$AjiWin\cuda134\bin\nvcc.exe") -or -not (Test-Path "$AjiWin\trt114\include\NvInferVersion.h")) {
    & (Join-Path $PSScriptRoot 'fetch-libaji-sdk.ps1') -AjiWin $AjiWin
}

$src = Join-Path $Cache 'libaji-build-src'
if (Test-Path $src) { Remove-Item -Recurse -Force $src }
git clone -q --depth 1 -b $c.tag "https://github.com/$($c.repo).git" $src
if ($LASTEXITCODE -ne 0) { throw 'cloning libaji failed' }
git -C $src apply $patch
if ($LASTEXITCODE -ne 0) { throw 'applying the D3D11 bridge patch failed' }

$aw = $AjiWin -replace '\\', '/'
$archs = if ($DevArch) { "$DevArch-real" } else { '75-real;80-real;86-real;89-real;90-real;100-real;120-real;120-virtual' }
$bld = Join-Path $src 'build-win'
Add-CMakeToPath
$env:PATH = "$AjiWin\cuda134\bin;$env:PATH"
Invoke-VcVars ("cmake -S `"$src`" -B `"$bld`" -G Ninja -DCMAKE_BUILD_TYPE=Release -DCMAKE_C_COMPILER=cl -DCMAKE_CXX_COMPILER=cl " +
               "`"-DCMAKE_CUDA_ARCHITECTURES=$archs`" `"-DCMAKE_CUDA_COMPILER=$aw/cuda134/bin/nvcc.exe`" `"-DCUDAToolkit_ROOT=$aw/cuda134`" " +
               "`"-DAJI_TRT_ROOT=$aw/trt114`" `"-DAJI_TRT_LIB=$aw/trt114`" -DAJI_NVINFER=nvinfer_11 -DAJI_BUILD_ANALYSIS=OFF " +
               "&& cmake --build `"$bld`" --target aji_trt")
New-Item -ItemType Directory -Force $out | Out-Null
Copy-Item -Force (Join-Path $bld 'aji_trt.dll') $out
Set-Content $stampFile $stamp
Write-Host "aji_trt (patched) ready: $out\aji_trt.dll"
