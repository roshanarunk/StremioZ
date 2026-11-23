/**
 * @name StremioZ Player Controls
 * @description Two additions to Stremio's player:
 *   - Remembered playback speed. Stremio's shell player sets speed 1 on every
 *     video it loads; StremioZ keeps the last speed you chose instead
 *     (Settings > StremioZ > Remember playback speed, on by default).
 *   - A motion smoothing (RIFE) button in the control bar, next to the speed
 *     button. It shows profile-manager.lua's state for this video
 *     (user-data/stremioz/motion-state: "on", "wanted", "off") and switches it
 *     like Ctrl+M.
 *   - A fullscreen button at the end of the control bar, where the controller
 *     can reach it (Stremio's own is in the top bar).
 */
(function () {
  "use strict";
  if (window.StremioZPlayerControls) return;
  if (!window.chrome?.webview) return;

  const KEY_SPEED = "stremioz-speed";
  const KEY_REMEMBER = "stremioz-remember-speed";
  const MOTION_PROP = "user-data/stremioz/motion-state";

  const ls = {
    get(k) {
      try {
        return localStorage.getItem(k);
      } catch (e) {
        return null;
      }
    },
    set(k, v) {
      try {
        localStorage.setItem(k, String(v));
      } catch (e) {}
    },
  };

  const webview = window.chrome.webview;
  const post = webview.postMessage.bind(webview);
  const send = (event, args) =>
    post(JSON.stringify({ type: 6, object: "transport", method: "handleInboundJSON", args: [event, args] }));
  const onPlayer = () => location.hash.startsWith("#/player");

  // ───────────────────────────── remembered speed
  const remember = () => ls.get(KEY_REMEMBER) !== "false";
  function savedSpeed() {
    const v = parseFloat(ls.get(KEY_SPEED));
    return isFinite(v) && v >= 0.25 && v <= 4 ? v : null;
  }

  // Stremio sets the speed when the player opens and right after each
  // "loadfile". Inside those windows its speed is replaced by the saved one,
  // and speed changes aren't taken as your choice.
  let resetWindowUntil = 0;
  const openWindow = (ms) => (resetWindowUntil = Math.max(resetWindowUntil, Date.now() + ms));
  const inWindow = () => Date.now() < resetWindowUntil;

  function rewrite(raw) {
    if (typeof raw !== "string" || raw.indexOf("mpv-") < 0) return raw;
    let m;
    try {
      m = JSON.parse(raw);
    } catch (e) {
      return raw;
    }
    const args = m?.args;
    if (!Array.isArray(args) || !Array.isArray(args[1])) return raw;
    if (args[0] === "mpv-command" && args[1][0] === "loadfile") {
      openWindow(2000);
      return raw;
    }
    if (args[0] === "mpv-set-prop" && args[1][0] === "speed" && inWindow() && remember()) {
      const s = savedSpeed();
      if (s !== null && Number(args[1][1]) !== s) {
        args[1][1] = typeof args[1][1] === "string" ? String(s) : s;
        console.log(`[StremioZ Player] Speed ${s}× (remembered)`);
        return JSON.stringify(m);
      }
    }
    return raw;
  }

  try {
    webview.postMessage = function (msg) {
      return post(rewrite(msg));
    };
  } catch (e) {
    console.warn("[StremioZ Player] Couldn't hook the transport; the speed is corrected after loading instead", e);
  }

  let lastHash = location.hash;
  window.addEventListener("hashchange", () => {
    const was = lastHash.startsWith("#/player");
    lastHash = location.hash;
    if (onPlayer() && !was) {
      openWindow(3000);
      observeMotion();
      ensureButton();
    }
  });

  function onSpeed(value) {
    const v = Number(value);
    if (!isFinite(v) || v <= 0) return;
    if (inWindow()) {
      // Fallback for when the hook above isn't in place.
      const s = savedSpeed();
      if (remember() && s !== null && Math.abs(v - s) > 0.001) send("mpv-set-prop", ["speed", s]);
      return;
    }
    if (onPlayer() && remember() && savedSpeed() !== v) {
      ls.set(KEY_SPEED, v);
      console.log(`[StremioZ Player] Speed ${v}× saved`);
    }
  }

  // ───────────────────────────── motion smoothing button
  let motionState = "off";
  let motionObserved = false;
  function observeMotion() {
    if (motionObserved) return;
    motionObserved = true;
    send("mpv-observe-prop", [MOTION_PROP]);
  }

  webview.addEventListener("message", (e) => {
    let m = e.data;
    if (typeof m === "string") {
      if (m.indexOf("mpv-prop-change") < 0) return;
      if (m.indexOf('"speed"') < 0 && m.indexOf("motion-state") < 0) return;
      try {
        m = JSON.parse(m);
      } catch (err) {
        return;
      }
    }
    const args = m?.args;
    if (!Array.isArray(args) || args[0] !== "mpv-prop-change" || !args[1]) return;
    const { name, data } = args[1];
    if (name === "speed") onSpeed(data);
    else if (name === MOTION_PROP && typeof data === "string") {
      motionState = data.replace(/"/g, "") || "off";
      syncButton();
    }
  });

  const ICON =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
    '<circle cx="16" cy="12" r="5"/><path d="M2 8h5M1 12h6M2 16h5"/></svg>';

  const TITLES = {
    on: "Motion smoothing: on (Ctrl+M)",
    wanted: "Motion smoothing: on, but not for this video. It works on anime upscaled by AnimeJaNai (Ctrl+M)",
    off: "Motion smoothing: off (Ctrl+M)",
  };

  let button = null;
  function syncButton() {
    if (!button) return;
    button.classList.toggle("szp-on", motionState === "on");
    button.classList.toggle("szp-wanted", motionState === "wanted");
    button.title = TITLES[motionState] || TITLES.off;
  }

  // ───────────────────────────── fullscreen button
  // Stremio's own fullscreen button is in the player's top bar, where the
  // controller's control-bar navigation doesn't go. This one sits at the end
  // of the control bar; webmods/StremioZ/fullscreen.js routes the page's
  // fullscreen API to the window.
  const FS_ICONS = {
    enter:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
      '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>',
    exit:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
      '<path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/></svg>',
  };
  let fsButton = null;
  let iconClass = null;
  const isFullscreen = () => !!document.fullscreenElement;
  function syncFullscreenButton() {
    if (!fsButton) return;
    const on = isFullscreen();
    if (fsButton.dataset.on === String(on)) return;
    fsButton.dataset.on = String(on);
    fsButton.innerHTML = on ? FS_ICONS.exit : FS_ICONS.enter;
    if (iconClass) fsButton.firstElementChild.setAttribute("class", iconClass);
    fsButton.title = on ? "Exit fullscreen (F)" : "Fullscreen (F)";
  }
  document.addEventListener("fullscreenchange", syncFullscreenButton);

  // A control-bar button with the class names of Stremio's own buttons (the
  // pinned build's hashes).
  function makeButton(peer, extraClass, onClick) {
    const b = document.createElement("div");
    b.className = [...peer.classList].filter((c) => c !== "disabled" && !c.startsWith("szp-")).join(" ") + " " + extraClass;
    b.tabIndex = -1;
    b.addEventListener("mousedown", (e) => e.stopPropagation());
    b.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      onClick();
    });
    return b;
  }

  function ensureButton() {
    if (!onPlayer()) return;
    const box = document.querySelector('[class*="control-bar-buttons-menu-container-"]');
    if (!box) return;
    if (button && box.contains(button) && fsButton && box.contains(fsButton)) return;
    const peer = box.querySelector('[class*="control-bar-button-"]:not(.szp-motion):not(.szp-fullscreen)');
    if (!peer) return;
    iconClass = peer.querySelector("svg")?.getAttribute("class") || null;
    if (!button || !box.contains(button)) {
      button = makeButton(peer, "szp-motion", () => {
        send("mpv-command", ["script-message-to", "profile_manager", "stremioz-set-motion", "toggle"]);
        // Shown at once; profile-manager confirms with the state for this video.
        motionState = motionState === "off" ? "wanted" : "off";
        syncButton();
      });
      button.innerHTML = ICON;
      if (iconClass) button.firstElementChild.setAttribute("class", iconClass);
      box.insertBefore(button, box.firstChild);
      syncButton();
    }
    if (!fsButton || !box.contains(fsButton)) {
      fsButton = makeButton(peer, "szp-fullscreen", () => {
        if (isFullscreen()) document.exitFullscreen().catch(() => {});
        else document.documentElement.requestFullscreen().catch(() => {});
      });
      box.appendChild(fsButton);
      syncFullscreenButton();
    }
  }

  // The control bar is re-rendered while playing (and absent while hidden).
  setInterval(() => {
    if (onPlayer()) ensureButton();
  }, 750);
  setTimeout(observeMotion, 4000);
  if (onPlayer()) {
    openWindow(3000);
    observeMotion();
  }

  window.StremioZPlayerControls = {
    savedSpeed,
    motionState: () => motionState,
    _debug: () => ({ windowLeftMs: resetWindowUntil - Date.now(), onPlayer: onPlayer(), remember: remember() }),
  };
})();
