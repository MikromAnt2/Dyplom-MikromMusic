const Song = require('../models/mongo/song');
const { buildGuestProfile } = require('../services/recommendation/signals');

jest.mock('../utils/mongo', () => ({
  isMongoConnected: jest.fn(() => true)
}));

describe('Профіль гостя (signals)', () => {
  beforeEach(() => {
    Song.find.mockResolvedValue([
      {
        youtubeId: 'seed1',
        title: 'Anime Opening Unravel TV size',
        author: 'TK',
        image: 'http://img',
        duration: 240
      }
    ]);
  });

  it('buildGuestProfile формує topGenres з seed треків', async () => {
    const profile = await buildGuestProfile(['seed1']);
    expect(profile.mode).toBe('guest');
    expect(profile.topGenres.length).toBeGreaterThan(0);
    expect(profile.topGenres).toContain('anime-ost');
  });

  it('coldStart для малої кількості seeds', async () => {
    const profile = await buildGuestProfile([]);
    expect(profile.coldStart).toBe(true);
    expect(profile.strength).toBeLessThan(0.2);
  });

  it('exclude містить усі guest seed ids', async () => {
    const profile = await buildGuestProfile(['a', 'b']);
    expect(profile.exclude.has('a')).toBe(true);
    expect(profile.exclude.has('b')).toBe(true);
  });
});
