/**
 * TC-8 — внутрішній гібридний пошук (PostgreSQL + MongoDB)
 */
const { matchSitePlaylists, mapSitePlaylistResults } = require('../services/hybridSearch');
const { SEARCH_PAGE_SIZE } = require('../services/searchLogic');

describe('TC-8: Внутрішній пошук за контентом (гібрид)', () => {
  const playlists = [
    {
      id: 'pl-1',
      name: 'Мій улюблений мікс',
      description: 'Різна музика',
      coverImage: 'http://cover/1.jpg',
      owner: { displayName: 'User1' },
      tracks: [{ youtubeId: 'lp_track_1' }, { youtubeId: 'other_99' }]
    },
    {
      id: 'pl-2',
      name: 'Rock collection',
      description: 'Only rock bands',
      coverImage: 'http://cover/2.jpg',
      owner: { displayName: 'User2' },
      tracks: [{ youtubeId: 'rock_only' }]
    },
    {
      id: 'pl-3',
      name: 'Chill vibes',
      description: 'No metal here',
      coverImage: 'http://cover/3.jpg',
      owner: { displayName: 'User3' },
      tracks: [{ youtubeId: 'chill_1' }]
    }
  ];

  it('q="Linkin Park" знаходить плейлист без цих слів у назві, але з треками гурту в MongoDB', () => {
    const mongoIds = ['lp_track_1', 'lp_track_2'];

    const matched = matchSitePlaylists(playlists, mongoIds, 'Linkin Park');

    expect(matched).toHaveLength(1);
    expect(matched[0].id).toBe('pl-1');
    expect(matched[0].name).not.toMatch(/linkin park/i);
    expect(matched[0].tracks.some((t) => mongoIds.includes(t.youtubeId))).toBe(true);
  });

  it('також знаходить плейлист за назвою або описом', () => {
    const matched = matchSitePlaylists(playlists, [], 'rock');
    expect(matched.map((p) => p.id)).toContain('pl-2');
  });

  it('обмежує результат до 15 плейлистів', () => {
    const many = Array.from({ length: 20 }, (_, i) => ({
      id: `pl-${i}`,
      name: `Rock mix ${i}`,
      description: '',
      tracks: []
    }));
    const results = mapSitePlaylistResults(
      matchSitePlaylists(many, [], 'Rock'),
      SEARCH_PAGE_SIZE
    );
    expect(results.length).toBe(15);
  });

  it('мапить результат у формат API', () => {
    const matched = matchSitePlaylists(playlists, ['lp_track_1'], 'Linkin Park');
    const mapped = mapSitePlaylistResults(matched);
    expect(mapped[0].id).toBe('pl-1');
    expect(mapped[0].title).toBe('Мій улюблений мікс');
    expect(mapped[0].ownerName).toBe('User1');
    expect(mapped[0].tracks[0].image).toContain('lp_track_1');
  });
});
