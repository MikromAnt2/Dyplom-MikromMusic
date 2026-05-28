const ListeningHistory = require('../../models/mongo/ListeningHistory');
const InteractionLog = require('../../models/mongo/InteractionLog');
const { AUTH_HOME_LIMITS, MIN_HOME_BLOCK_ITEMS } = require('./constants');
const { scoreCandidates, findClusterArtists } = require('./scoring');
const { diversifyByArtist, dedupeByYoutubeId } = require('./diversity');
const {
  toTrackCard,
  toArtistCard,
  toAlbumCard,
  shuffle,
  cardsFromSongs,
  normalizeArtistKey,
  uniq,
  inferGenreHint
} = require('./utils');
const { MOOD_SEARCH_SUFFIX } = require('./constants');
const {
  collaborativeCandidates,
  youtubeRelatedCandidates,
  mongoAuthorCandidates,
  globalPopularityCandidates,
  searchTracksViaInnertube,
  searchDiscoverCandidates
} = require('./sources');
const { buildAlbumsFromArtists } = require('./artistAlbums');
const { buildArtistsYouMayLike } = require('./homeArtists');
const { runInfiniteTracksSearch } = require('../../routes/search');
const { getSongsMap } = require('./signals');
const Song = require('../../models/mongo/song');
const { isMongoConnected } = require('../../utils/mongo');

const L = AUTH_HOME_LIMITS;

const TRACK_BLOCKS_DEDUPE = [
  'forYou',
  'newFromSubscribed',
  'basedOnListening',
  'newForYou',
  'exploreMix',
  'popularInYourGenres',
  'trendingNow',
  'quickPick'
];

// buildBlockCounts: кількість елементів у кожному блоці Home
function buildBlockCounts(blocks) {
  const counts = {};
  for (const [key, val] of Object.entries(blocks || {})) {
    counts[key] = Array.isArray(val) ? val.length : 0;
  }
  return counts;
}

// dedupeBlocksGlobally: прибирає дублікати треків між секціями Home
function dedupeBlocksGlobally(blocks) {
  const used = new Set((blocks.listenAgain || []).map((t) => t.youtubeId).filter(Boolean));
  const out = { ...blocks };

  for (const key of TRACK_BLOCKS_DEDUPE) {
    if (!Array.isArray(out[key])) continue;
    out[key] = out[key].filter((t) => {
      if (!t?.youtubeId || used.has(t.youtubeId)) return false;
      used.add(t.youtubeId);
      return true;
    });
  }
  return out;
}

// buildPersonalizedSearchQueries: пошукові запити з жанрів і артистів профілю
function buildPersonalizedSearchQueries(profile) {
  const queries = [];

  for (const g of (profile.topGenres || []).slice(0, 4)) {
    const suffix = MOOD_SEARCH_SUFFIX[g] || MOOD_SEARCH_SUFFIX.default;
    queries.push(`${g} ${suffix}`);
  }

  for (const doc of (profile.seedDocs || []).slice(0, 6)) {
    const author = doc?.author;
    if (!author) continue;
    queries.push(`${author} official music`);
    const key = normalizeArtistKey(author);
    for (const related of findClusterArtists(key).slice(0, 4)) {
      queries.push(`"${related}" official music`);
    }
  }

  for (const a of (profile.subscribedArtists || []).slice(0, 5)) {
    if (a?.name) queries.push(`${a.name} music`);
  }

  return uniq(queries).slice(0, 10);
}

// rankedToCards: ranked youtubeId → картки треків
function rankedToCards(ranked, trackById) {
  return ranked
    .map((r) => {
      const s = trackById.get(r.youtubeId);
      return s ? toTrackCard(s, { score: r.score }) : null;
    })
    .filter(Boolean);
}

