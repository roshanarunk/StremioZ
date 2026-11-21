/**
 * @name Stremio Kai Welcome Wizard
 * @description A premium multi-step onboarding flow for Stremio Kai.
 * @version 1.1.1
 * @author allecsc
 * @changelog v1.1.1 - Cleaned up code structure, moved large data arrays to bottom.
 */

(function () {
  "use strict";

  if (window.KaiWelcomeWizard?.initialized) return;
  window.KaiWelcomeWizard = {
    initialized: true,
    showDonationPrompt: null, // Will be assigned by WizardManager
  };

  const CONFIG = {
    FLAG_KEY: "stremio-kai-welcomed",
    // StremioZ: the StremioZ icon (images/stremioz.png, 128 px) instead of Kai's logo.
    LOGO_URL:
      "data:image/png;base64,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",
    LOGIN_URL: "#/intro?form=login",
    STORAGE_KEYS: {
      oled: "stremio-oled-theme-enabled",
      fullscreen: "stremio-auto-fullscreen",
      hdr: "kai-hdr-passthrough",
      // StremioZ: the anime step sets the upscaler; SVP removed.
      anime4k: "stremioz-upscaler",
      color: "kai-color-profile",
      icc: "kai-icc-profile",
      language: "kai-pref-language",
    },
    // Full ISO-639-1 list - Populated at bottom of file
    LANGUAGES: [],
  };

  let state = {
    currentStep: 0,
    totalSteps: 6,
    dom: {},
    heroBannerModified: false,
    cacheClearNeeded: false,
  };

  const WizardManager = {
    init() {
      if (localStorage.getItem(CONFIG.FLAG_KEY)) return;
      this.createUI();
      this.show();
    },

    /**
     * Shows a standalone donation prompt recycling the Wizard UI container.
     * @param {Object} callbacks - { onSupport, onSnooze, onDismiss }
     */
    showDonationPrompt(callbacks) {
      // Ensure UI container exists
      if (!state.dom.overlay) {
        this.createUI(true); // true = hidden initially
      }

      // Override content with Donation Card
      // Override content with Donation Card
      state.dom.overlay.innerHTML = `
            <div class="kai-wizard-card" style="max-width: 500px;">
                <div class="kai-wizard-header">
                     <div class="kai-wizard-title" style="margin-top: 1rem;">Like what Kai adds to Stremio?</div>
                </div>

                <div class="kai-wizard-content" style="min-height: auto; padding-bottom: 0;">
                    <div style="text-align: center; padding: 0 1rem; overflow: visible;">
                        <p style="color: var(--kai-wiz-text); font-size: 1.05rem; font-weight: 500; margin: 1rem 0 2rem; line-height: 1.5; text-wrap: balance;">
                          This project is independently developed and maintained.<br><br>
                          If it's been useful to you, a small donation supports continued development.
                        </p>
                        
                        <button id="kz-donate-now" class="kai-wizard-btn" 
                            style="width: 100%; margin: 1.5rem 0 1rem; background: linear-gradient(45deg, #7b5bf5, #9b5bf5); font-weight: 700; transform: scale(1.02);">
                            Support Stremio Kai
                        </button>

                        <div style="display: flex; justify-content: space-between; margin-top: 0.5rem; margin-bottom: 1.5rem;">
                             <button id="kz-snooze" style="background: none; border: none; color: rgba(255,255,255,0.7); cursor: pointer; font-size: 0.9rem; font-weight: 500;">
                                Remind me later
                             </button>
                             <button id="kz-dismiss" style="background: none; border: none; color: rgba(255,255,255,0.6); cursor: pointer; font-size: 0.9rem;">
                                No thanks
                             </button>
                        </div>
                    </div>
                </div>
            </div>
        `;

      // Bind Interactions
      // Implicit Actions (Click Outside / ESC) -> Snooze
      const triggerSnooze = () => {
        callbacks.onSnooze();
        this.hide();
      };

      const overlay = state.dom.overlay;

      // Click Outside
      state.clickHandler = (e) => {
        if (e.target === overlay) triggerSnooze();
      };
      overlay.addEventListener("click", state.clickHandler);

      // ESC Key
      state.escHandler = (e) => {
        if (e.key === "Escape") triggerSnooze();
      };
      document.addEventListener("keydown", state.escHandler);

      // Explicit Buttons
      overlay.querySelector("#kz-donate-now").onclick = () => {
        callbacks.onSupport();
        this.hide();
      };
      overlay.querySelector("#kz-snooze").onclick = () => {
        callbacks.onSnooze();
        this.hide();
      };
      overlay.querySelector("#kz-dismiss").onclick = () => {
        callbacks.onDismiss();
        this.hide();
      };

      // Show
      this.show();
    },

    createUI(hidden = false) {
      const overlay = document.createElement("div");
      overlay.className = "kai-wizard-overlay";
      overlay.id = "kai-wizard-overlay";

      overlay.innerHTML = `
                <div class="kai-wizard-card">
                    <div class="kai-wizard-header">
                        <img class="kai-wizard-logo" src="${CONFIG.LOGO_URL}">
                        <div class="kai-wizard-title" id="kz-title">Welcome to StremioZ</div>
                        <div class="kai-wizard-subtitle" id="kz-sub">Stremio with AnimeJaNai, RTX Video HDR and the Stremio Kai interface.</div>
                        <div class="kai-wizard-opt-desc" id="kz-desc" style="display: none; margin-top: 0.25rem; font-size: 0.9em; opacity: 0.7; text-align: center;">(Optional)</div>
                    </div>

                    <div class="kai-wizard-content">
                        <!-- Step 1: Welcome -->
                        <div class="kai-wizard-step active" data-step="0">
                            <div style="height: 200px; display: flex; flex-direction: column;">
                                <div style="flex: 1; display: flex; align-items: center; justify-content: center;">
                                    <p style="font-size: 2.5rem; font-weight: 700; color: var(--kai-wiz-text); margin: 0; text-align: center;">
                                        Let's get you set up.
                                    </p>
                                </div>
                            </div>
                        </div>

                        <!-- Step 2: UI & Theme -->
                        <div class="kai-wizard-step" data-step="1">
                            <div class="kai-wizard-option">
                                <div class="kai-wizard-opt-info">
                                    <div class="kai-wizard-opt-title">Auto Fullscreen</div>
                                    <div class="kai-wizard-opt-desc">Automatically expand on launch for immersion.</div>
                                </div>
                                <div class="kai-wizard-toggle" data-key="fullscreen"></div>
                            </div>
                            <div class="kai-wizard-option">
                                <div class="kai-wizard-opt-info">
                                    <div class="kai-wizard-opt-title">Hero Banner</div>
                                    <div class="kai-wizard-opt-desc">Immersive featured content on the home screen.</div>
                                </div>
                                <div class="kai-wizard-toggle" data-key="herobanner"></div>
                            </div>
                            <div class="kai-wizard-option">
                                <div class="kai-wizard-opt-info">
                                    <div class="kai-wizard-opt-title">OLED Theme</div>
                                    <div class="kai-wizard-opt-desc">Pure black background for OLED displays.</div>
                                </div>
                                <div class="kai-wizard-toggle" data-key="oled"></div>
                            </div>                            
                        </div>

                        <!-- Step 3: Visual Setup -->
                        <div class="kai-wizard-step" data-step="2">
                            <div class="kai-wizard-option">
                                <div class="kai-wizard-opt-info">
                                    <div class="kai-wizard-opt-title">Picture Mode</div>
                                    <div class="kai-wizard-opt-desc">Choose how the image should look on your display.</div>
                                </div>
                                <select class="kai-wizard-select" data-key="color">
                                    <option value="original">Original (Neutral)</option>
                                    <option value="kai" selected>Kai (Default)</option>
                                    <option value="vivid">Vivid (High Contrast)</option>
                                </select>
                            </div>

                            <div class="kai-wizard-option">
                                <div class="kai-wizard-opt-info">
                                    <div class="kai-wizard-opt-title">Use Display Color Profile</div>
                                    <div class="kai-wizard-opt-desc">Use your display’s color calibration if one is installed.
                                    Leave this off if you’re unsure.</div>
                                </div>
                                <div class="kai-wizard-toggle" data-key="icc"></div>
                            </div>

                            <div class="kai-wizard-option">
                                <div class="kai-wizard-opt-info">
                                    <div class="kai-wizard-opt-title">HDR Passthrough</div>
                                    <div class="kai-wizard-opt-desc">Direct HDR output to avoid SDR conversion and extra tonemapping.</div>
                                </div>
                                <div class="kai-wizard-toggle" data-key="hdr"></div>
                            </div>
                            <div class="kai-wizard-note">
                                <svg viewBox="0 0 24 24" fill="none" style="width: 1.25rem; height: 1.25rem; stroke: currentColor; flex-shrink: 0;"><path d="M12 15H12.01M12 12V9M4.98207 19H19.0179C20.5615 19 21.5233 17.3256 20.7455 15.9923L13.7276 3.96153C12.9558 2.63852 11.0442 2.63852 10.2724 3.96153L3.25452 15.9923C2.47675 17.3256 3.43849 19 4.98207 19Z" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
                                <span>Enable Passthrough ONLY if your display supports HDR.</span>
                            </div>
                        </div>

                        <!-- Step 4: Anime Enhancements -->
                        <div class="kai-wizard-step" data-step="3">
                            <div class="kai-wizard-option">
                                <div class="kai-wizard-opt-info">
                                    <div class="kai-wizard-opt-title">Anime Upscaler</div>
                                    <div class="kai-wizard-opt-desc">AnimeJaNai AI upscaling to 4K (NVIDIA RTX: TensorRT, other GPUs: DirectML), or Anime4K shaders.</div>
                                </div>
                                <select class="kai-wizard-select" data-key="anime4k">
                                    <option value="ajn-quality">AnimeJaNai Quality</option>
                                    <option value="ajn-balanced" selected>AnimeJaNai Balanced (Default)</option>
                                    <option value="ajn-performance">AnimeJaNai Performance</option>
                                    <option value="a4k-optimized">Anime4K Optimized+</option>
                                    <option value="a4k-fast">Anime4K Eye Candy (Fast)</option>
                                    <option value="a4k-hq">Anime4K Eye Candy (HQ)</option>
                                    <option value="off">Off</option>
                                </select>
                            </div>
                        </div>

                         <!-- Step 5: Enhanced Metadata (Optional) -->
                        <div class="kai-wizard-step" data-step="4">
                             <!-- Language Selector -->
                             <div class="kai-wizard-option" style="margin-bottom: 2rem;">
                                <div class="kai-wizard-opt-info">
                                    <div class="kai-wizard-opt-title">Content Language</div>
                                    <div class="kai-wizard-opt-desc">Preferred language for metadata and logos.</div>
                                </div>
                                <select class="kai-wizard-select" data-key="language" id="kai-language-select">
                                    <!-- Populated by JS -->
                                </select>
                            </div>

                             <!-- TMDB -->
                             <div class="kai-wizard-input-group">
                                <div class="kai-wizard-input-label">
                                    TMDB API Key
                                </div>
                                <div class="kai-wizard-input-wrapper">
                                    <input type="password" class="kai-wizard-input" data-provider="tmdb" placeholder="Enter TMDB Key...">
                                    <div class="kai-wizard-status"></div>
                                </div>
                                <div class="kai-wizard-hint">
                                    Get your free key at <a href="https://www.themoviedb.org/settings/api" target="_blank">themoviedb.org</a>
                                </div>
                             </div>

                             <!-- MDBList -->
                             <div class="kai-wizard-input-group">
                                <div class="kai-wizard-input-label">
                                    MDBList API Key
                                </div>
                                <div class="kai-wizard-input-wrapper">
                                    <input type="password" class="kai-wizard-input" data-provider="mdblist" placeholder="Enter MDBList Key...">
                                    <div class="kai-wizard-status"></div>
                                </div>
                                <div class="kai-wizard-hint">
                                    Get your key at <a href="https://mdblist.com/preferences/" target="_blank">mdblist.com</a>
                                </div>
                             </div>
                        </div>

                        <!-- Step 6: Finish -->
                        <div class="kai-wizard-step" data-step="5">
                            <div style="text-align: center;">
                                <div style="font-size: 3rem; margin-bottom: 1.5rem;">✨</div>
                                <div class="kai-wizard-opt-title" style="font-size: 1.4rem; margin-bottom: 0.5rem;">Setup Complete!</div>
                                <p style="color: var(--kai-wiz-subtext); margin-bottom: 1.5rem;">StremioZ is ready. All settings can be adjusted 
                                anytime in Settings (StremioZ, Player, General).</p>
                                <div style="display: flex; justify-content: center; align-items: center; margin-top: 1rem;">
                                    <a href="#" class="kai-wizard-donation" id="kz-donate" style="margin: 0; display: inline-flex; align-items: center; padding-bottom: 0;">
                                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" class="kai-wizard-icon kai-wizard-icon-heart" style="width: 18px; height: 18px; margin: 0 6px;">
                                            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78z"/>
                                        </svg>
                                        Support Development
                                    </a>
                                    <span style="margin: 0 0.8rem; color: var(--kai-wiz-subtext); line-height: 1;">•</span>
                                    <a href="https://github.com/allecsc/Stremio-Kai" target="_blank" class="kai-wizard-donation" style="margin: 0; display: inline-flex; align-items: center; padding-bottom: 0;">
                                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" class="kai-wizard-icon kai-wizard-icon-star" style="width: 18px; height: 18px; margin-right: 6px;">
                                            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                                        </svg>
                                        Star on GitHub
                                    </a>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div class="kai-wizard-footer">
                        <div class="kai-wizard-dots">
                            <div class="kai-wizard-dot active"></div>
                            <div class="kai-wizard-dot"></div>
                            <div class="kai-wizard-dot"></div>
                            <div class="kai-wizard-dot"></div>
                            <div class="kai-wizard-dot"></div>
                            <div class="kai-wizard-dot"></div>
                        </div>
                        <div class="kai-wizard-btns">
                            <button class="kai-wizard-btn kai-wizard-btn-back" id="kz-back" style="visibility: hidden;">Back</button>
                            <button class="kai-wizard-btn kai-wizard-btn-next" id="kz-next">Get Started</button>
                        </div>
                    </div>
                </div>
            `;

      document.body.appendChild(overlay);
      state.dom.overlay = overlay;
      state.dom.steps = overlay.querySelectorAll(".kai-wizard-step");
      state.dom.dots = overlay.querySelectorAll(".kai-wizard-dot");
      state.dom.btnNext = overlay.querySelector("#kz-next");
      state.dom.btnBack = overlay.querySelector("#kz-back");
      state.dom.title = overlay.querySelector("#kz-title");
      state.dom.subtitle = overlay.querySelector("#kz-sub");

      this.bindEvents();
    },

    bindEvents() {
      state.dom.btnNext.onclick = () => this.nextStep();
      state.dom.btnBack.onclick = () => this.prevStep();

      const donateLink = state.dom.overlay.querySelector("#kz-donate");
      if (donateLink) {
        donateLink.onclick = (e) => {
          e.preventDefault();
          window.open("https://revolut.me/altcelalalt", "_blank");
        };
      }

      // Toggle handlers
      state.dom.overlay
        .querySelectorAll(".kai-wizard-toggle")
        .forEach((toggle) => {
          const keyName = toggle.dataset.key;

          // Special handling for Hero Banner
          if (keyName === "herobanner") {
            const mIdx = localStorage.getItem("hero-movie-source-index");
            const sIdx = localStorage.getItem("hero-series-source-index");
            // Enabled if either is not explicitly disabled (0)
            const isEnabled = mIdx !== "0" || sIdx !== "0";

            if (isEnabled) toggle.classList.add("active");

            toggle.onclick = () => {
              const active = toggle.classList.toggle("active");
              // Set both to 1 (default) or 0 (disabled)
              const val = active ? "1" : "0";
              localStorage.setItem("hero-movie-source-index", val);
              localStorage.setItem("hero-series-source-index", val);
              state.heroBannerModified = true;
            };
            return;
          }

          const storageKey = CONFIG.STORAGE_KEYS[keyName];

          const isEnabled = localStorage.getItem(storageKey) === "true";
          if (isEnabled) toggle.classList.add("active");

          toggle.onclick = () => {
            const active = toggle.classList.toggle("active");
            localStorage.setItem(storageKey, active.toString());
            this.notifyStorage(storageKey, active.toString());
          };
        });

      // Select handlers (Restored)
      state.dom.overlay
        .querySelectorAll(".kai-wizard-select")
        .forEach((select) => {
          const keyName = select.dataset.key;
          const storageKey = CONFIG.STORAGE_KEYS[keyName];

          // Populate Language Dropdown if handling language
          if (keyName === "language") {
            CONFIG.LANGUAGES.forEach((lang) => {
              const opt = document.createElement("option");
              opt.value = lang.code;
              opt.textContent = lang.label;
              if (lang.code === "en") opt.selected = true;
              select.appendChild(opt);
            });
          }

          // Init value (Handle quoted JSON string for language)
          const savedRaw = localStorage.getItem(storageKey);
          if (savedRaw) {
            let val = savedRaw;
            if (keyName === "language") {
              // Remove quotes if present
              val = savedRaw.replace(/^"|"$/g, "");
            }
            select.value = val;
          }

          select.onchange = () => {
            let val = select.value;
            // Language needs to be JSON stringified to match preferences.js format
            if (keyName === "language") {
              val = JSON.stringify(val);
              state.cacheClearNeeded = true;
            }

            localStorage.setItem(storageKey, val);
            this.notifyStorage(storageKey, val);
          };
        });

      // Mark cache clear if API keys change
      state.dom.overlay
        .querySelectorAll(".kai-wizard-input")
        .forEach((input) => {
          input.addEventListener("change", () => {
            state.cacheClearNeeded = true;
          });
        });

      // API Key Validation Logic
      state.dom.overlay
        .querySelectorAll(".kai-wizard-input")
        .forEach((input) => {
          const provider = input.dataset.provider;
          const statusEl = input.nextElementSibling; // .kai-wizard-status
          let timeout;

          // Init value check
          if (window.MetadataModules?.apiKeys) {
            const key = window.MetadataModules.apiKeys.getKey(provider);
            if (key) {
              input.value = key;
              statusEl.innerHTML =
                '<span class="kai-wizard-status-icon status-valid">✓</span>';
            }
          }

          input.addEventListener("input", () => {
            const val = input.value.trim();
            statusEl.innerHTML = ""; // Clear status

            if (timeout) clearTimeout(timeout);

            if (!val) {
              // Cleared
              if (window.MetadataModules?.apiKeys) {
                window.MetadataModules.apiKeys.clearKey(provider);
              }
              return;
            }

            statusEl.innerHTML =
              '<span class="kai-wizard-status-icon status-loading">⏳</span>';

            timeout = setTimeout(async () => {
              if (!window.MetadataModules?.apiKeys) {
                statusEl.innerHTML =
                  '<span class="kai-wizard-status-icon status-invalid">?</span>';
                return;
              }

              const result = await window.MetadataModules.apiKeys.validateKey(
                provider,
                val,
              );

              if (result.valid) {
                window.MetadataModules.apiKeys.setKey(provider, val);
                statusEl.innerHTML =
                  '<span class="kai-wizard-status-icon status-valid">✓</span>';
              } else {
                statusEl.innerHTML =
                  '<span class="kai-wizard-status-icon status-invalid">✗</span>';
                // Optional: Show error tooltip?
              }
            }, 800);
          });
        });
    },

    notifyStorage(key, value) {
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: key,
          newValue: value,
        }),
      );
    },

    show() {
      setTimeout(() => state.dom.overlay.classList.add("visible"), 100);
    },

    hide() {
      state.dom.overlay.classList.remove("visible");

      // Cleanup Event Listeners if attached (Donation Mode)
      if (state.clickHandler) {
        state.dom.overlay.removeEventListener("click", state.clickHandler);
        state.clickHandler = null;
      }
      if (state.escHandler) {
        document.removeEventListener("keydown", state.escHandler);
        state.escHandler = null;
      }

      localStorage.setItem(CONFIG.FLAG_KEY, "true");
      setTimeout(() => state.dom.overlay.remove(), 400);
    },

    updateStep() {
      state.dom.steps.forEach((s, idx) =>
        s.classList.toggle("active", idx === state.currentStep),
      );
      state.dom.dots.forEach((d, idx) =>
        d.classList.toggle("active", idx === state.currentStep),
      );

      state.dom.btnBack.style.visibility =
        state.currentStep === 0 ? "hidden" : "visible";

      if (state.currentStep === 0) {
        state.dom.title.textContent = "Welcome to StremioZ"; // StremioZ
        state.dom.subtitle.textContent =
          "Stremio with AnimeJaNai, RTX Video HDR and the Stremio Kai interface.";
        state.dom.btnNext.textContent = "Get Started";
      } else if (state.currentStep === state.totalSteps - 1) {
        state.dom.title.textContent = "Ready to Roll";
        state.dom.subtitle.textContent = "All set for premium viewing.";
        state.dom.btnNext.textContent = "Login to Stremio";
      } else {
        state.dom.title.textContent = this.getStepTitle(state.currentStep);
        state.dom.subtitle.textContent = this.getStepSubtitle(
          state.currentStep,
        );
        state.dom.btnNext.textContent = "Next";
      }

      // Optional flag logic
      const descEl = state.dom.overlay.querySelector("#kz-desc");
      if (descEl) {
        descEl.style.display = state.currentStep === 4 ? "block" : "none";
      }
    },

    getStepTitle(step) {
      switch (step) {
        case 1:
          return "UI Experience";
        case 2:
          return "Visual Setup";
        case 3:
          return "Anime Enhancements";
        case 4:
          return "Enhanced Metadata";
        default:
          return "Onboarding";
      }
    },

    getStepSubtitle(step) {
      switch (step) {
        case 1:
          return "Customize Stremio's appearance and behavior. Perfect for OLED displays and immersive viewing.";
        case 2:
          return "Unlock the full potential of your display.";
        case 3:
          return "AI upscaling to 4K, applied automatically to anime."; // StremioZ
        case 4:
          return "Enable private APIs for richer ratings, and more.";
        default:
          return "The ultimate Stremio experience.";
      }
    },

    nextStep() {
      if (state.currentStep < state.totalSteps - 1) {
        state.currentStep++;
        this.updateStep();
      } else {
        window.location.hash = CONFIG.LOGIN_URL;

        // Finalize: Clear Caches and Reload if needed
        if (state.heroBannerModified || state.cacheClearNeeded) {
          localStorage.setItem(CONFIG.FLAG_KEY, "true");

          // Smart Cache Clearing
          try {
            console.log("[Wizard] Clearing caches for fresh start...");

            // 1. Clear IndexedDB
            const dbReq = indexedDB.deleteDatabase("MetadataDB");
            dbReq.onsuccess = () => console.log("[Wizard] MetadataDB deleted");
            dbReq.onerror = () =>
              console.warn("[Wizard] Failed to delete MetadataDB");

            // 2. Clear Hero Banner Cache
            const keys = [
              "heroMovieTitlesCache",
              "heroAnimeTitlesCache",
              "heroGlobalTimestamp",
            ];
            keys.forEach((k) => localStorage.removeItem(k));
          } catch (e) {
            console.warn("[Wizard] Cache clear error:", e);
          }

          setTimeout(() => location.reload(), 200);
        } else {
          this.hide();
        }
      }
    },

    prevStep() {
      if (state.currentStep > 0) {
        state.currentStep--;
        this.updateStep();
      }
    },
  };

  // Expose Public API
  window.KaiWelcomeWizard.showDonationPrompt = (cb) =>
    WizardManager.showDonationPrompt(cb);

  // Boot
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => WizardManager.init());
  } else {
    WizardManager.init();
  }
  // Languages Data (Moved to bottom)
  const LANGUAGES_DATA = [
    { code: "en", label: "English" },
    { code: "aa", label: "Afar" },
    { code: "ab", label: "Abkhazian" },
    { code: "af", label: "Afrikaans" },
    { code: "ak", label: "Akan" },
    { code: "sq", label: "Albanian" },
    { code: "am", label: "Amharic" },
    { code: "ar", label: "Arabic" },
    { code: "an", label: "Aragonese" },
    { code: "hy", label: "Armenian" },
    { code: "as", label: "Assamese" },
    { code: "av", label: "Avaric" },
    { code: "ae", label: "Avestan" },
    { code: "ay", label: "Aymara" },
    { code: "az", label: "Azerbaijani" },
    { code: "bm", label: "Bambara" },
    { code: "ba", label: "Bashkir" },
    { code: "eu", label: "Basque" },
    { code: "be", label: "Belarusian" },
    { code: "bn", label: "Bengali" },
    { code: "bh", label: "Bihari" },
    { code: "bi", label: "Bislama" },
    { code: "bs", label: "Bosnian" },
    { code: "br", label: "Breton" },
    { code: "bg", label: "Bulgarian" },
    { code: "my", label: "Burmese" },
    { code: "ca", label: "Catalan" },
    { code: "ch", label: "Chamorro" },
    { code: "ce", label: "Chechen" },
    { code: "ny", label: "Chichewa" },
    { code: "zh", label: "Chinese" },
    { code: "cu", label: "Church Slavic" },
    { code: "cv", label: "Chuvash" },
    { code: "kw", label: "Cornish" },
    { code: "co", label: "Corsican" },
    { code: "cr", label: "Cree" },
    { code: "hr", label: "Croatian" },
    { code: "cs", label: "Czech" },
    { code: "da", label: "Danish" },
    { code: "dv", label: "Divehi" },
    { code: "nl", label: "Dutch" },
    { code: "dz", label: "Dzongkha" },
    { code: "eo", label: "Esperanto" },
    { code: "et", label: "Estonian" },
    { code: "ee", label: "Ewe" },
    { code: "fo", label: "Faroese" },
    { code: "fj", label: "Fijian" },
    { code: "fi", label: "Finnish" },
    { code: "fr", label: "French" },
    { code: "ff", label: "Fulah" },
    { code: "gd", label: "Gaelic" },
    { code: "gl", label: "Galician" },
    { code: "lg", label: "Ganda" },
    { code: "ka", label: "Georgian" },
    { code: "de", label: "German" },
    { code: "el", label: "Greek" },
    { code: "kl", label: "Greenlandic" },
    { code: "gn", label: "Guarani" },
    { code: "gu", label: "Gujarati" },
    { code: "ht", label: "Haitian" },
    { code: "ha", label: "Hausa" },
    { code: "he", label: "Hebrew" },
    { code: "hz", label: "Herero" },
    { code: "hi", label: "Hindi" },
    { code: "ho", label: "Hiri Motu" },
    { code: "hu", label: "Hungarian" },
    { code: "is", label: "Icelandic" },
    { code: "io", label: "Ido" },
    { code: "ig", label: "Igbo" },
    { code: "id", label: "Indonesian" },
    { code: "ia", label: "Interlingua" },
    { code: "ie", label: "Interlingue" },
    { code: "iu", label: "Inuktitut" },
    { code: "ik", label: "Inupiaq" },
    { code: "ga", label: "Irish" },
    { code: "it", label: "Italian" },
    { code: "ja", label: "Japanese" },
    { code: "jv", label: "Javanese" },
    { code: "kn", label: "Kannada" },
    { code: "kr", label: "Kanuri" },
    { code: "ks", label: "Kashmiri" },
    { code: "kk", label: "Kazakh" },
    { code: "km", label: "Khmer" },
    { code: "ki", label: "Kikuyu" },
    { code: "rw", label: "Kinyarwanda" },
    { code: "ky", label: "Kyrgyz" },
    { code: "kv", label: "Kurdish" },
    { code: "lo", label: "Lao" },
    { code: "la", label: "Latin" },
    { code: "lv", label: "Latvian" },
    { code: "li", label: "Limburgish" },
    { code: "ln", label: "Lingala" },
    { code: "lt", label: "Lithuanian" },
    { code: "lb", label: "Luxembourgish" },
    { code: "lu", label: "Luba-Katanga" },
    { code: "mk", label: "Macedonian" },
    { code: "mg", label: "Malagasy" },
    { code: "ms", label: "Malay" },
    { code: "ml", label: "Malayalam" },
    { code: "mt", label: "Maltese" },
    { code: "gv", label: "Manx" },
    { code: "mi", label: "Maori" },
    { code: "mr", label: "Marathi" },
    { code: "mh", label: "Marshallese" },
    { code: "mn", label: "Mongolian" },
    { code: "na", label: "Nauru" },
    { code: "nv", label: "Navajo" },
    { code: "ng", label: "Ndonga" },
    { code: "ne", label: "Nepali" },
    { code: "nd", label: "North Ndebele" },
    { code: "se", label: "Northern Sami" },
    { code: "no", label: "Norwegian" },
    { code: "nb", label: "Norwegian Bokmål" },
    { code: "nn", label: "Norwegian Nynorsk" },
    { code: "oc", label: "Occitan" },
    { code: "oj", label: "Ojibwa" },
    { code: "or", label: "Oriya" },
    { code: "om", label: "Oromo" },
    { code: "os", label: "Ossetian" },
    { code: "pi", label: "Pali" },
    { code: "ps", label: "Pashto" },
    { code: "fa", label: "Persian" },
    { code: "pl", label: "Polish" },
    { code: "pt", label: "Portuguese" },
    { code: "pa", label: "Punjabi" },
    { code: "qu", label: "Quechua" },
    { code: "ro", label: "Romanian" },
    { code: "rm", label: "Romansh" },
    { code: "rn", label: "Rundi" },
    { code: "ru", label: "Russian" },
    { code: "sm", label: "Samoan" },
    { code: "sg", label: "Sango" },
    { code: "sa", label: "Sanskrit" },
    { code: "sc", label: "Sardinian" },
    { code: "sr", label: "Serbian" },
    { code: "sn", label: "Shona" },
    { code: "ii", label: "Sichuan Yi" },
    { code: "sd", label: "Sindhi" },
    { code: "si", label: "Sinhala" },
    { code: "sk", label: "Slovak" },
    { code: "sl", label: "Slovenian" },
    { code: "so", label: "Somali" },
    { code: "st", label: "Southern Sotho" },
    { code: "nr", label: "South Ndebele" },
    { code: "es", label: "Spanish" },
    { code: "su", label: "Sundanese" },
    { code: "sw", label: "Swahili" },
    { code: "ss", label: "Swati" },
    { code: "sv", label: "Swedish" },
    { code: "tl", label: "Tagalog" },
    { code: "ty", label: "Tahitian" },
    { code: "tg", label: "Tajik" },
    { code: "ta", label: "Tamil" },
    { code: "tt", label: "Tatar" },
    { code: "te", label: "Telugu" },
    { code: "th", label: "Thai" },
    { code: "bo", label: "Tibetan" },
    { code: "ti", label: "Tigrinya" },
    { code: "to", label: "Tonga" },
    { code: "ts", label: "Tsonga" },
    { code: "tn", label: "Tswana" },
    { code: "tr", label: "Turkish" },
    { code: "tk", label: "Turkmen" },
    { code: "tw", label: "Twi" },
    { code: "ug", label: "Uyghur" },
    { code: "uk", label: "Ukrainian" },
    { code: "ur", label: "Urdu" },
    { code: "uz", label: "Uzbek" },
    { code: "ve", label: "Venda" },
    { code: "vi", label: "Vietnamese" },
    { code: "vo", label: "Volapük" },
    { code: "wa", label: "Walloon" },
    { code: "cy", label: "Welsh" },
    { code: "fy", label: "Western Frisian" },
    { code: "wo", label: "Wolof" },
    { code: "xh", label: "Xhosa" },
    { code: "yi", label: "Yiddish" },
    { code: "yo", label: "Yoruba" },
    { code: "za", label: "Zhuang" },
    { code: "zu", label: "Zulu" },
  ];

  CONFIG.LANGUAGES.push(...LANGUAGES_DATA);
})();
