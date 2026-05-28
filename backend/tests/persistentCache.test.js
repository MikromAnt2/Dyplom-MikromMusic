const { createPersistentCache } = require('../utils/persistentCache');

describe('Файловий persistent cache', () => {
  const fileName = `jest_cache_${Date.now()}.json`;

  it('set/get зберігає значення в памʼяті', () => {
    const cache = createPersistentCache(fileName);
    cache.set('key1', { items: [1, 2] }, 60_000);
    expect(cache.get('key1')).toEqual({ items: [1, 2] });
  });

  it('get повертає undefined для простроченого TTL', () => {
    const cache = createPersistentCache(`${fileName}_exp`);
    cache.set('old', 'data', -1000);
    expect(cache.get('old')).toBeUndefined();
  });

  it('get повертає undefined для неіснуючого ключа', () => {
    const cache = createPersistentCache(`${fileName}_miss`);
    expect(cache.get('missing_key_xyz')).toBeUndefined();
  });
});
