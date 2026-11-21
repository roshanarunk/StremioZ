# Releasing StremioZ

A release is three files on a GitHub release of `roshanarunk/StremioZ`:

| File | What it is |
|---|---|
| `StremioZ-Setup-<version>.exe` | The installer (NSIS, `installer/StremioZ.nsi`) |
| `version-details.json` | `{"version", "files": {"windows-x64": {url, checksum}}}`: where the installer is and its SHA-256 |
| `version.json` | `{"versionDesc": <url of version-details.json>, "signature"}`: the signature is RSA-SHA256 over `version-details.json` |

Installed copies check `https://github.com/roshanarunk/StremioZ/releases/latest/download/version.json` at startup (Settings → StremioZ → Check for updates) or on **Check now**. When the signature matches the public key in `src/core/globals.cpp` and the version is newer, StremioZ downloads the installer, checks its SHA-256 and offers it. Installing runs it silently (`/S /UPDATE /D=<install folder>`), and it starts StremioZ again when done.

## Steps

1. Set the version in `CMakeLists.txt`: `set(STREMIOZ_VERSION "x.y.z")`. It feeds the exe's version resource, the updater's comparison, the installer and the feed.
2. Optionally write the notes in `docs/release-notes/vx.y.z.md`.
3. Build:

   ```powershell
   .\tools\release.ps1
   ```

   It builds `StremioZ.exe`, stages a clean copy in `dist\release\stage` (none of the profile, caches or settings of `dist\StremioZ`), compiles the installer and writes the signed feed into `dist\release`.
4. Try the installer.
5. Commit and push (publishing creates the tag `vx.y.z` on the pushed commit). Then publish:

   ```powershell
   .\tools\release.ps1 -SkipBuild -Publish
   ```

   This runs `gh release create vx.y.z` with the three files. Publishing is what ships the update to every installed copy.

## Requirements

- Everything in `docs/STREMIOZ.md` for building.
- NSIS 3: the portable zip unpacked as `deps\nsis` (no admin needed), or an installed NSIS.
- `openssl` (Git for Windows has one).
- The release signing key, `%USERPROFILE%\.stremioz\update-signing-key.pem` (or `-Key`). Keep it private and back it up: installed copies only accept updates signed with it, and it can't be replaced without shipping a new public key through an update signed by the old one.
- `gh`, signed in to the account that owns the repository (`-Publish` only).

## The signing key

The pair was made with:

```powershell
openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:3072 -out "$env:USERPROFILE\.stremioz\update-signing-key.pem"
```

The public half (`openssl pkey -in <key> -pubout`) is `public_key_pem` in `src/core/globals.cpp`. `release.ps1` refuses to build if the two don't match.
