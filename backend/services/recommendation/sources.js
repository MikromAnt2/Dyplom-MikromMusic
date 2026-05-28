const Song = require('../../models/mongo/song');
const { isMongoConnected } = require('../../utils/mongo');
const { LikedSong } = require('../../models/pg');
const { Innertube } = require('youtubei.js');
const { runInfiniteTracksSearch, fetchFromYouTube, isValidMusicTrack } = require('../../routes/search');
const {
  uniq,
  isGoodTrack,
  relevanceFilter,
  pickRepresentativeSeedDocs,
  interleaveSeedIds,
  normalizeArtistKey,
  inferGenreHint,
  scoreAdd,
  rankedFromMap
} = require('./utils');
const { findClusterArtists } = require('./scoring');
const { MOOD_SEARCH_SUFFIX } = require('./constants');
const searchCache = require('./searchCache');
const { enrichTrackMedia, enrichAlbumMedia } = require('./mediaQuality');
const { coerceMediaText, isPlayableTrackMeta } = require('./trackFilter');
const {
  extractUcFromArtistItem,
  pickUcArtistId,
  isUcArtistId
} = require('../../utils/artistChannel');

const ytClientPromise = Innertube.create().catch(() => null);

// getYtClient: спільний Innertube-клієнт для рекомендацій
async function getYtClient() {
  return ytClientPromise;
}

// walkCompactVideos: обходить дерево Innertube і збирає compact video
function walkCompactVideos(node, acc, depth = 0) {
  if (!node || depth > 25) return;
  if (node.video_id) {
    acc.push(node);
    return;
  }
  if (Array.isArray(node)) {
    for (const n of node) walkCompactVideos(n, acc, depth + 1);
    return;
  }
  if (node.contents && Array.isArray(node.contents)) {
    for (const n of node.contents) walkCompactVideos(n, acc, depth + 1);
  }
}

// songFromCompactVideo: compact video Innertube → обʼєкт треку
function songFromCompactVideo(v) {
  const id = v.video_id;
  if (!id) return null;
  const title = coerceMediaText(v.title);
  const duration = v.duration?.seconds || 0;
  if (!isValidMusicTrack(title, duration)) return null;
  let thumb = `https://i.ytimg.com/vi/${id}/sddefault.jpg`;
  try {
    const thumbs = v.thumbnails;
    if (thumbs?.length) thumb = thumbs[thumbs.length - 1]?.url || thumb;
  } catch {}
  const aid = v.author?.id;
  const channelId = aid && String(aid).startsWith('UC') ? String(aid) : '';
  const track = {
    youtubeId: id,
    title,
    author: coerceMediaText(v.author?.name || v.author),
    channelId,
    image: thumb,
    duration
  };
  return enrichTrackMedia(track);
}

// persistSong: upsert треку в Mongo (якщо підключено)
async function persistSong(track) {
  if (!track?.youtubeId || !isMongoConnected()) return;
  await Song.findOneAndUpdate(
    { youtubeId: track.youtubeId },
    {
      title: track.title,
      author: track.author,
      image: track.image,
      duration: track.duration || 0,
      ...(track.channelId ? { channelId: track.channelId } : {})
    },
    { upsert: true, setDefaultsOnInsert: true }
  ).catch(() => {});
}

// collaborativeCandidates: колаборативна фільтрація за спільними лайками
async function collaborativeCandidates(userId, excludeSet, limit = 60) {
  const myLikes = await LikedSong.findAll({ where: { userId: String(userId) } });
  const mySet = new Set(myLikes.map(l => l.youtubeId));
  if (mySet.size < 2) return [];

  const myIds = [...mySet];
  const allLikes = await LikedSong.findAll({
    where: { youtubeId: myIds },
    attributes: ['userId', 'youtubeId']
  });

  const byUser = new Map();
  for (const row of allLikes) {
    const uid = String(row.userId);
    if (uid === String(userId)) continue;
    if (!byUser.has(uid)) byUser.set(uid, new Set());
    byUser.get(uid).add(row.youtubeId);
  }

  const neighbors = [];
  for (const [uid, overlap] of byUser.entries()) {
    let inter = 0;
    for (const x of mySet) if (overlap.has(x)) inter++;
    if (inter < 1) continue;
    const union = mySet.size + overlap.size - inter;
    neighbors.push({ uid, jaccard: union ? inter / union : 0 });
  }
  neighbors.sort((a, b) => b.jaccard - a.jaccard);
  const topNeighbors = neighbors.slice(0, 20);
  if (!topNeighbors.length) return [];

  const neighborLikes = await LikedSong.findAll({
    where: { userId: topNeighbors.map(n => n.uid) },
    limit: 500
  });

  const jaccardByUser = new Map(topNeighbors.map(n => [n.uid, n.jaccard]));
  const scored = new Map();
  for (const row of neighborLikes) {
    if (excludeSet.has(row.youtubeId) || mySet.has(row.youtubeId)) continue;
    const j = jaccardByUser.get(String(row.userId)) || 0;
    scoreAdd(scored, row.youtubeId, 5 * j, 'collab');
  }
  return rankedFromMap(scored, limit);
}

