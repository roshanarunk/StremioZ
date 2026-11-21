# Building StremioZ (Windows x64)

StremioZ is Stremio Community's shell built against the AnimeJaNai libmpv fork,
with the AnimeJaNai runtime and a StremioZ config overlay. See `PLAN.md` for the
roadmap.

## Prerequisites

- Visual Studio 2022 or 2026 with **Desktop development with C++** and **C++ CMake tools**
- git, 7-Zip, PowerShell 7
- vcpkg (default location `%USERPROFILE%\vcpkg`, or set `VCPKG_ROOT`) with:

```powershell
vcpkg install openssl:x64-windows-static nlohmann-json:x64-windows-static webview2:x64-windows-static curl:x64-windows-static
```

## Build

```powershell
.\tools\fetch-deps.ps1
```

```powershell
.\tools\assemble.ps1 -SetupTensorRT
```

The result is `dist\StremioZ\stremio.exe`, a portable folder.

- `fetch-deps.ps1` downloads the pinned components in `tools/components.json`:
  - the-database libmpv fork, from which it generates an MSVC `mpv.lib`
  - the AnimeJaNai runtime
  - discord-rpc, built from source with `tools/patches/discord-rpc-3.4.0-type-buttons.patch`
- `assemble.ps1` builds `stremio.exe` (CMake + Ninja + MSVC) and stages the folder in place:
  - It keeps TensorRT engines and user settings between runs. Pass `-Clean` to start over.
  - `-SkipBuild` restages without compiling.
- `-SetupTensorRT` installs the TensorRT runtime and the builder pack for this GPU through `aji-runtime`, into the shared per-user store `%LOCALAPPDATA%\the-database\aji` (about 0.7 GB, one time).

## What differs from Stremio Community

| Area | Change |
|---|---|
| libmpv | the-database fork (`vf_animejanai`) instead of Zaarrg/libmpv |
| AnimeJaNai | current 3.12.x native filter, bundled; old VapourSynth package not used |
| `src/stremioz/animejanai_env.cpp` | gets the GPU list from NVML and passes it to AnimeJaNai's scripts (`ANIMEJANAI_NVIDIA_GPUS`). Without it, the script's `nvidia-smi` call at startup can deadlock playback in embedded libmpv. |
| App identity | window class, title and single-instance mutex are `StremioZ`, so it runs alongside an installed Stremio Community |
| Auto-update | off until StremioZ has its own signed feed |
| `overlay/portable_config` | `mpv.conf`: AnimeJaNai defaults, with Stremio overrides (no watch-later, no forced `alang`/`slang`)<br>`input.conf`: AnimeJaNai on Ctrl/Shift, Anime4K moved to Alt |
| server.js | Pinned to Stremio's current upload of v4.20.15. Community's recorded checksum is from an older upload. |

## Keys in the player

| Key | Action |
|---|---|
| Ctrl+J | AnimeJaNai stats |
| Ctrl+E | AnimeJaNai Manager (profiles, backend) |
| Shift+1 / 2 / 3 | AnimeJaNai Quality / Balanced / Performance |
| Ctrl+1 … 9 | AnimeJaNai custom slots |
| Ctrl+0 | AnimeJaNai off |
| Alt+1 … 7, Alt+0 | Anime4K presets, clear |
