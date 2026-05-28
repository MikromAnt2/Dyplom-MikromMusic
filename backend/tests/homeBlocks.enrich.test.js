jest.mock('../services/recommendation/artistAlbums', () => ({
  buildAlbumsFromArtists: jest.fn().mockResolvedValue([
    { youtubeId: 'MPREb_1', title: 'Album 1', author: 'Mili' }
  ])
}));

const {
  enrichMissingHomeBlocks,
  buildQuickPickFromSubscriptions
} = require('../services/recommendation/homeBlocks');

jest.mock('../services/recommendation/sources', () => ({
  searchTracksViaInnertube: jest.fn().mockResolvedValue([
    {
      youtubeId: 'dQw4w9WgXcQ',
      title: 'Sub Track',
      author: 'EGOIST',
      image: 'http://i',
      duration: 200
    }
  ])
}));

describe('Home blocks — доповнення порожніх секцій', () => {
  const profile = {
    subscribedArtists: [{ channelId: 'UC1', name: 'Mili' }],
    exclude: new Set()
  };

  it('enrichMissingHomeBlocks додає albumsForYou', async () => {
    const blocks = { forYou: [{ youtubeId: 'a', title: 'T', author: 'A' }] };
    const out = await enrichMissingHomeBlocks(blocks, profile);
    expect(out.albumsForYou).toHaveLength(1);
    expect(out.albumsForYou[0].title).toBe('Album 1');
  });

  it('enrichMissingHomeBlocks додає quickPick з підписок', async () => {
    const blocks = { forYou: [] };
    const out = await enrichMissingHomeBlocks(blocks, profile);
    expect(out.quickPick?.length).toBeGreaterThan(0);
  });

  it('buildQuickPickFromSubscriptions не дублює youtubeId', async () => {
    const blocks = {
      newFromSubscribed: [
        { youtubeId: 'dQw4w9WgXcQ', title: 'X', author: 'EGOIST', duration: 200 }
      ]
    };
    const out = await buildQuickPickFromSubscriptions(profile, blocks);
    const ids = out.map((t) => t.youtubeId);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
