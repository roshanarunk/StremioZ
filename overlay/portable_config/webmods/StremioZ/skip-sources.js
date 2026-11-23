/**
 * @name StremioZ Skip Sources
 * @description Finds the MyAnimeList entry and episode number of the anime
 *   episode being played, for AniSkip skip times in notify_skip.lua (which
 *   prefers the file's own Intro/OP/ED chapters, and falls back to silence
 *   detection). Sends "stremioz-aniskip" to notify_skip after mpv-bridge.js
 *   has sent the episode's content-metadata.
 *
 *   - mal:ID:EP in the player address: as is.
 *   - kitsu:ID:EP: the MAL id from arm.haglund.dev (Kitsu entries are one
 *     season each, so the episode number stays).
 *   - IMDb tt…:S:E (Cinemeta): only titles Kai's metadata marks as anime.
 *     MAL has an entry per season or cour, so the show's TV entries are found
 *     on AniList (sequel/prequel links from the MAL ids Kai knows) and put in
 *     airing order; S:E becomes an absolute episode number with Cinemeta's
 *     season lengths, counted on through the entries.
 */
(function () {
  "use strict";
  if (window.StremioZSkipSources || !window.chrome?.webview) return;
  const webview = window.chrome.webview;
  const mpv = (...args) =>
    webview.postMessage(JSON.stringify({ type: 6, object: "transport", method: "handleInboundJSON", args: ["mpv-command", args] }));
  const log = (...a) => console.log("[StremioZ Skip]", ...a);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function parse(hash) {
    let h;
    try {
      h = decodeURIComponent(hash);
    } catch (e) {
      h = hash;
    }
    if (!h.startsWith("#/player")) return null;
    const type = (h.match(/\/(movie|series)\//) || [])[1];
    // The address holds the show id and then the video id (id:season:episode);
    // the video id is the one with the episode.
    const imdb = h.match(/\/(tt\d+):(\d+):(\d+)(?:\/|$)/) || h.match(/\/(tt\d+)(?:\/|$)/);
    const kitsu = h.match(/kitsu:(\d+):(\d+)/) || h.match(/kitsu:(\d+)/);
    const mal = h.match(/mal:(\d+):(\d+)/) || h.match(/mal:(\d+)/);
    return {
      type,
      imdb: imdb ? imdb[1] : null,
      season: imdb && imdb[2] ? +imdb[2] : null,
      episode: imdb && imdb[3] ? +imdb[3] : null,
      kitsu: kitsu ? { id: +kitsu[1], ep: kitsu[2] ? +kitsu[2] : null } : null,
      mal: mal ? { id: +mal[1], ep: mal[2] ? +mal[2] : null } : null,
    };
  }

  async function getJson(url, options) {
    const r = await fetch(url, options);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  }

  // MAL ids of an IMDb title: Kai's metadata (waits for it to load) together
  // with arm.haglund.dev's IMDb mapping, since Kai's entry can be missing or
  // wrong. Neither has ids for titles that aren't anime.
  async function malIdsForImdb(imdb) {
    for (let i = 0; i < 20 && !window.metadataHelper?.getTitle; i++) await sleep(500);
    const [entry, arm] = await Promise.all([
      Promise.resolve(window.metadataHelper?.getTitle?.(imdb)).catch(() => null),
      getJson(`https://arm.haglund.dev/api/v2/imdb?id=${imdb}`).catch(() => []),
    ]);
    const kai = Array.isArray(entry?.mal) ? entry.mal : entry?.mal ? [entry.mal] : [];
    // Entries ARM maps to season 0 are specials and films, not episodes.
    const mapped = (Array.isArray(arm) ? arm : [])
      .filter((a) => (a["thetvdb-season"] ?? a["themoviedb-season"]) !== 0)
      .map((a) => a.myanimelist);
    return [...new Set([...kai, ...mapped].map(Number).filter(Boolean))];
  }

  // All TV entries of a show in airing order, from AniList: starting from the
  // MAL ids Kai knows (often only some seasons), follows the sequel/prequel
  // links (through films and specials, which aren't kept). Cached per show.
  const orderCache = new Map();
  async function airingOrder(ids) {
    const key = ids.slice().sort((a, b) => a - b).join(",");
    if (orderCache.has(key)) return orderCache.get(key);
    const query = `query ($ids: [Int]) { Page(perPage: 50) {
      media(idMal_in: $ids, type: ANIME) { idMal format episodes startDate { year month day }
        relations { edges { relationType node { idMal type } } } } } }`;
    const known = new Map();
    const seen = new Set(ids);
    let frontier = ids.slice();
    for (let round = 0; round < 10 && frontier.length; round++) {
      const json = await getJson("https://graphql.anilist.co", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ query, variables: { ids: frontier } }),
      });
      frontier = [];
      for (const m of json?.data?.Page?.media || []) {
        if (!m.idMal) continue;
        known.set(m.idMal, m);
        for (const e of m.relations?.edges || []) {
          const id = e.node?.idMal;
          if (!id || e.node.type !== "ANIME" || seen.has(id)) continue;
          if (e.relationType !== "SEQUEL" && e.relationType !== "PREQUEL") continue;
          seen.add(id);
          frontier.push(id);
        }
      }
    }
    const shortOnly = [...known.values()].every((m) => m.format !== "TV" && m.format !== "ONA");
    const formats = shortOnly ? ["TV_SHORT"] : ["TV", "ONA"];
    const date = (m) => (m.startDate?.year || 9999) * 10000 + (m.startDate?.month || 12) * 100 + (m.startDate?.day || 31);
    const list = [...known.values()].filter((m) => formats.includes(m.format)).sort((a, b) => date(a) - date(b));
    orderCache.set(key, list);
    return list;
  }

  // Cinemeta's episode count for each season of a show (season 0, specials,
  // left out), to turn season:episode into an absolute episode number.
  const seasonCache = new Map();
  async function seasonLengths(imdb) {
    if (seasonCache.has(imdb)) return seasonCache.get(imdb);
    const json = await getJson(`https://v3-cinemeta.strem.io/meta/series/${imdb}.json`).catch(() => null);
    const lengths = {};
    for (const v of json?.meta?.videos || []) {
      if (v.season > 0 && v.episode > 0) lengths[v.season] = Math.max(lengths[v.season] || 0, v.episode);
    }
    const result = Object.keys(lengths).length ? lengths : null;
    seasonCache.set(imdb, result);
    return result;
  }

  async function resolve(p) {
    if (p.mal?.id && p.mal.ep) return { mal_id: p.mal.id, mal_episode: p.mal.ep };
    if (p.kitsu?.id && p.kitsu.ep) {
      const arm = await getJson(`https://arm.haglund.dev/api/v2/ids?source=kitsu&id=${p.kitsu.id}`);
      return arm?.myanimelist ? { mal_id: +arm.myanimelist, mal_episode: p.kitsu.ep } : null;
    }
    if (!p.imdb || !p.season || !p.episode) return null;
    const ids = await malIdsForImdb(p.imdb);
    if (!ids || !ids.length) return null;
    const list = await airingOrder(ids);
    if (!list.length) return ids.length === 1 && p.season === 1 ? { mal_id: ids[0], mal_episode: p.episode } : null;
    if (list.length === 1) return { mal_id: list[0].idMal, mal_episode: p.episode };
    // Count through the entries from the absolute episode number (handles
    // seasons split into several MAL entries, and shows listed as one season).
    const lengths = await seasonLengths(p.imdb);
    let ep;
    if (lengths) {
      ep = p.episode;
      for (let s = 1; s < p.season; s++) ep += lengths[s] || 0;
    } else {
      // No Cinemeta data: take season S as the S-th entry.
      const bySeason = list[p.season - 1];
      if (bySeason && (!bySeason.episodes || p.episode <= bySeason.episodes))
        return { mal_id: bySeason.idMal, mal_episode: p.episode };
      ep = p.episode;
    }
    for (const m of list) {
      if (!m.episodes || ep <= m.episodes) return { mal_id: m.idMal, mal_episode: ep };
      ep -= m.episodes;
    }
    return null;
  }

  let lastHash = null;
  async function onRoute() {
    const hash = location.hash;
    if (hash === lastHash) return;
    lastHash = hash;
    const p = parse(hash);
    if (!p || p.type !== "series") return;
    // Content without an IMDb id (Kitsu addons): mpv-bridge.js sends nothing,
    // so notify_skip would never learn it's a series. Tell it here.
    let ident;
    if (p.imdb) ident = { imdb_id: p.imdb, season: p.season, episode: p.episode };
    else if (p.kitsu) {
      ident = { imdb_id: `kitsu:${p.kitsu.id}`, season: null, episode: p.kitsu.ep };
      mpv("script-message-to", "notify_skip", "content-metadata", JSON.stringify({ content_type: "series", ...ident }));
    } else return;
    try {
      const r = await resolve(p);
      if (!r || location.hash !== hash) return;
      log(`MAL ${r.mal_id} episode ${r.mal_episode}`);
      mpv("script-message-to", "notify_skip", "stremioz-aniskip", JSON.stringify({ ...ident, ...r }));
    } catch (e) {
      log("Couldn't find the MyAnimeList entry:", e.message || e);
    }
  }

  window.addEventListener("hashchange", () => setTimeout(onRoute, 300));
  setTimeout(onRoute, 1500);
  window.StremioZSkipSources = { parse, resolve, airingOrder, seasonLengths };
})();
