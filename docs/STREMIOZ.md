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
- About 2.5 GB free for the CUDA 13.4 / TensorRT 11.4 SDKs that build the patched `aji_trt.dll` (`%USERPROFILE%\aji-win`, or `AJI_WIN`)
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

The result is `dist\StremioZ\StremioZ.exe`, a portable folder. For the installer and the update feed, see `docs/RELEASE.md` (`tools\release.ps1`).

- `fetch-deps.ps1` downloads the pinned components in `tools/components.json`:
  - the-database libmpv fork, from which it generates an MSVC `mpv.lib`
  - the AnimeJaNai runtime
  - the standalone `mpv.exe` from the same libmpv release (Kai's thumbfast seek previews)
  - discord-rpc, built from source with `tools/patches/discord-rpc-3.4.0-type-buttons.patch`
  - the Stremio web UI, built by `tools/build-webui.ps1` from Zaarrg/stremio-web-shell-fixes at the pinned commit:
    - Dependencies are installed with pnpm's frozen lockfile and `--ignore-scripts`, so no package install scripts run.
    - Checked against what stremio.zarg.me serves: identical CSS, worker and stremio-core wasm. main.js has the same modules with different numeric ids.
- `assemble.ps1` builds `StremioZ.exe` (CMake + Ninja + MSVC) and stages the folder in place:
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
| `src/stremioz/gamepad.cpp` | Native controller input (SDL3): Xbox, PlayStation, Switch Pro and generic pads, hot-plug. Presses, auto-repeats and releases go to the web UI as `stremioz-gamepad` messages while StremioZ is the foreground window. `stremioz-fullscreen` lets the web UI switch fullscreen. |
| Fullscreen | One fullscreen for the mouse, keyboard and controller. `webmods/StremioZ/fullscreen.js` sends the page's fullscreen requests for the whole page (Stremio's button, F, double-click) to the shell's window fullscreen (`stremioz-fullscreen`), which a controller press can also use. The page reports the shell's state, which `ToggleFullScreen` posts on every change (`{"type":"stremioz-fullscreen","on":…}`), so Stremio's button always shows the right state. Esc leaves fullscreen. The player's control bar also has a fullscreen button at its right end (`webmods/StremioZ/player-controls.js`), where the controller's control-bar navigation reaches it; Stremio's own is in the top bar. Before 0.9.4 the controller's fullscreen and the page's were separate, so the button took several clicks after TV mode, and a controller couldn't use it. |
| `src/stremioz/ui_scale.cpp` | TV interface scale: in fullscreen on a display under 1000 logical pixels tall (a 4K TV at 300 % is 1280×720), the WebView2 zoom is set so the UI lays out at about 1080 CSS pixels, the size Kai is designed for. `[StremioZ] UiScale` in `stremio-settings.ini`: `auto` (default), `off`, or a fixed factor such as `0.75`. |

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

**Faster playback.** AnimeJaNai's presets check the video's own frame rate (Quality and Balanced up to 31 fps for 720p to 1080p, Quality up to 61 fps), not the playback speed. So at 2× a 24 fps episode still gets the chosen model, which then has to keep up with 48 frames a second. For 720p to 1080p up to 31 fps, Quality and Balanced run the same model (V3.1 Balanced); Performance runs the smaller V3.1 Performance.

Measured on an RTX 5070 Ti with RTX HDR, on a test pattern that changes every frame. Real anime holds drawings, and AnimeJaNai reuses those frames, so its load is lower.

| Preset | 2× (48 frames/s) | 3× (72 frames/s) |
|---|---|---|
| Balanced / Quality | no drops, GPU 39 %, 164 W | drops |
| Performance | no drops, GPU 23 %, 96 W | drops |

At 3× the drops come from the 60 Hz display, not from upscaling: the GPU was only a third busy. A 120 Hz or faster output would show every frame.

## Controller and TV mode

Any controller SDL3 knows works (Xbox, PlayStation, Switch Pro, most generic pads), plugged in before or after start. `overlay/portable_config/webmods/StremioZ/tv-navigation.js` decides what each button does on the current screen:

