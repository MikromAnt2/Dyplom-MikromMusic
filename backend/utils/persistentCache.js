const fs = require('fs');
const path = require('path');
const { CACHE_TTL_MS } = require('../config/cacheTtl');

// createPersistentCache: файловий кеш з TTL — економія YouTube Data API
function createPersistentCache(fileName) {
    const store = new Map();
    const cacheFilePath = path.join(__dirname, '..', 'cache', fileName);
    const now = () => Date.now();

    // load: завантажує кеш з диска у Map
    const load = () => {
        try {
            if (!fs.existsSync(cacheFilePath)) return;
            const raw = fs.readFileSync(cacheFilePath, 'utf8');
            if (!raw) return;
            const parsed = JSON.parse(raw);
            const entries = Array.isArray(parsed?.entries) ? parsed.entries : [];
            for (const e of entries) {
                if (!e || typeof e.key !== 'string') continue;
                if (!e.expiresAt || typeof e.expiresAt !== 'number') continue;
                if (e.expiresAt <= now()) continue;
                store.set(e.key, { value: e.value, expiresAt: e.expiresAt });
            }
        } catch (_) {}
    };

    let persistTimer = null;
    // persistDebounced: відкладене збереження кешу на диск
    const persistDebounced = () => {
        if (persistTimer) return;
        persistTimer = setTimeout(() => {
            persistTimer = null;
            try {
                fs.mkdirSync(path.dirname(cacheFilePath), { recursive: true });
                const entries = [];
                for (const [key, entry] of store.entries()) {
                    if (!entry?.expiresAt || entry.expiresAt <= now()) continue;
                    entries.push({ key, expiresAt: entry.expiresAt, value: entry.value });
                }
                fs.writeFileSync(cacheFilePath, JSON.stringify({ entries }), 'utf8');
            } catch (_) {}
        }, 300);
    };

    // get: значення з кешу або undefined після TTL
    const get = (key) => {
        const entry = store.get(key);
        if (!entry) return undefined;
        if (entry.expiresAt <= now()) {
            store.delete(key);
            return undefined;
        }
        return entry.value;
    };

    // set: запис у кеш з TTL і debounced persist
    const set = (key, value, ttlMs = CACHE_TTL_MS) => {
        store.set(key, { value, expiresAt: now() + ttlMs });
        persistDebounced();
    };

    load();

    return { get, set, load, CACHE_TTL_MS };
}

module.exports = { createPersistentCache };
