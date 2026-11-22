/**
 * @name StremioZ For You
 * @description A "For You" source for Stremio Kai's hero banner, built from
 *   the user's own watch history. No API keys:
 *   - anime they watched -> AniList community recommendations (one GraphQL
 *     query for all seeds), mapped back to IMDb through Kai's arm.haglund.dev
 *     converter (the hero needs IMDb IDs for its artwork);
 *   - other series and movies -> their genres, then Cinemeta's popular titles
 *     in those genres.
 *   Titles already watched are left out. The result is cached for 12 hours,
 *   or until the most-watched titles change.
 *
 * Kai's hero asks for it through the "For You" entry in its source lists
 * (UI/Hero Banner/modules/config.js, catalog-service.js fetchCatalog):
 *   await window.StremioZForYou.getItems("series" | "movie", limit)
 * which returns Cinemeta-style items ({ id, imdb_id, type, name, ... }).
 */
(function () {
  "use strict";
  if (window.StremioZForYou) return;

  const CACHE_KEY = "stremioz-for-you";
  const CACHE_TTL = 12 * 60 * 60 * 1000;
  const SEEDS = 20; // most relevant watched titles used as seeds
  const CANDIDATES = 50; // anime recommendations mapped to IMDb
  const IDS_KEY = "stremioz-for-you-ids"; // saved ID mappings (arm.haglund.dev is 2 lookups/s)
  const IDS_TTL = 30 * 864e5;
  const CINEMETA_META = "https://v3-cinemeta.strem.io/meta";
  const CINEMETA_GENRE = "https://cinemeta-catalogs.strem.io/top/catalog";
  const ANILIST = "https://graphql.anilist.co";
  const log = (...a) => console.log("[StremioZ For You]", ...a);

  // ───────────────────────────── watch history
  function readJson(key) {
    try {
      return JSON.parse(localStorage.getItem(key));
    } catch (e) {
      return null;
    }
  }

  function history() {
    const items = Object.assign({}, readJson("library")?.items, readJson("library_recent")?.items);
    const now = Date.now();
    return Object.values(items)
      .filter(
        (i) =>
          i &&
          i.state &&
          (i.type === "series" || i.type === "movie") &&
          /^(tt\d+|kitsu:\d+)$/.test(i._id) &&
          ((i.state.overallTimeWatched || 0) > 10 * 60 * 1000 || i.state.timesWatched > 0 || i.state.flaggedWatched),
      )
      .map((i) => {
        const days = Math.max(0, (now - new Date(i.state.lastWatched || i._mtime || 0)) / 864e5);
        const hours = (i.state.overallTimeWatched || 0) / 3.6e6;
        // Recent and much-watched titles count most.
        return { id: i._id, type: i.type, weight: Math.exp(-days / 45) * (1 + Math.log10(1 + hours)) };
      })
      .sort((a, b) => b.weight - a.weight);
  }

  // ───────────────────────────── helpers
  const converter = () => window.metadataServices?.idConverter || null;

  // ID mappings rarely change: keep them across restarts.
  let idCache = null;
  function ids() {
    if (!idCache) {
      idCache = readJson(IDS_KEY) || {};
      const now = Date.now();
      for (const k of Object.keys(idCache)) if (now - (idCache[k].t || 0) > IDS_TTL) delete idCache[k];
    }
    return idCache;
  }
  function saveIds() {
    try {
      localStorage.setItem(IDS_KEY, JSON.stringify(ids()));
    } catch (e) {}
  }
  async function mapped(key, lookup) {
    const c = ids();
    if (c[key]) return c[key].v;
    const v = await lookup();
    if (v !== undefined) c[key] = { v, t: Date.now() };
    return v;
  }

  async function getJson(url, init) {
    const r = await fetch(url, init);
    if (!r.ok) throw new Error(`HTTP ${r.status} ${url}`);
    return r.json();
  }

  async function cinemetaMeta(type, imdb) {
    for (const t of type === "movie" ? ["movie", "series"] : ["series", "movie"]) {
      try {
        const j = await getJson(`${CINEMETA_META}/${t}/${imdb}.json`);
        if (j?.meta?.name) return { ...j.meta, id: imdb, imdb_id: imdb, type: t };
      } catch (e) {}
    }
    return null;
  }

  // AniList ids for a watched title (null when it isn't anime).
  async function anilistIdsFor(seed) {
    const conv = converter();
    if (!conv) return null;
    return mapped(`seed:${seed.id}`, async () => {
      try {
        if (seed.id.startsWith("kitsu:")) {
          const r = await conv.convertToImdb(seed.id.slice(6), "kitsu");
          return r?.anilist ? { anilist: [r.anilist], imdb: r.imdb || null } : null;
        }
        const r = await conv.convertFromImdb(seed.id);
        return r?.anilist?.length ? { anilist: r.anilist, imdb: seed.id } : null;
      } catch (e) {
        return undefined; // network error: don't remember
      }
    });
  }

  // ───────────────────────────── anime: AniList recommendations
  async function animeRecommendations(seeds, watched) {
    const weightByAnilist = new Map();
    for (const s of seeds) for (const id of s.anilist) weightByAnilist.set(+id, Math.max(weightByAnilist.get(+id) || 0, s.weight));
    if (!weightByAnilist.size) return [];

    const query = `query ($ids: [Int]) { Page(perPage: 50) { media(id_in: $ids, type: ANIME) {
      id recommendations(sort: RATING_DESC, perPage: 12) { nodes { rating mediaRecommendation {
        id format isAdult popularity averageScore title { romaji english } } } } } } }`;
    let media = [];
    try {
      const j = await getJson(ANILIST, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ query, variables: { ids: [...weightByAnilist.keys()] } }),
      });
      media = j?.data?.Page?.media || [];
    } catch (e) {
      log("AniList failed:", e.message);
      return [];
    }

    // Score: seed weight x community votes, summed over the seeds that recommend it.
    const scores = new Map();
    for (const m of media) {
      const w = weightByAnilist.get(m.id) || 0;
      for (const n of m.recommendations?.nodes || []) {
        const r = n.mediaRecommendation;
        if (!r || r.isAdult || n.rating <= 0 || weightByAnilist.has(r.id)) continue;
        if (!["TV", "TV_SHORT", "ONA", "MOVIE", "OVA"].includes(r.format)) continue;
        const s = scores.get(r.id) || { id: r.id, format: r.format, score: 0, title: r.title?.english || r.title?.romaji };
        s.score += w * Math.log2(1 + n.rating) * (1 + (r.averageScore || 60) / 200);
        scores.set(r.id, s);
      }
    }
    const ranked = [...scores.values()].sort((a, b) => b.score - a.score).slice(0, CANDIDATES);

    // Back to IMDb (the hero's artwork comes from IMDb ids); drop watched.
    const conv = converter();
    const out = [];
    const seen = new Set();
    await Promise.all(
      ranked.map(async (c) => {
        try {
          const ids = await mapped(`anilist:${c.id}`, async () => {
            try {
              const r = await conv.convertToImdb(String(c.id), "anilist");
              return r ? { imdb: r.imdb || null, kitsu: r.kitsu || null } : null;
            } catch (e) {
              return undefined;
            }
          });
          if (!ids?.imdb || watched.imdb.has(ids.imdb) || (ids.kitsu && watched.kitsu.has(String(ids.kitsu)))) return;
          if (seen.has(ids.imdb)) return; // another season of the same show
          seen.add(ids.imdb);
          out.push({ imdb: ids.imdb, type: c.format === "MOVIE" ? "movie" : "series", score: c.score, why: "anime" });
        } catch (e) {}
      }),
    );
    return out.sort((a, b) => b.score - a.score);
  }

  // ───────────────────────────── everything else: genres -> Cinemeta
  async function genrePicks(seeds, watched) {
    const genres = new Map();
    await Promise.all(
      seeds.map(async (s) => {
        const meta = await cinemetaMeta(s.type, s.id);
        for (const g of meta?.genres || meta?.genre || []) genres.set(g, (genres.get(g) || 0) + s.weight);
      }),
    );
    const top = [...genres.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
    if (!top.length) return [];
    const out = [];
    const seen = new Set();
    await Promise.all(
      top.flatMap(([genre, gw]) =>
        ["series", "movie"].map(async (type) => {
          try {
            const j = await getJson(`${CINEMETA_GENRE}/${type}/top/genre=${encodeURIComponent(genre)}.json`);
            (j?.metas || []).slice(0, 25).forEach((m, i) => {
              const id = m.imdb_id || m.id;
              if (!/^tt\d+$/.test(id) || watched.imdb.has(id) || seen.has(id)) return;
              seen.add(id);
              out.push({ imdb: id, type, score: gw / (1 + i * 0.15), why: genre, preview: { ...m, id, imdb_id: id, type } });
            });
          } catch (e) {}
        }),
      ),
    );
    return out.sort((a, b) => b.score - a.score);
  }

  // ───────────────────────────── build + cache
  async function build() {
    const hist = history();
    const watched = {
      imdb: new Set(hist.filter((h) => h.id.startsWith("tt")).map((h) => h.id)),
      kitsu: new Set(hist.filter((h) => h.id.startsWith("kitsu:")).map((h) => h.id.slice(6))),
    };
    const seeds = hist.slice(0, SEEDS);
    if (!seeds.length) return { movie: [], series: [] };

    // Which seeds are anime (AniList ids) and which aren't.
    const mapped = await Promise.all(seeds.map(async (s) => ({ ...s, ...(await anilistIdsFor(s)) })));
    const anime = mapped.filter((s) => s.anilist?.length);
    const other = mapped.filter((s) => !s.anilist?.length && s.id.startsWith("tt"));
    for (const s of anime) if (s.imdb) watched.imdb.add(s.imdb);
    log(`seeds: ${anime.length} anime, ${other.length} other`);

    const [recs, picks] = await Promise.all([animeRecommendations(anime, watched), genrePicks(other, watched)]);
    saveIds();

    // Mix in proportion to how much of the watching is anime.
    const animeShare = anime.reduce((n, s) => n + s.weight, 0) / Math.max(1e-9, mapped.reduce((n, s) => n + s.weight, 0));
    const result = { movie: [], series: [] };
    for (const type of ["series", "movie"]) {
      const a = recs.filter((r) => r.type === type);
      const g = picks.filter((r) => r.type === type);
      const list = [];
      let ai = 0,
        gi = 0;
      while (list.length < 40 && (ai < a.length || gi < g.length)) {
        const takeAnime = gi >= g.length || (ai < a.length && (ai + 1) / (list.length + 1) <= Math.max(animeShare, 0.2));
        list.push(takeAnime ? a[ai++] : g[gi++]);
      }
      result[type] = list;
    }
    log(`built: ${result.series.length} series, ${result.movie.length} movies (anime share ${animeShare.toFixed(2)})`);
    return { ...result, fingerprint: fingerprint(hist), time: Date.now() };
  }

  // The set (not the order) of the top titles: rebuild when tastes move, not
  // after every episode.
  const fingerprint = (hist) =>
    hist
      .slice(0, 8)
      .map((s) => s.id)
      .sort()
      .join(",");

  let pending = null;
  async function recommendations() {
    const cached = readJson(CACHE_KEY);
    const fp = fingerprint(history());
    if (cached && cached.fingerprint === fp && Date.now() - cached.time < CACHE_TTL) return cached;
    if (!pending)
      pending = build()
        .then((r) => {
          try {
            localStorage.setItem(CACHE_KEY, JSON.stringify(r));
          } catch (e) {}
          return r;
        })
        .finally(() => (pending = null));
    return pending;
  }

  // Runs before Kai's hero modules (webmods load in path order).
  try {
    // 0.9.0: drop the hero's cached titles once, so it rebuilt from For You
    // at once instead of showing the old trending list until its refresh.
    if (!localStorage.getItem("stremioz-for-you-v1")) {
      ["heroMovieTitlesCache", "heroGlobalTimestamp"].forEach((k) => localStorage.removeItem(k));
      localStorage.setItem("stremioz-for-you-v1", "1");
    }
    // 0.9.3: For You became the banner's third mode (Movies, Anime, For You)
    // instead of the first entry of the Movie and Series source lists. Shift
    // the saved source choices back to Kai's lists, and keep showing For You
    // (with its cached titles) to whoever saw it in the Movies mode.
    if (!localStorage.getItem("heroSourcesStremioZ")) {
      const wasForYou = (key) => {
        const v = localStorage.getItem(key);
        if (v === null) return true; // the default was For You
        const n = parseInt(v, 10);
        if (n === 1) {
          localStorage.removeItem(key);
          return true;
        }
        if (n > 1) localStorage.setItem(key, String(n - 1));
        return false;
      };
      const movieWasForYou = wasForYou("hero-movie-source-index");
      const seriesWasForYou = wasForYou("hero-series-source-index");
      const mode = localStorage.getItem("heroCatalogPreference");
      if ((movieWasForYou || seriesWasForYou) && (mode === null || mode === "movies")) {
        const titles = localStorage.getItem("heroMovieTitlesCache");
        if (titles) localStorage.setItem("heroForYouTitlesCache", titles);
        localStorage.removeItem("heroMovieTitlesCache");
        localStorage.setItem("heroCatalogPreference", "foryou");
      }
      localStorage.setItem("heroSourcesStremioZ", "2");
    }
  } catch (e) {}

  window.StremioZForYou = {
    /** Cinemeta-style items for the hero banner. */
    async getItems(type = "series", limit = 30) {
      const recs = await recommendations();
      const list = (recs[type === "movie" ? "movie" : "series"] || []).slice(0, limit);
      const items = await Promise.all(list.map(async (r) => r.preview || (await cinemetaMeta(r.type, r.imdb))));
      return items.filter(Boolean);
    },
    /** Drops the cache (the next hero refresh rebuilds). */
    reset() {
      localStorage.removeItem(CACHE_KEY);
    },
    _debug: { history, recommendations },
  };
})();