// ingestUpNextPanel: додає треки з Up Next у scored Map
async function ingestUpNextPanel(upNext, scored, excludeSet, boost, maxItems = 12) {
  if (!upNext?.contents) return 0;
  let n = 0;
  for (const item of upNext.contents) {
    if (n >= maxItems) break;
    if (item.type !== 'PlaylistPanelVideo' || !item.video_id) continue;
    const track = {
      youtubeId: item.video_id,
      title: coerceMediaText(item.title),
      author: coerceMediaText(
        typeof item.author === 'string' ? item.author : item.authors?.[0]?.name || item.author
      ),
      image: item.thumbnails?.[item.thumbnails.length - 1]?.url,
      duration: item.duration?.seconds || 0
    };
    if (!isGoodTrack(track) || excludeSet.has(track.youtubeId)) continue;
    n++;
    scoreAdd(scored, track.youtubeId, boost, 'yt-up-next');
    await persistSong(track);
  }
  return n;
}

// youtubeRelatedCandidates: related/up-next кандидати за seed-id
async function youtubeRelatedCandidates(seedIds, excludeSet, seedMap, limit = 80) {
  const yt = await getYtClient();
  if (!yt) return [];
  const scored = new Map();
  const seeds = interleaveSeedIds(uniq(seedIds).filter(Boolean), seedMap).slice(0, 10);

  for (let i = 0; i < seeds.length; i++) {
    const seedId = seeds[i];
    const boost = 7 - i * 0.35;
    let added = 0;

    if (yt.music?.getUpNext) {
      try {
        const upNext = await yt.music.getUpNext(seedId);
        added = ingestUpNextPanel(upNext, scored, excludeSet, boost, 12);
      } catch {}
    }

    if (added < 4) {
      try {
        const info = await yt.getInfo(seedId);
        const compact = [];
        walkCompactVideos(info.watch_next_feed, compact);
        let items = compact.map(songFromCompactVideo).filter(Boolean);
        if (!items.length && typeof info?.getWatchNext === 'function') {
          try {
            const wn = await info.getWatchNext();
            const wnCompact = [];
            walkCompactVideos(wn?.contents || wn?.items || wn, wnCompact);
            items = wnCompact.map(songFromCompactVideo).filter(Boolean);
          } catch {}
        }
        let n = 0;
        for (const norm of items) {
          if (n >= 12) break;
          if (!norm?.youtubeId || excludeSet.has(norm.youtubeId) || !isGoodTrack(norm)) continue;
          n++;
          scoreAdd(scored, norm.youtubeId, boost * 0.9, 'yt-related');
          await persistSong(norm);
        }
      } catch {}
    }
  }
  return rankedFromMap(scored, limit);
}

// searchDiscoverCandidates: пошукові кандидати за кластерами артистів
async function searchDiscoverCandidates(seedSongDocs, excludeSet, limit = 100) {
  const reps = pickRepresentativeSeedDocs(seedSongDocs, 10);
  const scored = new Map();

  for (let i = 0; i < reps.length; i++) {
    const doc = reps[i];
    const author = doc.author;
    const hint = inferGenreHint(doc.title, doc.author);
    const seedCh = doc.channelId || '';
    const cluster = findClusterArtists(normalizeArtistKey(author)).slice(0, 4);

    const queries = [
      `${author} similar artists mix`,
      ...cluster.map(a => `"${a}" music`),
      `best of ${hint} ${MOOD_SEARCH_SUFFIX[hint] || MOOD_SEARCH_SUFFIX.default}`
    ];

    for (const q of queries.slice(0, 3)) {
      try {
        const { items } = await runInfiniteTracksSearch({ query: q });
        let added = 0;
        for (const item of items || []) {
          if (added >= 8) break;
          if (!item.youtubeId || excludeSet.has(item.youtubeId) || !isGoodTrack(item)) continue;
          if (!relevanceFilter(item, author, seedCh) && !cluster.some(c => normalizeArtistKey(item.author).includes(c))) continue;
          added++;
          await persistSong(item);
          scoreAdd(scored, item.youtubeId, 5.5 - i * 0.2, `discover|${hint}`);
        }
      } catch {}
    }
  }
  return rankedFromMap(scored, limit);
}

