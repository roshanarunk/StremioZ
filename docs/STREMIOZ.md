# Building StremioZ (Windows x64)

StremioZ is Stremio Community's shell built against the AnimeJaNai libmpv fork,
with the AnimeJaNai runtime, Stremio Kai's UI and automation (`vendor/kai`, see
`vendor/kai/STREMIOZ-CHANGES.md`) and a StremioZ config overlay. See `PLAN.md`
for the roadmap.

Config layering in `dist\StremioZ\portable_config` (later wins):
1. `vendor/kai/portable_config`: Kai's webmods, Lua scripts, script-opts, shaders, fonts
2. the AnimeJaNai runtime's mpv config and scripts
3. `overlay/portable_config`: the merged `mpv.conf` and `input.conf`; `stremio-settings.ini` is only seeded

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
  - the standalone `mpv.exe` from the same libmpv release (Kai's thumbfast seek previews)
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
| Stremio Kai | UI webmods, smart track selector, skip intro, profile manager, shaders, fonts. SVP removed; AnimeJaNai is the default anime upscaler (`vendor/kai/STREMIOZ-CHANGES.md`) |
| mpv commands from the web UI | `script-message` allowed (Kai's bridge uses it). The web player's `hwdec` / `hwdec-codecs` sets are ignored: AnimeJaNai's backend picks the decoder. |
| `--devtools-port=N` | opt-in Chrome DevTools Protocol port on localhost, for testing the web UI (for example with a CDP script) |
| `overlay/portable_config` | `mpv.conf`: AnimeJaNai defaults, then Kai's tuning, then Stremio overrides (no watch-later, no forced `alang`/`slang`). Keeps `gpu-api=vulkan` (CUDA interop).<br>`input.conf`: Kai's keys plus AnimeJaNai's, without SVP and without `q quit` |
| server.js | Pinned to Stremio's current upload of v4.20.15. Community's recorded checksum is from an older upload. |

## Keys in the player

| Key | Action |
|---|---|
| Ctrl+J | AnimeJaNai stats |
| Ctrl+E | AnimeJaNai Manager (profiles, backend) |
| Shift+1 / 2 / 3 | AnimeJaNai Quality / Balanced / Performance (this video) |
| Ctrl+0 | AnimeJaNai off (this video) |
| Ctrl+Shift+1 … 9 | AnimeJaNai custom slots |
| F1 / F2 / F3, F4 | Anime4K presets (Kai), clear |
| Ctrl+1 … 4 | Anime4K thin-line shaders (Kai) |
| F8 | Cycle colour profile: Kai / Vivid / Original |
| ` | Cycle audio preset |
| Tab | Skip intro (when offered) |
| T | Stats |

The upscaler for anime is chosen in **Settings → Player → Anime Upscaler** (default: AnimeJaNai Balanced) and applies from the next video.

## Known issues

- If a video starts while the window is minimized, the Vulkan output can't be created (0×0 surface) and that video plays without picture. `PauseOnMinimize=1`, the default, avoids most cases.
- The web UI is loaded from `stremio.zarg.me` (Zaarrg's build, unchanged since Dec 2025). Kai's styling targets its class names, so a change there could break Kai's theme.
- Kai's welcome wizard still says "Stremio Kai" (branding is Phase 6).
