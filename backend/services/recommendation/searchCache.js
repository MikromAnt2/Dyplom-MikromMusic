const { CACHE_TTL_MS: TTL_MS } = require('../../config/cacheTtl');
const store = new Map();

// get: пошуковий кеш Innertube за ключем (null після TTL)
function get(key) {
  const entry = store.get(key);
  if (!entry) return null;
  if (Date.now() - entry.at > TTL_MS) {
    store.delete(key);
    return null;
  }
  return entry.data;
}

// set: зберігає результат пошуку в памʼяті (до 200 ключів)
function set(key, data) {
  store.set(key, { data, at: Date.now() });
  if (store.size > 200) {
    const oldest = [...store.entries()].sort((a, b) => a[1].at - b[1].at)[0];
    if (oldest) store.delete(oldest[0]);
  }
}

module.exports = { get, set };
