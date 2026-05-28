const {
  normalizeArtistKey,
  inferGenreHint,
  isGoodTrack,
  relevanceFilter,
  pickRepresentativeSeedDocs,
  interleaveSeedIds,
  scoreAdd,
  rankedFromMap,
  toTrackCard
} = require('../services/recommendation/utils');
const { dedupeByYoutubeId } = require('../services/recommendation/diversity');

jest.mock('../routes/search', () => ({
  isValidMusicTrack: (title, dur) => dur > 30 && !/shorts/i.test(title)
}));

describe('Рекомендації — утиліти', () => {
  it('normalizeArtistKey нормалізує регістр і спецсимволи', () => {
    expect(normalizeArtistKey('Mili - Topic')).toBe('mili topic');
    expect(normalizeArtistKey('MYTH & ROID')).toBe('myth and roid');
  });

  it('inferGenreHint визначає anime-ost і vocaloid', () => {
    expect(inferGenreHint('Unravel TV size', 'TK')).toBe('anime-ost');
    expect(inferGenreHint('World is Mine', 'Hatsune Miku')).toBe('vocaloid');
    expect(inferGenreHint('Rock song', 'Band')).toBe('rock');
  });

  it('isGoodTrack відхиляє короткі та junk', () => {
    expect(isGoodTrack({ youtubeId: 'a', title: 'Ok song', duration: 200 })).toBe(true);
    expect(isGoodTrack({ youtubeId: 'b', title: '#shorts clip', duration: 200 })).toBe(false);
    expect(isGoodTrack({ youtubeId: 'c', title: 'Short', duration: 20 })).toBe(false);
  });

  it('relevanceFilter — збіг за channelId та author', () => {
    const item = { youtubeId: 'x', author: 'Linkin Park', channelId: 'UC_lp' };
    expect(relevanceFilter(item, 'Linkin Park', 'UC_lp')).toBe(true);
    expect(relevanceFilter(item, 'Other Band', 'UC_other')).toBe(false);
  });

  it('pickRepresentativeSeedDocs — один представник на артиста', () => {
    const docs = [
      { author: 'Mili', youtubeId: '1' },
      { author: 'Mili', youtubeId: '2' },
      { author: 'EGOIST', youtubeId: '3' }
    ];
    expect(pickRepresentativeSeedDocs(docs)).toHaveLength(2);
  });

  it('interleaveSeedIds чергує різних авторів', () => {
    const seedMap = new Map([
      ['a1', { author: 'A' }],
      ['b1', { author: 'B' }],
      ['a2', { author: 'A' }]
    ]);
    const out = interleaveSeedIds(['a1', 'a2', 'b1'], seedMap);
    expect(out[0]).not.toBe(out[1]);
  });

  it('scoreAdd і rankedFromMap сортують за score', () => {
    const m = new Map();
    scoreAdd(m, 'low', 1, 'a');
    scoreAdd(m, 'high', 10, 'b');
    const ranked = rankedFromMap(m, 2);
    expect(ranked[0].youtubeId).toBe('high');
  });

  it('toTrackCard повертає null для невалідного треку', () => {
    expect(toTrackCard(null)).toBeNull();
    expect(toTrackCard({ youtubeId: 'x', title: '#shorts', author: 'A', duration: 200 })).toBeNull();
  });

  it('dedupeByYoutubeId унікалізує списки', () => {
    const items = [{ youtubeId: 'a' }, { youtubeId: 'a' }, { youtubeId: 'b' }];
    expect(dedupeByYoutubeId(items)).toHaveLength(2);
  });
});
