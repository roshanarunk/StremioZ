# Stremio Kai in StremioZ

`portable_config/` here is [allecsc/Stremio-Kai](https://github.com/allecsc/Stremio-Kai) (GPL-3.0, see `LICENSE.md`):
- scripts, script-opts and webmods are from repo commit `a5a2a37` (2026-08-05), which is newer than the v4.8.0 release;
- `shaders/` and `fonts/` are from the v4.8.0 release archive.

Kai is the work of allecsc. If you enjoy its UI, consider supporting the author: https://ko-fi.com/allecsc

To see exactly what StremioZ changed, diff this folder against Kai at `a5a2a37`. Every edit is marked `StremioZ`.

## Changes

| File | Change |
|---|---|
| `scripts/profile-manager.lua` | v8.0-stremioz. It is the single owner of `vf`.<br>AnimeJaNai (`@aji`, with the filter string read from mpv-animejanai.conf) is the default anime upscaler. The "upscaler" setting picks `ajn-quality` / `ajn-balanced` / `ajn-performance` / `a4k-*` / `off`.<br>SVP removed. hwdec is no longer forced; AnimeJaNai's decoder (nvdec) is kept, except Anime4K + hqdn3d, which uses copy-back.<br>Filters are cleared at file start. AnimeJaNai never runs on HDR. Legacy SD gets GPU deinterlacing.<br>If no Stremio metadata arrives within 3 s (local files), it decides from the file name. |
| `webmods/Settings/mpv-settings.js` | "Anime Upscaler" dropdown replaces "Anime4K Shaders" and the SVP toggle. "SVP for all content" and "Use Vulkan Rendering" removed. Stored as `stremioz-upscaler`; a Kai-era Anime4K choice migrates. |
| `webmods/Metadata/Services/mpv-bridge.js` | Sends `upscaler`; drops the `svp_*` and `vulkan_mode` fields. |
| `webmods/UI/welcome-wizard.js` | The anime step chooses the upscaler; SVP step removed. |
| `webmods/Settings/custom-shortcuts.js` | AnimeJaNai keys listed; SVP keys removed. |
| removed | `svp_*.vpy`, `script-opts/svp.conf`, `scripts/svp_cleanup.lua`, `scripts/reactive_vf_bypass.lua` (SVP).<br>`webmods/UI/update-notification.*`: checks Kai's releases, not StremioZ's.<br>`webmods/UI/donation-manager.js`: Kai's donation prompt, credited above instead. |
| `mpv.conf`, `input.conf`, `stremio-settings.ini` | Kept as `*.kai-original` beside this file. The live versions are merged into `overlay/portable_config/`. |
