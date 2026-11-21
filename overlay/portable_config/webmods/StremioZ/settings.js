/**
 * @name StremioZ Settings
 * @description A "StremioZ" section in Settings (with a side-menu button):
 *   controller and TV mode, For You recommendations, updates and credits.
 *   The video settings (anime upscaler, RTX Video HDR/VSR) stay in Kai's
 *   Player section; this section links there.
 *
 * Built from Stremio's own settings markup (the pinned web UI's class names),
 * like Kai's settings mods. Values live in localStorage, except the ones the
 * shell owns (TV interface size, update checks), which go to it through the
 * transport and are kept in portable_config/stremio-settings.ini.
 */
(function () {
  "use strict";
  if (window.StremioZSettings?.initialized) return;
  const API = (window.StremioZSettings = {});

  const C = {
    sections: ".sections-container-EUKAe",
    section: "section-container-twzKQ",
    title: "section-title-Nt71Z",
    category: "section-category-container-EOuS0",
    option: "option-container-EGlcv",
    name: "option-name-container-exGMI",
    label: "label-FFamJ",
    input: "option-input-container-NPgpT",
    button: "button-container-zVLH6",
    toggleBox: "toggle-container-lZfHP",
    toggle: "toggle-toOWM",
    sideMenu: ".side-menu-container-NG17D",
    sideButton: "side-menu-button-vbkJ1",
    version: "version-info-label-uMkm7",
  };

  const REPO = "https://github.com/roshanarunk/StremioZ";

  // ───────────────────────────── values
  const ls = {
    get(k, d) {
      try {
        const v = localStorage.getItem(k);
        return v === null ? d : v;
      } catch (e) {
        return d;
      }
    },
    bool(k, d) {
      const v = ls.get(k, null);
      return v === null ? d : v === "true";
    },
    set(k, v) {
      try {
        localStorage.setItem(k, String(v));
      } catch (e) {}
    },
  };

  function shell(event, args = []) {
    try {
      window.chrome.webview.postMessage(
        JSON.stringify({ type: 6, object: "transport", method: "handleInboundJSON", args: [event, args] }),
      );
    } catch (e) {}
  }

  // Values the shell owns, reported by it on request ("stremioz-settings").
  const native = { uiScale: "auto", autoUpdate: true, version: "", updateStatus: "", updateReady: false };
  if (window.chrome?.webview) {
    window.chrome.webview.addEventListener("message", (e) => {
      let m = e.data;
      if (typeof m === "string") {
        if (!m.includes("stremioz-settings") && !m.includes("stremioz-update")) return;
        try {
          m = JSON.parse(m);
        } catch (err) {
          return;
        }
      }
      const args = m?.args;
      if (!Array.isArray(args)) return;
      if (args[0] === "stremioz-settings" && args[1]) {
        Object.assign(native, args[1]);
        refresh();
      } else if (args[0] === "stremioz-update-status" && args[1]) {
        native.updateStatus = args[1].text || "";
        native.updateReady = !!args[1].ready;
        refresh();
      }
    });
  }

  // ───────────────────────────── markup helpers
  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  };

  function row(label, description) {
    const r = el("div", `${C.option} szs-setting`);
    const name = el("div", C.name);
    const l = el("div", C.label, label);
    if (description) {
      const d = el("div", `${C.label} szs-desc`, description);
      // Same as Kai's descriptions (Stremio's label colour outranks a class).
      d.style.cssText =
        "color: rgba(191, 191, 191, 0.5); display: block; white-space: normal; word-wrap: break-word; line-height: 1.4; margin-top: 0.25rem;";
      l.appendChild(d);
    }
    name.appendChild(l);
    r.appendChild(name);
    return r;
  }

  function category(label, svg) {
    const h = el("div", `${C.category} szs-setting`);
    h.insertAdjacentHTML("beforeend", svg);
    h.appendChild(el("div", C.label, label));
    return h;
  }

  function toggle(label, description, get, set) {
    const r = row(label, description);
    const t = el("div", `${C.input} ${C.toggleBox} ${C.button}`);
    t.tabIndex = -1;
    t.appendChild(el("div", C.toggle));
    const sync = () => t.classList.toggle("checked", !!get());
    t.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      set(!get());
      sync();
    });
    r.appendChild(t);
    r.szsSync = sync;
    sync();
    return r;
  }

  function closeMenus(except) {
    document.querySelectorAll(".szs-setting .multiselect-container-w0c9l.active").forEach((d) => {
      if (d !== except) d.classList.remove("active");
    });
  }
  document.addEventListener("click", () => closeMenus(null));

  // Same structure as Stremio's (and Kai's) dropdowns.
  function dropdown(label, description, options, get, set) {
    const r = row(label, description);
    const d = el(
      "div",
      `${C.input} multiselect-container-w0c9l label-container-XOyzm label-container-dhjQS ${C.button}`,
    );
    d.tabIndex = 0;
    const value = el("div", "label-AR_l8");
    d.appendChild(value);
    d.insertAdjacentHTML(
      "beforeend",
      '<svg class="icon-jg2il" viewBox="0 0 512 512"><path d="m91.7 213.8 145.4 169.6a25 25 0 0 0 38.2 0l145.4-169.6A25 25 0 0 0 401.6 172H110.4a25 25 0 0 0-18.7 41.8" style="fill: currentcolor;"></path></svg>',
    );
    const menu = el("div", "menu-container-B6cqK menu-direction-bottom-right-aJ89V");
    const inner = el("div", "menu-container-qiz0X");
    menu.appendChild(inner);
    d.appendChild(menu);

    const sync = () => {
      const cur = get();
      const opt = options.find((o) => o.value === cur) || options[0];
      value.textContent = opt.label;
      inner.querySelectorAll(".option-container-mO9yW").forEach((item) => {
        const on = item.dataset.value === opt.value;
        item.classList.toggle("selected", on);
        item.querySelector(".icon-jg2il")?.remove();
        if (on) item.appendChild(el("div", "icon-jg2il"));
      });
    };
    for (const o of options) {
      const item = el("div", `option-container-mO9yW ${C.button}`);
      item.tabIndex = 0;
      item.title = o.label;
      item.dataset.value = o.value;
      item.appendChild(el("div", "label-AR_l8", o.label));
      item.addEventListener("click", (e) => {
        e.stopPropagation();
        set(o.value);
        sync();
        d.classList.remove("active");
      });
      inner.appendChild(item);
    }
    d.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const was = d.classList.contains("active");
      closeMenus(d);
      d.classList.toggle("active", !was);
    });
    r.appendChild(d);
    r.szsSync = sync;
    sync();
    return r;
  }

  function action(label, description, buttonText, onClick) {
    const r = row(label, description);
    const b = el("div", `${C.input} ${C.button} szs-button`);
    b.tabIndex = 0;
    const text = el("div", C.label, buttonText);
    b.appendChild(text);
    b.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      onClick(text, b);
    });
    r.appendChild(b);
    return r;
  }

  function note(html) {
    const n = el("div", "description-label-h5DXc szs-note szs-setting");
    n.innerHTML = html;
    return n;
  }

  function status(get) {
    const n = el("div", "description-label-h5DXc szs-note szs-setting");
    n.szsSync = () => {
      const t = get();
      n.textContent = t;
      n.style.display = t ? "" : "none";
    };
    n.szsSync();
    return n;
  }

  function link(text, href) {
    const a = el("a", "szs-link", text);
    a.href = href;
    a.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      shell("open-external", [href]);
    });
    return a;
  }

  const ICON = {
    pad: '<svg class="icon-REQkK" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="6" x2="10" y1="11" y2="11"/><line x1="8" x2="8" y1="9" y2="13"/><line x1="15" x2="15.01" y1="12" y2="12"/><line x1="18" x2="18.01" y1="10" y2="10"/><path d="M17.32 5H6.68a4 4 0 0 0-3.98 3.59C2.6 9.42 2 14.46 2 16a3 3 0 0 0 3 3c1 0 1.5-.5 2-1l1.41-1.41A2 2 0 0 1 9.83 16h4.34a2 2 0 0 1 1.41.59L17 18c.5.5 1 1 2 1a3 3 0 0 0 3-3c0-1.55-.6-6.58-.69-7.26A4 4 0 0 0 17.32 5z"/></svg>',
    heart:
      '<svg class="icon-REQkK" viewBox="0 0 24 24" fill="currentColor"><path d="M12 21s-7.5-4.6-10-9.3C.4 8.4 2.3 4.5 6 4c2.1-.3 4 .8 6 3 2-2.2 3.9-3.3 6-3 3.7.5 5.6 4.4 4 7.7C19.5 16.4 12 21 12 21z"/></svg>',
    update:
      '<svg class="icon-REQkK" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/></svg>',
    info: '<svg class="icon-REQkK" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 16v-5M12 8h.01"/></svg>',
    star: '<svg class="icon-REQkK" viewBox="0 0 24 24" fill="currentColor"><path d="m12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z"/></svg>',
  };

  // ───────────────────────────── the section
  const syncers = [];
  function refresh() {
    for (const s of syncers) s.szsSync?.();
  }

  function clearForYou() {
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && (k === "stremioz-for-you" || k.startsWith("hero") || k.includes("heroMovieTitles") || k.includes("heroGlobal")))
        keys.push(k);
    }
    // Keep the source choices (hero-*-source-index): only the cached picks go.
    for (const k of keys) if (!/source-index/.test(k)) localStorage.removeItem(k);
  }

  function build() {
    const s = el("div", `${C.section} szs-section animation-fade-in`);
    s.id = "stremioz-settings";
    s.appendChild(el("div", C.title, "StremioZ"));
    const add = (n) => {
      s.appendChild(n);
      if (n.szsSync) syncers.push(n);
      return n;
    };

    // Controller & TV
    add(category("Controller & TV", ICON.pad));
    add(
      toggle(
        "Controller",
        "Navigate with a game controller (Xbox, PlayStation, Switch Pro and others).",
        () => ls.bool("stremioz-controller", true),
        (v) => ls.set("stremioz-controller", v),
      ),
    );
    add(
      toggle(
        "Fullscreen on controller",
        "The first controller press switches StremioZ to fullscreen.",
        () => ls.bool("stremioz-tv-fullscreen", true),
        (v) => ls.set("stremioz-tv-fullscreen", v),
      ),
    );
    add(
      toggle(
        "Button hints",
        "Shows what the controller buttons do. The View / Share button switches them too.",
        () => ls.bool("stremioz-tv-hints", true),
        (v) => ls.set("stremioz-tv-hints", v),
      ),
    );
    add(
      dropdown(
        "TV interface size",
        "In fullscreen on a high-scaling display (a 4K TV at 300 %), Auto lays the interface out like a 1080p screen.",
        [
          { value: "auto", label: "Auto" },
          { value: "off", label: "Windows scaling" },
          { value: "0.5", label: "50 %" },
          { value: "0.6", label: "60 %" },
          { value: "0.65", label: "65 %" },
          { value: "0.75", label: "75 %" },
          { value: "0.85", label: "85 %" },
          { value: "1", label: "100 %" },
          { value: "1.25", label: "125 %" },
        ],
        () => native.uiScale,
        (v) => {
          native.uiScale = v;
          shell("stremioz-set-setting", ["UiScale", v]);
        },
      ),
    );

    // For You
    add(category("Recommendations", ICON.star));
    add(
      action(
        "For You",
        "The home banner's For You picks come from your watch history (AniList recommendations for anime, Cinemeta genres for the rest). They refresh every 12 hours.",
        "Refresh now",
        (text) => {
          clearForYou();
          text.textContent = "Refreshed";
          setTimeout(() => (text.textContent = "Refresh now"), 2500);
        },
      ),
    );
    add(
      note(
        'Anime upscaling (AnimeJaNai), RTX Video HDR and Super Resolution are in the <b>Player</b> section. Choices made while watching (controller menu, Shift+1/2/3, Ctrl+H) become the defaults there.',
      ),
    );

    // Updates
    add(category("Updates", ICON.update));
    add(
      toggle(
        "Check for updates",
        "Looks for a new StremioZ release at startup and offers to install it.",
        () => native.autoUpdate,
        (v) => {
          native.autoUpdate = v;
          shell("stremioz-set-setting", ["AutoUpdate", v ? "1" : "0"]);
        },
      ),
    );
    add(
      action("Check now", null, "Check", () => {
        native.updateStatus = "Checking for updates...";
        refresh();
        shell("stremioz-check-update", []);
      }),
    );
    add(status(() => native.updateStatus));
    const install = add(
      action("Install update", "StremioZ closes, updates and opens again.", "Install", () => shell("update-requested", [])),
    );
    install.szsSync = () => (install.style.display = native.updateReady ? "" : "none");
    install.szsSync();
    syncers.push(install);

    // About
    add(category("About", ICON.info));
    const about = add(status(() => (native.version ? `StremioZ ${native.version}` : "StremioZ")));
    about.classList.add("szs-version");
    const links = el("div", "szs-links szs-setting");
    links.append(link("StremioZ on GitHub", REPO), link("Report a problem", REPO + "/issues"));
    add(links);

    add(category("Built on", ICON.heart));
    const credits = el("div", "szs-credits szs-setting");
    const credit = (name, by, href, extra) => {
      const line = el("div", "szs-credit");
      line.append(link(name, href), document.createTextNode(` by ${by}`));
      if (extra) line.append(document.createTextNode(" · "), extra);
      credits.appendChild(line);
    };
    credit("Stremio Community v5", "Zaarrg", "https://github.com/Zaarrg/stremio-community-v5");
    credit("Stremio Kai", "allecsc", "https://github.com/allecsc/Stremio-Kai", link("support on Ko-fi", "https://ko-fi.com/allecsc"));
    credit("AnimeJaNai", "the-database", "https://github.com/the-database/mpv-upscale-2x_animejanai");
    credit("Anime4K", "bloc97", "https://github.com/bloc97/Anime4K");
    credit("mpv", "the mpv developers", "https://mpv.io");
    credit("Stremio", "Stremio", "https://www.stremio.com");
    add(credits);
    add(
      note(
        "StremioZ is free software (GPL-3.0). AnimeJaNai models are CC BY-NC-SA 4.0: free, non-commercial use only. RTX Video needs an NVIDIA RTX GPU; TensorRT is downloaded from NVIDIA on first use.",
      ),
    );
    return s;
  }

  // ───────────────────────────── injection
  function inject() {
    const container = document.querySelector(C.sections);
    if (!container) return false;
    if (!container.querySelector("#stremioz-settings")) {
      syncers.length = 0;
      const s = build();
      // After the Player section (and Kai's Enhanced Metadata if it is there).
      const titles = [...container.querySelectorAll("." + C.title)];
      const player = titles.find((t) => t.textContent.trim() === "Player")?.closest("." + C.section);
      const anchor = player?.parentElement === container ? player.nextSibling : null;
      container.insertBefore(s, anchor);
      shell("stremioz-get-settings", []);
    }
    sideButton();
    versionLabel();
    return true;
  }

  function sideButton() {
    const menu = document.querySelector(C.sideMenu);
    if (!menu || menu.querySelector(".szs-side-button")) return;
    const buttons = menu.querySelectorAll("." + C.sideButton);
    const player = [...buttons].find((b) => b.textContent.trim() === "Player");
    if (!player) return;
    const b = player.cloneNode(true);
    b.classList.remove("selected");
    b.classList.add("szs-side-button");
    b.textContent = "StremioZ";
    b.title = "StremioZ";
    b.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      document.getElementById("stremioz-settings")?.scrollIntoView({ behavior: "smooth", block: "start" });
      menu.querySelectorAll("." + C.sideButton).forEach((x) => x.classList.toggle("selected", x === b));
    });
    player.after(b);
  }

  function versionLabel() {
    const menu = document.querySelector(C.sideMenu);
    if (!menu) return;
    const first = menu.querySelector("." + C.version);
    const existing = menu.querySelector(".szs-version-label");
    if (existing) {
      // Kai adds its label later, in front: keep StremioZ's on top.
      if (first && first !== existing) menu.insertBefore(existing, first);
      return;
    }
    const l = el("div", `${C.version} szs-version-label`, "StremioZ Version: " + (native.version || "…"));
    l.szsSync = () => (l.textContent = "StremioZ Version: " + (native.version || "…"));
    syncers.push(l);
    if (first) menu.insertBefore(l, first);
    else menu.appendChild(l);
  }

  let observer = null;
  function onRoute() {
    if (!location.hash.startsWith("#/settings")) {
      observer?.disconnect();
      observer = null;
      return;
    }
    if (observer) return;
    let t = null;
    observer = new MutationObserver(() => {
      if (t) return;
      t = setTimeout(() => {
        t = null;
        inject();
      }, 80);
    });
    observer.observe(document.body, { childList: true, subtree: true });
    inject();
  }

  function start() {
    window.addEventListener("hashchange", onRoute);
    onRoute();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();

  API.refresh = refresh;
  API.native = native;
  API.initialized = true;
})();
