cmake_minimum_required(VERSION 3.16)

project(stremio VERSION "5.0.22")

# StremioZ's own release version (the project version above is the Community
# shell it is based on, which the web UI sees as shellVersion). The installer,
# updater feed and exe version resource all take it from here.
set(STREMIOZ_VERSION "0.9.4")
string(REPLACE "." ";" _szv "${STREMIOZ_VERSION}")
list(GET _szv 0 STREMIOZ_VERSION_MAJOR)
list(GET _szv 1 STREMIOZ_VERSION_MINOR)
list(GET _szv 2 STREMIOZ_VERSION_PATCH)
configure_file(src/stremioz/version.h.in "${CMAKE_BINARY_DIR}/generated/stremioz_version.h" @ONLY)
include_directories("${CMAKE_BINARY_DIR}/generated")

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_MSVC_RUNTIME_LIBRARY "MultiThreaded$<$<CONFIG:Debug>:Debug>")

option(DEBUG_LOG "Allow debug logs" ON)

# Locate MPV
if(CMAKE_SIZEOF_VOID_P EQUAL 8)
    # 64-bit architecture
    # StremioZ: the-database libmpv fork (carries vf_animejanai). Fetched by tools/fetch-deps.ps1.
    set(MPV_DIR "${CMAKE_CURRENT_SOURCE_DIR}/deps/thedatabase-mpv/x86_64")
    set(MPV_INCLUDE_DIR "${MPV_DIR}/include")
    set(MPV_LIBRARY "${MPV_DIR}/mpv.lib")
    set(MPV_DLL "${MPV_DIR}/libmpv-2.dll")
    set(MPV_EXTRA_DLLS "${MPV_DIR}/ajn-mvtools.dll")

    set(DISCORD_LIB "${CMAKE_CURRENT_SOURCE_DIR}/deps/discord-rpc/win64-static/lib/discord-rpc.lib")
    set(DISCORD_INCLUDE_DIR "${CMAKE_CURRENT_SOURCE_DIR}/deps/discord-rpc/win64-static/include")
else()
    # 32-bit architecture
    set(MPV_INCLUDE_DIR "${CMAKE_CURRENT_SOURCE_DIR}/deps/libmpv/i686/include")
    set(MPV_LIBRARY "${CMAKE_CURRENT_SOURCE_DIR}/deps/libmpv/i686/mpv.lib")
    set(MPV_DLL "${CMAKE_CURRENT_SOURCE_DIR}/deps/libmpv/i686/libmpv-2.dll")

    set(DISCORD_LIB "${CMAKE_CURRENT_SOURCE_DIR}/deps/discord-rpc/win32-static/lib/discord-rpc.lib")
    set(DISCORD_INCLUDE_DIR "${CMAKE_CURRENT_SOURCE_DIR}/deps/discord-rpc/win32-static/include")
endif()

include_directories(${DISCORD_INCLUDE_DIR})
include_directories(${MPV_INCLUDE_DIR})

find_package(OpenSSL REQUIRED)
find_package(CURL REQUIRED)
find_package(nlohmann_json CONFIG REQUIRED)
find_package(unofficial-webview2 CONFIG REQUIRED)
find_package(SDL3 CONFIG REQUIRED) # StremioZ: controller input

set(SOURCES
        src/main.cpp
        stremio.rc
        src/core/globals.h
        src/core/globals.cpp
        src/utils/helpers.h
        src/utils/helpers.cpp
        src/utils/config.h
        src/utils/config.cpp
        src/utils/crashlog.h
        src/utils/crashlog.cpp
        src/mpv/player.h
        src/mpv/player.cpp
        src/node/server.cpp
        src/node/server.h
        src/tray/tray.h
        src/tray/tray.cpp
        src/ui/splash.h
        src/ui/splash.cpp
        src/updater/updater.cpp
        src/updater/updater.h
        src/webview/webview.h
        src/webview/webview.cpp
        src/ui/mainwindow.h
        src/ui/mainwindow.cpp
        src/resource.h
        src/utils/extensions.cpp
        src/utils/extensions.h
        src/utils/discord.cpp
        src/utils/discord.h
        src/stremioz/animejanai_env.h
        src/stremioz/animejanai_env.cpp
        src/stremioz/webui.h
        src/stremioz/webui.cpp
        src/stremioz/display_hdr.h
        src/stremioz/display_hdr.cpp
        src/stremioz/ui_scale.h
        src/stremioz/ui_scale.cpp
        src/stremioz/gamepad.h
        src/stremioz/gamepad.cpp
)

add_executable(${PROJECT_NAME} WIN32 ${SOURCES})
# StremioZ: StremioZ.exe, so it can run beside Stremio (stremio.exe).
set_target_properties(${PROJECT_NAME} PROPERTIES OUTPUT_NAME "StremioZ")


target_link_libraries(${PROJECT_NAME} PRIVATE
        gdiplus.lib
        dwmapi.lib
        Shcore.lib
        Msimg32.lib
        winhttp.lib
        shlwapi.lib
        nlohmann_json::nlohmann_json
        unofficial::webview2::webview2
        OpenSSL::SSL
        OpenSSL::Crypto
        CURL::libcurl
        SDL3::SDL3
        ${MPV_LIBRARY}
        ${DISCORD_LIB}
)

target_compile_definitions(${PROJECT_NAME} PRIVATE DEBUG_LOG)

# Copy MPV DLL
add_custom_command(TARGET ${PROJECT_NAME} POST_BUILD
        COMMAND ${CMAKE_COMMAND} -E copy_if_different
        "${MPV_DLL}" ${MPV_EXTRA_DLLS}
        $<TARGET_FILE_DIR:${PROJECT_NAME}>
)