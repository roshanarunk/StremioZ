/**
 * @name StremioZ Fullscreen
 * @description One fullscreen for the mouse, the keyboard and the controller.
 *   Stremio's fullscreen button, F key and double-click use the page's
 *   fullscreen API; TV mode and the controller can't (a controller press is
 *   not a user gesture), so they use the shell's window fullscreen. With two
 *   kinds, the button showed the wrong state and took several clicks to exit.
 *   Here the page's requests for the whole page also go to the shell, and the
 *   page reports the shell's state (sent on every change), so the button,
 *   F and the controller all work and agree. Escape leaves fullscreen as it
 *   did with the page's own fullscreen.
 */
(function () {
  "use strict";
  if (window.StremioZFullscreen) return;
  const webview = window.chrome?.webview;
  if (!webview) return;

  const desc = Object.getOwnPropertyDescriptor(Document.prototype, "fullscreenElement");
  const realRequest = Element.prototype.requestFullscreen;
  const realExit = Document.prototype.exitFullscreen;
  if (!desc?.get || !realRequest || !realExit) return;
  const realElement = (doc) => desc.get.call(doc);

  const shell = (arg) => {
    try {
      webview.postMessage(
        JSON.stringify({ type: 6, object: "transport", method: "handleInboundJSON", args: ["stremioz-fullscreen", [arg]] }),
      );
    } catch (e) {}
  };

  // The shell's window fullscreen (corrected by its reply to "query").
  let on = false;

  Object.defineProperty(Document.prototype, "fullscreenElement", {
    configurable: true,
    enumerable: desc.enumerable,
    get() {
      const real = realElement(this);
      if (real) return real;
      return on && this === document ? this.documentElement : null;
    },
  });

  Element.prototype.requestFullscreen = function (options) {
    if (this === document.documentElement) {
      shell("true");
      return Promise.resolve();
    }
    return realRequest.call(this, options); // e.g. a trailer's own player
  };

  Document.prototype.exitFullscreen = function () {
    if (realElement(this)) return realExit.call(this);
    shell("false");
    return Promise.resolve();
  };

  webview.addEventListener("message", (e) => {
    const m = e.data;
    if (!m || typeof m !== "object" || m.type !== "stremioz-fullscreen") return;
    const next = !!m.on;
    if (next === on) return;
    on = next;
    document.dispatchEvent(new Event("fullscreenchange"));
  });

  // Escape leaves fullscreen (the page's own fullscreen did this before the
  // page saw the key), instead of going back a page.
  window.addEventListener(
    "keydown",
    (e) => {
      if (e.key !== "Escape" || !e.isTrusted || !on || realElement(document)) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      shell("false");
    },
    true,
  );

  shell("query");
  window.StremioZFullscreen = { isOn: () => on };
})();
