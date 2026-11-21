<p align="center">
  <img src="images/stremioz.png" alt="StremioZ" width="128" />
</p>
<h1 align="center">StremioZ</h1>

<p align="center">Stremio for the couch on Windows: AnimeJaNai upscaling, NVIDIA RTX Video HDR, the Stremio Kai interface and full game-controller control.</p>

StremioZ combines four projects into one app:
- **[Stremio Community v5](https://github.com/Zaarrg/stremio-community-v5)** by Zaarrg: the WebView2 + mpv desktop shell;
- **[Stremio Kai](https://github.com/allecsc/Stremio-Kai)** by allecsc: the interface, metadata and playback automation;
- **[AnimeJaNai](https://github.com/the-database/mpv-upscale-2x_animejanai)** by the-database: real-time AI upscaling for anime;
- **NVIDIA RTX Video HDR** running in the same chain as AnimeJaNai, plus native controller support for a PC connected to a TV.

## Features

- **AnimeJaNai upscaling** for anime (Quality, Balanced, Performance), picked automatically from Stremio's metadata. The last preset you choose while watching becomes the default.
- **RTX Video HDR and Super Resolution** on NVIDIA RTX GPUs, together with AnimeJaNai: TensorRT runs on Direct3D 11 frames, so 4K Quality with RTX HDR plays at 60 fps.
- **Game controllers**: Xbox, PlayStation, Switch Pro and most others, through SDL3. Every screen works with a pad: an on-screen keyboard for search, a player menu for subtitles, audio, speed, upscaler and HDR, and button hints with the right glyphs.
- **TV mode**: fullscreen, no cursor, and an interface scaled for a TV at high Windows scaling. The **StremioZ TV mode** shortcut opens straight into it.
- **For You**: the home banner recommends shows from your own watch history (AniList for anime, Cinemeta genres for the rest). No API keys needed.
- **Stremio Kai's interface**: themes, hero banner, enhanced metadata and ratings, smart audio and subtitle selection, skip intro.
- Everything from Stremio Community: native mpv playback, HDR passthrough, Discord presence, thumbnail previews, local files and torrents.
- **Automatic updates**, signed, from this repository's releases.

## Install

Download `StremioZ-Setup-<version>.exe` from [Releases](https://github.com/roshanarunk/StremioZ/releases) and run it. It installs for your user only (no admin prompt) and adds:
- **StremioZ** and **StremioZ TV mode** to the Start menu (and optionally the desktop);
- optionally NVIDIA TensorRT for AnimeJaNai (about 0.7 GB, downloaded from NVIDIA's packages by AnimeJaNai's `aji-runtime`; recommended on RTX GPUs).

Windows SmartScreen may warn about an unrecognised app, since the installer isn't code-signed. Choose **More info → Run anyway**.

Settings for all of it live in Stremio's **Settings**: the **StremioZ** section (controller, TV mode, interface size, recommendations, updates) and **Player** (AnimeJaNai, RTX Video HDR, Super Resolution).

### Requirements

- Windows 10 or 11, 64-bit.
- AnimeJaNai and RTX Video need an NVIDIA RTX GPU (RTX 30 series or newer is best). Other GPUs play normally, with Anime4K shaders for anime.
- RTX Video HDR needs Windows HDR turned on for the display.

## Controller

| Button | Browsing | Player |
|---|---|---|
| D-pad / left stick | Move | Seek ◀ ▶, control bar ▲ ▼ |
| A | Select | Play / pause |
| B | Back / close | Close menu, else leave the player |
| X | Search | Skip intro |
| Y | Home | Player menu |
| LB / RB | Previous / next page | Speed −/+ |
| LT / RT | Jump three items | Seek −/+ 85 s |
| Right stick | Scroll | Volume |

The full table is in [docs/STREMIOZ.md](docs/STREMIOZ.md#controller-and-tv-mode).

## Building

See [docs/STREMIOZ.md](docs/STREMIOZ.md) for building from source, and [docs/RELEASE.md](docs/RELEASE.md) for making a release.

## Credits

StremioZ stands on the work of others. Please support them:
- **Zaarrg**: [Stremio Community v5](https://github.com/Zaarrg/stremio-community-v5), the shell this is a fork of, and the Stremio web build it uses.
- **allecsc**: [Stremio Kai](https://github.com/allecsc/Stremio-Kai) ([Ko-fi](https://ko-fi.com/allecsc)).
- **the-database**: [AnimeJaNai](https://github.com/the-database/mpv-upscale-2x_animejanai), its models, libmpv build and inference runtime.
- **bloc97**: [Anime4K](https://github.com/bloc97/Anime4K).
- **Stremio** and the **mpv** developers.

StremioZ isn't affiliated with Stremio, NVIDIA or any of the projects above.

## License

GPL-3.0 (see [LICENSE.md](LICENSE.md)), like Stremio Community and Stremio Kai. The AnimeJaNai models are licensed CC BY-NC-SA 4.0: StremioZ is free and non-commercial, and must stay that way. TensorRT is NVIDIA's and is never redistributed here.
