#pragma once
#include <string>

struct ICoreWebView2_3;

// StremioZ: a pinned copy of the Stremio web UI shipped in <exe>\webui (built
// from Zaarrg/stremio-web-shell-fixes, see tools/build-webui.ps1) and served
// through a WebView2 virtual host. Stremio Kai's theme targets that build's
// CSS class names, so pinning it keeps the theme from breaking when the
// hosted build changes. The remote URLs stay as fallbacks.

// https://<host>/index.html when <exe>\webui\index.html exists, else empty.
std::wstring LocalWebUiUrl();

// True when url is the local web UI (no network reachability check needed).
bool IsLocalWebUiUrl(const std::wstring& url);

// Maps the virtual host onto <exe>\webui. Call once the webview exists.
void MapLocalWebUi(ICoreWebView2_3* webview);

// Set by --webui-url=: an explicit URL wins over the local copy.
extern bool g_webuiUrlFromCommandLine;