// mongoAuthorCandidates: треки з Mongo за топ-авторами профілю
async function mongoAuthorCandidates(seedSongDocs, excludeSet, limit = 80) {
  const authorWeights = new Map();
  for (let i = 0; i < seedSongDocs.length; i++) {
    const s = seedSongDocs[i];
    if (!s?.author) continue;
    const w = Math.max(0.5, 8 - i * 0.12);
    authorWeights.set(s.author, (authorWeights.get(s.author) || 0) + w);
  }
  const topAuthors = [...authorWeights.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([a]) => a);
  if (!topAuthors.length || !isMongoConnected()) return [];

  const pool = await Song.find({ author: { $in: topAuthors } }).limit(400);
  const scored = new Map();
  for (const s of pool) {
    if (!s?.youtubeId || excludeSet.has(s.youtubeId) || !isGoodTrack(s)) continue;
    scoreAdd(scored, s.youtubeId, (authorWeights.get(s.author) || 1) * 0.4, 'mongo-author');
  }
  return rankedFromMap(scored, limit);
}

// globalPopularityCandidates: популярні треки за лайками всіх користувачів
async function globalPopularityCandidates(excludeSet, limit = 40) {
  const all = await LikedSong.findAll({ attributes: ['youtubeId'], limit: 3000 });
  const counts = new Map();
  for (const r of all) {
    if (!r.youtubeId || excludeSet.has(r.youtubeId)) continue;
    counts.set(r.youtubeId, (counts.get(r.youtubeId) || 0) + 1);
  }
  const scored = new Map();
  for (const [youtubeId, cnt] of [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit * 2)) {
    scoreAdd(scored, youtubeId, Math.min(10, cnt), 'global-pop');
  }
  return rankedFromMap(scored, limit);
}

// pickBestThumbnail: найширший thumbnail з масиву Innertube
function pickBestThumbnail(thumbs) {
  if (!Array.isArray(thumbs) || !thumbs.length) return '';
  let best = thumbs[0];
  let maxW = Number(best?.width) || 0;
  for (const t of thumbs) {
    const w = Number(t?.width) || 0;
    if (w > maxW) {
      maxW = w;
      best = t;
    }
  }
  return best?.url || thumbs[thumbs.length - 1]?.url || '';
}

// parseInnertubeSongItem: елемент пошуку Innertube → трек
function parseInnertubeSongItem(item) {
  if (!item) return null;
  const youtubeId =
    item.id ||
    item.video_id ||
    item.videoId ||
    item.endpoint?.payload?.videoId ||
    item.play_endpoint?.payload?.videoId;
  if (!youtubeId || String(youtubeId).startsWith('MPREb')) return null;

  const title = coerceMediaText(item.title || item.name).trim();
  const author = coerceMediaText(
    item.artists?.[0]?.name || item.author?.name || item.subtitle || item.author
  ).trim();
  let image = `https://i.ytimg.com/vi/${youtubeId}/hqdefault.jpg`;
  const thumbs = item.thumbnails || item.thumbnail?.thumbnails;
  if (thumbs?.length) image = pickBestThumbnail(thumbs) || image;

  if (!title || !author) return null;

  let channelId = item.channel_id || item.channelId || '';
  if (!isUcArtistId(channelId)) {
    const artists = item.artists || [];
    for (const a of artists) {
      const aid =
        extractUcFromArtistItem(a) || pickUcArtistId(a?.channelId, a?.id, a?.browseId);
      if (aid) {
        channelId = aid;
        break;
      }
    }
  }

  const track = {
    youtubeId: String(youtubeId),
    title,
    author,
    image,
    duration: item.duration?.seconds || item.duration_seconds || 0,
    channelId: isUcArtistId(channelId) ? channelId : ''
  };
  const enriched = enrichTrackMedia(track);
  return isPlayableTrackMeta(enriched) ? enriched : null;
}

