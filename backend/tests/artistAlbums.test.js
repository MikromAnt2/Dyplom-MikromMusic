jest.mock('../routes/channels', () => ({
  loadArtistDiscography: jest.fn()
}));

const { mapDiscographyAlbum } = require('../services/recommendation/artistAlbums');

describe('Альбоми з дискографії', () => {
  it('приймає MPRE playlist як альбом', () => {
    const card = mapDiscographyAlbum(
      {
        youtubeId: 'MPREb_test123',
        title: 'Album Name',
        author: 'Mili',
        image: 'http://img',
        type: 'playlist',
        releaseType: 'Сингл'
      },
      'UCartist1234567'
    );
    expect(card).not.toBeNull();
    expect(card.youtubeId).toMatch(/^MPRE/);
    expect(card.channelId).toBe('UCartist1234567');
  });

  it('відхиляє звичайне video без playlist id', () => {
    expect(
      mapDiscographyAlbum(
        { youtubeId: 'dQw4w9WgXcQ', title: 'Video', type: 'video', releaseType: 'Сингл' },
        'UCx'
      )
    ).toBeNull();
  });

  it('відхиляє Most played / latest release', () => {
    expect(
      mapDiscographyAlbum(
        { youtubeId: 'MPREb_x', title: 'Most played', type: 'playlist' },
        'UCx'
      )
    ).toBeNull();
  });

  it('приймає повноцінний альбом', () => {
    const card = mapDiscographyAlbum(
      {
        youtubeId: 'OLAK5uy_abc',
        title: 'Full Album',
        author: 'EGOIST',
        releaseType: 'Альбом',
        type: 'playlist'
      },
      'UCegoist12345'
    );
    expect(card?.title).toBe('Full Album');
  });
});