| Button | Browsing | Player |
|---|---|---|
| D-pad / left stick | Move (hold to repeat) | ◀ ▶ seek 10 s (hold: keeps seeking), ▲ control bar (its last button is fullscreen), ▼ hide it |
| A | Select; on a text field, on-screen keyboard; on a dropdown, a list | Play / pause |
| B | Close menu or dialog, else back | Close menu, else leave the player |
| X | Search (opens the keyboard) | Skip intro |
| Y | Home | Player menu: subtitles, audio, speed, AnimeJaNai preset, motion smoothing on/off, RTX HDR on/off, next episode, episode list |
| LB / RB | Previous / next page (Board, Discover, Library, Calendar, Addons, Settings) | Speed −/+ 0.25 |
| LT / RT | Jump three items up / down | Seek −/+ 85 s |
| Right stick | Scroll while held (faster after a moment); the highlight moves with the list as it scrolls, and on release the list settles on the nearest row | ▲ ▼ volume |
| Start | Done (keyboard) | Next episode |
| View | Show / hide the button hints | Episode list |
| L3 / R3 | | Subtitle / audio menu |

The first controller press turns on TV mode:
- the mouse cursor hides (moving the mouse brings it back);
- a focus ring and button hints appear (glyphs follow the pad: Xbox, PlayStation or Nintendo);
- the window goes fullscreen (Settings → StremioZ → Fullscreen on controller);
- in fullscreen on a TV with high Windows scaling, the interface is scaled to a 1080p layout (`UiScale`, above).

The hints fade after 5 idle seconds and return on the next press.

In TV mode the interface is tuned for speed: moving the focus scrolls in about 120 ms (Chromium's smooth scrolling took up to half a second), the focus ring glides in 90 ms, and the theme's hover and focus transitions run in 0.08 s (the hero banner keeps its crossfade).

The **StremioZ TV mode** shortcut (`StremioZ.exe --tv`) starts in TV mode: fullscreen, with the controller focus ready. Run while StremioZ is open, it switches the open window to TV mode.

Focus is remembered per page, so Back returns to the poster you left. When a show opens, Kai jumps its episode list to the episode you're on (at once since 0.9.4; it used to scroll slowly). The first focus waits for that and lands on that episode (the one in progress, else the one in the middle), instead of going back to episode 1. A menu opened from any button (L3/R3, the player menu's Subtitles or Audio) gets focus on its first item.

Stremio's web UI turns Escape into "back" unless a component handles it, and the player's subtitle, audio and speed menus and the episode drawer don't. Escape there used to leave the stream. StremioZ closes the menu instead, for B and for a keyboard's Esc alike.

Keyboard users keep Kai's keyboard navigation.

## Settings → StremioZ

`overlay/portable_config/webmods/StremioZ/settings.js` adds a **StremioZ** section to Stremio's settings (and a button for it in the side menu):

| Setting | Stored in |
|---|---|
| Controller (on/off) | `localStorage["stremioz-controller"]` |
| Fullscreen on controller | `localStorage["stremioz-tv-fullscreen"]` |
| Button hints | `localStorage["stremioz-tv-hints"]` |
| TV interface size: Auto, Windows scaling, or 50–125 % | `[StremioZ] UiScale` in `portable_config/stremio-settings.ini` |
| For You: Refresh now | clears the cached picks |
| Check for updates (at startup), Check now, Install update | `[StremioZ] AutoUpdate` |

The interface size applies in fullscreen only. Auto lays the interface out at about 1080 CSS pixels tall when the display's scaling would make it smaller (a 4K TV at 300 %). The section also shows the version and credits. The shell side is `stremioz-get-settings` / `stremioz-set-setting` / `stremioz-check-update` in `src/ui/mainwindow.cpp`. `[StremioZ] UpdateFeed` replaces the update feed (for testing).

## Branding

