; StremioZ installer (NSIS 3). Built by tools/release.ps1:
;   makensis /DVERSION=0.9.0 /DSOURCE=<assembled folder> /DOUTFILE=<setup.exe>
;            /DAJN_VERSION=.. /DAJI_INDEX_URL=.. /DAJI_INDEX_SHA256=.. installer\StremioZ.nsi
;
; Per-user install (no admin prompt) to %LOCALAPPDATA%\Programs\StremioZ.
; Upgrades replace the program files and keep the user's state: the profile
; (StremioZ.exe.WebView2: sign-in, library, settings), stremio-settings.ini,
; animejanai.conf and portable_config\cache.
;
; Switches: /S silent; /UPDATE (the in-app updater) starts StremioZ when done;
; /D=<dir> install folder (last, unquoted).

Unicode true
ManifestDPIAware true
!ifndef VERSION
  !error "Pass /DVERSION=x.y.z /DSOURCE=<folder> /DOUTFILE=<file>"
!endif

!define APP        "StremioZ"
!define EXE        "StremioZ.exe"
!define REPO_URL   "https://github.com/roshanarunk/StremioZ"
!define UNINST_KEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\StremioZ"
!define APP_KEY    "Software\StremioZ"

Name "${APP}"
Caption "${APP} ${VERSION} Setup"
OutFile "${OUTFILE}"
InstallDir "$LOCALAPPDATA\Programs\StremioZ"
InstallDirRegKey HKCU "${APP_KEY}" "InstallDir"
RequestExecutionLevel user
SetCompressor /SOLID lzma
SetCompressorDictSize 64
BrandingText "${APP} ${VERSION}"

VIProductVersion "${VERSION}.0"
VIAddVersionKey "ProductName" "${APP}"
VIAddVersionKey "FileDescription" "${APP} Setup"
VIAddVersionKey "FileVersion" "${VERSION}"
VIAddVersionKey "ProductVersion" "${VERSION}"
VIAddVersionKey "LegalCopyright" "GPL-3.0"
VIAddVersionKey "CompanyName" "${APP}"

!include "MUI2.nsh"
!include "LogicLib.nsh"
!include "FileFunc.nsh"
!include "Sections.nsh"
!include "x64.nsh"

!define MUI_ICON "..\images\stremioz.ico"
!define MUI_UNICON "..\images\stremioz.ico"
!define MUI_HEADERIMAGE
!define MUI_HEADERIMAGE_RIGHT
!define MUI_HEADERIMAGE_BITMAP "header.bmp"
!define MUI_WELCOMEFINISHPAGE_BITMAP "welcome.bmp"
!define MUI_UNWELCOMEFINISHPAGE_BITMAP "welcome.bmp"
!define MUI_ABORTWARNING
!define MUI_COMPONENTSPAGE_SMALLDESC

!define MUI_WELCOMEPAGE_TEXT "This installs ${APP} ${VERSION}: Stremio with AnimeJaNai upscaling, NVIDIA RTX Video HDR, the Stremio Kai interface and game controller support.$\r$\n$\r$\nIf ${APP} is open, Setup closes it. Your profile and settings are kept.$\r$\n$\r$\nClick Next to continue."
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_LICENSE "..\LICENSE.md"
!insertmacro MUI_PAGE_COMPONENTS
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!define MUI_FINISHPAGE_RUN "$INSTDIR\${EXE}"
!define MUI_FINISHPAGE_RUN_TEXT "Start ${APP}"
!define MUI_FINISHPAGE_LINK "${APP} on GitHub"
!define MUI_FINISHPAGE_LINK_LOCATION "${REPO_URL}"
!insertmacro MUI_PAGE_FINISH

!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES

!insertmacro MUI_LANGUAGE "English"

Var IsUpdate

