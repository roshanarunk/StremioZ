#include "gamepad.h"

#include <SDL3/SDL.h>
#include <atomic>
#include <iostream>
#include <map>
#include <string>
#include <thread>
#include <nlohmann/json.hpp>

#include "../core/globals.h"

namespace {

// Logical buttons, positional (south = Xbox A / PlayStation Cross).
enum Button : int {
    B_A, B_B, B_X, B_Y, B_LB, B_RB, B_LT, B_RT, B_BACK, B_START, B_LS, B_RS,
    B_UP, B_DOWN, B_LEFT, B_RIGHT,         // D-pad and left stick
    B_RS_UP, B_RS_DOWN, B_RS_LEFT, B_RS_RIGHT, // right stick (scrolling)
    B_COUNT
};
const char *kNames[B_COUNT] = {
    "a", "b", "x", "y", "lb", "rb", "lt", "rt", "back", "start", "ls", "rs",
    "up", "down", "left", "right", "rs_up", "rs_down", "rs_left", "rs_right",
};
enum State : int { S_UP = 0, S_DOWN = 1, S_REPEAT = 2 };
enum Pad : int { P_GENERIC = 0, P_XBOX, P_PLAYSTATION, P_NINTENDO };
const char *kPads[] = {"generic", "xbox", "playstation", "nintendo"};

bool repeats(int b)
{
    return (b >= B_UP && b <= B_RS_RIGHT) || b == B_LB || b == B_RB;
}

HWND g_target = nullptr;
std::thread g_thread;
std::atomic<bool> g_run{false};

struct Held {
    bool down = false;
    Uint64 next = 0;     // next repeat (ms)
    Uint64 since = 0;
};

class Pump {
public:
    void post(int b, int state)
    {
        PostMessageW(g_target, WM_STREMIOZ_GAMEPAD, (WPARAM)b, MAKELPARAM(state, pad_));
    }
    void set(int b, bool down)
    {
        Held &h = held_[b];
        if (down == h.down) return;
        h.down = down;
        Uint64 now = SDL_GetTicks();
        if (down) {
            h.since = now;
            h.next = now + 380;   // first repeat
            post(b, S_DOWN);
        } else {
            post(b, S_UP);
        }
    }
    void tick()
    {
        Uint64 now = SDL_GetTicks();
        for (int b = 0; b < B_COUNT; b++) {
            Held &h = held_[b];
            if (!h.down || !repeats(b) || now < h.next) continue;
            post(b, S_REPEAT);
            // Speeds up the longer it is held (long lists, seeking).
            h.next = now + (now - h.since > 1500 ? 45 : 95);
        }
    }
    // Stick or trigger axes to buttons, with hysteresis.
    void axis(SDL_GamepadAxis a, Sint16 v)
    {
        const float f = v / 32767.0f;
        auto pair = [&](int neg, int pos) {
            const bool nd = held_[neg].down, pd = held_[pos].down;
            set(neg, nd ? f < -0.35f : f < -0.55f);
            set(pos, pd ? f > 0.35f : f > 0.55f);
        };
        switch (a) {
        case SDL_GAMEPAD_AXIS_LEFTX: lx_ = f; pair(B_LEFT, B_RIGHT); break;
        case SDL_GAMEPAD_AXIS_LEFTY: ly_ = f; pair(B_UP, B_DOWN); break;
        case SDL_GAMEPAD_AXIS_RIGHTX: pair(B_RS_LEFT, B_RS_RIGHT); break;
        case SDL_GAMEPAD_AXIS_RIGHTY: pair(B_RS_UP, B_RS_DOWN); break;
        case SDL_GAMEPAD_AXIS_LEFT_TRIGGER: set(B_LT, held_[B_LT].down ? f > 0.3f : f > 0.6f); break;
        case SDL_GAMEPAD_AXIS_RIGHT_TRIGGER: set(B_RT, held_[B_RT].down ? f > 0.3f : f > 0.6f); break;
        default: break;
        }
    }
    void button(SDL_GamepadButton sb, bool down)
    {
        static const std::map<int, int> m = {
            {SDL_GAMEPAD_BUTTON_SOUTH, B_A}, {SDL_GAMEPAD_BUTTON_EAST, B_B},
            {SDL_GAMEPAD_BUTTON_WEST, B_X}, {SDL_GAMEPAD_BUTTON_NORTH, B_Y},
            {SDL_GAMEPAD_BUTTON_LEFT_SHOULDER, B_LB}, {SDL_GAMEPAD_BUTTON_RIGHT_SHOULDER, B_RB},
            {SDL_GAMEPAD_BUTTON_BACK, B_BACK}, {SDL_GAMEPAD_BUTTON_START, B_START},
            {SDL_GAMEPAD_BUTTON_LEFT_STICK, B_LS}, {SDL_GAMEPAD_BUTTON_RIGHT_STICK, B_RS},
            {SDL_GAMEPAD_BUTTON_DPAD_UP, B_UP}, {SDL_GAMEPAD_BUTTON_DPAD_DOWN, B_DOWN},
            {SDL_GAMEPAD_BUTTON_DPAD_LEFT, B_LEFT}, {SDL_GAMEPAD_BUTTON_DPAD_RIGHT, B_RIGHT},
        };
        auto it = m.find(sb);
        if (it != m.end()) set(it->second, down);
    }
    void set_pad(SDL_Gamepad *g)
    {
        switch (SDL_GetGamepadType(g)) {
        case SDL_GAMEPAD_TYPE_XBOX360:
        case SDL_GAMEPAD_TYPE_XBOXONE: pad_ = P_XBOX; break;
        case SDL_GAMEPAD_TYPE_PS3:
        case SDL_GAMEPAD_TYPE_PS4:
        case SDL_GAMEPAD_TYPE_PS5: pad_ = P_PLAYSTATION; break;
        case SDL_GAMEPAD_TYPE_NINTENDO_SWITCH_PRO:
        case SDL_GAMEPAD_TYPE_NINTENDO_SWITCH_JOYCON_LEFT:
        case SDL_GAMEPAD_TYPE_NINTENDO_SWITCH_JOYCON_RIGHT:
        case SDL_GAMEPAD_TYPE_NINTENDO_SWITCH_JOYCON_PAIR: pad_ = P_NINTENDO; break;
        default: pad_ = P_GENERIC; break;
        }
    }
    void release_all()
    {
        for (int b = 0; b < B_COUNT; b++) set(b, false);
    }

private:
    Held held_[B_COUNT];
    int pad_ = P_GENERIC;
    float lx_ = 0, ly_ = 0;
};

void Run()
{
    // We gate on the foreground window ourselves (HandleGamepadMessage), so
    // SDL must keep delivering events while the WebView child has focus.
    SDL_SetHint(SDL_HINT_JOYSTICK_ALLOW_BACKGROUND_EVENTS, "1");
    if (!SDL_Init(SDL_INIT_GAMEPAD)) {
        std::cout << "[GAMEPAD]: SDL_Init failed: " << SDL_GetError() << "\n";
        return;
    }
    std::cout << "[GAMEPAD]: SDL " << SDL_GetVersion() << " ready\n";
    Pump pump;
    std::map<SDL_JoystickID, SDL_Gamepad *> pads;
    while (g_run) {
        SDL_Event e;
        while (SDL_WaitEventTimeout(&e, 15)) {
            switch (e.type) {
            case SDL_EVENT_GAMEPAD_ADDED:
                if (SDL_Gamepad *g = SDL_OpenGamepad(e.gdevice.which)) {
                    pads[e.gdevice.which] = g;
                    pump.set_pad(g);
                    std::cout << "[GAMEPAD]: connected: " << (SDL_GetGamepadName(g) ? SDL_GetGamepadName(g) : "?") << "\n";
                }
                break;
            case SDL_EVENT_GAMEPAD_REMOVED: {
                auto it = pads.find(e.gdevice.which);
                if (it != pads.end()) {
                    SDL_CloseGamepad(it->second);
                    pads.erase(it);
                }
                pump.release_all();
                break;
            }
            case SDL_EVENT_GAMEPAD_BUTTON_DOWN:
            case SDL_EVENT_GAMEPAD_BUTTON_UP:
                if (auto it = pads.find(e.gbutton.which); it != pads.end()) pump.set_pad(it->second);
                pump.button((SDL_GamepadButton)e.gbutton.button, e.type == SDL_EVENT_GAMEPAD_BUTTON_DOWN);
                break;
            case SDL_EVENT_GAMEPAD_AXIS_MOTION:
                pump.axis((SDL_GamepadAxis)e.gaxis.axis, e.gaxis.value);
                break;
            default:
                break;
            }
            if (!g_run) break;
        }
        pump.tick();
    }
    for (auto &p : pads) SDL_CloseGamepad(p.second);
    SDL_Quit();
}

} // namespace

void StartGamepad(HWND hwnd)
{
    if (g_run) return;
    g_target = hwnd;
    g_run = true;
    g_thread = std::thread(Run);
}

void StopGamepad()
{
    if (!g_run) return;
    g_run = false;
    if (g_thread.joinable()) g_thread.join();
}

void HandleGamepadMessage(WPARAM wParam, LPARAM lParam)
{
    const int b = (int)wParam, state = LOWORD(lParam), pad = HIWORD(lParam);
    if (b < 0 || b >= B_COUNT || !g_webview) return;
    // Only while StremioZ (or a window it owns) is in front.
    HWND fg = GetForegroundWindow();
    if (fg != g_hWnd && GetAncestor(fg, GA_ROOTOWNER) != g_hWnd) return;
    nlohmann::json j;
    j["type"] = "stremioz-gamepad";
    j["button"] = kNames[b];
    j["state"] = state == S_DOWN ? "down" : state == S_REPEAT ? "repeat" : "up";
    j["pad"] = kPads[pad <= P_NINTENDO ? pad : 0];
    const std::string s = j.dump();
    g_webview->PostWebMessageAsJson(std::wstring(s.begin(), s.end()).c_str());
}
