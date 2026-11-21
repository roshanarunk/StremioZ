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
- About 2.5 GB free for the CUDA 13.4 / TensorRT 11.4 SDKs that build the patched `aji_trt.dll` (`%USERPROFILE%ji-win`, or `AJI_WIN`)
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

## NVIDIA RTX Video (Phases 3 and 4)

NVIDIA RTX Video (mpv's `d3d11vpp`) needs D3D11 frames and a D3D11 renderer. StremioZ ships a patched `aji_trt.dll` so that AnimeJaNai's TensorRT backend takes D3D11 frames too, and feeds RTX Video HDR directly.

**Settings → Player → Video Pipeline** picks the pipeline. It is fixed per session, because mpv's renderer can't switch GPU API once it is open, so a change applies after a restart.

| Pipeline | Renderer | Anime | Movies / series |
|---|---|---|---|
| **RTX Video** | D3D11, `hwdec=d3d11va` | AnimeJaNai on **TensorRT** (D3D11 frames, `output-444=no`) → **RTX Video HDR** | **RTX Video Super Resolution** (scaled to the display height) + **RTX Video HDR**, in one `d3d11vpp` pass |
| **Vulkan** | Vulkan, `hwdec=nvdec` | AnimeJaNai on TensorRT (CUDA frames) | unchanged |

**Auto** (the default) picks RTX Video whenever an NVIDIA GPU is present. The shell publishes the GPU list as `ANIMEJANAI_NVIDIA_GPUS`.

- RTX Video HDR is only added while the window's display is in Windows HDR mode. The shell publishes that state as `user-data/stremioz/display-hdr` (`src/stremioz/display_hdr.cpp`). On an SDR desktop the HDR would just be tone-mapped back.
- The toggles **RTX Video HDR** and **RTX Video Super Resolution** turn each feature off.

**Not covered by RTX Video:**
- HDR sources: Kai's HDR passthrough or tone-mapping handles them.
- Anime4K: its CPU filters need copy-back frames, which the D3D11 video processor can't take.
- Legacy interlaced SD.

### TensorRT on D3D11 frames (`tools/patches/libaji-0.32.0-d3d11-bridge.patch`)

`vf_animejanai` already hands D3D11 textures to libaji when mpv decodes with `d3d11va`, but only the DirectML backend accepted them. The patch adds `src/d3d11_bridge.{h,cpp}` to the TensorRT backend: about 700 lines, with no change to mpv, the dispatcher or the ABI.

Each frame-taking call runs as follows:
1. D3D11 signals a shared D3D12 fence after the caller's copy into its input texture.
2. A D3D12 copy queue copies each texture plane (NV12 or P010, a box of the frame's size) into linear D3D12 buffers.
3. Those buffers are imported into CUDA as plain device memory, and the unchanged TensorRT code reads and writes them on the bridge's stream.
4. D3D12 copies the result into the output texture planes.
5. D3D11 waits on the fence before the renderer uses the output.

One fence timeline orders all three APIs. The ticket API (`aji_flush`/`aji_done`/`aji_wait`) maps onto it.

Why D3D12 does the plane copies:
- CUDA's external-memory arrays can't map P010 textures (`CUDA_ERROR_INVALID_VALUE`, tested with every format and channel combination).
- CUDA graphics interop rejects the filter's `SHARED_NTHANDLE` textures, and only exposes an NV12 texture's luma plane.

Checked against TensorRT's CUDA path on an RTX 5070 Ti: the upscaled frames match to 140 dB (8-bit) and 131 dB (10-bit), which is rounding.

`tools/build-libaji.ps1` builds it, and `fetch-deps.ps1` runs it:
- It clones libaji at the AnimeJaNai release's tag, applies the patch, and builds `aji_trt` for libaji's release GPU list.
- The SDKs come from `tools/fetch-libaji-sdk.ps1`: CUDA 13.4 pieces and TensorRT 11.4 from NVIDIA's public archives, with SHA-256 checks, about 2.2 GB once.

Measured on an RTX 5070 Ti, upscaling 1080p to 2160p:

| Chain | 24 fps | 60 fps |
|---|---|---|
| **TensorRT Balanced + RTX HDR (D3D11)** | no drops, GPU 19 %, 89 W | Balanced only runs up to 31 fps (AnimeJaNai's profile) |
| **TensorRT Quality + RTX HDR (D3D11)** | no drops, GPU 18 % | **no drops**, GPU 49 %, 190 W |
| TensorRT Balanced + RTX HDR, 10-bit HEVC source | no drops, GPU 19 % | |
| TensorRT Quality on Vulkan (no RTX Video), for comparison | no drops, GPU 19 % | no drops, GPU 48 % |
| Phase 3's DirectML Balanced + RTX HDR | no drops, GPU 34 %, 148 W | Quality: about half the frames dropped |
| RTX VSR + RTX HDR (live action) | no drops (runs on the video engine) | |

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
