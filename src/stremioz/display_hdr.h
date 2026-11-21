#pragma once
#include <windows.h>

// StremioZ: tells mpv whether the monitor showing the window is in Windows HDR
// mode, as the property user-data/stremioz/display-hdr ("yes"/"no").
// profile-manager.lua only adds NVIDIA RTX Video HDR when it is "yes" (on an
// SDR desktop the HDR output would just be tone-mapped back), and "Auto"
// pipeline selection uses it at startup.
//
// Call after mpv is initialised and whenever the window may have changed
// monitor or the display configuration changed. Cheap; only writes on change.
void PublishDisplayHdr(HWND hwnd);
