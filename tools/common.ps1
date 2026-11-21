# Shared helpers for the StremioZ build scripts (dot-source this file).

$script:Root  = Split-Path -Parent $PSScriptRoot
$script:Deps  = Join-Path $script:Root 'deps'
$script:Cache = Join-Path $script:Deps '.download'

function Find-SevenZip {
    $z = @("$env:ProgramFiles\7-Zip\7z.exe", "${env:ProgramFiles(x86)}\7-Zip\7z.exe") |
        Where-Object { Test-Path $_ } | Select-Object -First 1
    if (-not $z) { throw '7-Zip not found (install it from https://www.7-zip.org/).' }
    return $z
}

function Add-CMakeToPath {
    if (Get-Command cmake -ErrorAction SilentlyContinue) { return }
    $vswhere = "${env:ProgramFiles(x86)}\Microsoft Visual Studio\Installer\vswhere.exe"
    foreach ($vs in (& $vswhere -products * -property installationPath)) {
        $cm = Join-Path $vs 'Common7\IDE\CommonExtensions\Microsoft\CMake'
        if (Test-Path "$cm\CMake\bin\cmake.exe") { $env:PATH = "$cm\CMake\bin;$cm\Ninja;$env:PATH"; return }
    }
    throw 'CMake not found (install the "C++ CMake tools" Visual Studio component, or CMake).'
}

# Runs a cmd.exe command line inside the x64 MSVC developer environment.
function Invoke-VcVars([string]$cmd) {
    $vswhere = "${env:ProgramFiles(x86)}\Microsoft Visual Studio\Installer\vswhere.exe"
    $vs = & $vswhere -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
    if (-not $vs) { throw 'Visual Studio with C++ tools not found.' }
    & cmd.exe /c "`"$vs\VC\Auxiliary\Build\vcvars64.bat`" >nul 2>&1 && $cmd"
    if ($LASTEXITCODE -ne 0) { throw "Command failed: $cmd" }
}

function Get-Download([string]$url, [string]$name, [string]$sha256, [switch]$Force) {
    New-Item -ItemType Directory -Force $script:Cache | Out-Null
    $dest = Join-Path $script:Cache $name
    if (-not (Test-Path $dest) -or $Force) {
        Write-Host "Downloading $url"
        $ProgressPreference = 'SilentlyContinue'
        Invoke-WebRequest $url -OutFile "$dest.part"
        Move-Item -Force "$dest.part" $dest
    }
    if ($sha256) {
        $got = (Get-FileHash $dest -Algorithm SHA256).Hash.ToLower()
        if ($got -ne $sha256.ToLower()) { Remove-Item $dest; throw "SHA-256 mismatch for $name (got $got)" }
    }
    return $dest
}
