<#
.SYNOPSIS
  Fetches the SDKs needed to build libaji's TensorRT backend (StremioZ's patched
  aji_trt.dll, see tools/build-libaji.ps1) into the layout libaji's
  docs/BUILD-WINDOWS.md describes:

    %AJI_WIN%\cuda134   CUDA 13.4 from NVIDIA's redistributable archives
                        (nvcc, crt, nvvm, cudart, cccl; SHA-256 from NVIDIA's manifest)
    %AJI_WIN%\trt114    TensorRT 11.4.0.106 (public "-external" zip, flat layout)

  AJI_WIN defaults to %USERPROFILE%\aji-win. Downloads are cached; re-runs skip
  finished steps. About 2.2 GB to download.
#>
param([string]$AjiWin = $(if ($env:AJI_WIN) { $env:AJI_WIN } else { "$env:USERPROFILE\aji-win" }))
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
. (Join-Path $PSScriptRoot 'common.ps1')
$z = Find-SevenZip
$dl = Join-Path $AjiWin 'downloads'
New-Item -ItemType Directory -Force $dl | Out-Null

function Get-Verified($url, $sha) {
    $dest = Join-Path $dl ([IO.Path]::GetFileName(([Uri]$url).AbsolutePath))
    if (-not (Test-Path $dest) -or (Get-FileHash $dest -Algorithm SHA256).Hash.ToLower() -ne $sha.ToLower()) {
        Write-Host "Downloading $url"
        curl.exe -sSL --fail -o "$dest.part" $url
        if ($LASTEXITCODE -ne 0) { throw "download failed: $url" }
        $got = (Get-FileHash "$dest.part" -Algorithm SHA256).Hash.ToLower()
        if ($got -ne $sha.ToLower()) { Remove-Item "$dest.part"; throw "SHA-256 mismatch for $url (got $got)" }
        Move-Item -Force "$dest.part" $dest
    }
    return $dest
}

# ---------------------------------------------------------------- CUDA 13.4
$cuda = Join-Path $AjiWin 'cuda134'
if (-not (Test-Path (Join-Path $cuda 'bin\nvcc.exe'))) {
    $base = 'https://developer.download.nvidia.com/compute/cuda/redist/'
    $manifest = (curl.exe -sSL --fail "${base}redistrib_13.4.1.json") | ConvertFrom-Json
    $tmp = Join-Path $dl 'cuda-x'
    if (Test-Path $tmp) { Remove-Item -Recurse -Force $tmp }
    foreach ($pkg in 'cuda_nvcc', 'cuda_crt', 'libnvvm', 'cuda_cudart', 'cccl') {
        $w = $manifest.$pkg.'windows-x86_64'
        if (-not $w) { throw "manifest has no windows-x86_64 entry for $pkg" }
        $file = Get-Verified ($base + $w.relative_path) $w.sha256
        & $z x -y "-o$tmp\$pkg" $file | Out-Null
        if ($LASTEXITCODE -ne 0) { throw "extracting $pkg failed" }
        # each archive has one top folder holding bin/include/lib/nvvm: merge them
        $top = Get-ChildItem "$tmp\$pkg" -Directory | Select-Object -First 1
        robocopy $top.FullName $cuda /E /NFL /NDL /NJH /NJS /NP | Out-Null
        if ($LASTEXITCODE -ge 8) { throw "merging $pkg failed" }
    }
    Remove-Item -Recurse -Force $tmp
    & (Join-Path $cuda 'bin\nvcc.exe') --version | Select-Object -Last 2
} else { Write-Host 'CUDA 13.4: present' }

# ---------------------------------------------------------------- TensorRT 11.4
$deps = Get-Content (Join-Path $Root '_ref\libaji\ci\windows\dependencies.json') -Raw -ErrorAction SilentlyContinue | ConvertFrom-Json
$trtUrl = if ($deps) { $deps.tensorRTUrl } else { 'https://developer.nvidia.com/downloads/compute/machine-learning/tensorrt/11.4.0/zip/TensorRT-Enterprise-11.4.0.106-Windows-amd64-cuda-13.4-Release-external.zip' }
$trtSha = if ($deps) { $deps.tensorRTSha256 } else { 'b6fd86301ad803492adf7a06de29ce45e3968d29637a1437d0fb0994f412c980' }
$trt = Join-Path $AjiWin 'trt114'
if (-not (Test-Path (Join-Path $trt 'include\NvInferVersion.h'))) {
    $zip = Get-Verified $trtUrl $trtSha
    $tmp = Join-Path $dl 'trt-x'
    if (Test-Path $tmp) { Remove-Item -Recurse -Force $tmp }
    & $z x -y "-o$tmp" $zip | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'extracting TensorRT failed' }
    $top = Get-ChildItem $tmp -Directory | Select-Object -First 1
    New-Item -ItemType Directory -Force $trt | Out-Null
    robocopy (Join-Path $top.FullName 'include') (Join-Path $trt 'include') /E /NFL /NDL /NJH /NJS /NP | Out-Null
    foreach ($sub in 'lib', 'bin') {
        if (Test-Path (Join-Path $top.FullName $sub)) {
            robocopy (Join-Path $top.FullName $sub) $trt /E /NFL /NDL /NJH /NJS /NP | Out-Null
        }
    }
    Remove-Item -Recurse -Force $tmp
    Select-String -Path (Join-Path $trt 'include\NvInferVersion.h') -Pattern 'define TRT_(MAJOR|MINOR|PATCH|BUILD)_ENTERPRISE'
} else { Write-Host 'TensorRT 11.4: present' }
$global:LASTEXITCODE = 0