; ───────────────────────────────────────────── helpers
; Close a running StremioZ (and its streaming server child) before files are replaced.
!macro CloseStremioZ
  FindWindow $0 "StremioZ"
  ${If} $0 != 0
    DetailPrint "Closing ${APP}..."
    SendMessage $0 ${WM_CLOSE} 0 0 /TIMEOUT=3000
  ${EndIf}
  StrCpy $1 0
  ${Do}
    ClearErrors
    ${If} ${FileExists} "$INSTDIR\${EXE}"
      FileOpen $2 "$INSTDIR\${EXE}" a
      ${IfNot} ${Errors}
        FileClose $2
        ${Break}
      ${EndIf}
    ${Else}
      ${Break}
    ${EndIf}
    ${If} $1 == 6
      ; Still open (closing to the tray, or busy): end it and its child processes.
      nsExec::Exec 'taskkill /IM ${EXE} /T /F'
      Pop $2
    ${EndIf}
    ${If} $1 > 20
      MessageBox MB_RETRYCANCEL|MB_ICONEXCLAMATION "${APP} is still running. Close it and click Retry." /SD IDCANCEL IDRETRY +2
      Abort
      StrCpy $1 0
    ${EndIf}
    Sleep 500
    IntOp $1 $1 + 1
  ${Loop}
!macroend

; ───────────────────────────────────────────── sections
Section "StremioZ" SecMain
  SectionIn RO
  !insertmacro CloseStremioZ

  ; Program folders that are replaced whole on upgrade, so files a newer
  ; version dropped don't linger (every webmod in the folder is loaded).
  RMDir /r "$INSTDIR\webui"
  RMDir /r "$INSTDIR\portable_config\webmods\StremioZ"
  RMDir /r "$INSTDIR\portable_config\webmods\Metadata"
  RMDir /r "$INSTDIR\portable_config\webmods\Settings"
  RMDir /r "$INSTDIR\portable_config\webmods\Theme"
  RMDir /r "$INSTDIR\portable_config\webmods\UI"
  RMDir /r "$INSTDIR\portable_config\webmods\Utilities"
  ; Before 0.9 the exe was stremio.exe (StremioZ moves its profile folder over).
  Delete "$INSTDIR\stremio.exe"

  SetOutPath "$INSTDIR"
  SetOverwrite on
  File /r /x "stremio-settings.ini" /x "animejanai.conf" "${SOURCE}\*"
  ; User state: only seeded on a fresh install.
  SetOverwrite off
  SetOutPath "$INSTDIR\portable_config"
  File "${SOURCE}\portable_config\stremio-settings.ini"
  SetOutPath "$INSTDIR\animejanai"
  File "${SOURCE}\animejanai\animejanai.conf"
  SetOverwrite on
  SetOutPath "$INSTDIR"

  ; Microsoft Edge WebView2 Runtime (part of Windows 11; older systems may lack it).
  ReadRegStr $0 HKLM "SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}" "pv"
  ${If} $0 == ""
    ReadRegStr $0 HKCU "Software\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}" "pv"
  ${EndIf}
  ${If} $0 == ""
  ${OrIf} $0 == "0.0.0.0"
    DetailPrint "Installing the Microsoft Edge WebView2 Runtime..."
    File "/oname=$PLUGINSDIR\MicrosoftEdgeWebview2Setup.exe" "..\utils\windows\MicrosoftEdgeWebview2Setup.exe"
    ExecWait '"$PLUGINSDIR\MicrosoftEdgeWebview2Setup.exe" /silent /install'
  ${EndIf}

  ; Start menu
  CreateDirectory "$SMPROGRAMS\${APP}"
  CreateShortcut "$SMPROGRAMS\${APP}\${APP}.lnk" "$INSTDIR\${EXE}" "" "$INSTDIR\${EXE}" 0
  CreateShortcut "$SMPROGRAMS\${APP}\${APP} TV mode.lnk" "$INSTDIR\${EXE}" "--tv" "$INSTDIR\${EXE}" 0 SW_SHOWNORMAL "" "Fullscreen, controller-ready"
  CreateShortcut "$SMPROGRAMS\${APP}\Uninstall ${APP}.lnk" "$INSTDIR\Uninstall.exe"

  ; Uninstall entry
  WriteUninstaller "$INSTDIR\Uninstall.exe"
  WriteRegStr HKCU "${APP_KEY}" "InstallDir" "$INSTDIR"
  WriteRegStr HKCU "${UNINST_KEY}" "DisplayName" "${APP}"
  WriteRegStr HKCU "${UNINST_KEY}" "DisplayVersion" "${VERSION}"
  WriteRegStr HKCU "${UNINST_KEY}" "DisplayIcon" "$INSTDIR\${EXE},0"
  WriteRegStr HKCU "${UNINST_KEY}" "Publisher" "${APP}"
  WriteRegStr HKCU "${UNINST_KEY}" "URLInfoAbout" "${REPO_URL}"
  WriteRegStr HKCU "${UNINST_KEY}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "${UNINST_KEY}" "UninstallString" '"$INSTDIR\Uninstall.exe"'
  WriteRegStr HKCU "${UNINST_KEY}" "QuietUninstallString" '"$INSTDIR\Uninstall.exe" /S'
  WriteRegDWORD HKCU "${UNINST_KEY}" "NoModify" 1
  WriteRegDWORD HKCU "${UNINST_KEY}" "NoRepair" 1
  ${GetSize} "$INSTDIR" "/S=0K /G=1" $0 $1 $2
  WriteRegDWORD HKCU "${UNINST_KEY}" "EstimatedSize" $0
