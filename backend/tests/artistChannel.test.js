const {
  isUcArtistId,
  pickUcArtistId,
  extractUcFromArtistItem,
  cleanArtistName
} = require('../utils/artistChannel');

describe('Ідентифікатори каналів виконавців', () => {
  it('isUcArtistId — валідний UC id', () => {
    expect(isUcArtistId('UCxxxxxxxxxxxxxxxx')).toBe(true);
    expect(isUcArtistId('MPREb_xxx')).toBe(false);
    expect(isUcArtistId('')).toBe(false);
  });

  it('pickUcArtistId вибирає перший UC з кандидатів', () => {
    expect(pickUcArtistId('bad', 'UCvalidchannel12', 'other')).toBe('UCvalidchannel12');
    expect(pickUcArtistId(null, undefined)).toBeNull();
  });

  it('extractUcFromArtistItem з browseId у runs', () => {
    const item = {
      name: { runs: [{ endpoint: { payload: { browseId: 'UCfromruns12345' } } }] }
    };
    expect(extractUcFromArtistItem(item)).toBe('UCfromruns12345');
  });

  it('cleanArtistName прибирає - Topic', () => {
    expect(cleanArtistName('Mili - Topic')).toBe('Mili');
    expect(cleanArtistName('  EGOIST  ')).toBe('EGOIST');
  });
});
