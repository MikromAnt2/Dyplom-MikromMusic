describe('Конфіг TTL кешу', () => {
  const original = process.env.CACHE_TTL_DAYS;

  afterEach(() => {
    process.env.CACHE_TTL_DAYS = original;
    jest.resetModules();
  });

  it('за замовчуванням 1 день', () => {
    delete process.env.CACHE_TTL_DAYS;
    jest.resetModules();
    const { CACHE_TTL_DAYS, CACHE_TTL_MS } = require('../config/cacheTtl');
    expect(CACHE_TTL_DAYS).toBe(1);
    expect(CACHE_TTL_MS).toBe(24 * 60 * 60 * 1000);
  });

  it('обмежує CACHE_TTL_DAYS діапазоном 1–30', () => {
    process.env.CACHE_TTL_DAYS = '99';
    jest.resetModules();
    const { CACHE_TTL_DAYS } = require('../config/cacheTtl');
    expect(CACHE_TTL_DAYS).toBe(30);
  });
});
