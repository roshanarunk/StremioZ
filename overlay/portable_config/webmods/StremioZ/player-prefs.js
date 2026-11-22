/**
 * @name StremioZ Player Preferences
 * @description Manual choices made while watching become the defaults for the
 *   next video: the anime upscaler preset (Shift+1/2/3, Ctrl+0, player menu),
 *   RTX Video HDR (Ctrl+H, player menu) and motion smoothing (Ctrl+M, player menu).
 *
 * profile-manager.lua publishes each choice as
 *   user-data/stremioz/upscaler-choice = "ajn-quality#7"
 *   user-data/stremioz/rtx-hdr-choice  = "yes#8"
 * (the counter makes a repeated choice a change too). This module observes
 * those properties through the shell and stores them in the settings Kai's
 * mpv bridge sends with every video (stremioz-upscaler, stremioz-rtx-hdr), so
 * Settings > Player shows the same values.
 */
(function () {
  "use strict";
  if (window.StremioZPrefs) return;

  const KEYS = { upscaler: "stremioz-upscaler", rtxHdr: "stremioz-rtx-hdr", motion: "stremioz-motion" };
  const PROPS = {
    "user-data/stremioz/upscaler-choice": (v) => set(KEYS.upscaler, v),
    "user-data/stremioz/rtx-hdr-choice": (v) => set(KEYS.rtxHdr, v === "yes" ? "true" : "false"),
    "user-data/stremioz/motion-choice": (v) => set(KEYS.motion, v === "yes" ? "true" : "false"),
  };

  function set(key, value) {
    try {
      if (localStorage.getItem(key) !== value) {
        localStorage.setItem(key, value);
        console.log(`[StremioZ Prefs] ${key} = ${value}`);
      }
    } catch (e) {}
  }

  function send(event, args) {
    try {
      window.chrome.webview.postMessage(
        JSON.stringify({ type: 6, object: "transport", method: "handleInboundJSON", args: [event, args] }),
      );
    } catch (e) {}
  }

  // Observe once per mpv session; observing twice only doubles events, which
  // are idempotent here.
  let observed = false;
  function observe() {
    if (observed) return;
    observed = true;
    for (const p of Object.keys(PROPS)) send("mpv-observe-prop", [p]);
  }

  if (window.chrome?.webview) {
    window.chrome.webview.addEventListener("message", (e) => {
      let m = e.data;
      if (typeof m === "string") {
        if (!m.includes("stremioz/")) return;
        try {
          m = JSON.parse(m);
        } catch (err) {
          return;
        }
      }
      const args = m?.args;
      if (!Array.isArray(args) || args[0] !== "mpv-prop-change") return;
      const handler = PROPS[args[1]?.name];
      const data = args[1]?.data;
      if (handler && typeof data === "string" && data) handler(data.split("#")[0]);
    });
    // mpv is created with the window; observe once it surely exists, and again
    // on the first playback in case it wasn't yet.
    setTimeout(observe, 4000);
    window.addEventListener("hashchange", () => {
      if (location.hash.startsWith("#/player") && !observed) observe();
    });
  }

  window.StremioZPrefs = {
    upscaler: () => localStorage.getItem(KEYS.upscaler) || "ajn-balanced",
    rtxHdr: () => localStorage.getItem(KEYS.rtxHdr) !== "false", // default on
    motion: () => localStorage.getItem(KEYS.motion) === "true", // default off
  };
})();
