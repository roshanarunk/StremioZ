#ifndef UPDATER_H
#define UPDATER_H

#include <string>

// StremioZ updater. The feed (g_updateUrl) is the latest GitHub release's
// version.json: {"versionDesc": "<url of version-details.json>", "signature":
// "<base64 RSA-SHA256 of version-details.json>"}; version-details.json is
// {"version": "x.y.z", "files": {"windows-x64": {"url", "checksum"}}}.

// At startup, when [StremioZ] AutoUpdate is on.
void RunAutoUpdaterOnce();
// Settings > StremioZ > Check now. Reports progress as "stremioz-update-status".
void CheckForUpdatesAsync();
// The last status, for the settings page.
std::string UpdateStatusText();
bool UpdateReady();
// Runs the downloaded installer silently over this install and exits; the
// installer starts StremioZ again when it's done.
void RunInstallerAndExit();

#endif // UPDATER_H
