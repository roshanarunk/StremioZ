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
- git, 7-Zip, PowerShell 7, Node.js (builds the web UI; without it StremioZ falls back to the hosted one)
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
  - the Stremio web UI, built by `tools/build-webui.ps1` from Zaarrg/stremio-web-shell-fixes at the pinned commit:
    - Dependencies are installed with pnpm's frozen lockfile and `--ignore-scripts`, so no package install scripts run.
    - Checked against what stremio.zarg.me serves: identical CSS, worker and stremio-core wasm. main.js has the same modules with different numeric ids.
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
| Web UI | Served from `webui\` beside the exe as `https://web.stremioz.example/index.html`, through a WebView2 virtual host. The remote URLs stay as fallbacks, and `--webui-url=` still overrides. Kai's theme targets this exact build's class names. |
| `--devtools-port=N` | opt-in Chrome DevTools Protocol port on localhost, for testing the web UI (for example with a CDP script) |
| `overlay/portable_config` | `mpv.conf`: AnimeJaNai defaults, then Kai's tuning, then Stremio overrides (no watch-later, no forced `alang`/`slang`). Keeps `gpu-api=vulkan` (CUDA interop).<br>`input.conf`: Kai's keys plus AnimeJaNai's, without SVP and without `q quit` |
| server.js | Pinned to Stremio's current upload of v4.20.15. Community's recorded checksum is from an older upload. |

## NVIDIA RTX Video (Phase 3)

**Settings → Player → Video Pipeline** picks one of two pipelines. The choice is fixed per session, because mpv's renderer can't switch GPU API once it is open, and a change applies after a restart.

| Pipeline | Renderer | Anime | Movies / series |
|---|---|---|---|
| **RTX Video** | D3D11, `hwdec=d3d11va` | AnimeJaNai on **DirectML** (D3D11 frames, `output-444=no`) → **RTX Video HDR** | **RTX Video Super Resolution** (scaled to the display height) + **RTX Video HDR**, in one `d3d11vpp` pass |
| **AnimeJaNai TensorRT** | Vulkan, `hwdec=nvdec` | AnimeJaNai on TensorRT (CUDA frames) | unchanged |

**Auto** (the default) picks RTX Video when the window's display is in Windows HDR mode at startup, and TensorRT otherwise.

- The shell publishes that display state as `user-data/stremioz/display-hdr` (`src/stremioz/display_hdr.cpp`), using the monitor the window is on. It updates on display changes and moves.
- RTX Video HDR is only added while that display is in HDR mode. On an SDR desktop it would just be tone-mapped back.
- The toggles **RTX Video HDR** and **RTX Video Super Resolution** turn each feature off.

**Not covered by RTX Video:**
- HDR sources: Kai's HDR passthrough or tone-mapping handles them.
- Anime4K: its CPU filters need copy-back frames, which the D3D11 video processor can't take.
- Legacy interlaced SD.

Measured on an RTX 5070 Ti, upscaling 1080p to 2160p:

| Chain | 24 fps | 60 fps |
|---|---|---|
| DirectML Balanced + RTX HDR | no drops, GPU 34 %, 148 W | Balanced only runs up to 31 fps (AnimeJaNai's profile) |
| DirectML Quality + RTX HDR | no drops, GPU 39 % | about half the frames dropped |
| TensorRT Balanced | no drops, GPU 18 %, 89 W | (same 31 fps limit) |
| TensorRT Quality | no drops, GPU 19 % | no drops, GPU 48 %, 187 W |
| RTX VSR + RTX HDR (live action) | no drops (runs on the video engine) | |

Phase 4 (TensorRT on D3D11 frames) is meant to remove the DirectML cost and the need for two pipelines.

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
- The local web UI has its own origin. Logins and Kai settings from a copy that loaded `stremio.zarg.me` don't carry over: sign in once.
- Kai's welcome wizard still says "Stremio Kai" (branding is Phase 6).
- RTX Video HDR output is tagged as 1000-nit HDR10. That's mpv's guess at NVIDIA's setting, and the real peak follows the RTX Video settings in the NVIDIA App.
- On the RTX pipeline, AnimeJaNai's DirectML model takes about 1.5 s to start on each video (TensorRT's native kernels take about 0.1 s).
