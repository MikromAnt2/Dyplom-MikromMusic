const { normalizeMediaUrl, upgradeGoogleThumb } = require('../utils/mediaUrl');

describe('Нормалізація URL медіа', () => {
  it('normalizeMediaUrl витягує URL з markdown', () => {
    expect(normalizeMediaUrl('[img](https://i.ytimg.com/vi/abc/hqdefault.jpg)')).toBe(
      'https://i.ytimg.com/vi/abc/hqdefault.jpg'
    );
  });

  it('normalizeMediaUrl додає https до //', () => {
    expect(normalizeMediaUrl('//i.ytimg.com/vi/x/mqdefault.jpg')).toBe(
      'https://i.ytimg.com/vi/x/mqdefault.jpg'
    );
  });

  it('upgradeGoogleThumb підвищує mqdefault → hqdefault', () => {
    expect(upgradeGoogleThumb('https://i.ytimg.com/vi/xyz/mqdefault.jpg')).toContain('hqdefault');
  });

  it('normalizeMediaUrl повертає порожній рядок для невалідного вводу', () => {
    expect(normalizeMediaUrl('')).toBe('');
    expect(normalizeMediaUrl(null)).toBe('');
  });
});
