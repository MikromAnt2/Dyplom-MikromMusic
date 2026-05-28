const { computeTrackScore, scoreCandidates, findClusterArtists } = require('../services/recommendation/scoring');
const { normalizeArtistKey } = require('../services/recommendation/utils');

describe('Рекомендації — скоринг', () => {
  const baseProfile = {
    topGenres: ['anime-ost', 'rock'],
    topArtists: [normalizeArtistKey('mili')],
    artistWeights: new Map([[normalizeArtistKey('mili'), 8]]),
    engagementById: new Map(),
    playCounts: new Map(),
    skippedIds: new Set(),
    exclude: new Set()
  };

  it('findClusterArtists знаходить сусідів у кластері Mili', () => {
    const related = findClusterArtists(normalizeArtistKey('mili'));
    expect(related.some((a) => a.includes('myth'))).toBe(true);
  });

  it('computeTrackScore — вищий бал для збігу жанру', () => {
    const anime = { youtubeId: 'a1', title: 'Anime OP', author: 'Artist' };
    const classical = { youtubeId: 'c1', title: 'Symphony', author: 'Orchestra' };
    const sAnime = computeTrackScore(anime, baseProfile);
    const sClassical = computeTrackScore(classical, baseProfile);
    expect(sAnime.finalScore).toBeGreaterThan(sClassical.finalScore);
  });

  it('computeTrackScore — пропущені треки знижують historyScore', () => {
    const profile = {
      ...baseProfile,
      skippedIds: new Set(['skip1'])
    };
    const skipped = computeTrackScore(
      { youtubeId: 'skip1', title: 'T', author: 'A' },
      profile
    );
    expect(skipped.components.historyScore).toBeLessThan(0.2);
  });

  it('scoreCandidates повертає Map з meta', () => {
    const candidates = [
      { youtubeId: 't1', title: 'Song', author: 'Mili' },
      { youtubeId: 't2', title: 'Other', author: 'Unknown' }
    ];
    const scored = scoreCandidates(candidates, baseProfile, null, {});
    expect(scored.size).toBe(2);
    expect(scored.get('t1').meta.title).toBe('Song');
  });
});