// loadMongoCandidates: кандидати треків з Mongo за профілем
async function loadMongoCandidates(profile) {
  if (!isMongoConnected()) return [];
  const out = [];
  const seen = new Set();
  const add = (list) => {
    for (const s of list) {
      const obj = s.toObject?.() || s;
      if (!obj?.youtubeId || seen.has(obj.youtubeId)) continue;
      seen.add(obj.youtubeId);
      out.push(obj);
    }
  };

  if (profile.seedDocs?.length) {
    const authors = [...new Set(profile.seedDocs.map((d) => d.author).filter(Boolean))].slice(0, 10);
    if (authors.length) add(await Song.find({ author: { $in: authors } }).limit(120));
    add(profile.seedDocs);
  }
  if (profile.likedIds?.length) {
    add(await Song.find({ youtubeId: { $in: profile.likedIds.slice(0, 50) } }));
  }
  if (profile.coldStart) {
    add(await Song.find({}).sort({ addedAt: -1 }).limit(60));
  }

  if (profile.coldStart || (profile.strength ?? 0) < 0.2) {
    const pop = await globalPopularityCandidates(profile.exclude, 40);
    const popIds = pop.map((p) => p.youtubeId);
    if (popIds.length) add(await Song.find({ youtubeId: { $in: popIds } }));
  }

  return out;
}

// gatherCandidatePool: збирає пул кандидатів з усіх джерел рекомендацій
async function gatherCandidatePool(profile) {
  const trackById = new Map();
  const exclude = profile.exclude;

  (await loadMongoCandidates(profile)).forEach((t) => trackById.set(t.youtubeId, t));

  const genres = profile.topGenres?.length
    ? profile.topGenres.slice(0, 4)
    : profile.seedDocs?.length
      ? [inferGenreHint(profile.seedDocs[0].title, profile.seedDocs[0].author)]
      : [];
  for (const g of genres) {
    const suffix = MOOD_SEARCH_SUFFIX[g] || MOOD_SEARCH_SUFFIX.default;
    (await searchTracksViaInnertube(`${g} ${suffix}`, exclude, 28)).forEach((t) =>
      trackById.set(t.youtubeId, t)
    );
  }

  if (profile.userId && !profile.coldStart) {
    const collab = await collaborativeCandidates(profile.userId, exclude, 40);
    const ids = collab.map((c) => c.youtubeId).filter(Boolean);
    if (ids.length) {
      (await Song.find({ youtubeId: { $in: ids } })).forEach((s) => {
        trackById.set(s.youtubeId, s.toObject?.() || s);
      });
    }
  }

  if (profile.seedIds?.length) {
    const related = await youtubeRelatedCandidates(
      profile.seedIds.slice(0, 4),
      exclude,
      profile.seedMap,
      25
    );
    const ids = related.map((r) => r.youtubeId);
    if (ids.length) {
      (await Song.find({ youtubeId: { $in: ids } })).forEach((s) => {
        trackById.set(s.youtubeId, s.toObject?.() || s);
      });
    }
  }

  if (profile.seedDocs?.length) {
    const ar = await mongoAuthorCandidates(profile.seedDocs, exclude, 40);
    const ids = ar.map((r) => r.youtubeId);
    if (ids.length) {
      (await Song.find({ youtubeId: { $in: ids } })).forEach((s) => {
        trackById.set(s.youtubeId, s.toObject?.() || s);
      });
    }

  }

  const candidates = dedupeByYoutubeId([...trackById.values()]).filter(
    (c) => c.youtubeId && !exclude.has(c.youtubeId)
  );
  return { candidates, trackById };
}

// sliceBlock: вирізає блок треків зі скорингом і diversify
function sliceBlock(candidates, profile, seedTrack, weights, excludeIds, take) {
  const pool = candidates.filter(
    (c) =>
      c.youtubeId &&
      !excludeIds.has(c.youtubeId) &&
      !profile.exclude?.has(c.youtubeId)
  );
  const scored = scoreCandidates(pool, profile, seedTrack, { weights });
  return [...scored.entries()]
    .sort((a, b) => b[1].score - a[1].score)
    .slice(0, take * 2)
    .map(([youtubeId, meta]) => ({ youtubeId, score: meta.score }));
}

// fillBlock: наповнює блок до limit з кандидатів
function fillBlock(candidates, profile, trackById, recentSeed, weights, usedIds, limit, maxPerArtist = 2) {
  const ranked = sliceBlock(candidates, profile, recentSeed, weights, usedIds, limit);
  let cards = diversifyByArtist(rankedToCards(ranked, trackById), maxPerArtist, limit);
  cards.forEach((c) => usedIds.add(c.youtubeId));
  return cards.slice(0, limit);
}

const PERSONALIZED_SCORE_MIN = 0.32;

