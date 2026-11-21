/**
 * @name StremioZ TV Navigation
 * @description Couch use with a game controller: spatial focus navigation on
 *   every page, player controls, a player quick menu, an on-screen keyboard and
 *   TV mode (hidden cursor, optional fullscreen, button hints).
 *
 * Input comes from the StremioZ shell (src/stremioz/gamepad.cpp, SDL3) as
 * {type: "stremioz-gamepad", button, state: down|repeat|up, pad} web messages,
 * so it works whichever part of the window has focus. Stremio Kai's browser
 * Gamepad API poller is off (navigation.js); Kai's keyboard handling stays for
 * keyboard users.
 *
 * Browse:  D-pad / left stick move, A select, B back, X search, Y home,
 *          LB/RB previous/next page, LT/RT jump up/down, right stick scroll,
 *          View: show/hide hints.
 * Player:  A play/pause, left/right seek 10 s (hold: faster), LT/RT seek 85 s,
 *          LB/RB speed -/+0.25, up: controls bar, X skip intro, Y quick menu,
 *          B back, Start next episode, View episode list, L3 subtitles,
 *          R3 audio, right stick volume.
 */
(function () {
  "use strict";
  if (window.StremioZTV?.initialized) return;
  // The shell runs webmods at document creation and retries a mod that throws,
  // so "initialized" is only set once everything below has run.
  const TV = (window.StremioZTV = {});

  const STORE = {
    fullscreen: "stremioz-tv-fullscreen", // default on
    hints: "stremioz-tv-hints", // default on
  };
  const PAGES = ["#/", "#/discover", "#/library", "#/calendar", "#/addons", "#/settings"];
  const FOCUSABLE =
    'a[href], button:not([disabled]), input:not([type="hidden"]):not([disabled]), select, textarea, ' +
    '[tabindex]:not([tabindex="-1"]), [role="button"], [role="option"], [role="menuitem"]';
  // Overlays that own the focus while open (topmost wins). Our own first.
  const OVERLAYS = [
    ".szt-osk",
    ".szt-quick",
    ".kai-wizard-overlay",
    '[class*="menu-layer-"]', // player menus (subtitles, audio, speed, ...)
    '[class*="side-drawer-layer-"]', // player episode list
    '[class*="modal-dialog-container"]',
    '[class*="modal-container"]',
    '[class*="dialog-container"]',
    '[class*="dropdown-container"][class*="open"]',
    '[class*="menu-direction-"]', // pop-up menus (profile, sort, ...)
    '[class*="popup-menu"]',
  ];

  // Where the first press lands on a page, when it has one of these: the
  // episode list or the stream list on a detail page.
  const PRIMARY =
    '[class*="videos-container-"] > *, [class*="streams-container-"] > *, [class*="streams-list-"] [class*="stream-container-"]';

  let pad = "xbox";
  let focused = null;
  const rowMemory = new WeakMap();

  // ───────────────────────────── helpers
  const isPlayer = () => location.hash.startsWith("#/player");
  const hash = () => location.hash || "#/";
  const lsGet = (k, d) => {
    try {
      const v = localStorage.getItem(k);
      return v === null ? d : v === "true";
    } catch (e) {
      return d;
    }
  };

  function shown(el) {
    if (!el || !el.isConnected || !el.getClientRects().length) return false;
    const r = el.getBoundingClientRect();
    if (r.width < 4 || r.height < 4) return false;
    const cs = getComputedStyle(el);
    if (cs.visibility === "hidden" || cs.display === "none" || +cs.opacity === 0) return false;
    return true;
  }

  function topOverlay() {
    let best = null;
    for (const sel of OVERLAYS) {
      for (const el of document.querySelectorAll(sel)) {
        if (!shown(el) || !candidates(el).length) continue;
        // Last in document order wins within a selector (portals append).
        best = el;
      }
      if (best) return best;
    }
    return null;
  }

  function usable(el) {
    if (!shown(el) || el.closest(".szt-hints, .szt-shield")) return false;
    const r = el.getBoundingClientRect();
    // Full-window click layers are not targets.
    return !(r.width > innerWidth * 0.9 && r.height > innerHeight * 0.6);
  }

  // Focusable elements plus clickable ones that are not focusable (Kai's
  // option rows, toggles and chips are plain divs with click handlers): an
  // element where a pointer cursor starts, i.e. its parent has another cursor.
  const cache = new Map();
  const watch = () => {
    // No document element yet this early in a page load.
    if (!document.documentElement) return setTimeout(watch, 20);
    new MutationObserver(() => cache.clear()).observe(document.documentElement, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["class", "style", "hidden", "disabled"],
    });
  };
  watch();
  function clickables(root) {
    if (cache.has(root)) return cache.get(root);
    const out = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
    for (let el = walker.nextNode(); el; el = walker.nextNode()) {
      if (el.matches(FOCUSABLE)) {
        out.push(el);
        continue;
      }
      if (/^(svg|path|img|span|i|b|p|h\d)$/i.test(el.tagName) && !el.className) continue;
      if (getComputedStyle(el).cursor !== "pointer") continue;
      const p = el.parentElement;
      if (p && getComputedStyle(p).cursor === "pointer") continue;
      out.push(el);
    }
    cache.set(root, out);
    return out;
  }

  function candidates(scope) {
    const all = clickables(scope || document.body).filter(usable);
    const set = new Set(all);
    const real = new Set(all.filter((el) => el.matches(FOCUSABLE)));
    return all.filter((el) => {
      // A pointer-only container that holds real buttons is not a target itself.
      if (!real.has(el)) for (const r of real) if (el.contains(r)) return false;
      // Keep the outermost of nested targets (a card, not its inner icon).
      for (let p = el.parentElement; p; p = p.parentElement) if (set.has(p)) return false;
      return true;
    });
  }

  const rowOf = (el) =>
    el && el.closest('[class*="board-row-"], [class*="meta-items-container-"], [class*="videos-list-"], [class*="streams-list-"], [class*="seasons-bar-"]');

  function setFocus(el, opts = {}) {
    if (!el) return;
    for (const old of document.querySelectorAll(".szt-focus")) if (old !== el) old.classList.remove("szt-focus");
    focused = el;
    el.classList.add("szt-focus");
    // Clickable divs only take DOM focus with a tabindex.
    if (!el.matches(FOCUSABLE) && !el.hasAttribute("tabindex")) el.setAttribute("tabindex", "-1");
    try {
      el.focus({ preventScroll: true });
    } catch (e) {}
    if (!opts.noScroll) el.scrollIntoView({ block: opts.block || "nearest", inline: "nearest", behavior: "smooth" });
    const row = rowOf(el);
    if (row) rowMemory.set(row, el);
  }

  // The focus ring is its own fixed layer that follows the focused element, so
  // overflow: hidden containers (cards, rows, toggles) never clip it.
  let ring = null,
    ringFor = null,
    ringMoveUntil = 0;
  function ringTick() {
    requestAnimationFrame(ringTick);
    if (!document.body) return;
    if (!ring) {
      ring = document.createElement("div");
      ring.className = "szt-ring";
      document.body.appendChild(ring);
    }
    const on = document.body.classList.contains("szt-tv") && focused && shown(focused);
    ring.classList.toggle("on", !!on);
    if (!on) return;
    if (ringFor !== focused) {
      // Glide between targets; follow scrolling without lag.
      ringFor = focused;
      ringMoveUntil = performance.now() + 160;
      const rr = getComputedStyle(focused).borderRadius;
      ring.style.borderRadius = rr && rr !== "0px" ? `calc(${rr} + 4px)` : "10px";
    }
    ring.classList.toggle("glide", performance.now() < ringMoveUntil);
    const r = focused.getBoundingClientRect();
    ring.style.left = r.left - 5 + "px";
    ring.style.top = r.top - 5 + "px";
    ring.style.width = r.width + 10 + "px";
    ring.style.height = r.height + 10 + "px";
  }
  requestAnimationFrame(ringTick);

  function current(scope) {
    const a = document.activeElement;
    if (a && a !== document.body && (!scope || scope.contains(a)) && shown(a)) return a;
    if (focused && shown(focused) && (!scope || scope.contains(focused))) return focused;
    return null;
  }

  // Spatial search: best candidate in the half-plane of dir.
  function pick(cur, dir, list) {
    // Left/right: stay in the same horizontal band when anything there qualifies.
    if (dir === "left" || dir === "right") {
      const c = cur.getBoundingClientRect();
      const band = list.filter((el) => {
        const r = el.getBoundingClientRect();
        return Math.min(r.bottom, c.bottom) - Math.max(r.top, c.top) > Math.min(r.height, c.height) * 0.3;
      });
      const inBand = pickScored(cur, dir, band);
      if (inBand) return inBand;
    } else {
      // Up/down: stay in the left nav bar, or out of it (left/right switch).
      const side = (el) => !!el.closest('[class*="vertical-nav-bar-"]');
      // Nothing that way on this side: none (move() scrolls and retries).
      return pickScored(cur, dir, list.filter((el) => side(el) === side(cur)));
    }
    return pickScored(cur, dir, list);
  }

  function pickScored(cur, dir, list) {
    const c = cur.getBoundingClientRect();
    const cx = c.left + c.width / 2,
      cy = c.top + c.height / 2;
    let best = null,
      bestScore = Infinity;
    for (const el of list) {
      if (el === cur || cur.contains(el) || el.contains(cur)) continue;
      const r = el.getBoundingClientRect();
      const x = r.left + r.width / 2,
        y = r.top + r.height / 2;
      let primary, cross, overlap;
      if (dir === "right" || dir === "left") {
        if (dir === "right" ? x <= cx + 2 || r.right <= c.right : x >= cx - 2 || r.left >= c.left) continue;
        primary = dir === "right" ? Math.max(0, r.left - c.right) : Math.max(0, c.left - r.right);
        overlap = Math.min(r.bottom, c.bottom) - Math.max(r.top, c.top);
        cross = overlap > 0 ? 0 : Math.abs(y - cy);
      } else {
        if (dir === "down" ? y <= cy + 2 || r.bottom <= c.bottom : y >= cy - 2 || r.top >= c.top) continue;
        primary = dir === "down" ? Math.max(0, r.top - c.bottom) : Math.max(0, c.top - r.bottom);
        overlap = Math.min(r.right, c.right) - Math.max(r.left, c.left);
        cross = overlap > 0 ? Math.abs(x - cx) * 0.25 : Math.abs(x - cx);
      }
      const score = primary + cross * 2;
      if (score < bestScore) {
        bestScore = score;
        best = el;
      }
    }
    return best;
  }

  // probe: an instant scroll to make lazily rendered rows appear, and only
  // when a good amount is left that way (not just trailing padding).
  // The innermost scrollable ancestor in a direction (null: the page).
  function scrollerOf(el, vertical) {
    for (; el && el !== document.body; el = el.parentElement) {
      const cs = getComputedStyle(el);
      if (vertical && /(auto|scroll)/.test(cs.overflowY) && el.scrollHeight > el.clientHeight + 4) return el;
      if (!vertical && /(auto|scroll)/.test(cs.overflowX) && el.scrollWidth > el.clientWidth + 4) return el;
    }
    return null;
  }

  // First focus on a page with an episode or stream list. Stremio scrolls an
  // episode list to the episode you're on (centred) when a show opens; follow
  // it instead of going back to episode 1: the in-progress episode if it is
  // in view, else the one nearest the middle. An unscrolled list: the first.
  function pickPrimary(list) {
    const prim = list.filter((el) => el.matches(PRIMARY) || el.parentElement?.matches(PRIMARY));
    if (!prim.length) return null;
    const box = scrollerOf(prim[0], true);
    if (!box || box.scrollTop < 8) return prim[0];
    const br = box.getBoundingClientRect();
    const inView = prim.filter((el) => {
      const r = el.getBoundingClientRect();
      return r.bottom > br.top + 8 && r.top < br.bottom - 8;
    });
    const watching = inView.find((el) => el.querySelector('[class*="progress"]'));
    if (watching) return watching;
    const mid = br.top + br.height / 2;
    const dist = (el) => {
      const r = el.getBoundingClientRect();
      return Math.abs(r.top + r.height / 2 - mid);
    };
    return inView.sort((a, b) => dist(a) - dist(b))[0] || prim[0];
  }

  function scrollStep(dir, probe = false) {
    const dy = dir === "down" ? 1 : dir === "up" ? -1 : 0;
    const dx = dir === "right" ? 1 : dir === "left" ? -1 : 0;
    // The innermost scrollable around the focus, else the page's main scroller.
    let el = current();
    for (; el; el = el.parentElement) {
      const cs = getComputedStyle(el);
      const canY = dy && /(auto|scroll)/.test(cs.overflowY) && el.scrollHeight > el.clientHeight + 4;
      const canX = dx && /(auto|scroll)/.test(cs.overflowX) && el.scrollWidth > el.clientWidth + 4;
      if (canY || canX) break;
    }
    const target = el || document.scrollingElement;
    if (probe) {
      const left = dy > 0 ? target.scrollHeight - target.clientHeight - target.scrollTop
        : dy < 0 ? target.scrollTop
        : dx > 0 ? target.scrollWidth - target.clientWidth - target.scrollLeft
        : target.scrollLeft;
      if (left < (dy ? innerHeight : innerWidth) / 3) return false;
    }
    target.scrollBy({ top: dy * innerHeight * 0.5, left: dx * innerWidth * 0.5, behavior: probe ? "auto" : "smooth" });
    return true;
  }

  function move(dir, scope) {
    const list = candidates(scope);
    if (!list.length) return;
    const cur = current(scope);
    if (!cur) {
      const primary = !scope && pickPrimary(list);
      if (primary) return setFocus(primary, { noScroll: true });
      // Nothing focused: the first thing on screen, top-left first.
      // Content first: the nav bars are one press away.
      const nav = (el) => el.closest('nav, header, [class*="horizontal-nav-bar-"], [class*="vertical-nav-bar-"]');
      let onScreen = list.filter((el) => {
        const r = el.getBoundingClientRect();
        return r.top >= 0 && r.top < innerHeight * 0.85 && r.left >= 0 && r.left < innerWidth;
      });
      if (onScreen.some((el) => !nav(el))) onScreen = onScreen.filter((el) => !nav(el));
      // The top row (within 60 px of the highest), leftmost first.
      const pool = onScreen.length ? onScreen : list;
      const top = Math.min(...pool.map((el) => el.getBoundingClientRect().top));
      const first = pool
        .filter((el) => el.getBoundingClientRect().top < top + 60)
        .sort((a, b) => a.getBoundingClientRect().left - b.getBoundingClientRect().left)[0];
      setFocus(first);
      return;
    }
    let next = pick(cur, dir, list);
    if (next && (dir === "up" || dir === "down")) {
      const row = rowOf(next);
      if (row && row !== rowOf(cur)) {
        const mem = rowMemory.get(row);
        if (mem && mem.isConnected && shown(mem)) next = mem;
      }
    }
    if (next) {
      setFocus(next, { block: dir === "up" || dir === "down" ? "center" : "nearest" });
      return;
    }
    // Nothing that way yet: scroll (rows load lazily), then try once more
    // with what the scroll rendered; else bring the focus back into view.
    const before = new Set(list);
    if (!scrollStep(dir, true)) return;
    setTimeout(() => {
      const again = pick(cur, dir, candidates(scope).filter((el) => !before.has(el)));
      if (again) setFocus(again, { block: "center" });
      else if (cur.isConnected) cur.scrollIntoView({ block: "nearest", inline: "nearest" });
    }, 220);
  }

  function click(el) {
    if (!el) return;
    const o = { bubbles: true, cancelable: true, view: window };
    el.dispatchEvent(new PointerEvent("pointerdown", o));
    el.dispatchEvent(new MouseEvent("mousedown", o));
    el.dispatchEvent(new PointerEvent("pointerup", o));
    el.dispatchEvent(new MouseEvent("mouseup", o));
    el.click();
  }

  function key(k, code, opts = {}) {
    const init = { key: k, code: code || k, bubbles: true, cancelable: true, composed: true, ...opts };
    const t = opts.target || document;
    t.dispatchEvent(new KeyboardEvent("keydown", init));
    if (!opts.noUp) t.dispatchEvent(new KeyboardEvent("keyup", init));
  }

  function shell(event, args) {
    try {
      window.chrome.webview.postMessage(
        JSON.stringify({ type: 6, object: "transport", method: "handleInboundJSON", args: [event, args] }),
      );
    } catch (e) {}
  }
  const mpvCmd = (...args) => shell("mpv-command", args);
  const mpvSet = (prop, value) => shell("mpv-set-prop", [prop, String(value)]);

  function toast(text) {
    let t = document.querySelector(".szt-toast");
    if (!t) {
      t = document.createElement("div");
      t.className = "szt-toast";
      document.body.appendChild(t);
    }
    t.textContent = text;
    t.classList.add("show");
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => t.classList.remove("show"), 1600);
  }

  const isText = (el) =>
    el && ((el.tagName === "INPUT" && !/^(checkbox|radio|range|button|submit)$/i.test(el.type)) || el.tagName === "TEXTAREA");

  // ───────────────────────────── TV mode
  function tvOn() {
    if (!document.body.classList.contains("szt-tv")) {
      document.body.classList.add("szt-tv");
      // A transparent layer hides the cursor and keeps hover effects from
      // firing under a mouse left on the screen. The first real mouse
      // movement removes it (cursor: none on every element would also hide
      // the pointer cursor that marks Kai's clickable divs).
      if (!document.querySelector(".szt-shield")) {
        const sh = document.createElement("div");
        sh.className = "szt-shield";
        document.body.appendChild(sh);
      }
      renderHints();
    }
    if (lsGet(STORE.fullscreen, true) && !TV.fullscreenAsked) {
      TV.fullscreenAsked = true;
      if (!document.fullscreenElement && !(innerWidth >= screen.width - 2 && innerHeight >= screen.height - 2))
        shell("stremioz-fullscreen", ["true"]);
    }
  }
  function tvOff() {
    document.body.classList.remove("szt-tv");
    document.querySelector(".szt-shield")?.remove();
  }
  window.addEventListener(
    "mousemove",
    (e) => e.isTrusted && Math.abs(e.movementX) + Math.abs(e.movementY) >= 3 && tvOff(),
    true,
  );
  for (const t of ["wheel", "mousedown"]) window.addEventListener(t, (e) => e.isTrusted && tvOff(), true);

  const GLYPHS = {
    xbox: { a: "A", b: "B", x: "X", y: "Y", lb: "LB", rb: "RB", lt: "LT", rt: "RT", start: "☰", back: "⧉" },
    playstation: { a: "✕", b: "○", x: "□", y: "△", lb: "L1", rb: "R1", lt: "L2", rt: "R2", start: "OPTIONS", back: "SHARE" },
    nintendo: { a: "B", b: "A", x: "Y", y: "X", lb: "L", rb: "R", lt: "ZL", rt: "ZR", start: "+", back: "−" },
    generic: { a: "A", b: "B", x: "X", y: "Y", lb: "LB", rb: "RB", lt: "LT", rt: "RT", start: "Start", back: "Back" },
  };
  function renderHints() {
    let h = document.querySelector(".szt-hints");
    if (!h) {
      h = document.createElement("div");
      h.className = "szt-hints";
      document.body.appendChild(h);
    }
    if (!lsGet(STORE.hints, true)) {
      h.innerHTML = "";
      return;
    }
    const g = GLYPHS[pad] || GLYPHS.generic;
    let items;
    if (document.querySelector(".szt-osk")) items = [["a", "Type"], ["x", "Delete"], ["y", "Space"], ["start", "Done"], ["b", "Close"]];
    else if (document.querySelector(".szt-quick") || topOverlay()) items = [["a", "Select"], ["b", "Close"]];
    else if (isPlayer())
      items = [["a", "Play/Pause"], ["y", "Menu"], ["x", "Skip intro"], ["lb", "Speed −"], ["rb", "Speed +"], ["b", "Back"]];
    else items = [["a", "Select"], ["b", "Back"], ["x", "Search"], ["y", "Home"], ["lb", "◀ Page"], ["rb", "Page ▶"]];
    h.innerHTML = items
      .map(([b, label]) => `<span class="szt-hint"><b class="szt-btn szt-btn-${b}">${g[b]}</b>${label}</span>`)
      .join("");
    // Fades after a few idle seconds (it sits over the bottom row); the next
    // press brings it back.
    h.classList.add("show");
    clearTimeout(renderHints.timer);
    renderHints.timer = setTimeout(() => h.classList.remove("show"), 5000);
  }
  // Per-page focus memory: back on a page, focus returns where it was.
  const pageFocus = new Map();
  window.addEventListener("hashchange", (e) => {
    if (focused) pageFocus.set(new URL(e.oldURL).hash || "#/", focused);
    if (!document.body.classList.contains("szt-tv")) return;
    exitControlsQuiet();
    const mem = pageFocus.get(hash());
    setTimeout(() => {
      // The keyboard or quick menu opened meanwhile (X opens search + keyboard).
      if (document.querySelector(".szt-osk, .szt-quick")) return;
      if (mem && mem.isConnected && shown(mem)) setFocus(mem);
      else focusFresh();
      renderHints();
    }, 300);
  });

  // ───────────────────────────── on-screen keyboard
  const OSK_ROWS = [
    "1234567890".split(""),
    "qwertyuiop".split(""),
    "asdfghjkl'".split(""),
    "zxcvbnm,.-".split(""),
    ["⇧", "@", "space", ".com", "⌫", "Done"],
  ];
  const nativeSetter = (el) =>
    Object.getOwnPropertyDescriptor(el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype, "value").set;

  function oskOpen(input) {
    oskClose();
    const osk = document.createElement("div");
    osk.className = "szt-osk";
    osk.innerHTML = `<div class="szt-osk-preview"></div><div class="szt-osk-keys"></div>`;
    const keys = osk.querySelector(".szt-osk-keys");
    let shift = false;
    const preview = osk.querySelector(".szt-osk-preview");
    const write = (v) => {
      nativeSetter(input).call(input, v);
      input.dispatchEvent(new Event("input", { bubbles: true }));
      preview.textContent = input.type === "password" ? "•".repeat(v.length) : v || " ";
    };
    TV.osk = {
      input,
      type(ch) {
        write(input.value + (shift ? ch.toUpperCase() : ch));
      },
      del() {
        write(input.value.slice(0, -1));
      },
      done() {
        oskClose();
        input.focus();
        key("Enter", "Enter", { target: input });
      },
    };
    OSK_ROWS.forEach((row) => {
      const r = document.createElement("div");
      r.className = "szt-osk-row";
      row.forEach((k) => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "szt-osk-key" + (k.length > 1 ? " wide" : "");
        b.textContent = k === "space" ? "Space" : k;
        b.addEventListener("click", (e) => {
          e.preventDefault();
          if (k === "⌫") TV.osk.del();
          else if (k === "Done") TV.osk.done();
          else if (k === "space") TV.osk.type(" ");
          else if (k === "⇧") {
            shift = !shift;
            osk.classList.toggle("shift", shift);
          } else TV.osk.type(k);
        });
        r.appendChild(b);
      });
      keys.appendChild(r);
    });
    document.body.appendChild(osk);
    preview.textContent = input.value || " ";
    setFocus(osk.querySelector(".szt-osk-row:nth-child(2) .szt-osk-key"));
    renderHints();
  }
  function oskClose() {
    document.querySelector(".szt-osk")?.remove();
    TV.osk = null;
    renderHints();
  }

  // ───────────────────────────── player quick menu
  // Upscaler and RTX HDR choices also become the defaults for the next video
  // (profile-manager publishes them; player-prefs.js saves them).
  const sendUpscaler = (k) => mpvCmd("script-message-to", "profile_manager", "stremioz-set-upscaler", k);
  const sendRtxHdr = (on) => mpvCmd("script-message-to", "profile_manager", "stremioz-set-rtx-hdr", on ? "yes" : "no");
  function quickOpen() {
    quickClose();
    const prefs = window.StremioZPrefs;
    const ups = prefs ? prefs.upscaler() : null;
    const rtx = prefs ? prefs.rtxHdr() : true;
    const items = [
      ["Subtitles", () => key("s", "KeyS")],
      ["Audio", () => key("a", "KeyA")],
      ["Speed 1×", () => (mpvSet("speed", 1), toast("Speed 1×"))],
      ["Speed 1.5×", () => (mpvSet("speed", 1.5), toast("Speed 1.5×"))],
      ["Speed 2×", () => (mpvSet("speed", 2), toast("Speed 2×"))],
      ["AnimeJaNai Quality", () => sendUpscaler("ajn-quality"), ups === "ajn-quality"],
      ["AnimeJaNai Balanced", () => sendUpscaler("ajn-balanced"), ups === "ajn-balanced"],
      ["AnimeJaNai Performance", () => sendUpscaler("ajn-performance"), ups === "ajn-performance"],
      ["Upscaling off", () => sendUpscaler("off"), ups === "off"],
      [rtx ? "RTX HDR: on" : "RTX HDR: off", () => sendRtxHdr(!rtx), rtx],
      ["Skip intro", () => mpvCmd("script-message-to", "notify_skip", "perform-skip")],
      ["Next episode", nextEpisode],
      ["Episode list", () => key("i", "KeyI")],
    ];
    const q = document.createElement("div");
    q.className = "szt-quick";
    q.innerHTML = `<div class="szt-quick-title">Player</div>`;
    items.forEach(([label, fn, on]) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "szt-quick-item" + (on ? " on" : "");
      b.textContent = label;
      b.addEventListener("click", (e) => {
        e.preventDefault();
        quickClose();
        fn();
      });
      q.appendChild(b);
    });
    document.body.appendChild(q);
    setFocus(q.querySelector(".szt-quick-item"));
    renderHints();
  }
  // A <select> does not open from a synthetic click: list its options instead.
  function pickerOpen(select) {
    quickClose();
    const q = document.createElement("div");
    q.className = "szt-quick szt-picker";
    q.innerHTML = `<div class="szt-quick-title"></div>`;
    q.firstChild.textContent = select.getAttribute("aria-label") || select.closest("label, [class*=option], [class*=field]")?.querySelector("label, [class*=title], [class*=label]")?.textContent || "Choose";
    let sel = null;
    Array.from(select.options).forEach((o, i) => {
      if (o.disabled || o.hidden) return;
      const b = document.createElement("button");
      b.type = "button";
      b.className = "szt-quick-item";
      b.textContent = o.textContent;
      if (i === select.selectedIndex) sel = b;
      b.addEventListener("click", (e) => {
        e.preventDefault();
        quickClose();
        const set = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value").set;
        set.call(select, o.value);
        select.dispatchEvent(new Event("input", { bubbles: true }));
        select.dispatchEvent(new Event("change", { bubbles: true }));
        setFocus(select);
      });
      q.appendChild(b);
    });
    document.body.appendChild(q);
    TV.pickerFor = select;
    setFocus(sel || q.querySelector(".szt-quick-item"), { block: "center" });
    renderHints();
  }
  function quickClose() {
    document.querySelector(".szt-quick")?.remove();
    if (TV.pickerFor) {
      const s = TV.pickerFor;
      TV.pickerFor = null;
      if (s.isConnected) setFocus(s);
    }
    renderHints();
  }
  function nextEpisode() {
    const n = document.querySelector('div[title="Next Video"], [class*="next-video"] [class*="button"]');
    if (n) click(n);
    else toast("No next episode");
  }

  // ───────────────────────────── Escape in the player
  // Stremio maps Escape to history.back() unless a component marks the event
  // handled. Its pop-up menus do; the player's subtitle/audio/speed menus and
  // the episode drawer don't, so Escape (a keyboard's, Kai's or our B) left
  // the stream. This capture listener runs before Stremio's: with one of those
  // open, Escape closes it with its own toggle key and goes no further. The
  // same goes for our keyboard and player menu.
  const PLAYER_MENUS = [
    ["audio-menu-", "a", "KeyA"],
    ["subtitles-menu-", "s", "KeyS"],
    ["speed-menu-", "r", "KeyR"],
    ["statistics-menu-", "d", "KeyD"],
    ["side-drawer-", "i", "KeyI"],
  ];
  function openPlayerMenu() {
    if (!isPlayer()) return null;
    const layers = Array.from(
      document.querySelectorAll('[class*="menu-layer-"], [class*="side-drawer-layer-"]'),
    ).filter(shown);
    return layers.pop() || null;
  }
  function closePlayerMenu(layer) {
    const hit = PLAYER_MENUS.find(
      ([cls]) => layer.className.includes(cls) || layer.querySelector(`[class*="${cls}"]`),
    );
    if (hit) return key(hit[1], hit[2]);
    // Unknown menu: a mousedown outside closes pop-ups (a click on the video
    // would toggle pause).
    const o = { bubbles: true, cancelable: true, view: window };
    document.body.dispatchEvent(new MouseEvent("mousedown", o));
    document.body.dispatchEvent(new MouseEvent("mouseup", o));
  }
  window.addEventListener(
    "keydown",
    (e) => {
      if (e.key !== "Escape") return;
      let handled = true;
      if (document.querySelector(".szt-osk")) oskClose();
      else if (document.querySelector(".szt-quick")) quickClose();
      else {
        const layer = openPlayerMenu();
        if (layer) closePlayerMenu(layer);
        else handled = false;
      }
      if (handled) {
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    },
    true,
  );

  // ───────────────────────────── actions
  let controlsMode = false; // player: navigating the control bar
  const openers = new WeakMap(); // overlay -> the element that opened it

  function back() {
    if (document.querySelector(".szt-osk")) return oskClose();
    if (document.querySelector(".szt-quick")) return quickClose();
    const ov = topOverlay();
    if (ov) {
      // Stremio closes menus/dialogs on Escape (Kai lets it through then).
      key("Escape", "Escape", { target: window });
      setTimeout(() => {
        if (ov.isConnected && shown(ov)) click(document.querySelector(".modal-backdrop") || document.body);
        setTimeout(() => {
          const o = openers.get(ov);
          const next = topOverlay();
          if (o && o.isConnected && shown(o) && (!next || next.contains(o))) setFocus(o);
          renderHints();
        }, 150);
      }, 150);
      return;
    }
    if (isPlayer() && controlsMode) return exitControls();
    if (isText(document.activeElement)) return document.activeElement.blur();
    if (hash() === "#/" || hash() === "#") return; // already home
    history.back();
  }

  function activate() {
    if (TV.osk && document.activeElement?.closest(".szt-osk")) return click(document.activeElement);
    const el = current(topOverlay());
    if (isText(el)) return oskOpen(el);
    if (el && el.tagName === "SELECT") return pickerOpen(el);
    if (el) return click(el);
    move("down", topOverlay()); // nothing focused yet: focus something
  }

  // After switching pages: drop the old focus (Stremio keeps earlier routes
  // mounted, hidden) and focus the new page's content once it has rendered.
  function focusFresh() {
    if (focused) focused.classList.remove("szt-focus");
    focused = null;
    document.activeElement?.blur();
    whenSettled(() => !current() && move("down"));
  }

  // Run fn once the page has rendered and stopped scrolling by itself (a
  // detail page loads its data, then Stremio scrolls the episode list), so
  // the first focus doesn't fight that scroll. At most 2.5 s.
  function whenSettled(fn) {
    const start = performance.now();
    let last = null,
      still = 0;
    const tick = () => {
      const list = document.querySelector('[class*="videos-container-"], [class*="streams-container-"]');
      const pos = list ? list.scrollTop : -1;
      still = pos === last ? still + 1 : 0;
      last = pos;
      const t = performance.now() - start;
      const waitList = hash().startsWith("#/detail/") && !list;
      if ((t > 400 && still >= 3 && !waitList) || t > 2500) fn();
      else setTimeout(tick, 100);
    };
    setTimeout(tick, 100);
  }

  // Right stick: scroll, then move the highlight to whatever now sits where
  // it was on screen, within the same list (TV-style), once scrolling stops.
  let stick = null;
  function stickScroll(dir, scope) {
    const vertical = dir === "up" || dir === "down";
    const cur = current(scope);
    if (!stick && cur) {
      const r = cur.getBoundingClientRect();
      stick = { x: r.left + r.width / 2, y: r.top + r.height / 2, box: scrollerOf(cur, vertical) };
    }
    scrollStep(dir);
    if (!stick) return;
    clearTimeout(stick.timer);
    stick.timer = setTimeout(() => {
      const { x, y, box } = stick;
      stick = null;
      const br = box ? box.getBoundingClientRect() : { top: 0, bottom: innerHeight, left: 0, right: innerWidth };
      const near = candidates(scope)
        .filter((el) => !box || box.contains(el))
        .filter((el) => {
          const r = el.getBoundingClientRect();
          const cx = r.left + r.width / 2,
            cy = r.top + r.height / 2;
          return cy > br.top && cy < br.bottom && cx > br.left && cx < br.right;
        })
        .sort((a, b) => {
          const d = (el) => {
            const r = el.getBoundingClientRect();
            return Math.hypot(r.left + r.width / 2 - x, r.top + r.height / 2 - y);
          };
          return d(a) - d(b);
        })[0];
      if (near) setFocus(near, { noScroll: true });
    }, 420);
  }

  function cyclePage(step) {
    const h = hash();
    let i = PAGES.findIndex((p) => (p === "#/" ? h === "#/" || h === "#" : h.startsWith(p)));
    i = i < 0 ? 0 : Math.max(0, Math.min(PAGES.length - 1, i + step));
    location.hash = PAGES[i];
  }

  function search() {
    const btn = document.querySelector('[class*="search-button-"], [class*="submit-button-container-"]');
    if (btn) click(btn);
    else location.hash = "#/search";
    setTimeout(() => {
      const input = document.querySelector('[class*="search-input-"] input, [class*="search-bar-container-"] input, input[type="search"], input[type="text"]');
      if (input) {
        input.focus();
        oskOpen(input);
      }
    }, 250);
  }

  function showPlayerControls() {
    // The web player shows its bars on mouse movement.
    const target = document.querySelector('[class*="player-container-"]') || document.body;
    target.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, clientX: innerWidth / 2, clientY: innerHeight - 40 }));
  }
  function enterControls() {
    showPlayerControls();
    const btns = candidates(document.querySelector('[class*="control-bar-container-"]') || document);
    if (!btns.length) return;
    controlsMode = true;
    setFocus(btns.find((b) => /play|pause/i.test(b.title || "")) || btns[0]);
  }
  function exitControlsQuiet() {
    controlsMode = false;
  }
  function exitControls() {
    controlsMode = false;
    if (focused) focused.classList.remove("szt-focus");
    focused = null;
    document.activeElement?.blur();
  }

  function playerButton(b, state) {
    const repeat = state === "repeat";
    switch (b) {
      case "a":
        if (controlsMode) return activate();
        if (!repeat) key("MediaPlayPause", "MediaPlayPause");
        return showPlayerControls();
      case "b":
        return !repeat && back();
      case "left":
      case "right":
        if (controlsMode) return move(b, document.querySelector('[class*="control-bar-container-"]'));
        document.activeElement?.blur();
        // Stremio seeks on keydown and ends seeking on keyup.
        key(b === "left" ? "ArrowLeft" : "ArrowRight", b === "left" ? "ArrowLeft" : "ArrowRight", { noUp: true });
        return;
      case "up":
        return controlsMode ? move("up", document.querySelector('[class*="control-bar-container-"]')) : enterControls();
      case "down":
        return controlsMode ? exitControls() : showPlayerControls();
      case "lt":
        return mpvCmd("keypress", "Ctrl+Shift+LEFT");
      case "rt":
        return mpvCmd("keypress", "Ctrl+Shift+RIGHT");
      case "lb":
        return mpvCmd("keypress", "Ctrl+Shift+DOWN");
      case "rb":
        return mpvCmd("keypress", "Ctrl+Shift+UP");
      case "x":
        return !repeat && mpvCmd("script-message-to", "notify_skip", "perform-skip");
      case "y":
        return !repeat && quickOpen();
      case "start":
        return !repeat && nextEpisode();
      case "back":
        return !repeat && key("i", "KeyI");
      case "ls":
        return !repeat && key("s", "KeyS");
      case "rs":
        return !repeat && key("a", "KeyA");
      case "rs_up":
        return key("ArrowUp", "ArrowUp");
      case "rs_down":
        return key("ArrowDown", "ArrowDown");
    }
  }

  function browseButton(b, state, scope) {
    const repeat = state === "repeat";
    switch (b) {
      case "up":
      case "down":
      case "left":
      case "right":
        return move(b, scope);
      case "a":
        return !repeat && activate();
      case "b":
        return !repeat && back();
      case "x":
        if (TV.osk) return TV.osk.del();
        return !repeat && !scope && search();
      case "y":
        if (TV.osk) return TV.osk.type(" ");
        if (!repeat && !scope) {
          location.hash = "#/";
        }
        return;
      case "start":
        if (TV.osk) return TV.osk.done();
        return;
      case "lb":
        return !repeat && !scope && cyclePage(-1);
      case "rb":
        return !repeat && !scope && cyclePage(1);
      case "lt":
      case "rt":
        for (let i = 0; i < 3; i++) move(b === "lt" ? "up" : "down", scope);
        return;
      case "rs_up":
      case "rs_down":
      case "rs_left":
      case "rs_right":
        return stickScroll(b.slice(3), scope);
      case "back":
        if (!repeat) {
          localStorage.setItem(STORE.hints, String(!lsGet(STORE.hints, true)));
          renderHints();
        }
        return;
    }
  }

  function onPad(msg) {
    if (msg.pad) pad = msg.pad;
    if (msg.state === "up") {
      // End a held seek on the web player.
      if (isPlayer() && !controlsMode && (msg.button === "left" || msg.button === "right"))
        document.dispatchEvent(
          new KeyboardEvent("keyup", {
            key: msg.button === "left" ? "ArrowLeft" : "ArrowRight",
            code: msg.button === "left" ? "ArrowLeft" : "ArrowRight",
            bubbles: true,
          }),
        );
      return;
    }
    tvOn();
    const scope = topOverlay();
    const from = current(scope);
    // Our overlays and Stremio's dialogs/menus get the browse controls.
    if (isPlayer() && !scope) playerButton(msg.button, msg.state);
    else browseButton(msg.button, msg.state, scope);
    renderHints();
    // A menu or dialog this press opened (A on a button, L3/R3 in the player,
    // Subtitles/Audio in the player menu): focus its first item, and B
    // returns focus to where it was opened from.
    if (msg.state === "down") {
      setTimeout(() => {
        const ov = topOverlay();
        if (ov && ov !== scope) {
          if (from && !openers.has(ov)) openers.set(ov, from);
          if (!current(ov)) move("down", ov);
        }
        renderHints();
      }, 250);
    }
  }

  if (window.chrome?.webview) {
    window.chrome.webview.addEventListener("message", (e) => {
      const m = e.data;
      if (m && typeof m === "object" && m.type === "stremioz-gamepad") onPad(m);
    });
  }
  TV.simulate = (button, state = "down") => onPad({ type: "stremioz-gamepad", button, state, pad }); // testing
  TV.debug = { candidates, current, topOverlay, pick }; // testing
  TV.initialized = true;
  console.log("[StremioZ TV] ready");
})();
