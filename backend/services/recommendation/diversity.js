const { normalizeArtistKey, shuffle, toTrackCard } = require('./utils');
const { MAX_PER_ARTIST_IN_BLOCK } = require('./constants');

// diversifyByArtist: обмежує кількість треків одного артиста в списку
function diversifyByArtist(items, maxPerArtist = MAX_PER_ARTIST_IN_BLOCK, targetSize = 15) {
  const counts = new Map();
  const primary = [];
  const overflow = [];

  for (const item of items) {
    const key = normalizeArtistKey(item.author || '') || item.youtubeId;
    const n = counts.get(key) || 0;
    if (n < maxPerArtist) {
      counts.set(key, n + 1);
      primary.push(item);
    } else overflow.push(item);
  }

  const merged = [...primary];
  for (const o of overflow) {
    if (merged.length >= targetSize) break;
    const key = normalizeArtistKey(o.author || '') || o.youtubeId;
    if ((counts.get(key) || 0) < maxPerArtist + 1) {
      counts.set(key, (counts.get(key) || 0) + 1);
      merged.push(o);
    }
  }
  return merged.slice(0, targetSize);
}

// buildVariedQueue: черга autoplay з різноманітністю артистів
function buildVariedQueue(scoredTracks, seedTrack, options = {}) {
  const {
    targetSize = 80,
    maxSeedArtist = 4,
    maxOtherArtist = 3,
    seedArtistKey = normalizeArtistKey(seedTrack?.author)
  } = options;

  const isSeedArtist = (author) => {
    const k = normalizeArtistKey(author);
    if (!seedArtistKey || !k) return false;
    return k === seedArtistKey || k.includes(seedArtistKey) || seedArtistKey.includes(k);
  };

  const pool = [...scoredTracks].sort((a, b) => (b.score || 0) - (a.score || 0));
  const final = [];
  const artistCounts = new Map();
  let lastKey = seedArtistKey;

  const nonSeed = pool.filter(t => !isSeedArtist(t.author));
  const seedPool = pool.filter(t => isSeedArtist(t.author));

  for (const track of shuffle(nonSeed).sort((a, b) => (b.score || 0) - (a.score || 0)).slice(0, targetSize)) {
    if (final.length >= targetSize) break;
    const k = normalizeArtistKey(track.author) || track.youtubeId;
    if (k === lastKey) continue;
    const cap = isSeedArtist(track.author) ? maxSeedArtist : maxOtherArtist;
    if ((artistCounts.get(k) || 0) >= cap) continue;
    final.push(track);
    artistCounts.set(k, (artistCounts.get(k) || 0) + 1);
    lastKey = k;
  }

  const remainder = shuffle([...pool.filter(t => !final.includes(t))]);
  let safety = 0;
  while (final.length < targetSize && remainder.length && safety < 800) {
    safety++;
    let placed = false;
    for (let i = 0; i < remainder.length; i++) {
      const track = remainder[i];
      const k = normalizeArtistKey(track.author) || track.youtubeId;
      const cap = isSeedArtist(track.author) ? maxSeedArtist : maxOtherArtist;
      if ((artistCounts.get(k) || 0) >= cap) continue;
      if (k === lastKey && final.length > 2) continue;
      final.push(track);
      artistCounts.set(k, (artistCounts.get(k) || 0) + 1);
      lastKey = k;
      remainder.splice(i, 1);
      placed = true;
      break;
    }
    if (!placed) {
      for (let i = 0; i < remainder.length; i++) {
        const track = remainder[i];
        const k = normalizeArtistKey(track.author) || track.youtubeId;
        const cap = isSeedArtist(track.author) ? maxSeedArtist + 1 : maxOtherArtist + 1;
        if ((artistCounts.get(k) || 0) >= cap) continue;
        final.push(track);
        artistCounts.set(k, (artistCounts.get(k) || 0) + 1);
        lastKey = k;
        remainder.splice(i, 1);
        break;
      }
    }
  }

  let seedAdded = 0;
  for (const t of seedPool) {
    if (seedAdded >= 2 || final.length >= targetSize) break;
    if (!final.find(f => f.youtubeId === t.youtubeId)) {
      final.splice(Math.min(2, final.length), 0, t);
      seedAdded++;
    }
  }

  return final.slice(0, targetSize).map(t => toTrackCard(t.meta || t, { score: t.score }));
}

// dedupeByYoutubeId: унікальні треки за youtubeId
function dedupeByYoutubeId(items) {
  const seen = new Set();
  return items.filter((item) => {
    if (!item?.youtubeId || seen.has(item.youtubeId)) return false;
    seen.add(item.youtubeId);
    return true;
  });
}

module.exports = { diversifyByArtist, buildVariedQueue, dedupeByYoutubeId };
