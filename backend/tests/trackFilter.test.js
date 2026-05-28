/**
 * Додаткові тести системи фільтрації музичного контенту
 */
const {
  coerceMediaText,
  isJunkTitle,
  isValidDuration,
  isValidMusicContent,
  isPlayableTrackMeta,
  filterTrackList
} = require('../services/recommendation/trackFilter');

describe('Фільтр музичного контенту (додаткові тести)', () => {
  it('coerceMediaText приймає Innertube Text-обʼєкт', () => {
    expect(coerceMediaText({ toString: () => 'Mili - Hero' })).toBe('Mili - Hero');
    expect(() => isJunkTitle({ toString: () => 'Official song' })).not.toThrow();
  });

  it('відхиляє #shorts у назві', () => {
    expect(isJunkTitle('Cool beat #shorts')).toBe(true);
  });

  it('відхиляє тривалість ≤65 с (коли відома)', () => {
    expect(isValidDuration(30)).toBe(false);
    expect(isValidDuration(90)).toBe(true);
  });

  it('дозволяє невідому тривалість (0) для подальшої перевірки API', () => {
    expect(isValidDuration(0)).toBe(true);
  });

  it('isPlayableTrackMeta відхиляє Unknown автора', () => {
    expect(
      isPlayableTrackMeta({
        youtubeId: 'dQw4w9WgXcQ',
        title: 'EGOIST',
        author: 'Unknown',
        duration: 200
      })
    ).toBe(false);
  });

  it('filterTrackList залишає лише валідні треки', () => {
    const input = [
      {
        youtubeId: 'dQw4w9WgXcQ',
        title: 'Official song',
        author: 'Mili',
        duration: 200
      },
      {
        youtubeId: 'abcdefghij1',
        title: 'Top 100 mix',
        author: 'Artist',
        duration: 200
      },
      {
        youtubeId: 'abcdefghij2',
        title: 'Another song',
        author: 'EGOIST',
        duration: '3:45'
      }
    ];
    const out = filterTrackList(input);
    expect(out.map((t) => t.youtubeId)).toEqual(['dQw4w9WgXcQ', 'abcdefghij2']);
  });
});
