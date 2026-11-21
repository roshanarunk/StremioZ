#pragma once
#include <windows.h>

// StremioZ: interface scale for TVs. A 4K TV at 300 % Windows scaling gives the
// web UI a 1280x720 CSS viewport, where Stremio Kai's layout (made for 1080p
// and up) runs out of room: the hero banner overlaps the rows and buttons look
// oversized. In fullscreen on such a display, the WebView2 zoom is set so the
// UI lays out at about 1080 CSS pixels tall. Media queries and layout follow,
// as with browser zoom; text stays sharp.
//
// stremio-settings.ini, [StremioZ] UiScale:
//   auto (default)  fullscreen and a display under 1000 logical pixels tall
//   off             never
//   0.5 ... 1.0     this zoom factor, always
void ApplyUiScale(HWND hwnd);
