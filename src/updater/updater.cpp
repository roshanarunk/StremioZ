#include "updater.h"
#include <openssl/evp.h>
#include <openssl/pem.h>
#include <openssl/sha.h>
#include <curl/curl.h>
#include "../core/globals.h"
#include "../utils/crashlog.h"
#include "../utils/helpers.h"
#include <fstream>
#include <sstream>
#include <iomanip>
#include <iostream>
#include <mutex>

namespace {

std::mutex g_statusMutex;
std::string g_statusText;
bool g_ready = false;
std::atomic_bool g_checking = false;

size_t WriteCallback(void* contents, size_t size, size_t nmemb, void* userp)
{
    std::string* s = reinterpret_cast<std::string*>(userp);
    s->append(reinterpret_cast<char*>(contents), size * nmemb);
    return size * nmemb;
}

void CommonOptions(CURL* curl, const std::string& url)
{
    curl_easy_setopt(curl, CURLOPT_URL, url.c_str());
    // GitHub's release download links redirect to its asset storage.
    curl_easy_setopt(curl, CURLOPT_FOLLOWLOCATION, 1L);
    curl_easy_setopt(curl, CURLOPT_MAXREDIRS, 10L);
    curl_easy_setopt(curl, CURLOPT_FAILONERROR, 1L);
    curl_easy_setopt(curl, CURLOPT_CONNECTTIMEOUT, 15L);
    curl_easy_setopt(curl, CURLOPT_USERAGENT, "StremioZ/" STREMIOZ_VERSION);
}

bool DownloadString(const std::string& url, std::string& outData, long* httpStatus = nullptr)
{
    CURL* curl = curl_easy_init();
    if(!curl) return false;
    CommonOptions(curl, url);
    curl_easy_setopt(curl, CURLOPT_TIMEOUT, 60L);
    curl_easy_setopt(curl, CURLOPT_WRITEFUNCTION, WriteCallback);
    curl_easy_setopt(curl, CURLOPT_WRITEDATA, &outData);
    CURLcode res = curl_easy_perform(curl);
    if(httpStatus) curl_easy_getinfo(curl, CURLINFO_RESPONSE_CODE, httpStatus);
    curl_easy_cleanup(curl);
    return res == CURLE_OK;
}

bool DownloadFile(const std::string& url, const std::filesystem::path& dest)
{
    CURL* curl = curl_easy_init();
    if(!curl) return false;
    FILE* fp = _wfopen(dest.c_str(), L"wb");
    if(!fp){
        curl_easy_cleanup(curl);
        return false;
    }
    CommonOptions(curl, url);
    // Large file: give up only when the transfer stalls (under 1 KB/s for a minute).
    curl_easy_setopt(curl, CURLOPT_LOW_SPEED_LIMIT, 1024L);
    curl_easy_setopt(curl, CURLOPT_LOW_SPEED_TIME, 60L);
    curl_easy_setopt(curl, CURLOPT_WRITEDATA, fp);
    CURLcode res = curl_easy_perform(curl);
    fclose(fp);
    curl_easy_cleanup(curl);
    return res == CURLE_OK;
}

std::string FileChecksum(const std::filesystem::path& filepath)
{
    std::ifstream file(filepath, std::ios::binary);
    if(!file) return "";
    SHA256_CTX ctx;
    SHA256_Init(&ctx);
    std::vector<char> buf(1 << 16);
    while(file.read(buf.data(), buf.size()) || file.gcount() > 0) {
        SHA256_Update(&ctx, buf.data(), (size_t)file.gcount());
    }
    unsigned char hash[SHA256_DIGEST_LENGTH];
    SHA256_Final(hash, &ctx);
    std::ostringstream oss;
    for(int i=0; i<SHA256_DIGEST_LENGTH; ++i)
        oss << std::hex << std::setw(2) << std::setfill('0') << (int)hash[i];
    return oss.str();
}

bool VerifySignature(const std::string& data, const std::string& signatureBase64)
{
    BIO* bio = BIO_new_mem_buf(public_key_pem, -1);
    EVP_PKEY* pubKey = PEM_read_bio_PUBKEY(bio, nullptr, nullptr, nullptr);
    BIO_free(bio);
    if(!pubKey) return false;

    std::string cleanedSig;
    for(char c : signatureBase64){
        if(!isspace((unsigned char)c)) cleanedSig.push_back(c);
    }
    BIO* b64 = BIO_new(BIO_f_base64());
    BIO_set_flags(b64, BIO_FLAGS_BASE64_NO_NL);
    BIO* bmem = BIO_new_mem_buf(cleanedSig.data(), (int)cleanedSig.size());
    bmem = BIO_push(b64, bmem);
    std::vector<unsigned char> signature(1024);
    int sig_len = BIO_read(bmem, signature.data(), (int)signature.size());
    BIO_free_all(bmem);
    if(sig_len <= 0) {
        EVP_PKEY_free(pubKey);
        return false;
    }

    EVP_MD_CTX* ctx = EVP_MD_CTX_new();
    bool result = false;
    if(EVP_DigestVerifyInit(ctx, nullptr, EVP_sha256(), nullptr, pubKey)==1 &&
       EVP_DigestVerifyUpdate(ctx, data.data(), data.size())==1) {
        result = (EVP_DigestVerifyFinal(ctx, signature.data(), sig_len)==1);
    }
    EVP_MD_CTX_free(ctx);
    EVP_PKEY_free(pubKey);
    return result;
}

// "0.10.1" > "0.9.3". Missing parts count as 0; a leading "v" and anything
// after a "-" are ignored.
std::vector<int> ParseVersion(const std::string& v)
{
    std::vector<int> parts;
    std::string s = v.substr(v.rfind('v', 0) == 0 ? 1 : 0);
    s = s.substr(0, s.find('-'));
    std::stringstream ss(s);
    std::string item;
    while(std::getline(ss, item, '.')) {
        try { parts.push_back(std::stoi(item)); } catch(...) { parts.push_back(0); }
    }
    return parts;
}

bool IsNewer(const std::string& remote, const std::string& local)
{
    auto a = ParseVersion(remote), b = ParseVersion(local);
    size_t n = (std::max)(a.size(), b.size());
    a.resize(n, 0);
    b.resize(n, 0);
    return a > b;
}

void PushToWeb(const nlohmann::json& j)
{
    if(!g_hWnd) return;
    {
        std::lock_guard<std::mutex> lock(g_outboundMutex);
        g_outboundMessages.push_back(j);
    }
    PostMessage(g_hWnd, WM_NOTIFY_FLUSH, 0, 0);
}

void Report(const std::string& text, bool ready = false, bool toWeb = true)
{
    std::cout << "[UPDATER]: " << text << "\n";
    {
        std::lock_guard<std::mutex> lock(g_statusMutex);
        g_statusText = text;
        g_ready = ready;
    }
    if(!toWeb) return;
    nlohmann::json j;
    j["type"] = "stremioz-update-status";
    j["text"] = text;
    j["ready"] = ready;
    PushToWeb(j);
}

// manual: started from Settings, so every outcome is reported there. The
// startup check stays quiet unless an update is ready.
void CheckForUpdates(bool manual)
{
    if(g_checking.exchange(true)) return;
    struct Done { ~Done() { g_checking = false; } } done;

    if(g_updateUrl.empty()) {
        Report("Update checks are off (no update feed).", false, manual);
        return;
    }
    if(manual) Report("Checking for updates...");

    std::string versionContent;
    long status = 0;
    if(!DownloadString(g_updateUrl, versionContent, &status)) {
        AppendToCrashLog("[UPDATER]: Failed to download " + g_updateUrl + " (HTTP " + std::to_string(status) + ")");
        if(status == 404)
            Report("No StremioZ release is published yet. StremioZ " STREMIOZ_VERSION " is the latest.", false, manual);
        else
            Report("Couldn't reach the update server. Check your connection and try again.", false, manual);
        return;
    }
    std::string versionDescUrl, signatureBase64;
    try {
        auto versionJson = nlohmann::json::parse(versionContent);
        versionDescUrl = versionJson.at("versionDesc").get<std::string>();
        signatureBase64 = versionJson.at("signature").get<std::string>();
    } catch(...) {
        Report("The update information couldn't be read.", false, manual);
        return;
    }

    std::string detailsContent;
    if(!DownloadString(versionDescUrl, detailsContent)) {
        AppendToCrashLog("[UPDATER]: Failed to download version details");
        Report("Couldn't reach the update server. Check your connection and try again.", false, manual);
        return;
    }
    if(!VerifySignature(detailsContent, signatureBase64)) {
        AppendToCrashLog("[UPDATER]: Signature verification failed");
        Report("The update failed its signature check, so it was ignored.", false, manual);
        return;
    }

    std::string remoteVersion, url, expectedChecksum;
    try {
        auto details = nlohmann::json::parse(detailsContent);
        remoteVersion = details.contains("version") ? details["version"].get<std::string>()
                                                    : details.at("shellVersion").get<std::string>();
        auto& file = details.at("files").at("windows-x64");
        url = file.at("url").get<std::string>();
        expectedChecksum = file.at("checksum").get<std::string>();
    } catch(...) {
        Report("The update information couldn't be read.", false, manual);
        return;
    }

    if(!IsNewer(remoteVersion, STREMIOZ_VERSION) && !g_autoupdaterForceFull) {
        Report("StremioZ " STREMIOZ_VERSION " is up to date.", false, manual);
        return;
    }

    wchar_t buf[MAX_PATH];
    GetTempPathW(MAX_PATH, buf);
    std::filesystem::path tempDir = std::filesystem::path(buf) / L"StremioZ-update";
    std::error_code ec;
    std::filesystem::create_directories(tempDir, ec);
    std::string filename = url.substr(url.find_last_of('/') + 1);
    std::filesystem::path installerPath = tempDir / Utf8ToWstring(filename);

    // Only the installer being fetched stays in the folder.
    for(const auto& entry : std::filesystem::directory_iterator(tempDir, ec)) {
        if(entry.path() != installerPath) std::filesystem::remove_all(entry.path(), ec);
    }

    if(!std::filesystem::exists(installerPath) || FileChecksum(installerPath) != expectedChecksum) {
        Report("Downloading StremioZ " + remoteVersion + "...", false, manual);
        std::filesystem::remove(installerPath, ec);
        if(!DownloadFile(url, installerPath)) {
            AppendToCrashLog("[UPDATER]: Failed to download installer");
            Report("The download of StremioZ " + remoteVersion + " failed. Try again later.", false, manual);
            return;
        }
        if(FileChecksum(installerPath) != expectedChecksum) {
            AppendToCrashLog("[UPDATER]: Installer checksum mismatch: " + installerPath.string());
            std::filesystem::remove(installerPath, ec);
            Report("The download of StremioZ " + remoteVersion + " was damaged. Try again later.", false, manual);
            return;
        }
    }

    g_installerPath = installerPath;
    Report("StremioZ " + remoteVersion + " is ready to install.", true, true);
    // Also Stremio's own update prompt.
    nlohmann::json j;
    j["type"] = "requestUpdate";
    PushToWeb(j);
}

} // namespace

