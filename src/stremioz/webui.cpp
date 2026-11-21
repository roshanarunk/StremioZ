#include "webui.h"

#include <windows.h>
#include <WebView2.h>
#include <iostream>
#include "../utils/helpers.h"

bool g_webuiUrlFromCommandLine = false;

namespace {
// A reserved TLD (RFC 2606), as the WebView2 docs recommend for virtual hosts:
// it can never collide with a real site, and ".local" would trigger mDNS delays.
const wchar_t* kHost = L"web.stremioz.example";

std::wstring WebUiFolder()
{
    return GetExeDirectory() + L"\\webui";
}
} // namespace

std::wstring LocalWebUiUrl()
{
    std::wstring index = WebUiFolder() + L"\\index.html";
    if (GetFileAttributesW(index.c_str()) == INVALID_FILE_ATTRIBUTES) return {};
    // Explicit index.html: virtual hosts serve files, not directory indexes,
    // so a bare "/" ends on Chromium's error page. The app routes by hash.
    return std::wstring(L"https://") + kHost + L"/index.html";
}

bool IsLocalWebUiUrl(const std::wstring& url)
{
    return url.rfind(std::wstring(L"https://") + kHost + L"/", 0) == 0;
}

void MapLocalWebUi(ICoreWebView2_3* webview)
{
    if (!webview || LocalWebUiUrl().empty()) return;
    HRESULT hr = webview->SetVirtualHostNameToFolderMapping(
        kHost, WebUiFolder().c_str(), COREWEBVIEW2_HOST_RESOURCE_ACCESS_KIND_ALLOW);
    std::wcout << L"[WEBUI]: local web UI " << (SUCCEEDED(hr) ? L"mapped: " : L"mapping FAILED: ")
               << WebUiFolder() << std::endl;
}
