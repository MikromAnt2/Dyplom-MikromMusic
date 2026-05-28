const { TRENDING_QUERIES } = require('./constants');
const { shuffle } = require('./utils');
const {
  searchTracksViaInnertube,
  globalPopularityCandidates,
  youtubeRelatedCandidates
} = require('./sources');

// buildColdStartPool: пул треків для cold start / слабкого профілю
async function buildColdStartPool(profile, excludeSet) {
  const pools = [];
  const q = shuffle([...TRENDING_QUERIES])[0] || 'popular music';

  const tracks = await searchTracksViaInnertube(q, excludeSet, 20);
  tracks.forEach((t, i) => {
    pools.push({ youtubeId: t.youtubeId, score: 3 - i * 0.05, reasons: ['cold-innertube'] });
  });

  pools.push(...(await globalPopularityCandidates(excludeSet, 25)));

  if (profile.seedIds?.length) {
    pools.push(
      ...(await youtubeRelatedCandidates(profile.seedIds.slice(0, 3), excludeSet, profile.seedMap, 15))
    );
  }

  return pools;
}

module.exports = { buildColdStartPool };
