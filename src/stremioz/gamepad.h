#pragma once
#include <windows.h>

// StremioZ: native game controller input (SDL3 gamepad API: Xbox, PlayStation,
// Switch Pro and generic pads, hot-plug). Runs on its own thread and hands
// presses, auto-repeats and releases to the UI thread, which forwards them to
// the web UI as {type: "stremioz-gamepad", button, state, pad} messages while
// StremioZ is the foreground window (so a game in another window keeps its
// input). The web side (webmods/StremioZ/tv-navigation.js) decides what each
// button does on the current screen.

#define WM_STREMIOZ_GAMEPAD (WM_APP + 0x5A0)

void StartGamepad(HWND hwnd);
void StopGamepad();

// UI thread: handle a WM_STREMIOZ_GAMEPAD message.
void HandleGamepadMessage(WPARAM wParam, LPARAM lParam);
