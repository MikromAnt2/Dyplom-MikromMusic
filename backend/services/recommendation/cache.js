const HomeCache = require('../../models/mongo/HomeCache');
const { CACHE_TTL_MS } = require('./constants');
const { toTrackCard, toAlbumCard } = require('./utils');

const HOME_CACHE_SCHEMA_VERSION = 10;

const TRACK_BLOCK_KEYS = [
  'listenAgain',
  'forYou',
  'newFromSubscribed',
  'basedOnListening',
  'newForYou',
  'exploreMix',
  'popularInYourGenres',
  'quickPick',
  'trendingNow',
  'popularNewReleases',
  'similarToRecent',
  'artistsYouMayLike'
];

const ALBUM_BLOCK_KEYS = ['albumsForYou', 'popularAlbums'];

// blocksHaveContent: чи є хоча б один непорожній блок Home
function blocksHaveContent(blocks) {
  if (!blocks || typeof blocks !== 'object') return false;
  return Object.values(blocks).some(
    (arr) => Array.isArray(arr) && arr.length > 0
  );
}

// normalizeLegacyAlbum: старий формат альбому → youtubeId, title, author
function normalizeLegacyAlbum(raw) {
  if (!raw) return null;
  const youtubeId = raw.youtubeId || raw.id || raw.browseId;
  if (!youtubeId) return null;
  return {
    ...raw,
    youtubeId: String(youtubeId),
    title: raw.title || raw.name || '',
    author: raw.author || raw.ownerName || raw.artist || raw.owner || ''
  };
}

// albumsNeedRepair: чи потрібно оновити title альбомів у кеші
function albumsNeedRepair(albums) {
  if (!albums?.length) return true;
  return albums.some((a) => {
    const title = (a?.title || a?.name || '').trim();
    return !title || title === 'Album' || title === 'Unknown Album';
  });
}

// rehydrateHomeBlocks: оновлює кешовані блоки під поточний формат карток
function rehydrateHomeBlocks(blocks) {
  if (!blocks || typeof blocks !== 'object') return blocks;
  const out = { ...blocks };

  for (const key of TRACK_BLOCK_KEYS) {
    if (!Array.isArray(out[key])) continue;
    out[key] = out[key]
      .map((t) => toTrackCard(t))
      .filter(Boolean);
  }

  for (const key of ALBUM_BLOCK_KEYS) {
    if (!Array.isArray(out[key])) continue;
    out[key] = out[key]
      .map((a) => toAlbumCard(normalizeLegacyAlbum(a)))
      .filter(Boolean);
  }

  return out;
}

// getHomeCache: читає Home-кеш користувача з Mongo (з TTL і schema)
async function getHomeCache(userId) {
  const cache = await HomeCache.findOne({ userId: String(userId) });
  if (!cache) return null;
  const age = Date.now() - (cache.updatedAt || 0);
  if (age > CACHE_TTL_MS) return null;
  if (cache.schemaVersion !== HOME_CACHE_SCHEMA_VERSION) return null;
  if (!blocksHaveContent(cache.blocks)) return null;
  cache.blocks = rehydrateHomeBlocks(cache.blocks);
  if (Array.isArray(cache.albumsForYou)) {
    cache.albumsForYou = rehydrateHomeBlocks({ albumsForYou: cache.albumsForYou }).albumsForYou;
  }
  return cache;
}

// setHomeCache: зберігає блоки Home у Mongo з rehydrate
async function setHomeCache(userId, payload) {
  if (!blocksHaveContent(payload.blocks)) return;
  const blocks = rehydrateHomeBlocks(payload.blocks);
  await HomeCache.findOneAndUpdate(
    { userId: String(userId) },
    {
      ...payload,
      blocks,
      albumsForYou: blocks.albumsForYou || payload.albumsForYou || [],
      schemaVersion: HOME_CACHE_SCHEMA_VERSION,
      updatedAt: Date.now()
    },
    { upsert: true }
  );
}

// invalidateHomeCache: видаляє Home-кеш користувача
async function invalidateHomeCache(userId) {
  await HomeCache.deleteOne({ userId: String(userId) }).catch(() => {});
}

module.exports = {
  getHomeCache,
  setHomeCache,
  invalidateHomeCache,
  blocksHaveContent,
  rehydrateHomeBlocks,
  albumsNeedRepair,
  HOME_CACHE_SCHEMA_VERSION
};