- The exe is `StremioZ.exe`, so it can run beside Stremio. Its profile (sign-in, library, settings) is `StremioZ.exe.WebView2` beside it. A folder from before the rename (`stremio.exe.WebView2`) is moved over on first start.
- Icon and splash: `images/stremioz.ico` / `.png`, drawn by `tools/make-icon.py`. The installer art comes from `tools/make-installer-art.py`.
- The version is `STREMIOZ_VERSION` in `CMakeLists.txt` (exe version resource, updater, installer). The web UI still sees the Community shell version (`APP_VERSION`) as `shellVersion`.
- Kai's welcome wizard says "Welcome to StremioZ"; its links that support Kai's author are kept.
- The logo at the top left of the interface is the StremioZ icon (`webmods/StremioZ/branding.css`, a 128 px copy of `images/stremioz.png`, replacing Kai's).

## Hero banner: For You

The hero banner on the home screen has three modes, switched with the arrows button at the top right (Movies → Anime → For You; the banner names the new mode for a moment):
- **Movies**: Kai's movie and series sources (Settings → Hero Banner: Movie Catalog, Series Catalog);
- **Anime**: Kai's anime airing schedule (Jikan). When Jikan fails or takes over 8 s, the schedule comes from AniList instead for 10 minutes;
- **For You**, the default: built from your own watch history by `overlay/portable_config/webmods/StremioZ/hero-for-you.js`.

The mode is remembered. Before 0.9.3, For You was the first entry of the Movie and Series source lists; on the first start of 0.9.3, `hero-for-you.js` moves saved source choices back to Kai's lists, and whoever was seeing For You keeps it (with its cached titles) as the For You mode.

For You needs no API keys:

1. **Seeds.** The 20 titles from your library and history (`library`, `library_recent`) that matter most. Recent and much-watched titles weigh more, and debrid, YouTube and other add-on entries are skipped.
2. **Anime seeds** are matched to AniList through arm.haglund.dev, the same service Kai uses. One AniList query fetches the community recommendations for all of them, and each candidate scores by votes times the weight of the seeds recommending it. Results map back to IMDb IDs (the hero's artwork needs them). Shows you've already watched, and other seasons of them, are dropped.
3. **Other series and movies** contribute their genres, and Cinemeta's popular titles in your top three genres fill in, in proportion to how much of your watching isn't anime.

The list is cached for 12 hours, or until the set of your top titles changes. The ID mappings are kept for 30 days, so after the first build (about 35 s, in the background) a rebuild takes a fraction of a second. **Settings → StremioZ → For You → Refresh now** drops the picks; the banner builds them again the next time it shows For You.

## Motion smoothing (RIFE)

**Settings → Player → Motion Smoothing (RIFE)**, off by default. While watching: the motion smoothing button in the player's control bar (left of the speed button), Ctrl+M, or the controller's player menu. The button is lit while RIFE runs, and dimmed when smoothing is on but this video doesn't get it (not anime upscaled by AnimeJaNai, or already at the display rate); `profile-manager.lua` publishes that as `user-data/stremioz/motion-state` (`on`, `wanted`, `off`) for `webmods/StremioZ/player-controls.js`. It's AnimeJaNai's RIFE frame interpolation (model v4.26, the AnimeJaNai Manager's default), and runs on anime that AnimeJaNai upscales. It takes the video to the display's refresh rate, at most 60 fps: 23.976 fps on a 60 Hz screen is interpolated 5/2 to 59.94 fps. A video already near that rate (50/60 fps) is left alone. RIFE runs before the upscale, at the source resolution.

libaji reads RIFE only from a profile's chains in `animejanai.conf`, so with smoothing on, `profile-manager.lua` writes `animejanai/stremioz-motion.conf` for each video and gives the AnimeJaNai filter that file instead. It holds:
- the user's `animejanai.conf`;
- Quality / Balanced / Performance (libaji's built-in slots 1001–1003, or the user's own `[slot_100x]`) with RIFE on every chain at the video's factor.

The model ships in the package (`animejanai/rife`, 11 MB, MIT: `licenses/RIFE.txt`). `tools/fetch-deps.ps1` takes it from the-database's `models-rife-fp16-2` release (`tools/components.json`).

Measured on an RTX 5070 Ti (RTX Video pipeline, Windows HDR off): 1080p 23.976 fps → RIFE 5/2 → AnimeJaNai to 4K at a steady 59.94 fps, no dropped frames after the first second, about 72% GPU. Not yet measured together with RTX Video HDR.

## Playback speed

Stremio's shell player starts every video at 1×. StremioZ starts it at the speed you last chose instead (from Stremio's speed menu, the controller's LB/RB or player menu, or mpv's keys): **Settings → StremioZ → Playback → Remember playback speed**, on by default. `webmods/StremioZ/player-controls.js` saves the speed as you change it (`stremioz-speed`), and replaces the speed Stremio sends when the player opens and right after each `loadfile`.

## Keys in the player