// fillFromPersonalizedSources: дозаповнює блок персоналізованим пошуком
async function fillFromPersonalizedSources(
  profile,
  trackById,
  recentSeed,
  weights,
  blockedIds,
  need,
  { allowDiscover = false } = {}
) {
  if (need <= 0) return [];

  const exclude = new Set([...(profile.exclude || []), ...blockedIds]);
  const added = [];
  const seen = new Set(blockedIds);

  const pushRanked = (ranked, maxTake) => {
    const cards = diversifyByArtist(rankedToCards(ranked, trackById), 2, maxTake);
    for (const card of cards) {
      if (!card?.youtubeId || seen.has(card.youtubeId)) continue;
      seen.add(card.youtubeId);
      blockedIds.add(card.youtubeId);
      added.push(card);
      if (added.length >= need) return;
    }
  };

  if (profile.seedIds?.length) {
    const related = await youtubeRelatedCandidates(
      profile.seedIds.slice(0, 6),
      exclude,
      profile.seedMap,
      35
    );
    const ids = related.map((r) => r.youtubeId).filter(Boolean);
    if (ids.length) {
      (await Song.find({ youtubeId: { $in: ids } })).forEach((s) => {
        trackById.set(s.youtubeId, s.toObject?.() || s);
      });
    }
    const pool = ids
      .map((id) => trackById.get(id))
      .filter((c) => c?.youtubeId && !seen.has(c.youtubeId));
    const scored = scoreCandidates(pool, profile, recentSeed, { weights });
    const ranked = [...scored.entries()]
      .sort((a, b) => b[1].score - a[1].score)
      .filter(([, m]) => m.score >= PERSONALIZED_SCORE_MIN)
      .slice(0, need)
      .map(([youtubeId, meta]) => ({ youtubeId, score: meta.score }));
    pushRanked(ranked, need - added.length);
  }

  if (profile.seedDocs?.length && added.length < need) {
    const ar = await mongoAuthorCandidates(profile.seedDocs, exclude, 50);
    const ids = ar.map((r) => r.youtubeId).filter(Boolean);
    if (ids.length) {
      (await Song.find({ youtubeId: { $in: ids } })).forEach((s) => {
        trackById.set(s.youtubeId, s.toObject?.() || s);
      });
    }
    const pool = ids
      .map((id) => trackById.get(id))
      .filter((c) => c?.youtubeId && !seen.has(c.youtubeId));
    const scored = scoreCandidates(pool, profile, recentSeed, { weights });
    const ranked = [...scored.entries()]
      .sort((a, b) => b[1].score - a[1].score)
      .filter(([, m]) => m.score >= PERSONALIZED_SCORE_MIN)
      .slice(0, need - added.length)
      .map(([youtubeId, meta]) => ({ youtubeId, score: meta.score }));
    pushRanked(ranked, need - added.length);
  }

  if (allowDiscover && profile.seedDocs?.length && added.length < need) {
    const disc = await searchDiscoverCandidates(profile.seedDocs, exclude, 35);
    const discIds = disc.map((r) => r.youtubeId).filter(Boolean);
    if (discIds.length) {
      (await Song.find({ youtubeId: { $in: discIds } })).forEach((s) => {
        trackById.set(s.youtubeId, s.toObject?.() || s);
      });
    }
    const ranked = disc
      .filter((r) => r.youtubeId && !seen.has(r.youtubeId) && trackById.has(r.youtubeId))
      .map((r) => ({ youtubeId: r.youtubeId, score: r.score || 4 }));
    pushRanked(ranked, need - added.length);
  }

  for (const q of buildPersonalizedSearchQueries(profile)) {
    if (added.length >= need) break;
    const found = await searchTracksViaInnertube(q, exclude, need + 10);
    for (const t of found) {
      if (t?.youtubeId) trackById.set(t.youtubeId, t);
    }
    const pool = found.filter((t) => t?.youtubeId && !seen.has(t.youtubeId));
    const scored = scoreCandidates(pool, profile, recentSeed, { weights });
    const ranked = [...scored.entries()]
      .sort((a, b) => b[1].score - a[1].score)
      .filter(([, m]) => m.score >= PERSONALIZED_SCORE_MIN)
      .slice(0, need - added.length)
      .map(([youtubeId, meta]) => ({ youtubeId, score: meta.score }));
    pushRanked(ranked, need - added.length);
  }

  return added;
}

