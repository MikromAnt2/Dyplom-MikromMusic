const { filterQualityArtists } = require('../services/pageSearch');

describe('filterQualityArtists', () => {
  const query = 'Mili';

  it('прибирає виконавців без слухачів', () => {
    const list = [
      { channelId: 'UC1', name: 'Mili', subs: '3,81 млн слухачів' },
      { channelId: 'UC2', name: 'Mili', subs: '' },
      { channelId: 'UC3', name: 'Shruti Haasan', subs: '1 млн слухачів' }
    ];
    const out = filterQualityArtists(list, query);
    expect(out).toHaveLength(1);
    expect(out[0].channelId).toBe('UC1');
  });

  it('повертає менше, якщо якісних мало', () => {
    const list = [
      { channelId: 'UC1', name: 'Mili', subs: '2 тис. слухачів' },
      { channelId: 'UC2', name: 'Mili', subs: '' }
    ];
    expect(filterQualityArtists(list, query)).toHaveLength(1);
  });

  it('fallback за імʼям, якщо немає слухачів у жодного', () => {
    const list = [
      { channelId: 'UC1', name: 'Mili', subs: '' },
      { channelId: 'UC2', name: 'Milli', subs: '' }
    ];
    const out = filterQualityArtists(list, query);
    expect(out.length).toBeGreaterThan(0);
    expect(out[0].channelId).toBe('UC1');
  });
});
