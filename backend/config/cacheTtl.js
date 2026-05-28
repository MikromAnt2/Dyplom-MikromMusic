const CACHE_TTL_DAYS = Math.min(30, Math.max(1, parseInt(process.env.CACHE_TTL_DAYS || '1', 10) || 1));
const CACHE_TTL_MS = 1000 * 60 * 60 * 24 * CACHE_TTL_DAYS;

module.exports = { CACHE_TTL_MS, CACHE_TTL_DAYS };
