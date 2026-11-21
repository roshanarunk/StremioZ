#include "display_hdr.h"

#include <iostream>
#include <vector>
#include <mpv/client.h>
#include "../core/globals.h"

namespace {

// Advanced colour (HDR) state of the display path whose source is the GDI
// device `gdiName` (for example \\.\DISPLAY1). -1 when it can't be determined.
int HdrStateForGdiDevice(const wchar_t* gdiName)
{
    UINT32 numPaths = 0, numModes = 0;
    if (GetDisplayConfigBufferSizes(QDC_ONLY_ACTIVE_PATHS, &numPaths, &numModes) != ERROR_SUCCESS)
        return -1;
    std::vector<DISPLAYCONFIG_PATH_INFO> paths(numPaths);
    std::vector<DISPLAYCONFIG_MODE_INFO> modes(numModes);
    if (QueryDisplayConfig(QDC_ONLY_ACTIVE_PATHS, &numPaths, paths.data(), &numModes, modes.data(), nullptr) != ERROR_SUCCESS)
        return -1;

    for (UINT32 i = 0; i < numPaths; ++i) {
        DISPLAYCONFIG_SOURCE_DEVICE_NAME source = {};
        source.header.type = DISPLAYCONFIG_DEVICE_INFO_GET_SOURCE_NAME;
        source.header.size = sizeof(source);
        source.header.adapterId = paths[i].sourceInfo.adapterId;
        source.header.id = paths[i].sourceInfo.id;
        if (DisplayConfigGetDeviceInfo(&source.header) != ERROR_SUCCESS) continue;
        if (_wcsicmp(source.viewGdiDeviceName, gdiName) != 0) continue;

        DISPLAYCONFIG_GET_ADVANCED_COLOR_INFO color = {};
        color.header.type = DISPLAYCONFIG_DEVICE_INFO_GET_ADVANCED_COLOR_INFO;
        color.header.size = sizeof(color);
        color.header.adapterId = paths[i].targetInfo.adapterId;
        color.header.id = paths[i].targetInfo.id;
        if (DisplayConfigGetDeviceInfo(&color.header) != ERROR_SUCCESS) return -1;
        return (color.advancedColorSupported && color.advancedColorEnabled) ? 1 : 0;
    }
    return -1;
}

int g_lastPublished = -2;

} // namespace

void PublishDisplayHdr(HWND hwnd)
{
    if (!g_mpv || !hwnd) return;
    MONITORINFOEXW mi = {};
    mi.cbSize = sizeof(mi);
    HMONITOR mon = MonitorFromWindow(hwnd, MONITOR_DEFAULTTONEAREST);
    if (!mon || !GetMonitorInfoW(mon, &mi)) return;

    int state = HdrStateForGdiDevice(mi.szDevice);
    if (state < 0) state = 0;   // unknown: behave as SDR
    if (state == g_lastPublished) return;
    g_lastPublished = state;
    mpv_set_property_string(g_mpv, "user-data/stremioz/display-hdr", state ? "yes" : "no");
    std::wcout << L"[HDR]: " << mi.szDevice << L" HDR " << (state ? L"on" : L"off") << std::endl;
}
