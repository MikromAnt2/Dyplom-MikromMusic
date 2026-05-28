const { SEARCH_PAGE_SIZE } = require('./searchLogic');
const { fuzzyIncludes, nameSimilarity } = require('../utils/searchFuzzy');

function ytThumb(youtubeId) {
  if (!youtubeId) return null;
  return `https://i.ytimg.com/vi/${youtubeId}/sddefault.jpg`;
}

// matchSitePlaylists: фільтрує плейлисти за запитом — по назві, опису або треках Mongo
function matchSitePlaylists(playlists, songYoutubeIds, query) {
  const qLower = String(query || '').toLowerCase();
  const idSet = new Set(songYoutubeIds || []);

  return (playlists || []).filter((pl) => {
    const matchName = pl.name && (pl.name.toLowerCase().includes(qLower) || fuzzyIncludes(pl.name, query, 0.72));
    const matchDesc =
      pl.description &&
      (pl.description.toLowerCase().includes(qLower) || fuzzyIncludes(pl.description, query, 0.68));
    const matchTracks =
      pl.tracks && pl.tracks.some((t) => idSet.has(t.youtubeId));
    const matchOwner =
      pl.owner?.displayName &&
      (fuzzyIncludes(pl.owner.displayName, query, 0.8) || nameSimilarity(pl.owner.displayName, query) >= 0.75);
    return matchName || matchDesc || matchTracks || matchOwner;
  });
}

// mapSitePlaylistResults: мапить плейлисти для UI пошуку — обрізає до limit
function mapSitePlaylistResults(matched, limit = SEARCH_PAGE_SIZE) {
  return matched.slice(0, limit).map((pl) => ({
    id: pl.id,
    name: pl.name,
    title: pl.name,
    ownerName: pl.owner?.displayName || pl.ownerName || 'Система',
    author: pl.owner?.displayName || pl.ownerName || 'Система',
    coverImage: pl.coverImage,
    image: pl.coverImage,
    isPublic: pl.isPublic !== false,
    tracks: (pl.tracks || []).slice(0, 4).map((t) => {
      const id = t.youtubeId || t.videoId;
      return {
        youtubeId: id,
        videoId: id,
        title: t.title || '',
        image: t.image || t.thumbnail || ytThumb(id)
      };
    }),
    type: 'site_playlist'
  }));
}

module.exports = { matchSitePlaylists, mapSitePlaylistResults };