void RunAutoUpdaterOnce()
{
    g_updaterRunning = true;
    if(!g_autoUpdate) {
        std::cout << "[UPDATER]: Startup update check is off.\n";
        return;
    }
    CheckForUpdates(false);
}

void CheckForUpdatesAsync()
{
    std::thread([] { CheckForUpdates(true); }).detach();
}

std::string UpdateStatusText()
{
    std::lock_guard<std::mutex> lock(g_statusMutex);
    return g_statusText;
}

bool UpdateReady()
{
    std::lock_guard<std::mutex> lock(g_statusMutex);
    return g_ready;
}

void RunInstallerAndExit()
{
    if(g_installerPath.empty() || !std::filesystem::exists(g_installerPath)) {
        AppendToCrashLog("[UPDATER]: Installer path not set.");
        return;
    }
    // Silent install over this copy (NSIS: /D= must come last, unquoted); with
    // /UPDATE the installer starts StremioZ again when it's done.
    std::wstring dir = GetExeDirectory();
    std::wstring arguments = L"/S /UPDATE /D=" + dir;
    HINSTANCE result = ShellExecuteW(nullptr, L"open", g_installerPath.c_str(), arguments.c_str(), nullptr, SW_SHOWNORMAL);
    if ((INT_PTR)result <= 32) {
        AppendToCrashLog(L"[UPDATER]: Failed to start installer via ShellExecute.");
        return;
    }
    PostQuitMessage(0);
    exit(0);
}
