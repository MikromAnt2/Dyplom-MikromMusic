const { GUEST_HOME_LIMITS } = require('./constants');
const { searchTracksViaInnertube, searchAlbumsViaInnertube, getYtClient } = require('./sources');
const { diversifyByArtist } = require('./diversity');
const { toTrackCard, toArtistCard, toAlbumCard, shuffle } = require('./utils');
const { rehydrateHomeBlocks } = require('./cache');
const { enrichArtistMedia } = require('./mediaQuality');
const { searchArtistChannel } = require('./homeArtists');
const { enrichArtistsMonthlyListeners } = require('../../utils/artistSubs');
const { isUcArtistId } = require('../../utils/artistChannel');

// buildGuestBlocks: блоки головної для неавторизованого користувача
async function buildGuestBlocks(profile) {
  const exclude = profile.exclude || new Set();
  const L = GUEST_HOME_LIMITS;

  const trendingRaw = await searchTracksViaInnertube('trending music hits', exclude, L.trendingNow + 8);
  const newRaw = await searchTracksViaInnertube('new music releases 2025', exclude, L.popularNewReleases + 8);
  const artistSeed = await searchTracksViaInnertube('popular artists music', exclude, 40);

  const trendingNow = diversifyByArtist(
    trendingRaw.map((t) => toTrackCard(t)).filter(Boolean),
    2,
    L.trendingNow
  );

  const popularNewReleases = diversifyByArtist(
    newRaw.map((t) => toTrackCard(t)).filter(Boolean),
    2,
    L.popularNewReleases
  );

  const seenArtists = new Set();
  const popularArtistsRaw = [];
  for (const t of artistSeed) {
    const name = (t.author || '').trim();
    if (!name || seenArtists.has(name)) continue;
    seenArtists.add(name);
    popularArtistsRaw.push({ name, image: t.image, channelId: t.channelId || '' });
    if (popularArtistsRaw.length >= L.popularArtists) break;
  }

  const yt = await getYtClient();
  const resolvedArtists = [];
  for (const a of popularArtistsRaw) {
    try {
      const resolved = await searchArtistChannel(a.name);
      if (resolved?.channelId && isUcArtistId(resolved.channelId)) {
        resolvedArtists.push({
          channelId: resolved.channelId,
          name: resolved.name || a.name,
          image: resolved.image || a.image,
          monthlyListeners: resolved.monthlyListeners || ''
        });
      }
    } catch (_) {}
    if (resolvedArtists.length >= L.popularArtists) break;
  }

  const enriched = await enrichArtistsMonthlyListeners(yt, resolvedArtists, 4);
  const popularArtists = enriched
    .map((a) =>
      toArtistCard(
        enrichArtistMedia({
          channelId: a.channelId,
          name: a.name,
          image: a.image,
          subs: a.subs || ''
        })
      )
    )
    .filter(Boolean);

  const albumsRaw = await searchAlbumsViaInnertube('popular music albums', L.popularAlbums + 5);
  const popularAlbums = albumsRaw.map((a) => toAlbumCard(a)).filter(Boolean).slice(0, L.popularAlbums);

  const blocks = rehydrateHomeBlocks({
    trendingNow,
    popularNewReleases,
    popularArtists,
    popularAlbums
  });

  return {
    blocks,
    meta: { mode: 'guest', profileStrength: profile.strength }
  };
}

module.exports = { buildGuestBlocks };
