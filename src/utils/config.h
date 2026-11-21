#ifndef CONFIG_H
#define CONFIG_H

void LoadSettings();
void SaveSettings();
// StremioZ: [StremioZ] keys in stremio-settings.ini
#include <string>
std::wstring GetStremioZSetting(const wchar_t* key, const wchar_t* def);
void SetStremioZSetting(const wchar_t* key, const std::wstring& value);
void SaveWindowPlacement(const WINDOWPLACEMENT &wp);
bool LoadWindowPlacement(WINDOWPLACEMENT &wp);
static void WriteIntToIni(const std::wstring &section, const std::wstring &key, int value, const std::wstring &iniPath);
#endif // CONFIG_H
