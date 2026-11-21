#include "ui_scale.h"

#include <cmath>
#include <iostream>
#include <string>

#include "../core/globals.h"
#include "../utils/helpers.h"

namespace {

// <0: auto, 0: off, >0: fixed zoom factor (fullscreen only, like auto).
double ReadSetting()
{
    wchar_t buf[32] = {};
    GetPrivateProfileStringW(L"StremioZ", L"UiScale", L"auto", buf, _countof(buf), (GetExeDirectory() + L"\\portable_config\\stremio-settings.ini").c_str());
    const std::wstring v = buf;
    if (v == L"off" || v == L"0") return 0.0;
    if (v == L"auto" || v.empty()) return -1.0;
    try {
        const double f = std::stod(v);
        if (f >= 0.25 && f <= 2.0) return f;
    } catch (...) {}
    return -1.0;
}

double g_setting = -2.0; // not read yet

} // namespace

void ReloadUiScaleSetting()
{
    g_setting = ReadSetting();
}

void ApplyUiScale(HWND hwnd)
{
    if (!g_webviewController) return;
    if (g_setting < -1.5) g_setting = ReadSetting();
    const double setting = g_setting;

    double zoom = 1.0;
    if (setting > 0 && g_isFullscreen) {
        zoom = setting;
    } else if (setting < 0 && g_isFullscreen) {
        RECT rc;
        GetClientRect(hwnd, &rc);
        const UINT dpi = GetDpiForWindow(hwnd);
        const double logicalH = (rc.bottom - rc.top) * 96.0 / (dpi ? dpi : 96);
        if (logicalH > 200 && logicalH < 1000) {
            // About 1080 CSS pixels tall, in 5 % steps (720 -> 0.65).
            zoom = std::floor(logicalH / 1080.0 * 20.0) / 20.0;
            if (zoom < 0.5) zoom = 0.5;
        }
    }

    double current = 1.0;
    g_webviewController->get_ZoomFactor(&current);
    if (std::fabs(current - zoom) < 0.001) return;
    g_webviewController->put_ZoomFactor(zoom);
    std::cout << "[UI]: zoom factor " << zoom << "\n";
}