SectionEnd

Section "Desktop shortcut" SecDesktop
  CreateShortcut "$DESKTOP\${APP}.lnk" "$INSTDIR\${EXE}" "" "$INSTDIR\${EXE}" 0
SectionEnd

Section /o "Desktop shortcut for TV mode" SecDesktopTv
  CreateShortcut "$DESKTOP\${APP} TV mode.lnk" "$INSTDIR\${EXE}" "--tv" "$INSTDIR\${EXE}" 0
SectionEnd

Section "NVIDIA TensorRT for AnimeJaNai (about 0.7 GB download)" SecTrt
  ; The fastest AnimeJaNai engine, and the one that runs with RTX Video HDR.
  ; aji-runtime downloads it from NVIDIA's packages once per user and shares
  ; it with other AnimeJaNai installs; it is never bundled with StremioZ.
  DetailPrint "Getting NVIDIA TensorRT (this can take a few minutes)..."
  nsExec::ExecToLog '"$INSTDIR\aji-runtime.exe" ensure --app-id stremioz --per-copy --app-path "$INSTDIR\${EXE}" --app-version ${AJN_VERSION} --index ${AJI_INDEX_URL} --index-sha256 ${AJI_INDEX_SHA256} --want trt --gpus auto --aji-dir "$INSTDIR\animejanai\inference" --adopt-from "$INSTDIR\animejanai\inference" --progress lines'
  Pop $0
  ${If} $0 != 0
    DetailPrint "TensorRT setup didn't finish (code $0). AnimeJaNai still works on its other engines; run Setup again to retry."
  ${EndIf}
SectionEnd

Section /o "Open stremio:// links with StremioZ" SecProtocol
  ; Off by default: Stremio itself may own these links.
  WriteRegStr HKCU "Software\Classes\stremio" "" "URL:Stremio Protocol"
  WriteRegStr HKCU "Software\Classes\stremio" "URL Protocol" ""
  WriteRegStr HKCU "Software\Classes\stremio\DefaultIcon" "" "$INSTDIR\${EXE},0"
  WriteRegStr HKCU "Software\Classes\stremio\shell\open\command" "" '"$INSTDIR\${EXE}" "%1"'
  WriteRegStr HKCU "${APP_KEY}" "OwnsProtocol" "1"
SectionEnd

Section "-Finish"
  ${If} $IsUpdate == 1
    Exec '"$INSTDIR\${EXE}"'
  ${EndIf}
SectionEnd

