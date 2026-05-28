const {
  highQualityTrackImage,
  highQualityArtistImage,
  enrichTrackMedia,
  enrichArtistMedia
} = require('../services/recommendation/mediaQuality');

describe('Якість медіа (обкладинки)', () => {
  it('highQualityTrackImage будує sddefault з youtubeId', () => {
    expect(highQualityTrackImage('abc123xyz01')).toContain('sddefault');
    expect(highQualityTrackImage('abc123xyz01')).toContain('abc123xyz01');
  });

  it('enrichTrackMedia додає imageFallback', () => {
    const t = enrichTrackMedia({
      youtubeId: 'vid99',
      title: 'T',
      author: 'A',
      image: 'https://i.ytimg.com/vi/vid99/mqdefault.jpg'
    });
    expect(t.image).toContain('sddefault');
    expect(t.imageFallback).toContain('hqdefault');
  });

  it('highQualityArtistImage для UC каналу', () => {
    const url = highQualityArtistImage('', 'UCabcdefghijk');
    expect(url).toContain('googleusercontent');
  });

  it('enrichArtistMedia зберігає name', () => {
    const a = enrichArtistMedia({ name: 'Mili', channelId: 'UCx', image: '' });
    expect(a.name).toBe('Mili');
  });
});
