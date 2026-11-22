--[[
  @name Profile Manager
  @description Hybrid profile system: static base profiles + dynamic layers
  @version 8.6-stremioz
  @author allecsc (StremioZ changes marked "StremioZ")

  @changelog
    v8.6-stremioz - Publishes user-data/stremioz/motion-state ("on", "wanted"
           or "off") for the player's motion smoothing button.
    v8.5-stremioz - Motion smoothing: RIFE frame interpolation in the AnimeJaNai
           chain, to the display's refresh rate (at most 60 fps), through a conf
           written per video (animejanai/stremioz-motion.conf). Setting
           "motion_smoothing"; "stremioz-set-motion yes|no|toggle" for the
           current video, published as user-data/stremioz/motion-choice.
    v8.4-stremioz - "stremioz-set-rtx-hdr yes|no|toggle" switches RTX Video HDR
           for the current video. Manual upscaler / RTX HDR choices are
           published as user-data/stremioz/upscaler-choice and rtx-hdr-choice
           ("value#n"); StremioZ's web side saves them as the defaults for the
           next video. They are also kept in ~~/cache/stremioz-defaults.json for
           videos that arrive without Stremio metadata (local files, URLs).
    v8.3-stremioz - "stremioz-set-upscaler <key>" script message: switches the
           upscaler for the current video and re-applies the chain, on any
           video (a manual choice also upscales non-anime). Used by the preset
           keys (input.conf) and the controller's player menu.
    v8.2-stremioz - TensorRT on D3D11 frames (StremioZ's patched aji_trt): the
           RTX pipeline keeps the user's AnimeJaNai conf (no DirectML copy);
           "auto" picks it whenever an NVIDIA GPU is present.
    v8.1-stremioz - NVIDIA RTX Video: per-session "rtx" pipeline (D3D11:
           AnimeJaNai on DirectML -> RTX Video HDR; live action -> RTX Video
           Super Resolution + HDR in one d3d11vpp pass) or "native" (AnimeJaNai
           TensorRT on Vulkan). RTX HDR only while the window's display is in
           Windows HDR mode (user-data/stremioz/display-hdr from the shell).
    v8.0-stremioz - Single owner of the video filter chain for StremioZ:
           - AnimeJaNai (native vf_animejanai) is the default anime upscaler; the
             filter string is read from mpv-animejanai.conf's [upscale-on] profile.
           - "upscaler" setting: ajn-quality/balanced/performance, a4k-*, off.
           - SVP/VapourSynth removed (CPU frames break the GPU-only chain).
           - hwdec is no longer forced to auto/auto-copy: the decoder AnimeJaNai's
             backend chose (nvdec for TensorRT, d3d11va for DirectML) is kept,
             except for Anime4K + hqdn3d, which needs copy-back decoding.
           - Vulkan toggle removed (the AnimeJaNai backend picks the GPU API).
           - Metadata latch falls back after 3 s (local files have no Stremio metadata).
    v7.3 - AUDIO REVOLUTION (Audiophile Standard):
           - Removed ALL dynamic range compression (loudnorm/acompressor).
           - Removed Content Type split (Anime vs Cinema).
           - Added "Night Mode" (Highpass 70Hz + Lowpass 13kHz + Speech Lift).
           - Added "Voice Clarity" (Dual-band Speech Bias).
           - Default is "Reference" (Bit-perfect passthrough).
    v7.2 - AUDIO & LATCH REFACTOR:
           - Audio: Default mode is now "Off" (Vanilla).
           - Audio: "Night Mode" redesigned (Removed loudnorm, added EQ/Compression).
           - Latch: Strict Parameter Validation (Wait for Primaries/Gamma/Colormatrix).
           - Latch: "Smart Reset" (Freshness check) fixes race condition.
    v7.1 - Added Ultrawide Zoom support (panscan toggle via Stremio metdata)
    v7.0 - ARCHITECTURE REFACTOR: Hybrid static+dynamic approach
           - Base profiles (sdr, anime-sdr) in mpv.conf contain only static settings
           - Dynamic layers (HDR handling, shaders, VF chains) applied via mp.set_property()
           - Eliminates profile inheritance bleeding issues
           - Prepares infrastructure for user-configurable presets
    v6.0 - Cleanup: removed dead language/track code, simplified guard and logging
    v5.0 - Simplified: JS handles all DB detection, Lua only does release groups
    v4.0 - Added release group detection, anti-tier blocking
  
  @requires
    - Stremio Kai's mpv-bridge.js v2.0+ (handles DB-based anime detection with caching)
    - mpv.conf profiles: sdr, anime-sdr (base profiles only)
  
  Architecture:
    1. Base profile applied (sdr or anime-sdr)
    2. HDR layer applied (tonemapping OR passthrough, mutually exclusive)
    3. Anime layers applied (shaders + VF chains)
    4. OSD message set dynamically
--]]

local opts = {
    -- Tier 1: Anime-only release groups (from SeaDex curated list + additional research)
    -- These groups ONLY release anime, so matching = definitely anime
    -- NOTE: Use plain names - the matches_group function handles escaping
    anime_release_groups = {
        -- Anime BD Tier 01-04 (Top SeaDex Muxers)
        "Aergia", "Legion", "sam", "smol", "SoM", "Vanilla", "Vodes",
        "Arg0", "LYS1TH3A", "OZR", "SCY", "ZeroBuild",
        "Alt", "ARC", "Arid", "Crow", "DemiHuman", "Drag", "Lulu", "Metal",
        "Moxie", "Not-Vodes", "Smoke", "Thighs", "Yuki",
        "0x539", "aro", "Baws", "BKC", "Brrrrrrr", "Chotab", "CsS", "CUNNY",
        "Cunnysseur", "D-Z0N3", "Dae", "Datte13", "FLFL", "hydes", "iKaos",
        "JySzE", "LostYears", "Matsya", "MC", "McBalls", "MTBB", "Noyr",
        "NSDAB", "Okay-Subs", "pog42", "pyroneko", "RAI", "Reza", "Shimatta",
        "Spirale", "UDF",
        "Ayashii", "CRUCiBLE", "Dekinai", "EXP", "Headpatter", "Kaizoku",
        "Mysteria", "Senjou", "YURI", "ASC", "AssMix", "B00BA", "CBT", "CTR",
        "CyC", "Flugel", "Galator", "GSK", "Holomux", "IK", "AnimeKaizoku",
        "Kametsu", "KH", "kuchikirukia", "LazyRemux", "MK", "Netaro", "Pn8",
        "Pookie", "Quetzal", "Rasetsu", "ShowY", "WBDP", "WSE", "Yoghurt", "ZOIO", "ZR",
        "Asakura", "Bolshevik", "Bulldog", "Chihiro", "Chimera", "Davinci",
        "Doki", "Foxtrot", "Lia", "Orphan", "SOLA", "Tsundere",
        "9volt", "AOmundson", "ASO", "Cait-Sidhe", "CoalGirls", "Commie", "D3",
        "deanzel", "Dragon-Releases", "GHS", "HaiveMind", "hchcsen", "Kaleido",
        "karios", "kBaraka", "kmplx", "Koitern", "Kulot", "MCLR", "mottoj",
        "NH", "NTRM", "RMX", "SallySubs", "Scriptum", "ShadyCrab", "SNSbu",
        "THORA", "UWU", "xPearse",
        -- Anime BD Tier 05 (Remuxes)
        "VULCAN", "BluDragon", "D4C", "Raizel", "REVO", "SRLS", "TTGA", "PMR",
        "Beatrice-Raws", "Nan0", "Zanros",
        -- Anime BD Tier 06 (FanSubs)
        "Afro", "Akai", "Almighty", "ANE", "CH", "Harunatsu", "Impatience",
        "Judgment", "Kantai", "Nii-sama", "Soldado", "Sushi", "Vivid",
        "Watashi", "Yabai", "Asenshi", "BlurayDesuYo", "Bunny-Apocalypse",
        "EJF", "Exiled-Destiny", "E-D", "FFF", "Final8", "GS", "Inka-Subs",
        "LCE", "Licca", "niizk", "Nishi-Taku", "OnDeed", "orz", "PAS",
        "peachflavored", "Saizen", "SCP-2223", "SHiN-gx", "SmugCat", "Zurako",
        "AnimeChap", "ReinForce", "DDY",
        -- Anime BD Tier 07 (P2P/Scene)
        "NPC", "STRiFE", "A-L", "ANiHLS", "CBM", "DHD", "DragsterPS", "HAiKU",
        "Hark0N", "iAHD", "inid4c", "KS", "KiyoshiStar", "MCR", "RedBlade",
        "RH", "SEV", "TENEIGHTY", "WaLMaRT", "Moozzi",
        -- Anime BD Tier 08 (Mini Encodes)
        "EDGE", "EMBER", "GHOST", "Judas", "naiyas", "Prof", "YURASUKA",
        "AkihitoSubs", "Arukoru", "ASW", "Cleo", "DB", "NeoHVC", "Trix",
        "YuiSubs", "Tenrai-Sensei",
        -- Anime Web Tier 01-06
        "Setsugen", "Z4ST1N", "Cyan", "Gao", "Pizza", "tenshi", "Half-Baked",
        "HatSubs", "MALD", "Slyfox", "SoLCE", "SubsPlease", "SubsPlus", "ZigZag",
        "BlueLobster", "Erai-raws", "GST", "HorribleRips", "HorribleSubs",
        "KAN3D2M", "NanDesuKa", "URANIME", "VARYG", "GJM", "SobsPlease",
        "Some-Stuffs", "DameDesuYo", "KawaSubs", "AC", "AnimeRG", "Anime Time",
        "Sokudo", "zza", "One Pace", "ToonsHub", "Kanjouteki", "stition", "TACHiKEN", "Reaktor", "Godim"
    },

    -- Anti-Tier: General release groups (release all content types)
    -- If JP audio but from these groups → likely NOT anime (live-action)
    general_release_groups = {
        -- WEB Tier 01 (Top P2P)
        "ABBIE", "AJP69", "APEX", "PAXA", "PEXA", "XEPA", "BLUTONiUM",
        "CasStudio", "CMRG", "CRFW", "CRUD", "CtrlHD", "FLUX", "GNOME",
        "HONE", "KiNGS", "Kitsune", "monkee", "NOSiViD", "NTb", "NTG",
        "QOQ", "RTN", "SiC", "TEPES", "TheFarm", "T6D", "TOMMY", "ViSUM",
        -- WEB Tier 02
        "3cTWeB", "BTW", "BYNDR", "Cinefeel", "CiT", "Coo7", "dB", "DEEP",
        "END", "ETHiCS", "FC", "Flights", "iJP", "iKA", "iT00NZ", "JETIX",
        "KHN", "KiMCHI", "LAZY", "MiU", "MZABI", "NPMS", "NYH", "orbitron",
        "PHOENiX", "playWEB", "PSiG", "RAWR", "ROCCaT", "RTFM", "SA89",
        "SbR", "SDCC", "SIGMA", "SMURF", "SPiRiT", "TVSmash", "WELP",
        "XEBEC", "4KBEC", "CEBEX", "TBD",
        -- WEB Tier 03
        "Dooky", "DRACULA", "GNOMiSSiON", "NINJACENTRAL", "SLiGNOME",
        "SwAgLaNdEr", "T4H", "ViSiON", "TrollHD", "REL1VIN",
        -- WEB Scene
        "DEFLATE", "INFLATE",
        -- Remux Tiers (general, not anime-specific)
        "3L", "BiZKiT", "BLURANiUM", "CiNEPHiLES", "FraMeSToR", "PmP",
        "PiRAMiDHEAD", "ZQ", "BMF", "WiLDCAT",
        "ATELiER", "NCmt", "playBD", "SiCFoI", "SURFINBIRD", "12GaugeShotgun",
        "decibeL", "EPSiLON", "HiFi", "KRaLiMaRKo", "PTer", "TRiToN",
        "iFT", "PTP", "SumVision", "TOA", "Tigole",
        -- Bluray Tiers (general)
        "BBQ", "c0kE", "CRiSC", "Dariush", "DON", "EbP", "EDPH", "Geek",
        "LolHD", "MainFrame", "TayTO", "TDD", "TnP", "VietHD", "ZoroSenpai",
        "W4NK3R", "EA", "HiDt", "HiSD", "HQMUX", "sbR", "BHDStudio",
        "hallowed", "LoRD", "SPHD", "WEBDV", "playHD",
        -- Common scene/generic tags
        "G66", "Joy", "Monkee", "NOGRP", "MeGusta", "EVO", "AMIABLE", "SPARKS", "RMTeam", "Qxr",
        "RGzsRutracker", "NeoNoir", "Me7alh", "Lat", "MiNX", "sylix", "Silence", "ION10"
    }
}

-- ═══════════════════════════════════════════════════════════════════════════
-- DYNAMIC LAYER CONSTANTS
-- ═══════════════════════════════════════════════════════════════════════════

-- Shader presets (from original mpv.conf comments)
local SHADER_PRESETS = {
    optimized = "~~/shaders/denoise1.glsl;~~/shaders/Anime4K_Clamp_Highlights.glsl;~~/shaders/Anime4K_Restore_CNN_M.glsl;~~/shaders/Anime4K_Upscale_CNN_x2_M.glsl;~~/shaders/Anime4K_AutoDownscalePre_x2.glsl;~~/shaders/Anime4K_AutoDownscalePre_x4.glsl;~~/shaders/Anime4K_Upscale_Denoise_CNN_x2_M.glsl;~~/shaders/Anime4K_Thin_Fast.glsl",
    fast = "~~/shaders/denoise1.glsl;~~/shaders/Anime4K_Clamp_Highlights.glsl;~~/shaders/Anime4K_Restore_CNN_M.glsl;~~/shaders/Anime4K_Upscale_CNN_x2_M.glsl;~~/shaders/Anime4K_Restore_CNN_S.glsl;~~/shaders/Anime4K_AutoDownscalePre_x2.glsl;~~/shaders/Anime4K_AutoDownscalePre_x4.glsl;~~/shaders/Anime4K_Upscale_CNN_x2_S.glsl;~~/shaders/Anime4K_Thin_HQ.glsl;~~/shaders/Anime4K_Thin_Fast.glsl;~~/shaders/Anime4K_Thin_VeryFast.glsl",
    hq = "~~/shaders/nlmeans.glsl;~~/shaders/Anime4K_Clamp_Highlights.glsl;~~/shaders/Anime4K_Restore_CNN_VL.glsl;~~/shaders/Anime4K_Upscale_CNN_x2_VL.glsl;~~/shaders/Anime4K_Restore_CNN_M.glsl;~~/shaders/Anime4K_AutoDownscalePre_x2.glsl;~~/shaders/Anime4K_AutoDownscalePre_x4.glsl;~~/shaders/Anime4K_Upscale_CNN_x2_M.glsl;~~/shaders/Anime4K_Thin_HQ.glsl;~~/shaders/Anime4K_Thin_Fast.glsl;~~/shaders/Anime4K_Thin_VeryFast.glsl"
}

-- VF components (composable)
local VF_FILTERS = {
    -- Base filters (always applied for anime)
    hqdn3d = '@HQDN3D_HIGH:lavfi=[hqdn3d=luma_spatial=5:chroma_spatial=5:luma_tmp=6:chroma_tmp=6]',
    bwdif = '@BWDIF:lavfi=[bwdif=mode=1:parity=auto:deint=all]',
}

-- StremioZ: upscaler choices. AnimeJaNai built-in slots: 1001 Quality,
-- 1002 Balanced, 1003 Performance (libaji aji_conf.cpp add_builtin_slots).
local UPSCALERS = {
    ["ajn-quality"]     = { kind = "ajn", slot = 1001, label = "AnimeJaNai Quality" },
    ["ajn-balanced"]    = { kind = "ajn", slot = 1002, label = "AnimeJaNai" },
    ["ajn-performance"] = { kind = "ajn", slot = 1003, label = "AnimeJaNai Performance" },
    ["a4k-optimized"]   = { kind = "a4k", preset = "optimized", label = "Anime4K" },
    ["a4k-fast"]        = { kind = "a4k", preset = "fast", label = "Anime4K Fast" },
    ["a4k-hq"]          = { kind = "a4k", preset = "hq", label = "Anime4K HQ" },
    ["off"]             = { kind = "off" },
}
local DEFAULT_UPSCALER = "ajn-balanced"

-- AnimeJaNai's grain shaders, applied after the upscale as in its own defaults.
local AJN_SHADERS = "~~/shaders/noise_static_luma.hook;~~/shaders/noise_static_chroma.hook"

-- The @aji filter string, as AnimeJaNai ships it (mpv-animejanai.conf [upscale-on]).
local ajn_vf_cache = nil
local function ajn_vf_string()
    if ajn_vf_cache then return ajn_vf_cache end
    for _, p in ipairs(mp.get_property_native("profile-list") or {}) do
        if p.name == "upscale-on" then
            for _, o in ipairs(p.options or {}) do
                if o.key == "vf" and o.value and o.value:find("animejanai") then
                    ajn_vf_cache = o.value
                end
            end
        end
    end
    return ajn_vf_cache
end

-- The decoder AnimeJaNai's backend script selected at startup. The web player
-- no longer sets hwdec in StremioZ, so the first value seen is the backend's.
local ajn_hwdec = nil

-- Audio Presets (Audiophile / Non-Destructive)
local AUDIO_FILTERS = {
    -- Night Mode: Aggressive bass cut (120Hz), highs tamed (10kHz), voice boost (+6dB @ 2kHz, Q=2)
    NIGHT = "@NIGHT:lavfi=[highpass=f=120,lowpass=f=10000,equalizer=f=2000:width_type=q:width=2:g=6]",
    
    -- Voice Clarity: Strong intelligibility boost (+8dB @ 2kHz, +6dB @ 4kHz, Q=2)
    VOICE = "@VOICE:lavfi=[highpass=f=80,equalizer=f=2000:width_type=q:width=2:g=8,equalizer=f=4000:width_type=q:width=2:g=6]"
}

-- Audio Cycle State
local audio_state = {
    mode = "off" -- "off" (Default), "night", "voice"
}

-- ═══════════════════════════════════════════════════════════════════════════
-- INTERNAL STATE
-- ═══════════════════════════════════════════════════════════════════════════

local function log(str)
    mp.msg.info("[profile-manager] " .. str)
end

-- Latch State
local state = {
    profile_applied = false,
    video_params_ready = false,
    metadata_ready = false,
    params_cache = nil
}

local utils = require("mp.utils")
local stremio_metadata = nil


-- Forward declaration
local try_execute_profile

-- ═══════════════════════════════════════════════════════════════════════════
-- StremioZ: VIDEO PIPELINE (RTX Video HDR / Super Resolution)
-- ═══════════════════════════════════════════════════════════════════════════
-- NVIDIA RTX Video (d3d11vpp) needs D3D11 frames and a D3D11 renderer, while
-- AnimeJaNai's TensorRT backend produces CUDA frames for a Vulkan renderer.
-- The renderer's GPU API is fixed once mpv opens its video output, so the
-- pipeline is chosen once per session, at the first file:
--   "rtx"    gpu-api=d3d11, hwdec=d3d11va; AnimeJaNai runs on D3D11 frames
--            (TensorRT through StremioZ's patched aji_trt, or DirectML) and can
--            feed RTX Video HDR; live action gets RTX Video Super Resolution
--            (+ HDR) from one d3d11vpp pass.
--   "native" whatever AnimeJaNai's backend chose (TensorRT: nvdec + Vulkan).
-- Setting "video_pipeline": "auto" (rtx when an NVIDIA GPU is present), "rtx",
-- or "native". It is persisted so the next session starts with it even before
-- Stremio's metadata arrives.

local PIPELINE_FILE = "~~/cache/stremioz-pipeline.txt"
local session_pipeline = nil   -- "rtx" / "native", fixed at the first file

local function expand(path)
    return mp.command_native({"expand-path", path})
end

local function read_text(path)
    local f = io.open(expand(path), "r")
    if not f then return nil end
    local s = f:read("*a")
    f:close()
    return s
end

local function write_text(path, text)
    local f = io.open(expand(path), "w")
    if not f then log("Could not write " .. path); return false end
    f:write(text)
    f:close()
    return true
end

local function display_is_hdr()
    -- Published by the StremioZ shell (src/stremioz/display_hdr.cpp). Native
    -- read: as a string, user-data comes back JSON-quoted ("\"yes\"").
    return mp.get_property_native("user-data/stremioz/display-hdr") == "yes"
end

-- StremioZ: the upscaler / RTX Video defaults, for videos without Stremio
-- metadata (local files, plain URLs). Kept in step with the metadata's
-- settings and with manual choices.
local DEFAULTS_FILE = "~~/cache/stremioz-defaults.json"
local function load_defaults()
    local s = read_text(DEFAULTS_FILE)
    return (s and utils.parse_json(s)) or {}
end
local function save_defaults(changes)
    local d = load_defaults()
    local changed = false
    for k, v in pairs(changes) do
        if v ~= nil and d[k] ~= v then d[k] = v; changed = true end
    end
    if changed then write_text(DEFAULTS_FILE, utils.format_json(d)) end
end

local function persist_pipeline_setting(value)
    if value ~= "auto" and value ~= "rtx" and value ~= "native" then return end
    local current = read_text(PIPELINE_FILE)
    if current and current:match("^%s*(%S+)") == value then return end
    write_text(PIPELINE_FILE, value .. "\n")
end

local function nvidia_gpu_present()
    -- The shell publishes the NVIDIA GPU list for AnimeJaNai's scripts
    -- (src/stremioz/animejanai_env.cpp).
    local g = os.getenv("ANIMEJANAI_NVIDIA_GPUS")
    return g ~= nil and g ~= ""
end

local function choose_pipeline(meta_setting)
    local setting = meta_setting
    if not setting then
        local persisted = read_text(PIPELINE_FILE)
        setting = persisted and persisted:match("^%s*(%S+)") or "auto"
    end
    if setting == "rtx" or setting == "native" then return setting, setting end
    return nvidia_gpu_present() and "rtx" or "native", "auto"
end

-- Called at the first start-file, before the video output exists.
local function lock_pipeline(meta_setting)
    if session_pipeline then return end
    local setting
    session_pipeline, setting = choose_pipeline(meta_setting)
    if session_pipeline == "rtx" then
        mp.set_property("gpu-api", "d3d11")
        mp.set_property("hwdec", "d3d11va")
    end
    log(string.format("Video pipeline: %s (setting %s, NVIDIA GPU %s, display HDR %s, gpu-api %s, hwdec %s)",
        session_pipeline, setting, tostring(nvidia_gpu_present()), tostring(display_is_hdr()),
        mp.get_property("gpu-api"), mp.get_property("hwdec")))
end

local function rtx_hdr_wanted(meta)
    -- StremioZ: a choice made during this video wins over the setting.
    if state.override_rtx_hdr ~= nil then return state.override_rtx_hdr end
    return meta.rtx_hdr ~= false
end

local function rtx_hdr_active(meta)
    return session_pipeline == "rtx" and rtx_hdr_wanted(meta) and display_is_hdr()
end

-- ═══════════════════════════════════════════════════════════════════════════
-- StremioZ: MOTION SMOOTHING (RIFE frame interpolation, part of AnimeJaNai)
-- ═══════════════════════════════════════════════════════════════════════════
-- libaji takes RIFE only from a profile's chains in animejanai.conf, and the
-- factor (output frames per source frame) is fixed there. With smoothing on,
-- the AnimeJaNai filter gets a conf StremioZ writes for the video: the user's
-- conf, with Quality / Balanced / Performance (libaji's built-ins, or the
-- user's own [slot_100x]) carrying RIFE on every chain, at the factor that
-- takes this video to the display's refresh rate, at most 60 fps (23.976 fps
-- on a 60 Hz screen: 5/2). RIFE runs before the upscale, at the source size.

local MOTION_CONF = "~~/../animejanai/stremioz-motion.conf"
local USER_AJN_CONF = "~~/../animejanai/animejanai.conf"
local RIFE_MODEL = 426        -- rife_v4.26 (AnimeJaNai Manager's default), in animejanai/rife
local MOTION_MAX_FPS = 60

-- libaji 0.32's built-in slots (src/aji_conf.cpp add_builtin_slots), which a
-- [slot_X] in the file replaces entirely.
local HD_BAL = "2x_AnimeJaNai_HD_V3.1_Balanced_SPANF3_b8f64_unshuffle_fp16"
local HD_PERF = "2x_AnimeJaNai_HD_V3.1_Performance_SPANF3_b5f48_unshuffle_fp16"
local SD_MODEL = "2x_AnimeJaNai_SD_V1beta34_Compact_1x3xHxW_dyn-HW_strong_fp16_op21_dynamo"
local BUILTIN_SLOTS = {
    [1001] = { name = "Quality", preset_key = "quality_preset", chains = {
        { "1280x720", "1920x1080", 31, HD_BAL }, { "0x0", "1280x720", 31, SD_MODEL },
        { "0x0", "1920x1080", 61, HD_BAL } } },
    [1002] = { name = "Balanced", preset_key = "balanced_preset", chains = {
        { "1280x720", "1920x1080", 31, HD_BAL }, { "0x0", "1280x720", 31, SD_MODEL } } },
    [1003] = { name = "Performance", preset_key = "performance_preset", chains = {
        { "1280x720", "1920x1080", 31, HD_PERF }, { "0x0", "1280x720", 31, SD_MODEL } } },
}

local function motion_wanted(meta)
    if state.override_motion ~= nil then return state.override_motion end
    return meta.motion_smoothing == true
end

-- num/den with den <= 5 and num/den at most target/source, closest to it.
-- nil when the video is already near the target rate.
local function motion_factor()
    local src = mp.get_property_number("container-fps") or mp.get_property_number("estimated-vf-fps")
    local disp = mp.get_property_number("display-fps") or mp.get_property_number("estimated-display-fps") or 60
    if not src or src <= 1 then return nil end
    local target = math.min(disp, MOTION_MAX_FPS)
    local r = target / src
    if r < 1.5 then return nil end
    local best_n, best_d, best_err
    for d = 1, 5 do
        local n = math.floor(r * d + 1e-6)
        local err = r - n / d
        if n > d and (not best_err or err < best_err - 1e-9) then
            best_n, best_d, best_err = n, d, err
        end
    end
    if not best_n then return nil end
    if best_n / best_d > 8 then best_n, best_d = 8, 1 end
    return best_n, best_d, src * best_n / best_d
end

-- Sections of an INI file, in order: { name = "global", lines = { ... } }.
local function read_ini_sections(text)
    local sections, cur = {}, nil
    for line in (text or ""):gmatch("[^\r\n]+") do
        local name = line:match("^%s*%[(.-)%]%s*$")
        if name then
            cur = { name = name:lower(), lines = {} }
            table.insert(sections, cur)
        elseif cur then
            table.insert(cur.lines, line)
        end
    end
    return sections
end

local function rife_lines(chain, num, den)
    local p = "chain_" .. chain .. "_"
    return {
        p .. "rife=yes",
        p .. "rife_model=" .. RIFE_MODEL,
        p .. "rife_factor_numerator=" .. num,
        p .. "rife_factor_denominator=" .. den,
        p .. "rife_scene_detect_threshold=0.150",
        p .. "rife_ensemble=no",
        p .. "rife_before_upscale=yes",
    }
end

-- Writes MOTION_CONF for this factor; returns true when written.
local function write_motion_conf(num, den)
    local sections = read_ini_sections(read_text(USER_AJN_CONF))
    local global = {}
    for _, s in ipairs(sections) do
        if s.name == "global" then
            for _, l in ipairs(s.lines) do
                local k, v = l:match("^%s*([%w_]+)%s*=%s*(.-)%s*$")
                if k then global[k:lower()] = v end
            end
        end
    end
    local out = { "; Written by StremioZ for motion smoothing (RIFE " .. num .. "/" .. den ..
                  "), from animejanai.conf. Rewritten for every video; edit animejanai.conf instead." }
    local done = {}
    for _, s in ipairs(sections) do
        local slot = tonumber(s.name:match("^slot_(%d+)$") or "")
        table.insert(out, "[" .. s.name .. "]")
        for _, l in ipairs(s.lines) do
            -- the user's own RIFE keys in a Quality/Balanced/Performance slot give way to ours
            if not (BUILTIN_SLOTS[slot] and l:match("^%s*chain_%d+_rife")) then table.insert(out, l) end
        end
        if BUILTIN_SLOTS[slot] then
            local chains = {}
            for _, l in ipairs(s.lines) do
                local c = l:match("^%s*chain_(%d+)_")
                if c then chains[tonumber(c)] = true end
            end
            for c in pairs(chains) do
                for _, l in ipairs(rife_lines(c, num, den)) do table.insert(out, l) end
            end
            done[slot] = true
        end
    end
    for slot, def in pairs(BUILTIN_SLOTS) do
        if not done[slot] then
            -- "sharp" presets swap the HD models (aji_conf.cpp apply_sharp_presets,
            -- which only touches the built-ins, so it is applied here).
            local sharp = (global[def.preset_key] or ""):lower() == "sharp"
            table.insert(out, "[slot_" .. slot .. "]")
            table.insert(out, "profile_name=" .. def.name .. " + RIFE")
            for i, ch in ipairs(def.chains) do
                local p = "chain_" .. i .. "_"
                local model = ch[4]
                if sharp then model = model:gsub("_HD_V3%.1_", "_HD_V3.1Sharp1_") end
                table.insert(out, p .. "min_resolution=" .. ch[1])
                table.insert(out, p .. "max_resolution=" .. ch[2])
                table.insert(out, p .. "min_fps=0")
                table.insert(out, p .. "max_fps=" .. ch[3])
                table.insert(out, p .. "model_1_name=" .. model)
                for _, l in ipairs(rife_lines(i, num, den)) do table.insert(out, l) end
            end
        end
    end
    return write_text(MOTION_CONF, table.concat(out, "\n") .. "\n")
end

-- StremioZ: tell the web UI about a manual choice so it becomes the default.
-- The counter makes every choice a property change, even a repeated one.
local choice_counter = 0
local function publish_motion_state(value)
    mp.set_property_native("user-data/stremioz/motion-state", value)
end

local function publish_choice(name, value)
    choice_counter = choice_counter + 1
    mp.set_property_native("user-data/stremioz/" .. name, value .. "#" .. choice_counter)
end

-- Stremio metadata bridge
mp.register_script_message("anime-metadata", function(json_str)
    stremio_metadata = utils.parse_json(json_str)
    if stremio_metadata then
        log("Received Stremio metadata:" ..
            " anime=" .. tostring(stremio_metadata.is_anime) .. 
            ", type=" .. tostring(stremio_metadata.content_type) ..
            ", hdr=" .. tostring(stremio_metadata.hdr_passthrough) ..
            ", upscaler=" .. tostring(stremio_metadata.upscaler or stremio_metadata.shader_preset) ..
            ", osd=" .. tostring(stremio_metadata.osd_profile_messages) ..
            ", uw=" .. tostring(stremio_metadata.ultrawide_zoom) ..
            ", pipeline=" .. tostring(stremio_metadata.video_pipeline) ..
            ", rtx_hdr=" .. tostring(stremio_metadata.rtx_hdr) ..
            ", rtx_vsr=" .. tostring(stremio_metadata.rtx_vsr) ..
            ", motion=" .. tostring(stremio_metadata.motion_smoothing))
        -- StremioZ: remember the pipeline choice for the next session's start.
        persist_pipeline_setting(stremio_metadata.video_pipeline)
        save_defaults({ upscaler = stremio_metadata.upscaler,
                        rtx_hdr = stremio_metadata.rtx_hdr,
                        rtx_vsr = stremio_metadata.rtx_vsr,
                        motion_smoothing = stremio_metadata.motion_smoothing })

        state.metadata_ready = true
        state.metadata_arrival = mp.get_time() -- Track arrival time to prevent race-condition wipes
        
        -- Immediate Ultrawide Zoom (safe anytime)
        if stremio_metadata.ultrawide_zoom then
            mp.set_property("panscan", "1.0")
            log("[Ultrawide] Zoom enabled (panscan=1.0)")
        else
            mp.set_property("panscan", "0.0")
        end
        
        -- TRIGGER LATCH
        try_execute_profile()
    end
end)

-- Enhanced HDR detection function
local function detect_hdr(video_params)
    if not video_params then return false end
    
    local primaries = video_params.primaries
    local gamma = video_params.gamma
    local colormatrix = video_params.colormatrix
    
    -- Log the detected values for debugging
    log("Video params - Primaries: " .. tostring(primaries) .. ", Gamma: " .. tostring(gamma) .. ", Colormatrix: " .. tostring(colormatrix))
    
    -- Check for Dolby Vision profile
    if colormatrix == "dolbyvision" then
        log("Dolby Vision detected")
        return true
    end
    
    -- Check for HDR10/HDR10+ via primaries
    if primaries == "bt.2020" or primaries == "rec2020" then
        log("HDR detected via primaries: " .. tostring(primaries))
        return true
    end
    
    -- Check for HDR via gamma/transfer characteristics
    if gamma == "smpte2084" or gamma == "pq" or gamma == "st2084" then
        log("HDR10 detected via gamma: " .. tostring(gamma))
        return true
    end
    
    if gamma == "arib-std-b67" or gamma == "hlg" then
        log("HLG detected via gamma: " .. tostring(gamma))
        return true
    end
    
    -- Additional checks for HDR indicators
    if colormatrix == "bt.2020-ncl" or colormatrix == "bt.2020-cl" or colormatrix == "rec2020" then
        log("HDR detected via colormatrix: " .. tostring(colormatrix))
        return true
    end
    
    return false
end

-- ═══════════════════════════════════════════════════════════════════════════
-- DYNAMIC LAYER HELPER FUNCTIONS
-- ═══════════════════════════════════════════════════════════════════════════

-- Apply SDR baseline settings (safe defaults for SDR content or as a reset)
-- Called at the START of every profile application to ensure clean slate
local function apply_sdr_baseline()
    log("Applying SDR baseline (clean slate)")
    
    -- 0. StremioZ: restore AnimeJaNai's decoder (undoes Anime4K's auto-copy)
    if ajn_hwdec then mp.set_property("hwdec", ajn_hwdec) end

    -- 1. Reset Rendering Chains (prevents bleed-over without resetting global prefs like volume)
    mp.set_property("glsl-shaders", "")   -- Clear all shaders
    mp.set_property("vf", "")             -- Clear video filters
    mp.set_property("af", "")             -- Clear audio filters
    
    -- 2. Reset Colorspace to Neutral/Auto
    mp.set_property("target-colorspace-hint", "no")   -- Don't trigger HDR mode
    mp.set_property("target-peak", "203")             -- SDR peak (100 nits nominal)
    mp.set_property("hdr-compute-peak", "no")         -- Not needed for SDR
    mp.set_property("hdr-contrast-recovery", "0")     -- Not needed for SDR
    mp.set_property("tone-mapping", "auto")           -- Reset tone mapping
end

-- StremioZ: SVP sync policy removed along with SVP.

-- StremioZ: insert AnimeJaNai with the chosen built-in slot. On the RTX
-- pipeline it takes D3D11 frames and writes 4:2:0 output, which the D3D11
-- video processor accepts, optionally followed by RTX Video HDR.
local function apply_animejanai(slot, with_rtx_hdr, with_motion)
    local vf = ajn_vf_string()
    if not vf then
        log("AnimeJaNai filter string not found (mpv-animejanai.conf missing?)")
        return false
    end
    vf = vf:gsub("slot=%d+", "slot=" .. slot)
    -- StremioZ: motion smoothing runs from a conf written for this video.
    local motion_label = nil
    if with_motion then
        local num, den, out_fps = motion_factor()
        if not num then
            log("Motion smoothing: not needed at this frame rate")
        elseif write_motion_conf(num, den) then
            vf = vf:gsub(":conf=[^:]+", ":conf=" .. MOTION_CONF)
            motion_label = string.format("Smooth %d fps", math.floor(out_fps + 0.5))
            log(string.format("Motion smoothing: RIFE %d/%d -> %.3f fps", num, den, out_fps))
        end
    end
    if session_pipeline == "rtx" then
        vf = vf .. ":output-444=no"
    end
    log("Appending VF: AnimeJaNai slot " .. slot .. (session_pipeline == "rtx" and " (D3D11 frames)" or ""))
    mp.commandv("vf", "append", vf)
    -- Not sending "script-message aji-slot": animejanai_slot.lua answers it
    -- with "seek 0 exact" while paused, which would drop Stremio's resume
    -- position. The slot is already in the filter string.
    if with_rtx_hdr then
        mp.commandv("vf", "append", "@rtx:d3d11vpp=nvidia-true-hdr")
        mp.set_property("target-colorspace-hint", "yes")
        log("Appending VF: RTX Video HDR")
    else
        -- AnimeJaNai's grain is tuned for SDR; not applied to RTX HDR output.
        mp.set_property("glsl-shaders", AJN_SHADERS)
    end
    return true, motion_label
end

-- StremioZ: RTX Video Super Resolution and/or HDR for live action, in one
-- d3d11vpp pass. Returns the OSD labels it applied.
local function apply_rtx_video(height, want_vsr, want_hdr)
    local parts, labels = {}, {}
    if want_vsr then
        local display_h = tonumber(mp.get_property("display-height")) or 2160
        local scale = math.min(display_h / math.max(height, 1), 4)
        if scale > 1.05 then
            parts[#parts + 1] = string.format("scale=%.3f", scale)
            parts[#parts + 1] = "scaling-mode=nvidia"
            labels[#labels + 1] = "RTX VSR"
        end
    end
    if want_hdr then
        parts[#parts + 1] = "nvidia-true-hdr"
        labels[#labels + 1] = "RTX HDR"
        mp.set_property("target-colorspace-hint", "yes")
    end
    if #parts > 0 then
        local vf = "@rtx:d3d11vpp=" .. table.concat(parts, ":")
        log("Appending VF: " .. vf)
        mp.commandv("vf", "append", vf)
    end
    return labels
end

-- Apply HDR passthrough settings (for HDR displays)
local function apply_hdr_passthrough(target_peak)
    log("Applying HDR passthrough layer")
    mp.set_property("target-colorspace-hint", "yes")
    mp.set_property("icc-profile-auto", "no")
    mp.set_property("hdr-compute-peak", "yes")
    mp.set_property("hdr-peak-percentile", "99.9")
    mp.set_property("hdr-peak-decay-rate", "20")
    mp.set_property("hdr-contrast-recovery", "0.3")
    mp.set_property("target-contrast", "inf")
    -- Use user-specified target-peak if provided, else auto
    mp.set_property("target-peak", target_peak or "auto")
    log("Target-peak set to: " .. (target_peak or "auto"))
    -- Reset color adjustments for true passthrough
    mp.set_property("brightness", "0")
    mp.set_property("contrast", "0")
    mp.set_property("gamma", "0")
    mp.set_property("saturation", "0")
end

-- Apply HDR-to-SDR tonemapping settings (for SDR displays)
-- ACTIVE PROCESSING: mpv analyzes HDR signal and maps it to SDR range
local function apply_tonemapping()
    log("Applying HDR-to-SDR tonemapping layer")
    mp.set_property("tone-mapping", "bt.2446a")       -- Balanced, good highlight roll-off
    mp.set_property("tone-mapping-param", "0.5")      -- Adjust highlight compression
    mp.set_property("gamut-mapping-mode", "perceptual")
    mp.set_property("tone-mapping-mode", "hybrid")
    
    -- Dynamic peak detection for scene-by-scene adjustments
    mp.set_property("hdr-compute-peak", "yes")        -- Analyze HDR signal
    mp.set_property("hdr-peak-percentile", "99.8")    -- Ignore extreme highlight outliers
    mp.set_property("hdr-peak-decay-rate", "20")      -- Smooth scene-to-scene transitions
    mp.set_property("hdr-contrast-recovery", "0.3")   -- Recover crushed shadows
end

-- Remove denoise shaders from chain (for legacy/HDR anime)
local function remove_denoise_shaders(shader_chain)
    return shader_chain
        :gsub("~~/shaders/denoise1%.glsl;?", "")
        :gsub("~~/shaders/denoise3%.glsl;?", "")
        :gsub("~~/shaders/nlmeans%.glsl;?", "")
        :gsub(";$", "")  -- Clean trailing semicolon
end

-- Apply anime shader preset
local function apply_anime_shaders(preset, is_legacy, is_hdr)
    local shader_chain = SHADER_PRESETS[preset] or SHADER_PRESETS.optimized
    
    -- Legacy and HDR anime: remove denoise shaders
    if is_legacy or is_hdr then
        shader_chain = remove_denoise_shaders(shader_chain)
        log("Removed denoise shaders for " .. (is_legacy and "legacy" or "HDR") .. " content")
    end
    
    log("Applying shader preset: " .. preset)
    mp.set_property("glsl-shaders", shader_chain)
end

-- Apply the Anime4K-path VF chain (hqdn3d, or BWDIF for legacy content).
-- StremioZ: these are CPU (lavfi) filters, so decoding switches to copy-back.
local function apply_anime_vf(is_legacy)
    local base_filter = is_legacy and VF_FILTERS.bwdif or VF_FILTERS.hqdn3d

    local base_name = is_legacy and "BWDIF" or "hqdn3d"
    log("Appending VF Base: " .. base_name)
    mp.set_property("hwdec", "auto-copy")
    mp.commandv("vf", "append", base_filter)
end

-- Extract filename from path/URL
local function get_filename()
    local path = mp.get_property("path") or ""
    -- URL decode common patterns
    path = path:gsub("%%20", " "):gsub("%%5B", "["):gsub("%%5D", "]"):gsub("%%28", "("):gsub("%%29", ")")
    -- Extract filename from path or URL
    local filename = path:match("[^/\\]+$") or path
    return filename
end

-- Check if filename matches any release group with proper word boundaries
-- Patterns checked:
--   1. [GroupName] - bracket format (common for anime fansubs)
--   2. -GroupName. or -GroupName at end - scene format
--   3. (GroupName) - parenthesis format (less common)
local function matches_group(filename, group_list)
    for _, group in ipairs(group_list) do
        -- Escape Lua pattern special chars in group name (except our intentional patterns)
        local escaped = group:gsub("([%(%)%.%%%+%-%*%?%[%]%^%$])", "%%%1")
        
        -- Pattern 1: [GroupName] - bracket format
        if filename:find("%[" .. escaped .. "%]") then
            return group
        end
        
        -- Pattern 2: -GroupName followed by . or end of filename
        if filename:find("%-" .. escaped .. "[%.%s%-%[]") or 
           filename:match("%-" .. escaped .. "$") or
           filename:match("%-" .. escaped .. "%.mkv$") or
           filename:match("%-" .. escaped .. "%.mp4$") then
            return group
        end
        
        -- Pattern 3: x265-GroupName or x264-GroupName (common scene format)
        -- FIXED: Added boundary check to prevent partial matches (e.g. EDGE matching EDGE2020)
        local p3_match = filename:match("x26[45]%-" .. escaped .. "([%.%s%-%[])") or 
                         filename:match("x26[45]%-" .. escaped .. "$") or
                         filename:match("x26[45]%-" .. escaped .. "%.mkv$") or
                         filename:match("x26[45]%-" .. escaped .. "%.mp4$")
        
        if p3_match then
            return group
        end
    end
    return nil
end



-- Visual Identity Application Function
local current_visual_profile = "kai" -- Default tracking

local function apply_visual_settings(profile_name, icc_enabled, is_hdr_passthrough, show_osd)
    -- Update tracking state if a valid profile name is passed
    if profile_name then current_visual_profile = profile_name end
    
    log("[Visuals] Applying Profile: " .. (current_visual_profile or "nil") .. ", ICC: " .. tostring(icc_enabled) .. ", HDR Passthrough: " .. tostring(is_hdr_passthrough))

    -- 1. ICC Profile Logic
    -- FIXED: Force ICC OFF if HDR Passthrough is active (prevents override during cycling)
    if icc_enabled and not is_hdr_passthrough then
        mp.set_property("icc-profile-auto", "yes")
        log("[Visuals] ICC Profile: Validated Auto")
    else
        mp.set_property("icc-profile", "") -- Clears it (sRGB/Monitor Native)
        local reason = is_hdr_passthrough and "Forced OFF (HDR Passthrough)" or "OFF"
        log("[Visuals] ICC Profile: " .. reason)
    end

    -- 2. Color Profile Logic
    
    -- NOTE: We trust the user. If they manually select a profile during HDR playback, apply it.
    -- The "Default to Original" logic is handled int the select_and_apply_profile function.

    if current_visual_profile == "original" then
        mp.set_property("contrast", 0)
        mp.set_property("brightness", 0)
        mp.set_property("saturation", 0)
        mp.set_property("gamma", 0)
        if show_osd then mp.osd_message("Color Profile: Original (Neutral)") end
    elseif current_visual_profile == "vivid" then
        mp.set_property("contrast", 5)
        mp.set_property("brightness", -4)
        mp.set_property("saturation", 15)
        mp.set_property("gamma", -2)
        if show_osd then mp.osd_message("Color Profile: Vivid (High Contrast)") end
    else -- "kai" (default)
        mp.set_property("contrast", 2)
        mp.set_property("brightness", -6)
        mp.set_property("saturation", 2)
        mp.set_property("gamma", 2)
        if show_osd then mp.osd_message("Color Profile: Kai (Cinematic)") end
    end
end

mp.register_script_message("cycle-visual-profile", function()
    -- Check for HDR Passthrough PREFERENCE (logging only)
    -- But we no longer block the user based on it.

    -- Cycle logic: Kai -> Vivid -> Original -> Kai
    if current_visual_profile == "kai" then
        current_visual_profile = "vivid"
    elseif current_visual_profile == "vivid" then
        current_visual_profile = "original"
    else
        current_visual_profile = "kai"
    end
    
    -- Re-apply with current state (preserve ICC setting)
    -- We can retrieve current passthrough state from metadata for logging transparency
    local is_hdr_passthrough = stremio_metadata and stremio_metadata.hdr_passthrough
    local icc_enabled = stremio_metadata and stremio_metadata.icc_profile
    apply_visual_settings(current_visual_profile, icc_enabled, is_hdr_passthrough, true)
end)

-- Helper to apply audio filter non-destructively
local function apply_audio_current()
    -- 1. Remove existing preset (by label) to avoid stacking or conflicts
    mp.commandv("af", "remove", "@NIGHT")
    mp.commandv("af", "remove", "@VOICE")

    -- 2. Determine target filter based on state
    local target_filter = nil
    local osd_name = "Off (Pass-Through)"

    if audio_state.mode == "night" then
        target_filter = AUDIO_FILTERS.NIGHT
        osd_name = "Night Mode"
    elseif audio_state.mode == "voice" then
        target_filter = AUDIO_FILTERS.VOICE
        osd_name = "Voice Clarity"
    else
        -- "off", do nothing (filter already removed)
        osd_name = "Off (Pass-Through)"
    end

    -- 3. Apply if exists
    if target_filter then
        mp.commandv("af", "add", target_filter)
    end

    return osd_name
end

mp.register_script_message("cycle-audio-preset", function()
    -- Cycle Logic: OFF -> NIGHT -> VOICE -> OFF
    if audio_state.mode == "off" then
        audio_state.mode = "night"
    elseif audio_state.mode == "night" then
        audio_state.mode = "voice"
    else
        audio_state.mode = "off"
    end
    
    local name = apply_audio_current()
    mp.osd_message("Audio: " .. name)
    log("[Audio] Cycled to: " .. name)
end)


-- ═══════════════════════════════════════════════════════════════════════════
-- MAIN EXECUTION LATCH
-- ═══════════════════════════════════════════════════════════════════════════

function try_execute_profile()
    -- 1. Check Latch Conditions
    if state.profile_applied then return end
    
    if not state.video_params_ready then
        -- Still waiting for MPV to analyze file
        return 
    end
    
    if not state.metadata_ready and not state.metadata_timed_out then
        -- Waiting for Stremio metadata (Strict Latch)
        log("Latch: Waiting for Metadata...")
        -- StremioZ: local files and magnets never get Stremio metadata; decide
        -- from the file name (release groups) after a short wait instead of
        -- leaving the profile unapplied.
        if not state.metadata_timer then
            state.metadata_timer = mp.add_timeout(3, function()
                state.metadata_timer = nil
                if not state.profile_applied and not state.metadata_ready then
                    log("Latch: no Stremio metadata after 3 s, using file name only")
                    state.metadata_timed_out = true
                    try_execute_profile()
                end
            end)
        end
        return
    end
    
    -- 2. Lock Latch
    state.profile_applied = true

    
    -- 3. Prepare Data
    local video_params = state.params_cache
    
    log("--- Starting Profile Application ---")
    log("Metadata Ready: " .. tostring(state.metadata_ready))
    
    -- Extract video info
    local height = video_params.h
    local is_interlaced = video_params.interlaced or false
    local is_hdr = detect_hdr(video_params)
    local filename = get_filename()
    
    -- The Decision Logic (Tiered Approach)
    local is_anime = false
    local detection_reason = "None"

    -- TIER 0: Stremio Metadata
    if stremio_metadata and stremio_metadata.is_anime then
        is_anime = true
        detection_reason = "Stremio: " .. (stremio_metadata.detection_reason or "Unknown")
        log("STREMIO MATCH: " .. detection_reason)
    end

    -- TIER 1: Known Anime Release Group
    if not is_anime then
        local matched_group = matches_group(filename, opts.anime_release_groups)
        if matched_group then
            is_anime = true
            detection_reason = "Release Group: " .. matched_group
            log("TIER 1 MATCH: " .. detection_reason)
        end
    end

    -- ANTI-TIER: Block detection if from Known General Release Group
    if not is_anime then
        local blocked_by = matches_group(filename, opts.general_release_groups)
        if blocked_by then
            log("ANTI-TIER: " .. blocked_by)
            detection_reason = "Default (General group: " .. blocked_by .. ")"
        end
    end

    -- ═══════════════════════════════════════════════════════════════════════
    -- HYBRID PROFILE SYSTEM
    -- ═══════════════════════════════════════════════════════════════════════
    
    -- Get preferences (safely handle nil if metadata never arrived)
    -- StremioZ: without Stremio metadata, the saved upscaler / RTX defaults.
    local meta = stremio_metadata or load_defaults()
    local hdr_passthrough = meta.hdr_passthrough or false
    local color_profile = meta.color_profile or "kai"
    local icc_profile_enabled = meta.icc_profile
    local target_peak = meta.target_peak or "auto"

    local is_legacy_anime = is_anime and is_interlaced and height <= 576

    -- StremioZ: one upscaler setting. Older payloads only carry Kai's
    -- shader_preset; map it so a Kai-era profile keeps working.
    local upscaler_key = state.override_upscaler or meta.upscaler
    state.detected_anime = is_anime
    if state.override_upscaler and state.override_upscaler ~= "off" and not is_anime then
        -- StremioZ: an upscaler chosen by hand (keys / controller quick menu)
        -- applies even when the file wasn't detected as anime.
        is_anime = true
        detection_reason = "Chosen by hand"
    end
    if not upscaler_key and meta.shader_preset then
        upscaler_key = (meta.shader_preset == "none") and "off" or ("a4k-" .. meta.shader_preset)
    end
    local upscaler = UPSCALERS[upscaler_key or DEFAULT_UPSCALER] or UPSCALERS[DEFAULT_UPSCALER]
    -- AnimeJaNai models are trained on SDR BT.709 anime: never run them on HDR.
    if upscaler.kind == "ajn" and is_hdr then
        log("AnimeJaNai skipped: HDR source")
        upscaler = UPSCALERS["off"]
    end

    -- Determine base profile
    local base_profile = is_anime and "anime-sdr" or "sdr"
    
    -- Build OSD message
    local osd_parts = {}
    if is_anime then
        table.insert(osd_parts, "Anime")
        if is_legacy_anime then table.insert(osd_parts, "Legacy") end
    else
        table.insert(osd_parts, "Cinema")
    end
    if is_hdr then
        table.insert(osd_parts, hdr_passthrough and "HDR" or "HDR→SDR")
    end
    if is_anime and upscaler.label then
        table.insert(osd_parts, upscaler.label)
    end

    -- APPLY
    log("--- FINAL DECISION ---")
    log("Reason: " .. detection_reason)
    log("HDR Status: " .. tostring(is_hdr) .. ", Passthrough: " .. tostring(hdr_passthrough))
    log("Resolution: " .. tostring(height) .. "p")
    log("Legacy Anime: " .. tostring(is_legacy_anime))
    log("Upscaler: " .. tostring(upscaler_key or DEFAULT_UPSCALER) .. " (" .. upscaler.kind .. ")")

    apply_sdr_baseline()
    
    log("Applying base: " .. base_profile)
    mp.commandv("apply-profile", base_profile)
    
    local is_passthrough_active = false
    if is_hdr then
        if hdr_passthrough then
            apply_hdr_passthrough(target_peak)
            is_passthrough_active = true
        else
            apply_tonemapping()
        end
    end
    
    -- StremioZ: RTX Video on SDR sources (RTX pipeline only). Anime4K's CPU
    -- filters need copy-back frames, which the D3D11 video processor can't take.
    local rtx_ok = session_pipeline == "rtx" and not is_hdr and
                   not (is_anime and upscaler.kind == "a4k") and not is_legacy_anime
    local use_rtx_hdr = rtx_ok and rtx_hdr_active(meta)
    local use_rtx_vsr = rtx_ok and not is_anime and meta.rtx_vsr ~= false

    if is_passthrough_active or use_rtx_hdr then
        color_profile = "original"
        log((use_rtx_hdr and "RTX Video HDR" or "HDR Passthrough") .. ": Forcing 'original' colors")
    end

    apply_visual_settings(color_profile, icc_profile_enabled, is_passthrough_active or use_rtx_hdr, false)

    local motion_running = false
    if is_anime then
        if upscaler.kind == "ajn" then
            -- Legacy interlaced SD: GPU deinterlacing keeps frames on the GPU.
            if is_legacy_anime then mp.set_property("deinterlace", "yes") end
            local ok, motion_label = apply_animejanai(upscaler.slot, use_rtx_hdr, motion_wanted(meta))
            if ok then
                state.ajn_active = true
                if motion_label then table.insert(osd_parts, motion_label); motion_running = true end
                if use_rtx_hdr then table.insert(osd_parts, "RTX HDR") end
            else
                apply_anime_shaders("optimized", is_legacy_anime, is_hdr and hdr_passthrough)
            end
        elseif upscaler.kind == "a4k" then
            apply_anime_shaders(upscaler.preset, is_legacy_anime, is_hdr and hdr_passthrough)
            apply_anime_vf(is_legacy_anime)
        elseif is_legacy_anime then
            apply_anime_vf(true)
        elseif use_rtx_hdr then
            for _, l in ipairs(apply_rtx_video(height, false, true)) do table.insert(osd_parts, l) end
        end
    elseif use_rtx_vsr or use_rtx_hdr then
        for _, l in ipairs(apply_rtx_video(height, use_rtx_vsr, use_rtx_hdr)) do table.insert(osd_parts, l) end
    end

    -- StremioZ: for the player's motion smoothing button. "on" = RIFE runs,
    -- "wanted" = on, but this video doesn't get it (not anime / AnimeJaNai,
    -- or already at the display rate), "off".
    publish_motion_state(motion_running and "on" or (motion_wanted(meta) and "wanted" or "off"))

    audio_state.mode = meta.audio_preset or "off"
    apply_audio_current()

    -- OSD
    local show_osd = meta.osd_profile_messages
    if show_osd == nil then show_osd = true end
    
    if show_osd then
        local osd_msg = "• " .. table.concat(osd_parts, " • ") .. " •"
        mp.set_property("osd-playing-msg", osd_msg)
        mp.osd_message(osd_msg, 3)
    else
        mp.set_property("osd-playing-msg", "")
    end
    
    log("Profile applied successfully.")
end


-- StremioZ: change the upscaler for the current video (input.conf keys and the
-- controller quick menu). Re-runs the chain instead of `apply-profile
-- upscale-on`, which would replace the whole vf (dropping RTX Video HDR and
-- the RTX pipeline's output-444=no).
mp.register_script_message("stremioz-set-upscaler", function(key)
    if not UPSCALERS[key] then
        log("Unknown upscaler: " .. tostring(key))
        return
    end
    state.override_upscaler = key
    mp.osd_message(key == "off" and "Upscaler: off" or ("Upscaler: " .. (UPSCALERS[key].label or key)), 2)
    -- The anime default follows the last choice; "off" on a video that isn't
    -- anime says nothing about anime.
    if key ~= "off" or state.detected_anime then
        publish_choice("upscaler-choice", key)
        save_defaults({ upscaler = key })
    end
    if state.video_params_ready then
        state.profile_applied = false
        state.metadata_timed_out = true   -- don't wait for metadata again
        try_execute_profile()
    end
end)

-- StremioZ: RTX Video HDR on/off for this video (player menu, Ctrl+H).
mp.register_script_message("stremioz-set-rtx-hdr", function(value)
    local meta = stremio_metadata or load_defaults()
    local on
    if value == "toggle" then on = not rtx_hdr_wanted(meta)
    else on = (value == "yes" or value == "true" or value == "on") end
    state.override_rtx_hdr = on
    publish_choice("rtx-hdr-choice", on and "yes" or "no")
    save_defaults({ rtx_hdr = on })
    local note = ""
    if on and session_pipeline ~= "rtx" then note = " (needs the RTX Video pipeline: Settings > Player)"
    elseif on and not display_is_hdr() then note = " (turn on Windows HDR for this display)" end
    mp.osd_message("RTX HDR: " .. (on and "on" or "off") .. note, 3)
    if state.video_params_ready then
        state.profile_applied = false
        state.metadata_timed_out = true
        try_execute_profile()
    end
end)

-- StremioZ: motion smoothing (RIFE) on/off for this video (player menu, Ctrl+M).
-- Applies to anime upscaled by AnimeJaNai.
mp.register_script_message("stremioz-set-motion", function(value)
    local meta = stremio_metadata or load_defaults()
    local on
    if value == "toggle" then on = not motion_wanted(meta)
    else on = (value == "yes" or value == "true" or value == "on") end
    state.override_motion = on
    publish_choice("motion-choice", on and "yes" or "no")
    save_defaults({ motion_smoothing = on })
    local note = ""
    if on and not state.ajn_active then note = " (with AnimeJaNai, on anime)" end
    mp.osd_message("Motion smoothing: " .. (on and "on" or "off") .. note, 3)
    if state.video_params_ready then
        state.profile_applied = false
        state.metadata_timed_out = true
        try_execute_profile()
    end
end)

-- Observer for video-params (Phase 1 of Latch)
mp.observe_property('video-params', 'native', function(_, params)
    -- STRICT VALIDATION: Ignore partial updates.
    -- We must have ALL components needed by detect_hdr before burning the latch.
    if not params or 
       not params.primaries or 
       not params.gamma or 
       not params.colormatrix then 
        return 
    end
    
    -- Cache params for execution
    state.params_cache = params
    state.video_params_ready = true
    
    -- TRIGGER LATCH
    try_execute_profile()
end)


-- Reset state on new file
mp.register_event('start-file', function()
    -- Clear previous state
    state.profile_applied = false
    state.video_params_ready = false
    state.params_cache = nil
    state.metadata_timed_out = false
    state.override_upscaler = nil
    state.override_rtx_hdr = nil
    state.override_motion = nil
    state.ajn_active = nil
    state.detected_anime = nil
    if state.metadata_timer then state.metadata_timer:kill(); state.metadata_timer = nil end
    -- StremioZ: fix the video pipeline for this session before the first
    -- video output opens (uses the setting from fresh metadata, else the
    -- persisted one).
    if not session_pipeline then
        local fresh = state.metadata_ready and (mp.get_time() - (state.metadata_arrival or 0) < 2.0)
        lock_pipeline(fresh and stremio_metadata and stremio_metadata.video_pipeline or nil)
    end
    -- StremioZ: remember AnimeJaNai's decoder (or the RTX pipeline's d3d11va)
    -- before anything changes it.
    if not ajn_hwdec then
        ajn_hwdec = mp.get_property("hwdec")
        log("AnimeJaNai decoder: " .. tostring(ajn_hwdec))
    else
        -- Open this file's decoder with it too (the previous file may have
        -- switched to copy-back for Anime4K), instead of re-opening it later.
        mp.set_property("hwdec", ajn_hwdec)
    end
    mp.set_property("deinterlace", "no")
    -- StremioZ: drop the previous file's upscaler before this file's chain is
    -- built, so it never runs on content that turns out not to be anime.
    mp.set_property("vf", "")
    mp.set_property("glsl-shaders", "")
    
    -- Clear stale OSD from previous session
    mp.set_property("osd-playing-msg", "")
    
    -- Smart Metadata Clear: Only clear if it didn't just arrive
    -- This fixes the race condition where metadata arrives milliseconds before start-file
    local now = mp.get_time()
    local arrival = state.metadata_arrival or 0
    if state.metadata_ready and (now - arrival < 2.0) then
        log("Preserving fresh metadata received " .. string.format("%.3f", now - arrival) .. "s ago")
        -- Keep stremio_metadata and state.metadata_ready = true
    else
        state.metadata_ready = false
        stremio_metadata = nil
    end
    
    log("State reset. Waiting for latch (params + metadata)...")
end)
