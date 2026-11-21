# StremioZ — plan

Goal: one Windows build that takes the best parts of **Stremio Community** (the C++ shell) and **Stremio Kai** (the UI and the mpv automation), adds the **current** AnimeJaNai built in, lets AnimeJaNai and **RTX Video HDR** run in the same chain, and can be used from the couch with only a controller.

Reference clones live in `_ref/` (git-ignored, read-only).

---

## 1. What each upstream actually is

| Upstream | What it is | License |
|---|---|---|
| `Zaarrg/stremio-community-v5` (5.0.0-beta.22) | C++ Win32 shell: WebView2 hosting Stremio Web v5, embedded **libmpv** (`deps/libmpv/x86_64/libmpv-2.dll`), node streaming server, tray, updater, NSIS installer. Loads `portable_config/webmods/**.js/.css` into the web UI on startup. ~3.6k lines. | GPL-3.0 |
| `allecsc/Stremio-Kai` (v4.8.0) | **Not a fork of the shell code.** It is a `portable_config/` overlay that runs on the stock Community exe: ~60 webmods (theme, hero banner, metadata panel, details pages, welcome wizard, settings pages, basic gamepad code) and mpv Lua scripts (skip intro, smart track selector, profile manager, thumbfast). It also bundles VapourSynth + SVP. Webmods talk to mpv through the shell's existing transport (`type: 6`, `mpv-command`). | GPL-3.0 |
| `the-database/mpv-AnimeJaNai` (3.12.5, released 2026-11-20) | Current AnimeJaNai. **No VapourSynth any more.** Upscaling (and RIFE interpolation) runs in a native `vf_animejanai` filter inside the-database's **libmpv fork**, which loads `aji.dll` (libaji: TensorRT, TensorRT-RTX or DirectML). Models: V3.1 HD + SD V1 beta + temporal fix. | Repo and models: **CC BY-NC-SA 4.0** (non-commercial). Manager: GPL-3.0 |

The AnimeJaNai package that Community offers is the old 3.x VapourSynth build, and its build script **deletes AnimeJaNai's libmpv** and keeps Community's stock libmpv. The current AnimeJaNai can't work that way: it needs the-database's libmpv, because that is where the filter lives.

**Takeaway:** the merge is very doable. The shell comes from Community. The UI and automation come from Kai's overlay. AnimeJaNai needs a libmpv swap plus its runtime overlay. Kai and AnimeJaNai only really collide in `mpv.conf` and in who owns the `vf` chain.

---

## 2. AnimeJaNai + RTX HDR in one chain (the hard part)

