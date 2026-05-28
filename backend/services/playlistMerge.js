// mergePlaylistWithMongoSongs: зливає PG-плейлисти з Mongo — метадані треків за youtubeId
function mergePlaylistWithMongoSongs(playlists, mongoSongs = []) {
  const songMap = {};
  mongoSongs.forEach((song) => {
    songMap[song.youtubeId] = song;
  });

  return (playlists || []).map((pl) => {
    const plObj = pl.toJSON ? pl.toJSON() : pl;
    plObj.ownerName = plObj.owner ? plObj.owner.displayName : 'Unknown';
    plObj.tracks = (plObj.tracks || []).map((t) => {
      const songInfo = songMap[t.youtubeId];
      if (songInfo) {
        return {
          _id: songInfo._id,
          youtubeId: t.youtubeId,
          title: songInfo.title,
          author: songInfo.author,
          image: songInfo.image || `https://i.ytimg.com/vi/${t.youtubeId}/mqdefault.jpg`,
          duration: songInfo.duration,
          addedAt: t.addedAt
        };
      }
      return {
        youtubeId: t.youtubeId,
        title: 'Трек',
        author: 'YouTube',
        image: `https://i.ytimg.com/vi/${t.youtubeId}/mqdefault.jpg`,
        duration: 0,
        addedAt: t.addedAt
      };
    });
    if (!plObj.coverImage && plObj.tracks[0]?.image) {
      plObj.coverImage = plObj.tracks[0].image;
    }
    return plObj;
  });
}

// collectYoutubeIdsFromPlaylists: збирає унікальні youtubeId — з усіх треків плейлистів
function collectYoutubeIdsFromPlaylists(playlists) {
  const ids = new Set();
  (playlists || []).forEach((pl) => {
    if (pl.tracks) pl.tracks.forEach((t) => ids.add(t.youtubeId));
  });
  return ids;
}

module.exports = { mergePlaylistWithMongoSongs, collectYoutubeIdsFromPlaylists };
