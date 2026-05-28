const { parseCountFromString, formatSubsLabel } = require('../utils/formatListeners');
const { enrichArtistsMonthlyListeners } = require('../utils/artistSubs');
const { dedupeTracksByYoutubeId, enhanceSearchTracksForQuery } = require('./searchLogic');
const { matchSitePlaylists, mapSitePlaylistResults } = require('./hybridSearch');
const {
  nameSimilarity,
  expandQueryVariants,
  normalizeSearchKey,
  cyrillicKeyboardToLatin,
  hasCyrillic
} = require('../utils/searchFuzzy');

// normalizeQuery: нормалізує пошуковий рядок
function normalizeQuery(q) {
  return String(q || '').trim().replace(/\s+/g, ' ');
}

// decodeHtmlEntities: декодує HTML-сутності
function decodeHtmlEntities(str) {
  if (!str || typeof str !== 'string') return str || '';
  return str
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'");
}

// cleanTrackTitle: очищує title треку від HTML і зайвих пробілів
function cleanTrackTitle(title) {
  return decodeHtmlEntities(title || '')
    .replace(/\s+/g, ' ')
    .trim();
}

// subsToNumber: число підписників з рядка subs
function subsToNumber(subs) {
  return parseCountFromString(subs) || 0;
}

// scoreArtistMatch: релевантність артиста запиту з урахуванням subs
function scoreArtistMatch(artist, query) {
  const q = normalizeQuery(query);
  const name = artist.name || '';
  if (!name || !q) return 0;

  const sim = nameSimilarity(name, q);
  if (sim < 0.45) return Math.log10(subsToNumber(artist.subs) + 1) * 10;

  let score = sim * 20_000_000;

  if (name.toLowerCase() === q.toLowerCase()) score += 5_000_000;
  if (name === q) score += 8_000_000;

  const qHasLower = /[a-zа-яіїєґ]/.test(q);
  const nameAllCaps =
    name.length >= 2 && name === name.toUpperCase() && /[A-ZА-ЯІЇЄҐ]/.test(name);
  if (nameAllCaps && qHasLower) score -= 6_000_000;

  const nLow = name.toLowerCase();
  const qLow = q.toLowerCase();
  if (nLow.startsWith(qLow) && name.length > q.length) {
    score -= (name.length - q.length) * 2_000_000;
  }

  score += Math.log10(subsToNumber(artist.subs) + 1) * 800;
  return score;
}

// nameMatchScore: короткий скор схожості імені та запиту
function nameMatchScore(name, query) {
  return Math.round(nameSimilarity(name, query) * 3);
}

// scoreTrackMatch: релевантність треку запиту та bestArtist
function scoreTrackMatch(track, query, bestArtist) {
  const q = normalizeQuery(query);
  const qKey = normalizeSearchKey(q);
  const title = cleanTrackTitle(track.title).toLowerCase();
  const author = (track.author || '').toLowerCase();
  let score = Math.log10((track.views || 0) + 1) * 100;

  if (title.includes(q.toLowerCase())) score += 500;
  if (author.includes(q.toLowerCase())) score += 300;
  score += nameSimilarity(track.title, q) * 400;
  score += nameSimilarity(track.author, q) * 350;

  const words = q.split(/\s+/).filter((w) => w.length >= 2);
  for (const w of words) {
    if (title.includes(w.toLowerCase())) score += 80;
    if (author.includes(w.toLowerCase())) score += 40;
  }
  if (qKey.length >= 3 && normalizeSearchKey(title).includes(qKey)) score += 200;

  if (bestArtist?.channelId && track.channelId === bestArtist.channelId) score += 2000;
  if (bestArtist?.name) {
    const an = bestArtist.name.toLowerCase();
    if (author.includes(an) || title.includes(an)) score += 1500;
    else if (q.length >= 3 && (nameMatchScore(an, q) > 0)) score -= 4000;
  }

  if (/\(official\s+video\)|lyrics|cover|reaction|live\s+stream/i.test(title)) score -= 200;
  if (author.includes('topic') && bestArtist && !author.includes(bestArtist.name.toLowerCase().slice(0, 4))) {
    score -= 100;
  }

  return score;
}

// rankArtists: сортує артистів за scoreArtistMatch, дедуп за channelId
function rankArtists(artists, query) {
  const byId = new Map();
  for (const a of artists || []) {
    if (!a?.channelId) continue;
    const prev = byId.get(a.channelId);
    if (!prev || scoreArtistMatch(a, query) > scoreArtistMatch(prev, query)) {
      byId.set(a.channelId, a);
    }
  }
  return [...byId.values()].sort((a, b) => scoreArtistMatch(b, query) - scoreArtistMatch(a, query));
}

