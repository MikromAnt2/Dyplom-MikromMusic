const Song = require('../../models/mongo/song');
const ListeningHistory = require('../../models/mongo/ListeningHistory');
const InteractionLog = require('../../models/mongo/InteractionLog');
const { User, LikedSong, Playlist, PlaylistTrack, Artist } = require('../../models/pg');
const { isMongoConnected } = require('../../utils/mongo');
const { uniq, normalizeArtistKey, inferGenreHint } = require('./utils');

// getSongsMap: Map youtubeId → Song з Mongo
async function getSongsMap(youtubeIds) {
  const ids = uniq(youtubeIds).filter(Boolean);
  if (!ids.length || !isMongoConnected()) return new Map();
  const songs = await Song.find({ youtubeId: { $in: ids } });
  const map = new Map();
  songs.forEach(s => map.set(s.youtubeId, s));
  return map;
}

// buildUserProfile: профіль користувача для скорингу рекомендацій
async function buildUserProfile(userId) {
  const uid = String(userId);

  const mongoHistory = isMongoConnected()
    ? ListeningHistory.find({ userId: uid }).sort({ playedAt: -1 }).limit(50)
    : Promise.resolve([]);
  const mongoInteractions = isMongoConnected()
    ? InteractionLog.find({ userId: uid }).sort({ createdAt: -1 }).limit(200).catch(() => [])
    : Promise.resolve([]);

  const [likes, history, interactions, userPlaylists, userWithSubs] = await Promise.all([
    LikedSong.findAll({ where: { userId: uid }, order: [['createdAt', 'DESC']], limit: 80 }),
    mongoHistory,
    mongoInteractions,
    Playlist.findAll({ where: { ownerId: uid }, attributes: ['id'], limit: 30 }).catch(() => []),
    User.findByPk(uid, { include: [{ model: Artist, as: 'subscribedArtists' }] }).catch(() => null)
  ]);

  const subscribedArtists = (userWithSubs?.subscribedArtists || []).map((a) => ({
    channelId: a.channelId,
    name: a.name,
    image: a.image
  }));

  const ownedPlaylistIds = (userPlaylists || []).map(p => p.id);
  const playlistTracks = ownedPlaylistIds.length
    ? await PlaylistTrack.findAll({ where: { playlistId: ownedPlaylistIds }, limit: 120 }).catch(() => [])
    : [];

  const likedIds = likes.map(l => l.youtubeId);
  const playedIds = history.map(h => h.youtubeId);
  const playlistSongIds = (playlistTracks || []).map(t => t.youtubeId);
  const seedIds = uniq([...likedIds, ...playedIds, ...playlistSongIds]).slice(0, 60);

  const skippedIds = new Set();
  const playCounts = new Map();
  const genreWeights = new Map();
  const artistWeights = new Map();
  const engagementById = new Map();

  for (const log of interactions) {
    const id = log.youtubeId;
    if (log.action === 'skip') skippedIds.add(id);
    if (log.action === 'play') {
      playCounts.set(id, (playCounts.get(id) || 0) + 1);
      const dur = log.listenDurationSeconds || 0;
      const prev = engagementById.get(id) || { plays: 0, totalListen: 0 };
      prev.plays += 1;
      prev.totalListen += dur;
      engagementById.set(id, prev);
    }
    if (log.action === 'like') engagementById.set(id, { ...(engagementById.get(id) || {}), liked: true });
  }

  const seedMap = await getSongsMap(seedIds);
  const seedDocs = seedIds.map(id => seedMap.get(id)).filter(Boolean);

  for (let i = 0; i < seedDocs.length; i++) {
    const s = seedDocs[i];
    const g = inferGenreHint(s.title, s.author);
    const recency = Math.max(0.3, 1 - i * 0.02);
    genreWeights.set(g, (genreWeights.get(g) || 0) + recency);
    const ak = normalizeArtistKey(s.author);
    if (ak) artistWeights.set(ak, (artistWeights.get(ak) || 0) + recency);
  }

  const topGenres = [...genreWeights.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([g]) => g);
  const topArtists = [...artistWeights.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([a]) => a);

  const signalCount = likedIds.length + playedIds.length + playlistSongIds.length;
  const strength = Math.min(1, signalCount / 25);

  return {
    mode: 'user',
    userId: uid,
    likedIds,
    playedIds,
    playlistSongIds,
    seedIds,
    seedDocs,
    seedMap,
    skippedIds,
    playCounts,
    genreWeights,
    artistWeights,
    topGenres,
    topArtists,
    engagementById,
    subscribedArtists,
    exclude: new Set([...likedIds, ...playedIds]),
    strength,
    coldStart: strength < 0.15
  };
}

// buildGuestProfile: гостьовий профіль за seed-id з localStorage
async function buildGuestProfile(guestSeedIds = []) {
  const ids = uniq(guestSeedIds).filter(Boolean).slice(0, 30);
  const seedMap = await getSongsMap(ids);
  const seedDocs = ids.map(id => seedMap.get(id)).filter(Boolean);

  const genreWeights = new Map();
  const artistWeights = new Map();
  for (const s of seedDocs) {
    const g = inferGenreHint(s.title, s.author);
    genreWeights.set(g, (genreWeights.get(g) || 0) + 1);
    const ak = normalizeArtistKey(s.author);
    if (ak) artistWeights.set(ak, (artistWeights.get(ak) || 0) + 1);
  }

  const strength = Math.min(1, ids.length / 10);

  return {
    mode: 'guest',
    userId: null,
    likedIds: [],
    playedIds: ids,
    playlistIds: [],
    seedIds: ids,
    seedDocs,
    seedMap,
    skippedIds: new Set(),
    playCounts: new Map(),
    genreWeights,
    artistWeights,
    topGenres: [...genreWeights.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([g]) => g),
    topArtists: [...artistWeights.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([a]) => a),
    engagementById: new Map(),
    exclude: new Set(ids),
    strength,
    coldStart: strength < 0.2
  };
}

module.exports = { buildUserProfile, buildGuestProfile, getSongsMap };