// buildScoredBlock: блок Home зі скорингом і мінімальною кількістю карток
async function buildScoredBlock(
  blockKey,
  candidates,
  profile,
  trackById,
  recentSeed,
  weights,
  limit,
  crossBlockUsed
) {
  const usedIds = new Set(crossBlockUsed);
  let cards = fillBlock(candidates, profile, trackById, recentSeed, weights, usedIds, limit);

  if (cards.length < MIN_HOME_BLOCK_ITEMS) {
    const extra = await fillFromPersonalizedSources(
      profile,
      trackById,
      recentSeed,
      weights,
      usedIds,
      limit - cards.length,
      { allowDiscover: blockKey === 'exploreMix' }
    );
    cards = diversifyByArtist([...cards, ...extra], 2, limit);
  }

  cards.forEach((c) => crossBlockUsed.add(c.youtubeId));
  return cards.slice(0, limit);
}

// buildListenAgain: блок «Прослухати ще раз» з історії
async function buildListenAgain(userId) {
  const uid = String(userId);
  const rows = await InteractionLog.aggregate([
    { $match: { userId: uid, action: 'play' } },
    { $group: { _id: '$youtubeId', playCount: { $sum: 1 } } },
    { $sort: { playCount: -1 } },
    { $limit: L.listenAgain }
  ]).catch(() => []);

  let ids = rows.map((r) => r._id).filter((id) => id && typeof id === 'string');

  if (!ids.length) {
    const ListeningHistory = require('../../models/mongo/ListeningHistory');
    const hist = await ListeningHistory.find({ userId: uid })
      .sort({ playedAt: -1 })
      .limit(L.listenAgain)
      .catch(() => []);
    ids = hist.map((h) => h.youtubeId).filter(Boolean);
  }

  const m = await getSongsMap(ids);
  return ids.map((id) => m.get(id)).filter(Boolean).map((s) => toTrackCard(s)).filter(Boolean);
}

// buildNewFromSubscribed: нові треки від підписаних артистів
async function buildNewFromSubscribed(profile) {
  const artists = profile.subscribedArtists || [];
  if (!artists.length) return [];

  const tracks = [];
  const seen = new Set();
  for (const a of artists.slice(0, 8)) {
    const found = await searchTracksViaInnertube(`${a.name} new release`, profile.exclude, 8);
    for (const t of found) {
      if (seen.has(t.youtubeId)) continue;
      seen.add(t.youtubeId);
      const card = toTrackCard(t);
      if (card) tracks.push(card);
    }
    if (tracks.length >= L.newFromSubscribed) break;
  }
  return diversifyByArtist(tracks, 2, L.newFromSubscribed);
}

// buildBasedOnListening: рекомендації на основі історії прослуховування
async function buildBasedOnListening(profile) {
  if (!profile.userId) return [];
  const history = await ListeningHistory.find({ userId: profile.userId })
    .sort({ playedAt: -1 })
    .limit(30);
  const seedIds = history.map((h) => h.youtubeId);
  if (!seedIds.length) return [];

  const seedMap = await getSongsMap(seedIds);
  const related = await youtubeRelatedCandidates(seedIds.slice(0, 5), profile.exclude, seedMap, 35);
  const ids = related.map((r) => r.youtubeId);
  const songs = await Song.find({ youtubeId: { $in: ids } });
  const cards = cardsFromSongs(songs, L.basedOnListening);
  if (cards.length >= 8) return cards;

  const hMap = await getSongsMap(seedIds);
  const fromHistory = history
    .map((h) => hMap.get(h.youtubeId))
    .filter(Boolean)
    .map((s) => toTrackCard(s))
    .filter(Boolean);
  return diversifyByArtist([...fromHistory, ...cards], 2, L.basedOnListening);
}