// hasListenerData: чи є у артиста дані про слухачів
function hasListenerData(artist) {
  return subsToNumber(artist?.subs) > 0;
}

// filterQualityArtists: релевантні артисти з слухачами або fallback за ім'ям
function filterQualityArtists(artists, query, max = 12) {
  const q = normalizeQuery(query);
  if (!q) return [];

  const pool = artists || [];
  const byScore = (list) =>
    [...list].sort((a, b) => scoreArtistMatch(b, q) - scoreArtistMatch(a, q));

  const withListeners = byScore(
    pool.filter((a) => {
      if (!hasListenerData(a)) return false;
      const sim = nameSimilarity(a.name, q);
      if (sim >= 0.72) return true;
      if (sim >= 0.58 && subsToNumber(a.subs) >= 50_000) return true;
      return false;
    })
  ).slice(0, max);

  if (withListeners.length > 0) return withListeners;

  return byScore(
    pool.filter((a) => a?.channelId && nameSimilarity(a.name, q) >= 0.55)
  ).slice(0, Math.min(max, 6));
}

// rankTracks: топ треків за scoreTrackMatch
function rankTracks(tracks, query, bestArtist, limit = 15) {
  const unique = dedupeTracksByYoutubeId(tracks || []);
  return unique
    .map((t) => ({
      ...t,
      title: cleanTrackTitle(t.title),
      score: scoreTrackMatch(t, query, bestArtist)
    }))
    .filter((t) => t.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ score, ...t }) => t);
}

// attachAlbumMeta: прив'язує album/albumId до треків за назвою
function attachAlbumMeta(tracks, albums) {
  if (!albums?.length) {
    return (tracks || []).map((t) => ({ ...t, album: t.album || 'Single', albumId: null }));
  }

  const albumList = albums.map((a) => ({
    id: a.youtubeId,
    title: cleanTrackTitle(a.title),
    key: cleanTrackTitle(a.title).toLowerCase().replace(/[^\p{L}\p{N}]/gu, '')
  }));

  return (tracks || []).map((track) => {
    const titleKey = cleanTrackTitle(track.title).toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
    const hit = albumList.find((a) => {
      if (!a.key || a.key.length < 3) return false;
      return titleKey.includes(a.key) || a.key.includes(titleKey.slice(0, Math.min(12, titleKey.length)));
    });
    if (hit) return { ...track, album: hit.title, albumId: hit.id };
    return { ...track, album: track.album && track.album !== 'Single' ? track.album : 'Single', albumId: null };
  });
}

// searchArtists: пошук артистів через Innertube з варіантами запиту
async function searchArtists(ytClient, query) {
  if (!ytClient?.music?.search) return [];

  const { extractUcFromArtistItem, pickUcArtistId, isUcArtistId } = require('../utils/artistChannel');
  const getText = (val) => {
    if (!val) return '';
    if (typeof val === 'string') return val;
    if (val.text) return val.text;
    if (Array.isArray(val.runs)) return val.runs.map((r) => r.text).join('');
    return String(val);
  };

  const variants = expandQueryVariants(query);
  const byChannel = new Map();

  for (const variant of variants) {
    try {
      const searchRes = await ytClient.music.search(variant, { type: 'artist' });
      const items = searchRes?.artists?.contents || searchRes?.contents || searchRes?.results || [];
      const list = Array.isArray(items) ? items : [];

      for (const a of list) {
        const channelId =
          extractUcFromArtistItem(a) || pickUcArtistId(a.channelId, a.id, a.browseId);
        if (!channelId || !isUcArtistId(channelId)) continue;

        const rawSubs = getText(a.subscribers) || getText(a.subtitle) || '';
        const mapped = {
          name: getText(a.name) || getText(a.title) || 'Unknown',
          image: a.thumbnails?.[0]?.url || a.thumbnail?.thumbnails?.[0]?.url || '',
          subs: formatSubsLabel(rawSubs) || '',
          channelId
        };

        const prev = byChannel.get(channelId);
        if (!prev || scoreArtistMatch(mapped, query) > scoreArtistMatch(prev, query)) {
          byChannel.set(channelId, mapped);
        }
      }
    } catch (_) {}
  }

  const mapped = [...byChannel.values()];
  const ranked = rankArtists(mapped, query);
  if (!ranked.length) return [];

  const candidates = ranked
    .filter((a) => nameSimilarity(a.name, query) >= 0.5)
    .slice(0, 10);

  const enriched = await enrichArtistsMonthlyListeners(ytClient, candidates, 3);
  const merged = enriched.map((a, i) => ({
    ...a,
    subs: a.subs || candidates[i]?.subs || ''
  }));

  return filterQualityArtists(merged, query, 12);
}