RTX Video HDR in mpv is `vf=d3d11vpp=nvidia-true-hdr` (upstream mpv; the-database's fork has it too). Two hard constraints:

- `d3d11vpp` only accepts **D3D11** frames (`IMGFMT_D3D11`).
- `vf_animejanai` keeps frames on the GPU, and the output type matches the input type:
  - **TensorRT** backend → **CUDA** frames (`hwdec=nvdec`, Vulkan VO)
  - **DirectML** backend → **D3D11** frames (`hwdec=d3d11va`, D3D11 VO)

So today, **TensorRT AnimeJaNai can't feed RTX HDR**: the frames are CUDA, and d3d11vpp wants D3D11. That is why nobody ships this chain.

### Plan

**Stage A — works with no C code (do this first to prove the idea)**
```
hwdec=d3d11va, gpu-api=d3d11, vo=gpu-next, target-colorspace-hint=yes
vf = @aji:animejanai:backend=DirectML ...  ,  @rtxhdr:d3d11vpp=nvidia-true-hdr
```
AnimeJaNai on DirectML, then RTX HDR, all on D3D11. To check: the formats the DirectML path outputs (the filter can emit `YUV444P16` in some cases, and the D3D11 video processor may reject that), whether it holds up at 4K on a 5070 Ti, and how HDR output and subtitles look.

**Stage B — the proper fix: TensorRT on D3D11 frames**
Teach the TensorRT path to accept D3D11 frames through CUDA↔D3D11 interop (`cuGraphicsD3D11RegisterResource` → map → copy into the CUDA buffers TensorRT already uses → copy the result into a D3D11 output pool). These GPU-to-GPU copies take well under a millisecond at 4K. The chain becomes:
```
d3d11va decode → animejanai (TensorRT, D3D11 in/out) → d3d11vpp=nvidia-true-hdr → D3D11 VO (HDR)
```
Where it lives: either in our fork of `the-database/mpv` (`vf_animejanai.c`), or as a D3D11 frames mode in libaji's TensorRT backend. Doing it in libaji is cleaner and could go upstream to the-database, so we don't have to keep a fork alive long term.

**Order:** upscale first, then HDR. AnimeJaNai models are trained on SDR BT.709, so they must see the source before RTX HDR changes it.

### Content-aware enhancement matrix (driven by Kai's profile manager)

| Content | Chain |
|---|---|
| Anime, SDR | AnimeJaNai → RTX HDR |
| Live action, SDR | `d3d11vpp=scale=2:scaling-mode=nvidia:nvidia-true-hdr` (RTX VSR + HDR in one pass) |
| HDR source | Passthrough (Kai's "Cinematic HDR"); no RTX HDR |
| Non-NVIDIA GPU | AnimeJaNai DirectML or Anime4K; no RTX HDR |
| HDR display off | Skip RTX HDR, tone-map as today |

The vf chain gets **one owner**: an extended version of Kai's `profile-manager.lua` / `reactive_vf_bypass.lua` that knows about `@aji` and `@rtxhdr` labels, instead of AnimeJaNai's scripts and Kai's scripts each rewriting `vf`.

**SVP:** Kai's SVP runs through VapourSynth on CPU frames, which breaks a GPU-only chain. Replace it with AnimeJaNai's built-in GPU **RIFE** interpolation, which already lives in the same filter.

---

## 3. Controller and TV ("10-foot") support

Kai has a basic gamepad poller in `webmods/Utilities/navigation.js`. It uses the browser Gamepad API, maps a few buttons to keys and page jumps, and only works while the WebView has focus. That isn't enough to use the app without a mouse.

Design:

1. **Native input in the shell (C++)**: use SDL3's gamepad API (Xbox, PlayStation, Switch Pro and generic pads, hot-plug, rumble) or Windows.Gaming.Input, polled on its own thread. Works whether the WebView or mpv has focus, and works when the app is launched from a controller (Steam Big Picture or Playnite).
2. **Routing**: browsing → events go to the web UI as `{type:"gamepad", action:"up|down|left|right|select|back|menu|page_l|page_r"}`. Playback → handled directly by the shell for mpv (seek with triggers or stick, play/pause, subtitle/audio quick menus, skip intro), with no round trip through JS.
3. **Spatial focus engine (webmod)**: real D-pad navigation over Stremio Web's DOM, with focus rings, row/column memory, scroll-into-view, Back that unwinds modals → page → home, and a long-press context menu. Kai's own UI (hero banner, metadata panel, details pages) gets proper focus targets.
4. **TV mode**: bigger type, focus-first layout, an on-screen keyboard for search and add-on URLs, starts fullscreen, and hides the mouse cursor while a pad is in use.
5. **TV remotes and keyboard-style remotes**: anything that sends arrows, Enter and Back/Esc (most PC/HTPC remotes and Bluetooth TV remotes) uses the same focus engine for free. HDMI-CEC (the TV's own remote controlling the PC) needs a USB-CEC adapter such as Pulse-Eight with libCEC. That's optional, for later.

---

## 4. Repository layout

```
StremioZ/
  shell/            fork of stremio-community-v5 (upstream remote kept for rebases)
                    + native gamepad, + vf-chain/HDR helpers, rebranding
  mpv/              build recipe / pin for the-database libmpv (later: our patched fork)
  overlay/
    portable_config/  merged Kai config + AnimeJaNai runtime + our scripts
    webmods/          Kai UI + TV mode + focus engine
  tools/assemble/   one script that pulls pinned components (libmpv, aji, models,
                    TensorRT via aji-runtime) and builds the portable folder + installer
  _ref/             upstream reference clones (ignored)
```
Pinned component versions live in one manifest. TensorRT is installed at first run through `aji-runtime`, the same way AnimeJaNai does it, so we never redistribute NVIDIA binaries ourselves.

---

## 5. Phases

| # | Phase | Done when |
|---|---|---|
| 0 | ✅ Repo + build the Community shell locally (vcpkg deps, CMake, VS 2026) | stock shell runs from our tree |
| 1 | ✅ Swap in the-database libmpv; add the AnimeJaNai 3.12 runtime overlay | AnimeJaNai TensorRT upscaling works inside our Stremio (CUDA path). Verified 2026-11-20: 1080p→2160p V3.1 Balanced on native kernels, RTX 5070 Ti |
| 2 | ✅ Merge Kai overlay (UI, scripts); resolve mpv.conf; one vf-chain owner; drop SVP | Kai UI + automation working on top of AnimeJaNai. Verified 2026-11-20 (local files + simulated Stremio metadata; real streams need a signed-in account). RIFE interpolation deferred: needs the 460 MB RIFE component |
| 3 | ✅ Stage A chain (DirectML → RTX HDR), HDR output checks | Verified 2026-11-20: the chain produces 2160p BT.2020/PQ at 24 fps with no drops (5070 Ti). The pipeline, settings and display-HDR detection are in place. Not yet seen on a real HDR display: Windows HDR was off on both monitors during testing. |
| 4 | Stage B: TensorRT on D3D11 frames (CUDA↔D3D11 interop) | TensorRT AnimeJaNai → RTX HDR in real time at 4K |
| 5 | Native gamepad + focus engine + TV mode + on-screen keyboard | whole app usable with only a pad, no mouse/keyboard |
| 6 | Settings UI for all of it (in Kai's settings pages), installer, updater, branding | one-click installer |

### Notes from Phase 0–1
- Layout as built: the repo root **is** the Community fork (remote `upstream` = Zaarrg/stremio-community-v5), with StremioZ additions in `src/stremioz/`, `overlay/` and `tools/`, rather than a `shell/` subfolder. That keeps upstream merges plain `git merge`.
- AnimeJaNai's SPAN models run on libaji's **native CUDA kernels** on sm_80+, so no TensorRT engine build happens for the default profiles. TensorRT is still installed, for custom models and RIFE.
- Stremio's web UI forwards keys to mpv as `CTRL+J` / `SHIFT+2`. Bindings must use that spelling (mpv letter keys are case-sensitive).
- The window opens small on first run. TV mode (Phase 5) should start fullscreen.
- Stremio's web UI: Zaarrg's build is now built from source at a pinned commit (`tools/build-webui.ps1`) and served locally from `webui\`. `stremio.zarg.me` stays as a fallback.

## 6. Constraints to respect

- Everything is GPL-3.0, plus CC BY-NC-SA 4.0 for the AnimeJaNai models. The project must stay **free and non-commercial**, with source published and attribution to Zaarrg, allecsc, the-database and bloc97.
- Don't commit or redistribute TensorRT. Fetch it through `aji-runtime`.
- Kai's webmods are tied to Stremio Web's hashed CSS class names (`*-UPAkA`). A Stremio Web update can break them, so pin the web UI version the shell loads, or add a selector-compatibility layer.
