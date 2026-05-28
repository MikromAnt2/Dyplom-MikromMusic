const { buildUserProfile, buildGuestProfile } = require('./signals');
const { buildHomeBlocks } = require('./homeBlocks');
const { buildGuestBlocks } = require('./guestHome');
const { buildSmartQueue } = require('./queueBuilder');
const { buildColdStartPool } = require('./coldStart');
const { getHomeCache, setHomeCache, invalidateHomeCache } = require('./cache');
const { searchTracksViaInnertube } = require('./sources');
const { diversifyByArtist } = require('./diversity');
const { toTrackCard } = require('./utils');

// buildGuestHome: блоки головної для гостя за guestSeedIds
async function buildGuestHome(guestSeedIds = []) {
  const profile = await buildGuestProfile(guestSeedIds);
  return buildGuestBlocks(profile);
}

// buildPublicFeed: публічна стрічка треків через Innertube-пошук
async function buildPublicFeed(query = 'music trending', limit = 20) {
  const exclude = new Set();
  const tracks = await searchTracksViaInnertube(query, exclude, limit);
  return tracks.map((t) => toTrackCard(t)).filter(Boolean).slice(0, limit);
}

module.exports = {
  buildUserProfile,
  buildGuestProfile,
  buildHomeBlocks,
  buildGuestHome,
  buildPublicFeed,
  buildSmartQueue,
  buildColdStartPool,
  getHomeCache,
  setHomeCache,
  invalidateHomeCache
};