// parseInnertubeAlbumItem: елемент альбому Innertube → картка
function parseInnertubeAlbumItem(item) {
  if (!item) return null;
  const browseId = item.browseId || item.id || item.endpoint?.payload?.browseId;
  if (!browseId) return null;
  const title = (item.title?.toString?.() || item.name?.toString?.() || '').trim();
  const author =
    (item.artists?.[0]?.name?.toString?.() || item.author?.name?.toString?.() || item.author || '').trim();
  let image = '';
  const thumbs = item.thumbnails || item.thumbnail?.thumbnails;
  if (thumbs?.length) image = thumbs[thumbs.length - 1].url || '';
  return enrichAlbumMedia({
    youtubeId: String(browseId),
    title: title || 'Album',
    author: author || '',
    image,
    channelId: browseId
  });
}

// flattenInnertubeAlbumResults: плоский список альбомів з відповіді пошуку
function flattenInnertubeAlbumResults(res) {
  const out = [];
  const push = (node) => {
    if (!node) return;
    if (Array.isArray(node)) {
      node.forEach(push);
      return;
    }
    const a = parseInnertubeAlbumItem(node);
    if (a) out.push(a);
    if (node.contents) push(node.contents);
    if (node.items) push(node.items);
  };
  push(res?.albums?.contents);
  push(res?.results);
  push(res?.contents);
  return out;
}

// searchAlbumsViaInnertube: пошук альбомів через YT Music (кеш)
async function searchAlbumsViaInnertube(query, limit = 12) {
  const cacheKey = `innertube-album:${query}:${limit}`;
  const cached = searchCache.get(cacheKey);
  if (cached) return cached.slice(0, limit);

  const yt = await getYtClient();
  if (!yt?.music?.search) return [];

  const albums = [];
  const seen = new Set();
  try {
    const res = await yt.music.search(query, { type: 'album' });
    for (const item of flattenInnertubeAlbumResults(res)) {
      if (!item?.youtubeId || seen.has(item.youtubeId)) continue;
      seen.add(item.youtubeId);
      albums.push(item);
      if (albums.length >= limit) break;
    }
  } catch (err) {
    console.warn('[rec] Innertube album search failed:', err.message);
  }
  searchCache.set(cacheKey, albums);
  return albums;
}

// flattenInnertubeSearchResults: плоский список треків з відповіді пошуку
function flattenInnertubeSearchResults(res) {
  const out = [];
  const push = (node) => {
    if (!node) return;
    if (Array.isArray(node)) {
      node.forEach(push);
      return;
    }
    const t = parseInnertubeSongItem(node);
    if (t) out.push(t);
    if (node.contents) push(node.contents);
    if (node.items) push(node.items);
  };
  push(res?.results);
  push(res?.songs?.contents);
  push(res?.contents);
  return out;
}

// searchTracksViaInnertube: пошук треків через YT Music без Google API
async function searchTracksViaInnertube(query, excludeSet, limit = 25) {
  const cacheKey = `innertube:${query}:${limit}`;
  const cached = searchCache.get(cacheKey);
  if (cached) {
    return cached.filter((t) => !excludeSet.has(t.youtubeId)).slice(0, limit);
  }

  const yt = await getYtClient();
  if (!yt?.music?.search) return [];

  const tracks = [];
  const seen = new Set();
  try {
    const res = await yt.music.search(query, { type: 'song' });
    for (const item of flattenInnertubeSearchResults(res)) {
      if (seen.has(item.youtubeId) || excludeSet.has(item.youtubeId)) continue;
      seen.add(item.youtubeId);
      await persistSong(item);
      tracks.push(item);
      if (tracks.length >= limit) break;
    }
  } catch (err) {
    console.warn('[rec] Innertube search failed:', err.message);
  }

  searchCache.set(cacheKey, tracks);
  return tracks;
}

// searchTracksWithMeta: Innertube, при нестачі — Google API
async function searchTracksWithMeta(query, excludeSet, limit = 25) {
  const cacheKey = `meta:${query}:${limit}`;
  const cached = searchCache.get(cacheKey);
  if (cached) {
    return cached.filter((t) => !excludeSet.has(t.youtubeId)).slice(0, limit);
  }

  let tracks = await searchTracksViaInnertube(query, excludeSet, limit);

  if (tracks.length < Math.min(8, limit)) {
    try {
      const { items } = await runInfiniteTracksSearch({ query });
      for (const item of items || []) {
        if (!item?.youtubeId || excludeSet.has(item.youtubeId) || !isGoodTrack(item)) continue;
        const track = {
          youtubeId: item.youtubeId,
          title: item.title,
          author: item.author,
          image: item.image,
          duration: item.duration || 0,
          channelId: item.channelId || ''
        };
        await persistSong(track);
        if (!tracks.find((t) => t.youtubeId === track.youtubeId)) tracks.push(track);
        if (tracks.length >= limit) break;
      }
    } catch (err) {
      console.warn('[rec] Google API search skipped (quota):', err.message);
    }
  }

  tracks = tracks.slice(0, limit);
  searchCache.set(cacheKey, tracks);
  return tracks;
}

