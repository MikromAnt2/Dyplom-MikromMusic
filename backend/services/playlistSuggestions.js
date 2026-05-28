const { runInfiniteTracksSearch } = require('../routes/search');
const { buildSmartQueue } = require('./recommendation');
const { inferGenreHint } = require('./recommendation/utils');
const { cleanArtistName } = require('../utils/artistChannel');

const GENRE_SEARCH = {
  'anime-ost': 'anime soundtrack',
  vocaloid: 'vocaloid',
  metal: 'metal music',
  rock: 'rock music',
  jazz: 'jazz music',
  lofi: 'lofi hip hop',
  hiphop: 'hip hop music',
  electronic: 'electronic music',
  classical: 'classical music',
  jpop: 'j-pop music',
  acoustic: 'acoustic music',
  pop: 'pop music'
};

// extractPlaylistSignals: топ артистів, жанрів і exclude з треків плейлиста
function extractPlaylistSignals(tracks) {
  const artistWeights = new Map();
  const genreWeights = new Map();
  const exclude = new Set();

  for (const t of tracks || []) {
    if (t?.youtubeId) exclude.add(t.youtubeId);
    const author = cleanArtistName(t.author || '');
    if (author && !/^youtube$/i.test(author)) {
      artistWeights.set(author, (artistWeights.get(author) || 0) + 1);
    }
    const genre = inferGenreHint(t.title, t.author);
    if (genre) genreWeights.set(genre, (genreWeights.get(genre) || 0) + 1);
  }

  const artists = [...artistWeights.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name]) => name);

  const genres = [...genreWeights.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([g]) => g);

  return { artists, genres, exclude };
}

// mapSuggestionTrack: сирий трек → картка пропозиції для плейлиста
function mapSuggestionTrack(t) {
  if (!t?.youtubeId) return null;
  const author = cleanArtistName(t.author || '');
  if (!author || /^youtube$/i.test(author)) return null;
  return {
    youtubeId: t.youtubeId,
    title: String(t.title || 'Без назви').trim(),
    author,
    image: t.image || `https://i.ytimg.com/vi/${t.youtubeId}/mqdefault.jpg`,
    duration: Number(t.duration) || 0,
    album: t.album || 'Single'
  };
}

// buildPlaylistAddSuggestions: треки для додавання в плейлист за сигналами
async function buildPlaylistAddSuggestions(tracks, { userId = null } = {}) {
  if (!Array.isArray(tracks) || tracks.length === 0) return [];

  const { artists, genres, exclude } = extractPlaylistSignals(tracks);
  const byId = new Map();

  const addTracks = (list) => {
    for (const raw of list || []) {
      const mapped = mapSuggestionTrack(raw);
      if (!mapped || exclude.has(mapped.youtubeId) || byId.has(mapped.youtubeId)) continue;
      byId.set(mapped.youtubeId, mapped);
    }
  };

  const seeds = tracks.filter((t) => t?.youtubeId).slice(0, 3);
  const excludeGrowing = () => [...exclude, ...byId.keys()];

  await Promise.all(
    seeds.map(async (seed) => {
      try {
        const radio = await buildSmartQueue(seed, {
          userId: userId ? String(userId) : null,
          excludeIds: excludeGrowing()
        });
        addTracks(radio);
      } catch (_) {}
    })
  );

  await Promise.all(
    artists.slice(0, 4).map(async (artist) => {
      try {
        const { items } = await runInfiniteTracksSearch({
          query: `${artist} official audio`,
          pageSize: 15
        });
        addTracks(items);
      } catch (_) {}
    })
  );

  await Promise.all(
    genres.slice(0, 3).map(async (genre) => {
      const q = GENRE_SEARCH[genre] || `${genre} music`;
      try {
        const { items } = await runInfiniteTracksSearch({
          query: q,
          pageSize: 12
        });
        addTracks(items);
      } catch (_) {}
    })
  );

  return [...byId.values()].slice(0, 45);
}

module.exports = { buildPlaylistAddSuggestions, extractPlaylistSignals };