// buildQuickPickFromSubscriptions: швидкий вибір з підписок при порожньому пулі
async function buildQuickPickFromSubscriptions(profile, blocks = {}) {
  const used = new Set();
  const pool = [];

  const addCards = (arr) => {
    for (const c of arr || []) {
      if (!c?.youtubeId || used.has(c.youtubeId)) continue;
      used.add(c.youtubeId);
      pool.push(c);
    }
  };

  addCards(blocks.newFromSubscribed);
  addCards(blocks.forYou);
  addCards(blocks.basedOnListening);
  addCards(blocks.newForYou);
  addCards(blocks.trendingNow);

  const artists = profile.subscribedArtists || [];
  for (const a of artists.slice(0, 8)) {
    try {
      const found = await searchTracksViaInnertube(
        `${a.name} official music`,
        profile.exclude,
        14
      );
      for (const t of found) {
        const card = toTrackCard(t);
        if (card && !used.has(card.youtubeId)) {
          used.add(card.youtubeId);
          pool.push(card);
        }
        if (pool.length >= L.quickPick) break;
      }
    } catch (_) {}
    if (pool.length >= L.quickPick) break;
  }

  return shuffle(pool).slice(0, L.quickPick);
}

// enrichMissingHomeBlocks: дозаповнює порожні блоки Home
async function enrichMissingHomeBlocks(blocks, profile, options = {}) {
  const { skipArtists = false, skipAlbums = false } = options;
  const { rehydrateHomeBlocks, albumsNeedRepair } = require('./cache');
  const out = rehydrateHomeBlocks({ ...blocks });
  if (
    !skipAlbums &&
    (profile.subscribedArtists || []).length &&
    albumsNeedRepair(out.albumsForYou)
  ) {
    out.albumsForYou = await buildAlbumsFromArtists(profile);
    out.albumsForYou = rehydrateHomeBlocks({ albumsForYou: out.albumsForYou }).albumsForYou;
  }
  if (!out.quickPick?.length) {
    out.quickPick = await buildQuickPickFromSubscriptions(profile, out);
    out.quickPick = rehydrateHomeBlocks({ quickPick: out.quickPick }).quickPick;
  }
  if (!skipArtists && !out.artistsYouMayLike?.length) {
    out.artistsYouMayLike = await buildArtistsYouMayLike(profile);
    out.artistsYouMayLike = rehydrateHomeBlocks({ artistsYouMayLike: out.artistsYouMayLike }).artistsYouMayLike;
  }
  return dedupeBlocksGlobally(out);
}

// buildQuickPick: великий блок швидкого вибору треків
async function buildQuickPick(blocks, candidates, trackById, profile) {
  const used = new Set();
  const pool = [];

  const addCards = (arr) => {
    for (const c of arr || []) {
      if (!c?.youtubeId || used.has(c.youtubeId)) continue;
      used.add(c.youtubeId);
      pool.push(c);
    }
  };

  if ((profile.subscribedArtists || []).length) {
    const fromSubs = await buildQuickPickFromSubscriptions(profile, blocks);
    addCards(fromSubs);
  }

  addCards(blocks.forYou);
  addCards(blocks.basedOnListening);
  addCards(blocks.popularInYourGenres);
  addCards(blocks.exploreMix);
  addCards(blocks.newForYou);
  addCards(blocks.trendingNow);

  for (const c of candidates) {
    const card = toTrackCard(c);
    if (card && !used.has(card.youtubeId)) {
      used.add(card.youtubeId);
      pool.push(card);
    }
  }

  if (pool.length < L.quickPick) {
    for (const q of buildPersonalizedSearchQueries(profile)) {
      if (pool.length >= L.quickPick) break;
      const extra = await searchTracksViaInnertube(q, profile.exclude, 20);
      for (const t of extra) {
        const card = toTrackCard(t);
        if (card && !used.has(card.youtubeId)) {
          used.add(card.youtubeId);
          pool.push(card);
        }
        if (pool.length >= L.quickPick) break;
      }
    }
  }

  if (pool.length < 12 && profile.topGenres?.[0]) {
    try {
      const g = profile.topGenres[0];
      const suffix = MOOD_SEARCH_SUFFIX[g] || MOOD_SEARCH_SUFFIX.default;
      const { items } = await runInfiniteTracksSearch({ query: `${g} ${suffix}` });
      for (const t of items || []) {
        const card = toTrackCard(t);
        if (card && !used.has(card.youtubeId) && !profile.exclude?.has(card.youtubeId)) {
          used.add(card.youtubeId);
          pool.push(card);
        }
        if (pool.length >= L.quickPick) break;
      }
    } catch (_) {}
  }

  return shuffle(pool).slice(0, L.quickPick);
}