// fetchTrackPool: пул треків для сторінки пошуку (загальний + channel)
async function fetchTrackPool(query, bestArtist) {
  const { runInfiniteTracksSearch } = require('../routes/search');
  const pageSize = 30;
  const variants = expandQueryVariants(query).slice(0, 3);

  const generalResults = await Promise.all(
    variants.map((q) =>
      runInfiniteTracksSearch({ query: q, channelId: '', pageToken: '', pageSize }).catch(() => ({
        items: []
      }))
    )
  );

  const channel = bestArtist?.channelId
    ? await runInfiniteTracksSearch({
        query: '',
        channelId: bestArtist.channelId,
        pageToken: '',
        pageSize
      }).catch(() => ({ items: [] }))
    : { items: [] };

  const generalItems = generalResults.flatMap((r) => r.items || []);
  const nextPageToken = generalResults.find((r) => r.nextPageToken)?.nextPageToken || null;

  return {
    items: [...(channel.items || []), ...generalItems],
    nextPageToken
  };
}

// searchAlbumsForArtist: альбоми артиста з дискографії channels
async function searchAlbumsForArtist(ytClient, bestArtist, query) {
  if (!bestArtist?.channelId) return [];
  const channelsRouter = require('../routes/channels');
  const loadDisco = channelsRouter.loadArtistDiscography;
  if (typeof loadDisco !== 'function') return [];

  const disco = await loadDisco(bestArtist.channelId, bestArtist.name || query);
  const albums = [...(disco.albums || []), ...(disco.eps || [])].filter((a) => a?.youtubeId);
  return albums.slice(0, 20).map((a) => ({
    youtubeId: a.youtubeId,
    title: cleanTrackTitle(a.title),
    author: a.author || bestArtist.name,
    image: a.image,
    type: 'playlist'
  }));
}

// buildPageSearch: повний результат сторінки пошуку (треки, артисти, альбоми)
async function buildPageSearch(query, deps = {}) {
  const q = normalizeQuery(query);
  if (!q) {
    return {
      query: q,
      bestArtist: null,
      popularTracks: [],
      tracks: [],
      artists: [],
      albums: [],
      sitePlaylists: [],
      nextPageToken: null
    };
  }

  const ytClient = deps.ytClient || null;
  const sitePlaylistsFn = deps.loadSitePlaylists;

  const artists = await searchArtists(ytClient, q).catch(() => []);
  const bestArtist = artists[0] || null;

  const [trackPage, albums, sitePlaylists] = await Promise.all([
    fetchTrackPool(q, bestArtist),
    bestArtist ? searchAlbumsForArtist(ytClient, bestArtist, q).catch(() => []) : Promise.resolve([]),
    sitePlaylistsFn ? sitePlaylistsFn(q).catch(() => []) : Promise.resolve([])
  ]);

  const rankedTracks = enhanceSearchTracksForQuery(trackPage.items || [], q, 15);

  const tracksWithAlbums = attachAlbumMeta(rankedTracks, albums).map((t) => ({
    ...t,
    channelId: t.channelId || bestArtist?.channelId || ''
  }));

  let suggestedQuery = null;
  if (hasCyrillic(q)) {
    const fixed = cyrillicKeyboardToLatin(q);
    if (fixed && normalizeSearchKey(fixed) !== normalizeSearchKey(q)) {
      suggestedQuery = fixed;
    }
  }

  return {
    query: q,
    suggestedQuery,
    bestArtist,
    popularTracks: tracksWithAlbums.slice(0, 4),
    tracks: tracksWithAlbums,
    artists,
    albums,
    sitePlaylists: sitePlaylists || [],
    nextPageToken: trackPage.nextPageToken || null
  };
}

module.exports = {
  buildPageSearch,
  searchArtists,
  searchAlbumsForArtist,
  rankArtists,
  rankTracks,
  cleanTrackTitle,
  attachAlbumMeta,
  filterQualityArtists,
  hasListenerData
};
