const Song = require('../../models/mongo/song');
const { QUEUE_TARGET_SIZE } = require('./constants');
const { buildUserProfile, buildGuestProfile } = require('./signals');
const { scoreCandidates } = require('./scoring');
const { buildVariedQueue, dedupeByYoutubeId } = require('./diversity');
const { normalizeArtistKey, isGoodTrack } = require('./utils');
const {
  upNextCandidates,
  relatedArtistSearchCandidates,
  youtubeRelatedCandidates,
  trendingSearchCandidates,
  hydrateMissingFromYtApi,
  persistSong
} = require('./sources');
const { buildColdStartPool } = require('./coldStart');

// buildSmartQueue: розумна черга autoplay за seed-треком
async function buildSmartQueue(seedTrack, options = {}) {
  const {
    userId = null,
    guestSeeds = [],
    sessionIds = [],
    excludeIds = []
  } = options;

  const profile = userId
    ? await buildUserProfile(userId)
    : await buildGuestProfile(guestSeeds);

  const exclude = new Set([
    seedTrack.youtubeId,
    ...profile.exclude,
    ...excludeIds,
    ...sessionIds
  ]);

  const seedDoc = await Song.findOne({ youtubeId: seedTrack.youtubeId }) || seedTrack;
  const sessionExclude = new Set(sessionIds);

  const [upNext, relatedSearch, ytRelated, coldPool] = await Promise.all([
    upNextCandidates(seedTrack.youtubeId, exclude, 20),
    relatedArtistSearchCandidates(seedDoc, exclude, sessionExclude),
    youtubeRelatedCandidates([seedTrack.youtubeId], exclude, new Map([[seedTrack.youtubeId, seedDoc]]), 25),
    profile.coldStart || profile.strength < 0.25
      ? buildColdStartPool(profile, exclude)
      : Promise.resolve([])
  ]);

  const rawCandidates = [];
  const idToTrack = new Map();

  const addRanked = (ranked, boost = 1) => {
    for (const r of ranked) {
      if (exclude.has(r.youtubeId)) continue;
      rawCandidates.push({ youtubeId: r.youtubeId, _boost: (r.score || 1) * boost, _reason: r.reasons?.[0] });
    }
  };

  addRanked(upNext, 1.2);
  addRanked(relatedSearch, 1);
  addRanked(ytRelated, 0.9);
  addRanked(coldPool, 0.7);

  const ids = [...new Set(rawCandidates.map(c => c.youtubeId))];
  await hydrateMissingFromYtApi(ids.slice(0, 60));
  const songs = await Song.find({ youtubeId: { $in: ids } });
  for (const s of songs) idToTrack.set(s.youtubeId, s.toObject?.() || s);

  const candidateTracks = [];
  for (const c of rawCandidates) {
    const doc = idToTrack.get(c.youtubeId);
    if (!doc || !isGoodTrack(doc)) continue;
    candidateTracks.push({
      ...doc,
      youtubeId: c.youtubeId,
      _boost: c._boost
    });
  }

  const scored = scoreCandidates(dedupeByYoutubeId(candidateTracks), profile, seedDoc, {
    boostExploration: true
  });

  const scoredList = [...scored.entries()].map(([youtubeId, meta]) => ({
    youtubeId,
    score: meta.score * (candidateTracks.find(t => t.youtubeId === youtubeId)?._boost || 1),
    meta: meta.meta || idToTrack.get(youtubeId)
  }));

  const queue = buildVariedQueue(scoredList, seedDoc, {
    targetSize: QUEUE_TARGET_SIZE,
    seedArtistKey: normalizeArtistKey(seedDoc.author)
  });

  for (const t of queue) {
    if (t) persistSong(t);
  }

  return queue.filter(t => t?.youtubeId && t.youtubeId !== seedTrack.youtubeId);
}

module.exports = { buildSmartQueue };
