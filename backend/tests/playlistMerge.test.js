const {
  mergePlaylistWithMongoSongs,
  collectYoutubeIdsFromPlaylists
} = require('../services/playlistMerge');

describe('Злиття PostgreSQL + MongoDB для плейлистів', () => {
  const playlists = [
    {
      id: 'pl-1',
      name: 'Rock Mix',
      owner: { displayName: 'User1' },
      tracks: [
        { youtubeId: 'yt1', addedAt: '2024-01-01' },
        { youtubeId: 'yt_missing', addedAt: '2024-01-02' }
      ]
    }
  ];

  const mongoSongs = [
    {
      _id: 'mongo1',
      youtubeId: 'yt1',
      title: 'Real Title',
      author: 'Real Author',
      image: 'http://cover.jpg',
      duration: 245
    }
  ];

  it('collectYoutubeIdsFromPlaylists збирає всі id', () => {
    const ids = collectYoutubeIdsFromPlaylists(playlists);
    expect(ids.has('yt1')).toBe(true);
    expect(ids.has('yt_missing')).toBe(true);
    expect(ids.size).toBe(2);
  });

  it('mergePlaylistWithMongoSongs підставляє метадані з MongoDB', () => {
    const merged = mergePlaylistWithMongoSongs(playlists, mongoSongs);
    expect(merged[0].ownerName).toBe('User1');
    expect(merged[0].tracks[0].title).toBe('Real Title');
    expect(merged[0].tracks[0].duration).toBe(245);
    expect(merged[0].coverImage).toBe('http://cover.jpg');
  });

  it('mergePlaylistWithMongoSongs — fallback для треку без Mongo', () => {
    const merged = mergePlaylistWithMongoSongs(playlists, mongoSongs);
    const missing = merged[0].tracks.find((t) => t.youtubeId === 'yt_missing');
    expect(missing.title).toBe('Трек');
    expect(missing.author).toBe('YouTube');
    expect(missing.image).toContain('ytimg.com');
  });
});
