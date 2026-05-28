const {
  nameSimilarity,
  expandQueryVariants,
  normalizeSearchKey,
  cyrillicKeyboardToLatin
} = require('../utils/searchFuzzy');

describe('searchFuzzy', () => {
  it('Mili vs MILLI — вища схожість у точного Mili', () => {
    expect(nameSimilarity('Mili', 'Mili')).toBe(1);
    expect(nameSimilarity('MILLI', 'Mili')).toBeLessThan(nameSimilarity('Mili', 'Mili'));
  });

  it('typo Nili → варіант Mili', () => {
    const variants = expandQueryVariants('Nili');
    expect(variants.map((v) => normalizeSearchKey(v))).toContain('mili');
  });

  it('leet M1l1 → mili', () => {
    expect(normalizeSearchKey('M1l1')).toBe('mili');
    expect(expandQueryVariants('M1l1').map(normalizeSearchKey)).toContain('mili');
  });

  it('wrong keyboard layout: ифнгкш → sayuri', () => {
    expect(cyrillicKeyboardToLatin('ифнгкш')).toBe('bayuri');
    expect(expandQueryVariants('ифнгкш').map(normalizeSearchKey)).toContain('bayuri');
  });

  it('wrong keyboard layout: іфнгкш (UA) → sayuri', () => {
    expect(cyrillicKeyboardToLatin('іфнгкш')).toBe('sayuri');
    expect(expandQueryVariants('іфнгкш').map(normalizeSearchKey)).toContain('sayuri');
  });
});
