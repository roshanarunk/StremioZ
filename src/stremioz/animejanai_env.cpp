#include "animejanai_env.h"

#include <windows.h>
#include <iostream>
#include <string>

// AnimeJaNai's animejanai_backend.lua asks nvidia-smi for the GPU list with a
// blocking `subprocess` while the script is still initialising. Inside our
// embedded libmpv that call sometimes never returns, and because mpv waits for
// scripts to finish initialising before it starts the first file, playback
// then hangs forever on the loading screen. The script takes the same answer
// from ANIMEJANAI_NVIDIA_GPUS when it is set, so we get it from NVML here, in
// process and without spawning anything, and publish it before mpv starts.
//
// Format (one GPU per entry, ';'-separated), as nvidia-smi prints it:
//   GPU-<uuid>, <major>.<minor>, <name>

namespace {

typedef int nvmlReturn_t;           // NVML_SUCCESS == 0
typedef struct nvmlDevice_st* nvmlDevice_t;

typedef nvmlReturn_t (*nvmlInit_t)();
typedef nvmlReturn_t (*nvmlShutdown_t)();
typedef nvmlReturn_t (*nvmlDeviceGetCount_t)(unsigned int*);
typedef nvmlReturn_t (*nvmlDeviceGetHandleByIndex_t)(unsigned int, nvmlDevice_t*);
typedef nvmlReturn_t (*nvmlDeviceGetString_t)(nvmlDevice_t, char*, unsigned int);
typedef nvmlReturn_t (*nvmlDeviceGetCudaComputeCapability_t)(nvmlDevice_t, int*, int*);

std::string QueryNvidiaGpus()
{
    HMODULE nvml = LoadLibraryExW(L"nvml.dll", nullptr, LOAD_LIBRARY_SEARCH_SYSTEM32);
    if (!nvml) {
        // Drivers before the DCH layout keep it next to nvidia-smi.
        wchar_t pf[MAX_PATH];
        if (GetEnvironmentVariableW(L"ProgramFiles", pf, MAX_PATH)) {
            std::wstring p = std::wstring(pf) + L"\\NVIDIA Corporation\\NVSMI\\nvml.dll";
            nvml = LoadLibraryExW(p.c_str(), nullptr, LOAD_WITH_ALTERED_SEARCH_PATH);
        }
    }
    if (!nvml) return {};

    auto init = (nvmlInit_t)GetProcAddress(nvml, "nvmlInit_v2");
    auto shutdown = (nvmlShutdown_t)GetProcAddress(nvml, "nvmlShutdown");
    auto getCount = (nvmlDeviceGetCount_t)GetProcAddress(nvml, "nvmlDeviceGetCount_v2");
    auto getHandle = (nvmlDeviceGetHandleByIndex_t)GetProcAddress(nvml, "nvmlDeviceGetHandleByIndex_v2");
    auto getUuid = (nvmlDeviceGetString_t)GetProcAddress(nvml, "nvmlDeviceGetUUID");
    auto getName = (nvmlDeviceGetString_t)GetProcAddress(nvml, "nvmlDeviceGetName");
    auto getCc = (nvmlDeviceGetCudaComputeCapability_t)GetProcAddress(nvml, "nvmlDeviceGetCudaComputeCapability");

    std::string out;
    if (init && shutdown && getCount && getHandle && getUuid && getName && getCc && init() == 0) {
        unsigned int count = 0;
        if (getCount(&count) == 0) {
            for (unsigned int i = 0; i < count; ++i) {
                nvmlDevice_t dev = nullptr;
                char uuid[96] = {0}, name[96] = {0};
                int major = 0, minor = 0;
                if (getHandle(i, &dev) != 0 || getUuid(dev, uuid, sizeof uuid) != 0 ||
                    getName(dev, name, sizeof name) != 0 || getCc(dev, &major, &minor) != 0) {
                    out.clear();   // a partial list would mislead the script
                    break;
                }
                std::string n = name;
                for (char& c : n) if (c == ';' || c == ',') c = ' ';
                if (!out.empty()) out += ';';
                out += std::string(uuid) + ", " + std::to_string(major) + "." +
                       std::to_string(minor) + ", " + n;
            }
        }
        shutdown();
    }
    FreeLibrary(nvml);
    return out;
}

// libmpv (and the LuaJIT inside it) reads the environment through the shared
// Universal CRT, while this exe links its CRT statically, so set the variable
// in ucrtbase's copy as well as in the OS block (for child processes).
void SetSharedEnv(const wchar_t* name, const std::wstring& value)
{
    SetEnvironmentVariableW(name, value.c_str());
    HMODULE ucrt = LoadLibraryExW(L"ucrtbase.dll", nullptr, LOAD_LIBRARY_SEARCH_SYSTEM32);
    if (!ucrt) return;
    typedef int (__cdecl *wputenv_s_t)(const wchar_t*, const wchar_t*);
    if (auto put = (wputenv_s_t)GetProcAddress(ucrt, "_wputenv_s")) put(name, value.c_str());
    // ucrtbase stays loaded: libmpv imports it.
}

} // namespace

void PrepareAnimeJaNaiEnvironment()
{
    const wchar_t* var = L"ANIMEJANAI_NVIDIA_GPUS";
    if (GetEnvironmentVariableW(var, nullptr, 0) > 0) return;   // user override wins

    std::string gpus = QueryNvidiaGpus();
    if (gpus.empty()) {
        std::cout << "[ANIMEJANAI] No NVIDIA GPU info from NVML; scripts will ask nvidia-smi.\n";
        return;
    }
    int n = MultiByteToWideChar(CP_UTF8, 0, gpus.c_str(), -1, nullptr, 0);
    std::wstring w(n > 0 ? n - 1 : 0, L'\0');
    if (n > 0) MultiByteToWideChar(CP_UTF8, 0, gpus.c_str(), -1, &w[0], n);
    SetSharedEnv(var, w);
    std::cout << "[ANIMEJANAI] GPUs: " << gpus << "\n";
}