!insertmacro MUI_FUNCTION_DESCRIPTION_BEGIN
  !insertmacro MUI_DESCRIPTION_TEXT ${SecMain} "StremioZ itself."
  !insertmacro MUI_DESCRIPTION_TEXT ${SecDesktop} "A StremioZ shortcut on the desktop."
  !insertmacro MUI_DESCRIPTION_TEXT ${SecDesktopTv} "A desktop shortcut that opens StremioZ fullscreen, ready for a controller. The Start menu gets one either way."
  !insertmacro MUI_DESCRIPTION_TEXT ${SecTrt} "Recommended on NVIDIA RTX GPUs: the fastest AnimeJaNai engine, and the one that runs together with RTX Video HDR. Downloaded once from NVIDIA's packages."
  !insertmacro MUI_DESCRIPTION_TEXT ${SecProtocol} "Addon install links (stremio://) open in StremioZ instead of Stremio."
!insertmacro MUI_FUNCTION_DESCRIPTION_END

Function .onInit
  StrCpy $IsUpdate 0
  ${GetParameters} $R0
  ClearErrors
  ${GetOptions} $R0 "/UPDATE" $R1
  ${IfNot} ${Errors}
    StrCpy $IsUpdate 1
  ${EndIf}

  ; TensorRT only makes sense with an NVIDIA GPU (its driver puts nvml.dll in System32).
  ${DisableX64FSRedirection}
  ${IfNot} ${FileExists} "$SYSDIR\nvml.dll"
    !insertmacro UnselectSection ${SecTrt}
  ${EndIf}
  ${EnableX64FSRedirection}

  ; An update keeps the choices of the first install: no new desktop shortcuts.
  ReadRegStr $0 HKCU "${APP_KEY}" "InstallDir"
  ${If} $0 != ""
    ${IfNot} ${FileExists} "$DESKTOP\${APP}.lnk"
      !insertmacro UnselectSection ${SecDesktop}
    ${EndIf}
    ReadRegStr $1 HKCU "${APP_KEY}" "OwnsProtocol"
    ${If} $1 == "1"
      !insertmacro SelectSection ${SecProtocol}
    ${EndIf}
  ${EndIf}
FunctionEnd

; ───────────────────────────────────────────── uninstall
Var KeepData

Section "Uninstall"
  !insertmacro CloseStremioZ

  StrCpy $KeepData 1
  MessageBox MB_YESNO|MB_ICONQUESTION|MB_DEFBUTTON2 "Also delete your StremioZ profile and settings (sign-in, library, preferences)?$\r$\n$\r$\nChoose No to keep them for a later install." /SD IDNO IDNO +2
  StrCpy $KeepData 0

  Delete "$DESKTOP\${APP}.lnk"
  Delete "$DESKTOP\${APP} TV mode.lnk"
  RMDir /r "$SMPROGRAMS\${APP}"

  ReadRegStr $0 HKCU "${APP_KEY}" "OwnsProtocol"
  ${If} $0 == "1"
    DeleteRegKey HKCU "Software\Classes\stremio"
  ${EndIf}
  DeleteRegKey HKCU "${UNINST_KEY}"
  DeleteRegKey HKCU "${APP_KEY}"

  ${If} $KeepData == 0
    RMDir /r "$INSTDIR"
  ${Else}
    ; Everything except the profile and portable_config (settings, cache, AnimeJaNai config).
    FindFirst $0 $1 "$INSTDIR\*"
    ${DoWhile} $1 != ""
      ${If} $1 != "."
      ${AndIf} $1 != ".."
      ${AndIf} $1 != "StremioZ.exe.WebView2"
      ${AndIf} $1 != "portable_config"
        ${If} ${FileExists} "$INSTDIR\$1\*"
          RMDir /r "$INSTDIR\$1"
        ${Else}
          Delete "$INSTDIR\$1"
        ${EndIf}
      ${EndIf}
      FindNext $0 $1
    ${Loop}
    FindClose $0
    ; Keep only the user state inside portable_config.
    RMDir /r "$INSTDIR\portable_config\webmods"
    RMDir /r "$INSTDIR\portable_config\scripts"
    RMDir /r "$INSTDIR\portable_config\shaders"
    RMDir /r "$INSTDIR\portable_config\fonts"
    RMDir /r "$INSTDIR\portable_config\mpv"
  ${EndIf}
SectionEnd