// trendingSearchCandidates: трендові треки за пошуковим запитом
async function trendingSearchCandidates(query, excludeSet, limit = 25) {
  const tracks = await searchTracksWithMeta(query, excludeSet, limit);
  const scored = new Map();
  tracks.forEach((t, i) => scoreAdd(scored, t.youtubeId, 3 - i * 0.05, 'trending'));
  return rankedFromMap(scored, limit);
}

// upNextCandidates: Up Next для youtubeId через music API
async function upNextCandidates(youtubeId, excludeSet, limit = 25) {
  const yt = await getYtClient();
  if (!yt?.music?.getUpNext) return [];
  const scored = new Map();
  try {
    const upNext = await yt.music.getUpNext(youtubeId);
    if (upNext?.contents) {
      for (const item of upNext.contents) {
        if (item.type !== 'PlaylistPanelVideo' || !item.video_id) continue;
        const track = {
          youtubeId: item.video_id,
          title: coerceMediaText(item.title),
          author: coerceMediaText(
            typeof item.author === 'string' ? item.author : item.authors?.[0]?.name || item.author
          ),
          image: item.thumbnails?.[item.thumbnails.length - 1]?.url,
          duration: item.duration?.seconds || 0
        };
        if (!isGoodTrack(track) || excludeSet.has(track.youtubeId)) continue;
        scoreAdd(scored, track.youtubeId, 8, 'up-next');
        await persistSong(track);
      }
    }
  } catch {}
  return rankedFromMap(scored, limit);
}

// relatedArtistSearchCandidates: пошук схожих артистів за кластером
async function relatedArtistSearchCandidates(seedTrack, excludeSet, sessionExclude = new Set()) {
  const author = seedTrack?.author || '';
  const key = normalizeArtistKey(author);
  const related = findClusterArtists(key);
  const hint = inferGenreHint(seedTrack?.title, seedTrack?.author);
  const scored = new Map();

  const queries = [
    ...related.slice(0, 6).map(a => `"${a}" official music video`),
    `${hint} artists like ${author} mix`,
    `${author} radio mix similar`
  ];

  for (const q of queries.slice(0, 2)) {
    const items = await searchTracksViaInnertube(q, new Set([...excludeSet, ...sessionExclude]), 15);
    for (const item of items) {
      const isSame = normalizeArtistKey(item.author) === key;
      scoreAdd(scored, item.youtubeId, isSame ? 2 : 6, 'related-artist-search');
    }
  }
  return rankedFromMap(scored, 120);
}

// hydrateMissingFromYtApi: доповнює Mongo метаданими з YouTube API
async function hydrateMissingFromYtApi(youtubeIds) {
  const ids = uniq(youtubeIds).filter(Boolean);
  for (let i = 0; i < ids.length; i += 25) {
    const chunk = ids.slice(i, i + 25);
    if (!chunk.length) continue;
    const url = `https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails&id=${chunk.join(',')}`;
    try {
      const data = await fetchFromYouTube(url);
      for (const v of data.items || []) {
        const match = v.contentDetails?.duration?.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
        let duration = 0;
        if (match) {
          duration =
            (parseInt(match[1], 10) || 0) * 3600 +
            (parseInt(match[2], 10) || 0) * 60 +
            (parseInt(match[3], 10) || 0);
        }
        await Song.findOneAndUpdate(
          { youtubeId: v.id },
          {
            title: v.snippet?.title || '',
            author: v.snippet?.channelTitle || '',
            channelId: v.snippet?.channelId || '',
            image: `https://i.ytimg.com/vi/${v.id}/mqdefault.jpg`,
            duration
          },
          { upsert: true, setDefaultsOnInsert: true }
        );
      }
    } catch {}
  }
}

module.exports = {
  collaborativeCandidates,
  youtubeRelatedCandidates,
  searchDiscoverCandidates,
  mongoAuthorCandidates,
  globalPopularityCandidates,
  searchTracksViaInnertube,
  searchAlbumsViaInnertube,
  searchTracksWithMeta,
  trendingSearchCandidates,
  upNextCandidates,
  relatedArtistSearchCandidates,
  hydrateMissingFromYtApi,
  persistSong,
  getYtClient
};
