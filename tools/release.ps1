<#
.SYNOPSIS
  Builds a StremioZ release: the installer plus the signed update feed.

.DESCRIPTION
  1. Builds StremioZ.exe (unless -SkipBuild) and assembles a clean copy in
     dist\release\stage (no profile, caches or settings from dist\StremioZ).
  2. Compiles installer\StremioZ.nsi with NSIS (deps\nsis or an installed NSIS)
     into dist\release\StremioZ-Setup-<version>.exe.
  3. Writes the updater feed beside it:
       version-details.json  {"version", "files": {"windows-x64": {url, checksum}}}
       version.json          {"versionDesc": <url of version-details.json>, "signature"}
     signed with the release key (RSA, SHA-256) whose public half is in
     src\core\globals.cpp.
  4. With -Publish, creates the GitHub release v<version> with those three
     files (gh CLI, signed in). The app's feed is the latest release's
     version.json, so publishing is what ships the update.

  The version comes from STREMIOZ_VERSION in CMakeLists.txt.

.PARAMETER Key
  The release signing key (PEM). Keep it private and backed up: without it no
  update can be published to existing installs.
#>
param(
    [switch]$SkipBuild,
    [switch]$Publish,
    [string]$Key = "$env:USERPROFILE\.stremioz\update-signing-key.pem",
    [string]$Repo = 'roshanarunk/StremioZ'
)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'common.ps1')

$cmake = Get-Content (Join-Path $Root 'CMakeLists.txt') -Raw
if ($cmake -notmatch 'set\(STREMIOZ_VERSION "([0-9]+\.[0-9]+\.[0-9]+)"\)') { throw 'STREMIOZ_VERSION not found in CMakeLists.txt' }
$Version = $Matches[1]
$Tag = "v$Version"
$Rel = Join-Path $Root 'dist\release'
$Stage = Join-Path $Rel 'stage'
$Setup = "StremioZ-Setup-$Version.exe"
Write-Host "StremioZ $Version"

if (-not (Test-Path $Key)) { throw "Release signing key not found: $Key" }
$openssl = (Get-Command openssl -ErrorAction SilentlyContinue).Source
if (-not $openssl) { $openssl = "$env:ProgramFiles\Git\usr\bin\openssl.exe" }
if (-not (Test-Path $openssl)) { throw 'openssl not found (Git for Windows ships one)' }
$makensis = @((Join-Path $Deps 'nsis\makensis.exe'), "${env:ProgramFiles(x86)}\NSIS\makensis.exe", "$env:ProgramFiles\NSIS\makensis.exe") |
    Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $makensis) { throw 'NSIS not found: unzip nsis-3.x.zip into deps\nsis' }

# ------------------------------------------------------------------ build + stage
$assemble = Join-Path $PSScriptRoot 'assemble.ps1'
if (-not $SkipBuild) { & $assemble }
& $assemble -SkipBuild -Clean -Out $Stage
foreach ($p in 'StremioZ.exe.WebView2', 'stremio.exe.WebView2', 'portable_config\cache', 'portable_config\mpv.log', 'animejanai\currentanimejanai.log') {
    if (Test-Path (Join-Path $Stage $p)) { throw "User state in the staging folder: $p" }
}

# ------------------------------------------------------------------ installer
$man = Get-Content (Join-Path $Deps 'animejanai-runtime\manifest.json') -Raw | ConvertFrom-Json
$ajnVersion = (Get-Content (Join-Path $Deps 'animejanai-runtime\version.txt')).Trim()
$out = Join-Path $Rel $Setup
& $makensis /V2 "/DVERSION=$Version" "/DSOURCE=$Stage" "/DOUTFILE=$out" `
    "/DAJN_VERSION=$ajnVersion" "/DAJI_INDEX_URL=$($man.runtime.index_url)" "/DAJI_INDEX_SHA256=$($man.runtime.index_sha256)" `
    (Join-Path $Root 'installer\StremioZ.nsi')
if ($LASTEXITCODE -ne 0) { throw "makensis failed ($LASTEXITCODE)" }

# ------------------------------------------------------------------ update feed
$base = "https://github.com/$Repo/releases/download/$Tag"
$sha = (Get-FileHash $out -Algorithm SHA256).Hash.ToLower()
$details = [ordered]@{
    version  = $Version
    released = (Get-Date).ToUniversalTime().ToString('yyyy-MM-dd')
    files    = [ordered]@{ 'windows-x64' = [ordered]@{ url = "$base/$Setup"; checksum = $sha } }
}
$utf8 = New-Object System.Text.UTF8Encoding $false
$detailsPath = Join-Path $Rel 'version-details.json'
[IO.File]::WriteAllText($detailsPath, (($details | ConvertTo-Json -Depth 5) -replace "`r`n", "`n") + "`n", $utf8)

$sigPath = Join-Path $Rel 'version-details.sig'
& $openssl dgst -sha256 -sign $Key -out $sigPath $detailsPath
if ($LASTEXITCODE -ne 0) { throw 'signing failed' }
# Check it against the public key the app carries.
$pubPath = Join-Path $Rel 'release-key.pub.pem'
& $openssl pkey -in $Key -pubout -out $pubPath
$embedded = (Get-Content (Join-Path $Root 'src\core\globals.cpp') -Raw) -replace "`r", ''
$pub = (Get-Content $pubPath -Raw) -replace "`r", ''
if (-not $embedded.Contains($pub.Trim())) { throw 'The signing key does not match the public key in src\core\globals.cpp' }
& $openssl dgst -sha256 -verify $pubPath -signature $sigPath $detailsPath | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'signature check failed' }
$signature = [Convert]::ToBase64String([IO.File]::ReadAllBytes($sigPath))
Remove-Item $sigPath, $pubPath

$feed = [ordered]@{ versionDesc = "$base/version-details.json"; signature = $signature }
[IO.File]::WriteAllText((Join-Path $Rel 'version.json'), (($feed | ConvertTo-Json) -replace "`r`n", "`n") + "`n", $utf8)

$size = [math]::Round((Get-Item $out).Length / 1MB)
Write-Host ""
Write-Host "Release files in $Rel"
Write-Host "  $Setup ($size MB, sha256 $sha)"
Write-Host "  version.json, version-details.json"

# ------------------------------------------------------------------ publish
if ($Publish) {
    $notes = Join-Path $Root "docs\release-notes\$Tag.md"
    $files = @($out, (Join-Path $Rel 'version.json'), $detailsPath)
    if (Test-Path $notes) { gh release create $Tag @files --repo $Repo --title "StremioZ $Version" --notes-file $notes }
    else { gh release create $Tag @files --repo $Repo --title "StremioZ $Version" --generate-notes }
    if ($LASTEXITCODE -ne 0) { throw 'gh release create failed' }
    Write-Host "Published $Tag"
}
