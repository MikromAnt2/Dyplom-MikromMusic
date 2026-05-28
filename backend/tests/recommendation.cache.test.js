/**
 * Додаткові тести кешу рекомендацій Home
 */
const { blocksHaveContent } = require('../services/recommendation/cache');

describe('Кеш рекомендацій Home', () => {
  it('blocksHaveContent = false для порожніх блоків', () => {
    expect(blocksHaveContent({})).toBe(false);
    expect(blocksHaveContent({ forYou: [], quickPick: [] })).toBe(false);
  });

  it('blocksHaveContent = true, якщо хоча б один масив непорожній', () => {
    expect(
      blocksHaveContent({
        forYou: [],
        quickPick: [{ youtubeId: 'x', title: 't' }]
      })
    ).toBe(true);
  });
});
