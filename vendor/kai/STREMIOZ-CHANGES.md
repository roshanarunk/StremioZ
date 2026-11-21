# Stremio Kai in StremioZ

`portable_config/` here is [allecsc/Stremio-Kai](https://github.com/allecsc/Stremio-Kai) (GPL-3.0, see `LICENSE.md`):
- scripts, script-opts and webmods are from repo commit `a5a2a37` (2026-08-05), which is newer than the v4.8.0 release;
- `shaders/` and `fonts/` are from the v4.8.0 release archive.

Kai is the work of allecsc. If you enjoy its UI, consider supporting the author: https://ko-fi.com/allecsc

To see exactly what StremioZ changed, diff this folder against Kai at `a5a2a37`. Every edit is marked `StremioZ`.

## Changes

| File | Change |
|---|---|
| `scripts/profile-manager.lua` | v8.4-stremioz: `stremioz-set-rtx-hdr` switches RTX Video HDR for the current video. Manual upscaler and RTX HDR choices are published to the web UI, which keeps them as the defaults, and saved in `cache/stremioz-defaults.json` for videos without Stremio metadata. v8.3-stremioz: a `stremioz-set-upscaler` script message switches the upscaler for the current video (preset keys, controller menu). v8.2-stremioz: the RTX Video pipeline runs AnimeJaNai on TensorRT with D3D11 frames (patched aji_trt), and "auto" picks it on any NVIDIA GPU. v8.1-stremioz added the per-session RTX Video pipeline (D3D11 + RTX Video HDR/VSR, or Vulkan), using the shell-published display HDR state. v8.0-stremioz: It is the single owner of `vf`.<br>AnimeJaNai (`@aji`, with the filter string read from mpv-animejanai.conf) is the default anime upscaler. The "upscaler" setting picks `ajn-quality` / `ajn-balanced` / `ajn-performance` / `a4k-*` / `off`.<br>SVP removed. hwdec is no longer forced; AnimeJaNai's decoder (nvdec) is kept, except Anime4K + hqdn3d, which uses copy-back.<br>Filters are cleared at file start. AnimeJaNai never runs on HDR. Legacy SD gets GPU deinterlacing.<br>If no Stremio metadata arrives within 3 s (local files), it decides from the file name. |
| `webmods/Settings/mpv-settings.js` | "Anime Upscaler" dropdown replaces "Anime4K Shaders" and the SVP toggle. "SVP for all content" and "Use Vulkan Rendering" removed. Display section adds "Video Pipeline", "RTX Video HDR" and "RTX Video Super Resolution". Stored as `stremioz-upscaler`; a Kai-era Anime4K choice migrates. |
| `webmods/Metadata/Services/mpv-bridge.js` | Sends `upscaler`, `video_pipeline`, `rtx_hdr` and `rtx_vsr`; drops the `svp_*` and `vulkan_mode` fields. |
| `webmods/UI/welcome-wizard.js` | The anime step chooses the upscaler; SVP step removed. |
| `webmods/Settings/custom-shortcuts.js` | AnimeJaNai keys listed; SVP keys removed. The gamepad sections describe StremioZ's controller layout. |
| `webmods/UI/Hero Banner/modules/config.js`, `catalog-service.js` | A "For You" source (index 1, so it is the default for movies and series) asks `webmods/StremioZ/hero-for-you.js` for titles picked from the user's watch history. When one source returns nothing, its slots go to the other. |
| `webmods/Utilities/navigation.js` | The browser Gamepad API poller is off: StremioZ's native controller input (`webmods/StremioZ/tv-navigation.js`) replaces it. Keyboard navigation is unchanged. |
| removed | `svp_*.vpy`, `script-opts/svp.conf`, `scripts/svp_cleanup.lua`, `scripts/reactive_vf_bypass.lua` (SVP).<br>`webmods/UI/update-notification.*`: checks Kai's releases, not StremioZ's.<br>`webmods/UI/donation-manager.js`: Kai's donation prompt, credited above instead. |
| `mpv.conf`, `input.conf`, `stremio-settings.ini` | Kept as `*.kai-original` beside this file. The live versions are merged into `overlay/portable_config/`. |
