const Song = require('../models/mongo/song');
const { parseIso8601Duration } = require('./searchLogic');

// isMetadataComplete: перевіряє повноту метаданих треку — title, author, image, duration
function isMetadataComplete(doc) {
  if (!doc) return false;
  const d = doc.toObject?.() || doc;
  return Boolean(
    d.youtubeId &&
      d.title &&
      d.author &&
      d.image &&
      Number(d.duration) > 0
  );
}

// needsMetadataUpdate: чи бракує полів метаданих — для часткового кешу
function needsMetadataUpdate(doc) {
  if (!doc) return true;
  const d = doc.toObject?.() || doc;
  return !d.title || !d.author || !d.image || !Number(d.duration);
}

// fetchYoutubeVideoMetadata: тягне метадані з YouTube API — snippet і contentDetails
async function fetchYoutubeVideoMetadata(youtubeId, fetchFromYouTube) {
  const url = `https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails,statistics&id=${youtubeId}`;
  const data = await fetchFromYouTube(url);
  const v = data?.items?.[0];
  if (!v) return null;

  const thumbs = v.snippet?.thumbnails || {};
  const image =
    thumbs.maxres?.url ||
    thumbs.standard?.url ||
    thumbs.high?.url ||
    thumbs.medium?.url ||
    `https://i.ytimg.com/vi/${v.id}/hqdefault.jpg`;

  return {
    youtubeId: v.id,
    title: v.snippet?.title || '',
    author: v.snippet?.channelTitle || '',
    channelId: v.snippet?.channelId || '',
    image,
    duration: parseIso8601Duration(v.contentDetails?.duration)
  };
}

// saveTrackToMongo: upsert треку в MongoDB — за youtubeId
async function saveTrackToMongo(track) {
  if (!track?.youtubeId) return null;
  return Song.findOneAndUpdate(
    { youtubeId: track.youtubeId },
    {
      title: track.title,
      author: track.author,
      image: track.image,
      duration: track.duration || 0,
      ...(track.channelId ? { channelId: track.channelId } : {})
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
}

// resolveTrackMetadata: повертає метадані треку — Mongo, API або fallback
async function resolveTrackMetadata(youtubeId, fetchFromYouTube) {
  const cached = await Song.findOne({ youtubeId });

  if (cached && isMetadataComplete(cached)) {
    return {
      track: cached.toObject?.() || cached,
      source: 'mongo',
      youtubeApiUsed: false
    };
  }

  try {
    const fromApi = await fetchYoutubeVideoMetadata(youtubeId, fetchFromYouTube);
    if (!fromApi) throw new Error('YouTube video not found');

    const merged = {
      ...(cached?.toObject?.() || cached || {}),
      ...fromApi
    };
    const saved = await saveTrackToMongo(merged);
    return {
      track: saved?.toObject?.() || saved || merged,
      source: cached ? 'mongo+api' : 'api',
      youtubeApiUsed: true,
      wasPartial: Boolean(cached && needsMetadataUpdate(cached))
    };
  } catch (err) {
    if (cached) {
      return {
        track: cached.toObject?.() || cached,
        source: 'mongo-fallback',
        youtubeApiUsed: false,
        apiError: err.message
      };
    }
    throw err;
  }
}

// persistTracksBatch: зберігає пакет треків у Mongo — upsert кожного
async function persistTracksBatch(tracks = []) {
  const saved = [];
  for (const t of tracks) {
    const doc = await saveTrackToMongo(t);
    if (doc) saved.push(doc);
  }
  return saved;
}

// findTracksInMongoByQuery: шукає треки в Mongo — regex по title і author
async function findTracksInMongoByQuery(query) {
  if (!query) return [];
  return Song.find({
    $or: [
      { author: { $regex: query, $options: 'i' } },
      { title: { $regex: query, $options: 'i' } }
    ]
  });
}

module.exports = {
  isMetadataComplete,
  needsMetadataUpdate,
  fetchYoutubeVideoMetadata,
  saveTrackToMongo,
  resolveTrackMetadata,
  persistTracksBatch,
  findTracksInMongoByQuery
};