| Key | Action |
|---|---|
| Ctrl+J | AnimeJaNai stats |
| Ctrl+E | AnimeJaNai Manager (profiles, backend) |
| Shift+1 / 2 / 3 | AnimeJaNai Quality / Balanced / Performance (this video, anime or not) |
| Ctrl+0 | Upscaling off (this video) |
| Ctrl+H | RTX Video HDR on / off (needs Windows HDR on the display) |
| Ctrl+M | Motion smoothing (RIFE) on / off |
| Ctrl+Shift+← / → | Seek −/+ 85 s (skip an opening) |
| Ctrl+Shift+↑ / ↓, Ctrl+Shift+Home | Speed +/− 0.25, back to 1× |
| Ctrl+Shift+1 … 9 | AnimeJaNai custom slots |
| F1 / F2 / F3, F4 | Anime4K presets (Kai), clear |
| Ctrl+1 … 4 | Anime4K thin-line shaders (Kai) |
| F8 | Cycle colour profile: Kai / Vivid / Original |
| ` | Cycle audio preset |
| Tab | Skip intro (when offered) |
| T | Stats |

The upscaler for anime is chosen in **Settings → Player → Anime Upscaler** (default: AnimeJaNai Balanced). Switching while watching (Shift+1/2/3, Ctrl+0, or the controller's player menu) applies at once and **becomes the new default**: the next anime starts with it, and Settings shows it. RTX Video HDR (Ctrl+H; Settings → Player → RTX Video HDR) and motion smoothing (Ctrl+M; Settings → Player → Motion Smoothing) work the same way, from the keys or the player menu. Turning upscaling off on a video that isn't anime doesn't change the anime default. Local files and plain URLs, which come without Stremio's metadata, use the same defaults (`portable_config/cache/stremioz-defaults.json`).

## Skip intro

When an episode has an intro, recap or ending to skip, a "Skip" prompt appears (Tab, or X on the controller). Kai's `notify_skip` script finds the skip times, in this order:

1. **The file's chapters** named Intro, OP, Opening, Outro, ED, Ending, Credits, Recap, Preview and so on.
2. **Online skip times**, when the file has no such chapters:
   - **AniSkip** (api.aniskip.com) for anime. `webmods/StremioZ/skip-sources.js` works out the MyAnimeList entry and episode: from `mal:` or `kitsu:` ids in the player address (Kitsu through arm.haglund.dev), or for IMDb ids (Cinemeta):
     - the MAL ids Kai's metadata and arm.haglund.dev's IMDb mapping know (ARM's specials and films, season 0, left out);
     - AniList's sequel/prequel links from them, for all the show's TV entries in airing order (MAL has one per season or cour);
     - Cinemeta's episode counts per season turn S:E into an absolute episode number, counted on through those entries. So a season split into two MAL entries (Spy x Family season 1, Slime season 2) gets the right one.

     The times are those submitted for an episode of about the same length as the file (AniSkip allows some 20–30 s).
   - **IntroDB** (api.introdb.app) by IMDb id, season and episode, for other shows. AniSkip's times win when both have some.

   Online segments that start after the end of the file are ignored. When the episode changes after the file has loaded, the previous episode's online segments, and the chapters made from them, are cleared.
3. **Silence and black-frame detection**: press skip twice to fast-forward until the audio goes quiet or the picture goes black. It's the same idea as Stremio Community's skip-intro.

The lookups run in mpv with Windows' `curl.exe`. Kai fetched IntroDB with a `python.exe` that StremioZ doesn't ship, so before 0.9.4 that lookup never worked here.

## Known issues

- If a video starts while the window is minimized, the Vulkan output can't be created (0×0 surface) and that video plays without picture. `PauseOnMinimize=1`, the default, avoids most cases.
- The local web UI has its own origin. Logins and Kai settings from a copy that loaded `stremio.zarg.me` don't carry over: sign in once.
- Stremio's "Play URL/Magnet link" menu item reads the link from the clipboard, so it can't be used with only a controller.
- A settings section with no buttons on screen (for example Kai Shortcuts) can only be scrolled with the right stick; select a section name on the left to jump to it.
- RTX Video HDR output is tagged as 1000-nit HDR10. That's mpv's guess at NVIDIA's setting, and the real peak follows the RTX Video settings in the NVIDIA App.