// buildHomeBlocks: усі блоки головної для авторизованого користувача
async function buildHomeBlocks(profile) {
  const { candidates, trackById } = await gatherCandidatePool(profile);
  const recentSeed = profile.seedDocs?.[0] || null;
  const crossBlockUsed = new Set();

  const blocks = {
    listenAgain: await buildListenAgain(profile.userId),
    forYou: await buildScoredBlock(
      'forYou',
      candidates,
      profile,
      trackById,
      recentSeed,
      {},
      L.forYou,
      crossBlockUsed
    ),
    newFromSubscribed: await buildNewFromSubscribed(profile),
    basedOnListening: await buildBasedOnListening(profile)
  };

  for (const t of blocks.newFromSubscribed || []) {
    if (t?.youtubeId) crossBlockUsed.add(t.youtubeId);
  }
  for (const t of blocks.basedOnListening || []) {
    if (t?.youtubeId) crossBlockUsed.add(t.youtubeId);
  }

  Object.assign(blocks, {
    newForYou: await buildScoredBlock(
      'newForYou',
      candidates,
      profile,
      trackById,
      recentSeed,
      { exploration: 0.2, popularity: 0.15 },
      L.newForYou,
      crossBlockUsed
    ),
    exploreMix: shuffle(
      await buildScoredBlock(
        'exploreMix',
        candidates,
        profile,
        trackById,
        recentSeed,
        { exploration: 0.35, genre: 0.15, artist: 0.15 },
        L.exploreMix,
        crossBlockUsed
      )
    ),
    popularInYourGenres: await buildScoredBlock(
      'popularInYourGenres',
      candidates,
      profile,
      trackById,
      recentSeed,
      { popularity: 0.25, genre: 0.35, history: 0.1 },
      L.popularInYourGenres,
      crossBlockUsed
    ),
    albumsForYou: await buildAlbumsFromArtists(profile),
    artistsYouMayLike: []
  });

  const trendGenre = profile.topGenres?.[0] || inferGenreHint(recentSeed?.title, recentSeed?.author) || 'pop';
  const trendQ = `trending ${trendGenre}`;
  let trendingNow = diversifyByArtist(
    (await searchTracksViaInnertube(trendQ, profile.exclude, L.trendingNow + 10))
      .map((t) => toTrackCard(t))
      .filter(Boolean),
    2,
    L.trendingNow
  );
  if (trendingNow.length < MIN_HOME_BLOCK_ITEMS) {
    const used = new Set(trendingNow.map((c) => c.youtubeId));
    const extra = await fillFromPersonalizedSources(
      profile,
      trackById,
      recentSeed,
      { popularity: 0.3, genre: 0.35 },
      used,
      L.trendingNow - trendingNow.length
    );
    trendingNow = diversifyByArtist([...trendingNow, ...extra], 2, L.trendingNow);
  }
  blocks.trendingNow = trendingNow;

  if (blocks.newForYou.length < MIN_HOME_BLOCK_ITEMS && profile.seedDocs?.[0]?.author) {
    const used = new Set(blocks.newForYou.map((c) => c.youtubeId));
    const q = `${profile.seedDocs[0].author} new songs`;
    const nt = await searchTracksViaInnertube(q, profile.exclude, L.newForYou);
    for (const t of nt) {
      const card = toTrackCard(t);
      if (card && !used.has(card.youtubeId)) {
        used.add(card.youtubeId);
        blocks.newForYou.push(card);
      }
    }
    blocks.newForYou = diversifyByArtist(blocks.newForYou, 2, L.newForYou);
  }

  blocks.quickPick = await buildQuickPick(blocks, candidates, trackById, profile);

  const finalized = dedupeBlocksGlobally(blocks);

  return {
    blocks: finalized,
    meta: {
      coldStart: profile.coldStart,
      profileStrength: profile.strength,
      mode: profile.mode,
      candidateCount: candidates.length,
      blockCounts: buildBlockCounts(finalized)
    }
  };
}

module.exports = {
  buildHomeBlocks,
  buildListenAgain,
  gatherCandidatePool,
  enrichMissingHomeBlocks,
  buildQuickPickFromSubscriptions,
  dedupeBlocksGlobally,
  buildBlockCounts
};
