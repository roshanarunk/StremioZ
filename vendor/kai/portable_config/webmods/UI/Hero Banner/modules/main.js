// Ensure namespace exists
window.HeroPlugin = window.HeroPlugin || {};

// Main logic wrapper
window.HeroPlugin.Main = {
  /**
   * Initialize the Hero Banner Plugin.
   * Sets up state, attempts to load from cache, or fetches new data.
   */
  init: function () {
    // Idempotency: prevent double-init zombies
    if (window.HeroPlugin.Main.initialized) {
      console.log("[Hero Plugin] Main module already initialized, skipping.");
      return;
    }
    window.HeroPlugin.Main.initialized = true;

    const CONFIG = window.HeroPlugin.Config;
    const HeroState = window.HeroPlugin.State;
    const Cache = window.HeroPlugin.Cache;
    const Service = window.HeroPlugin.catalogService;
    const UI = window.HeroPlugin.UI;

    // ==========================================
    // UTILITIES
    // ==========================================

    /**
     * Debounces function execution to prevent excessive calls.
     * @param {Function} func - Function to debounce
     * @param {number} wait - Delay in milliseconds
     * @returns {Function} Debounced function
     */
    function debounce(func, wait) {
      let timeout;
      return function (...args) {
        const later = () => {
          clearTimeout(timeout);
          func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
      };
    }

    // StremioZ: three catalogs ("modes"): Kai's movies/series sources and
    // anime airing schedule, and For You from the user's watch history.
    const CATALOGS = ["movies", "anime", "foryou"];
    const CATALOG_NAMES = { movies: "Movies", anime: "Anime", foryou: "For You" };
    const TITLES = { movies: "movieSeriesTitles", anime: "animeTitles", foryou: "forYouTitles" };
    const PRELOADED = {
      movies: "movieCatalogPreloaded",
      anime: "animeCatalogPreloaded",
      foryou: "forYouCatalogPreloaded",
    };

    function loadCached(catalog) {
      if (catalog === "anime") return Cache.loadAnimeCache()?.titles || null;
      if (catalog === "foryou") return Cache.loadForYouCache();
      return Cache.loadMovieCache();
    }

    // The anime service saves its own cache (with its build state).
    function saveCached(catalog, titles) {
      if (catalog === "movies") Cache.saveMovieCache(titles);
      else if (catalog === "foryou") Cache.saveForYouCache(titles);
    }

    function collect(catalog, progressCallback) {
      if (catalog === "anime") return Service.getAnimeCatalog(20, progressCallback);
      if (catalog === "foryou") return Service.getForYou(progressCallback);
      return Service.getMoviesAndSeries(progressCallback);
    }

    function setTitles(catalog, titles) {
      HeroState[TITLES[catalog]] = titles;
      HeroState[PRELOADED[catalog]] = true;
    }

    /**
     * Retrieves the title list for the currently active catalog.
     * Tries memory state first, then local storage cache, then fallback.
     * @returns {Array} List of hero titles
     */
    function getTitlesForCurrentCatalog() {
      const catalog = HeroState.currentCatalog;
      if (HeroState[TITLES[catalog]].length > 0) return HeroState[TITLES[catalog]];
      const cached = loadCached(catalog);
      if (Array.isArray(cached) && cached.length > 0) {
        setTitles(catalog, cached);
        return cached;
      }
      return HeroState.fallbackTitles;
    }

    // ==========================================
    // INITIALIZATION LOGIC
    // ==========================================

    /**
     * Attempts to load cached content for immediate display.
     * @returns {boolean} True if cache loaded successfully
     */
    function tryLoadFromCache() {
      const cachedTitles = getTitlesForCurrentCatalog();

      if (
        cachedTitles.length > 0 &&
        cachedTitles !== HeroState.fallbackTitles
      ) {
        HeroState.heroTitles = cachedTitles;
        setTimeout(preLoadCatalogs, 100);

        HeroState.initializationComplete = true;
        HeroState.titlesReady = true;
        console.log(
          "[Hero Plugin] Loaded from cache, no loading screen needed"
        );

        return true;
      }
      return false;
    }

    /**
     * Fetches fresh content when cache is unavailable.
     * Shows in-banner loading state during fetch.
     * @returns {Promise<boolean>} True if fetch succeeded
     */
    async function fetchFreshContent() {
      console.log("[Hero Plugin] No cache found, showing banner loading...");

      UI.createHeroDirect();

      const catalogAtStart = HeroState.currentCatalog;
      UI.showBannerLoading({
        catalog: catalogAtStart,
        total: 20,
      });

      const timeoutPromise = new Promise((resolve) => {
        setTimeout(() => resolve([]), 20000); // 20s timeout
      });

      const progressCallback = (msg, progress, current, title) => {
        UI.updateBannerLoading({
          currentTitle: title || null,
          current: current || 0,
          total: 20,
        });
      };

      const collectionPromise = collect(catalogAtStart, progressCallback);

      try {
        const collectedTitles = await Promise.race([
          collectionPromise,
          timeoutPromise,
        ]);

        if (collectedTitles && collectedTitles.length > 0) {
          HeroState.heroTitles = collectedTitles;
          setTitles(catalogAtStart, collectedTitles);
          saveCached(catalogAtStart, collectedTitles);

          setTimeout(preLoadCatalogs, 100);
          return true;
        } else {
          throw new Error("No titles found or timeout");
        }
      } catch (error) {
        console.warn("[Hero Plugin] Fetch failed, using fallback:", error);
        HeroState.heroTitles = [...HeroState.fallbackTitles];
        setTitles(catalogAtStart, [...HeroState.fallbackTitles]);

        // StremioZ: a first "For You" build (fresh install, empty caches)
        // takes longer than the 20 s above. When the same fetch finishes
        // later, show its titles instead of the placeholders now, rather
        // than on the next launch.
        collectionPromise
          .then((late) => {
            if (!Array.isArray(late) || late.length === 0) return;
            const showingFallback =
              HeroState.heroTitles[0]?.id === HeroState.fallbackTitles[0]?.id;
            setTitles(catalogAtStart, late);
            saveCached(catalogAtStart, late);
            if (showingFallback && HeroState.currentCatalog === catalogAtStart) {
              console.log(`[Hero Plugin] Late titles arrived (${late.length}), replacing the placeholders`);
              HeroState.heroTitles = late;
              UI.createHeroDirect();
            }
          })
          .catch(() => {});

        return false;
      } finally {
        setTimeout(() => UI.hideBannerLoading(), 500);
      }
    }

    /**
     * Main initialization orchestrator.
     * Tries cache first, then fetches fresh content if needed.
     * @returns {Promise<boolean>} True if initialization succeeded
     */
    async function initializeTitles() {
      if (HeroState.isInitializing) return false;
      HeroState.isInitializing = true;

      try {
        // Check if Hero Banner is globally disabled (Both catalogs = None)
        if (!CONFIG.MOVIE_CATALOG_URL && !CONFIG.SERIES_CATALOG_URL) {
          console.log(
            "[Hero Plugin] All catalogs disabled (None). Hero Banner will not be shown."
          );
          HeroState.isHeroDisabled = true;
          HeroState.initializationComplete = true; // Mark as done to prevent loops
          UI.hideLoadingScreen();

          // Ensure UI is clean
          const existingHero = document.querySelector(".hero-container");
          if (existingHero) existingHero.remove();
          document.body.classList.remove("hero-active"); // Cleanup CSS class

          return true; // Return true to signal "handled", but inactive
        }

        if (tryLoadFromCache()) {
          setupBackgroundTimers();
          return true;
        }

        await fetchFreshContent();

        HeroState.initializationComplete = true;
        HeroState.titlesReady = true;
        setupBackgroundTimers();

        return true;
      } catch (error) {
        console.error("[Hero Plugin] Critical Initialization error:", error);
        HeroState.heroTitles = [...HeroState.fallbackTitles];
        HeroState.titlesReady = true;
        HeroState.initializationComplete = true;
        UI.hideLoadingScreen();
        setupBackgroundTimers();
        return true;
      } finally {
        HeroState.isInitializing = false;
      }
    }

    /**
     * Sets up background refresh interval and initial check.
     */
    function setupBackgroundTimers() {
      if (!HeroState.backgroundRefreshInterval) {
        HeroState.backgroundRefreshInterval = setInterval(
          silentBackgroundRefresh,
          CONFIG.CHECK_INTERVAL
        );
        setTimeout(silentBackgroundRefresh, 2000);
      }
    }

    // ==========================================
    // BACKGROUND LOGIC
    // ==========================================

    /**
     * Performs a background refresh of data without interrupting the UI.
     * Checks if the daily cache is stale and refetches if necessary.
     *
     * IMPORTANT: This function updates the CACHE and STATE only.
     * It does NOT update the visible UI - user continues seeing stale content.
     * New content will be visible on next app launch/navigation.
     */
    async function silentBackgroundRefresh() {
      if (HeroState.isRefreshing) return;

      if (!window.MetadataModules || !window.MetadataModules.ready) {
        setTimeout(silentBackgroundRefresh, 2000);
        return;
      }

      HeroState.isRefreshing = true;

      try {
        if (!Cache.isCacheValid()) {
          console.log(
            "[Hero Plugin] Global cache stale (new day detected), refreshing ALL catalogs in background..."
          );

          const collectedTitles = await Service.getMoviesAndSeries();
          if (collectedTitles.length > 0) {
            Cache.saveMovieCache(collectedTitles);
            HeroState.movieSeriesTitles = collectedTitles;
            console.log(
              `[Hero Plugin] Background refresh: Cached ${collectedTitles.length} movies for next launch`
            );
          }

          const existingAnime =
            HeroState.animeTitles.length > 0
              ? HeroState.animeTitles
              : Cache.loadAnimeCache()?.titles || [];

          console.log(
            `[Hero Plugin] Prepending today's anime to ${existingAnime.length} existing titles...`
          );
          const updatedAnime = await Service.refreshAnimeCatalog(existingAnime);
          if (updatedAnime.length > 0) {
            Cache.saveAnimeCache({
              titles: updatedAnime,
              lastUpdated: Date.now(),
              daysProcessed: 0,
              targetSize: updatedAnime.length,
            });
            HeroState.animeTitles = updatedAnime;
            console.log(
              `[Hero Plugin] Background refresh: Cached ${updatedAnime.length} anime (prepended today's titles) for next launch`
            );
          }

          // StremioZ: For You (hero-for-you.js keeps its picks for 12 h
          // and rebuilds sooner when the most-watched titles change).
          try {
            const forYou = await Service.getForYou();
            if (forYou.length > 0) {
              Cache.saveForYouCache(forYou);
              HeroState.forYouTitles = forYou;
            }
          } catch (e) {
            console.warn("[Hero Plugin] Background For You refresh failed:", e);
          }

          console.log(
            "[Hero Plugin] Background refresh complete. New content will be visible on next app launch."
          );
        }
      } catch (error) {
        console.warn("[Hero Plugin] Silent background refresh failed:", error);
      } finally {
        HeroState.isRefreshing = false;
      }
    }

    /**
     * Pre-loads the catalogs in background for instant switching.
     * StremioZ: all three, one after another.
     */
    async function preLoadCatalogs() {
      console.log("[Hero Plugin] Pre-loading catalogs...");

      for (const catalog of CATALOGS) {
        if (HeroState[PRELOADED[catalog]]) continue;
        try {
          const cached = loadCached(catalog);
          if (Array.isArray(cached) && cached.length > 0) {
            setTitles(catalog, cached);
            continue;
          }
          const titles = await collect(catalog);
          if (titles.length > 0) {
            setTitles(catalog, titles);
            saveCached(catalog, titles);
          }
        } catch (e) {
          console.warn(`Pre-load ${catalog} failed`, e);
        }
      }
    }

    // ==========================================
    // ROTATION LOGIC
    // ==========================================

    function startAutoRotate() {
      if (HeroState.autoRotateInterval)
        clearInterval(HeroState.autoRotateInterval);
      if (HeroState.isAutoRotating) {
        HeroState.autoRotateInterval = setInterval(() => {
          HeroState.currentIndex =
            (HeroState.currentIndex + 1) % HeroState.heroTitles.length;
          UI.updateHeroContent(HeroState.heroTitles[HeroState.currentIndex]);
        }, CONFIG.ROTATION_INTERVAL);
      }
    }

    function stopAutoRotate() {
      if (HeroState.autoRotateInterval) {
        clearInterval(HeroState.autoRotateInterval);
        HeroState.autoRotateInterval = null;
      }
    }

    function resetAutoRotate() {
      if (HeroState.isAutoRotating) {
        stopAutoRotate();
        startAutoRotate();
      }
    }

    // ==========================================
    // GLOBAL FUNCTIONS & API
    // ==========================================

    Object.assign(window, {
      playTitle: (type, imdbId) => {
        window.location.hash = `#/detail/${type}/${imdbId}`;
      },
      showMoreInfo: (type, imdbId) => {
        window.location.hash = `#/detail/${type}/${imdbId}`;
      },
      goToTitle: (index) => {
        if (
          index !== HeroState.currentIndex &&
          index >= 0 &&
          index < HeroState.heroTitles.length
        ) {
          HeroState.currentIndex = index;
          UI.updateHeroContent(HeroState.heroTitles[HeroState.currentIndex]);
          resetAutoRotate();
        }
      },
      nextTitle: () => {
        HeroState.currentIndex =
          (HeroState.currentIndex + 1) % HeroState.heroTitles.length;
        UI.updateHeroContent(HeroState.heroTitles[HeroState.currentIndex]);
        resetAutoRotate();
      },
      previousTitle: () => {
        HeroState.currentIndex =
          (HeroState.currentIndex - 1 + HeroState.heroTitles.length) %
          HeroState.heroTitles.length;
        UI.updateHeroContent(HeroState.heroTitles[HeroState.currentIndex]);
        resetAutoRotate();
      },
      skipLoading: () => {
        UI.hideLoadingScreen();
        HeroState.heroTitles = [...HeroState.fallbackTitles];
        UI.createHeroDirect();
      },
      // StremioZ: Movies -> Anime -> For You. A catalog name picks it directly.
      toggleCatalog: async (target) => {
        const targetCatalog = CATALOGS.includes(target)
          ? target
          : CATALOGS[(CATALOGS.indexOf(HeroState.currentCatalog) + 1) % CATALOGS.length];

        // Check if ready / Demand Load
        if (!HeroState[PRELOADED[targetCatalog]] && !(loadCached(targetCatalog)?.length > 0)) {
          UI.showBannerLoading({ catalog: targetCatalog, total: 20 });

          // Progress callback for on-demand loading
          const onDemandCallback = (msg, progress, current, title) => {
            UI.updateBannerLoading({
              currentTitle: title || null,
              current: current || 0,
              total: 20,
            });
          };

          try {
            const titles = await collect(targetCatalog, onDemandCallback);
            if (titles.length > 0) {
              setTitles(targetCatalog, titles);
              saveCached(targetCatalog, titles);
            }
          } catch (e) {
            console.error(`Failed to load ${targetCatalog} catalog on demand:`, e);
          }
          UI.hideBannerLoading();
        }

        // Perform Switch
        HeroState.currentCatalog = targetCatalog;

        // Get titles
        HeroState.heroTitles = getTitlesForCurrentCatalog();

        // UI Update
        UI.injectCatalogToggle();
        UI.showCatalogName?.(CATALOG_NAMES[targetCatalog]);

        // Persistence
        localStorage.setItem(
          CONFIG.CATALOG_PERSIST_KEY,
          HeroState.currentCatalog
        );

        // Reset Display
        HeroState.currentIndex = 0;
        UI.updateHeroContent(HeroState.heroTitles[HeroState.currentIndex]);
        UI.updateIndicators();
        resetAutoRotate();
      },
    });

    // ==========================================
    // NAVIGATION & EVENTS
    // ==========================================

    function handleNavigation() {
      const currentHash = window.location.hash;
      const heroExists = document.querySelector(".hero-container");
      const shouldShow = UI.shouldShowHero();

      if (!shouldShow && heroExists) {
        HeroState.heroBannerPaused = true;
        stopAutoRotate();
        return;
      }

      if (shouldShow && !heroExists) {
        if (HeroState.heroBannerPaused) {
          HeroState.heroBannerPaused = false;
          UI.createHeroDirect();
        } else {
          setTimeout(() => UI.addHeroDiv(), 100);
          // Legacy robustness calls, can likely be reduced but keeping for safety
          setTimeout(() => UI.addHeroDiv(), 500);
        }
      }

      HeroState.lastKnownHash = currentHash;
    }

    // Single debounced handler for all state changes
    const debouncedNavigation = debounce(handleNavigation, 200);

    function setupHeroObserver() {
      UI.setupHeroObserver(() => {
        debouncedNavigation();
      });
    }

    function cleanupOnUnload() {
      console.log("[Hero Plugin] Cleanup...");
      if (HeroState.autoRotateInterval)
        clearInterval(HeroState.autoRotateInterval);
      if (HeroState.backgroundRefreshInterval)
        clearInterval(HeroState.backgroundRefreshInterval);
      UI.disconnectHeroObserver();
    }

    // ==========================================
    // INIT ENTRY & LISTENERS
    // ==========================================

    window.addEventListener("hero-request-init", async () => {
      const success = await initializeTitles();
      if (success) {
        HeroState.titlesReady = true;
        UI.createHeroDirect();
      } else {
        // Retry logic
        if (HeroState.retryCount < CONFIG.MAX_RETRIES) {
          HeroState.retryCount++;
          setTimeout(() => UI.addHeroDiv(), 3000);
        } else {
          // Fail to fallback
          HeroState.heroTitles = getTitlesForCurrentCatalog();
          HeroState.titlesReady = true;
          UI.createHeroDirect();
        }
      }
    });

    // Event Bindings
    window.addEventListener("hero-start-rotation", startAutoRotate);
    window.addEventListener("hero-stop-rotation", stopAutoRotate);
    window.addEventListener("hero-banner-created", startAutoRotate);

    // Navigation Events
    window.addEventListener("hashchange", debouncedNavigation);
    window.addEventListener("popstate", debouncedNavigation);
    window.addEventListener("focus", debouncedNavigation);

    // Visibility API
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        cleanupOnUnload();
      } else {
        setupHeroObserver(); // Re-enable observer
        debouncedNavigation();
      }
    });

    window.addEventListener("beforeunload", cleanupOnUnload);
    window.addEventListener("pagehide", cleanupOnUnload);

    // StremioZ: Settings > StremioZ > For You "Refresh now".
    window.HeroPlugin.Main.forgetForYou = () => {
      Cache.clearForYouCache();
      HeroState.forYouTitles = [];
      HeroState.forYouCatalogPreloaded = false;
    };

    // Execute Init
    UI.disconnectHeroObserver();
    setupHeroObserver();

    // Initial check
    setTimeout(debouncedNavigation, 1000);
  },
};
