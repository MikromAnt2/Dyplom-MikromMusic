const { isValidMusicTrack } = require('../../routes/search');
const { ADJACENT_GENRES } = require('./constants');
const { enrichTrackMedia, enrichArtistMedia, enrichAlbumMedia } = require('./mediaQuality');
const { filterTrackList, isPlayableTrackMeta } = require('./trackFilter');

// uniq: унікальні значення масиву
function uniq(arr) {
  return Array.from(new Set(arr));
}

// shuffle: випадкове перемішування масиву (Fisher–Yates)
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// normalizeArtistKey: нормалізований ключ імені артиста для порівняння
function normalizeArtistKey(s) {
  return (s || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

// inferGenreHint: евристичний жанр за title і author
function inferGenreHint(title, author) {
  const t = `${title || ''} ${author || ''}`.toLowerCase();
  if (
    /anime|tv size|\bop\b|\bed\b|\bost\b|soundtrack|アニメ|絶望|re:zero|touhou|opening|ending|limbus|project\s*moon|\bmili\b|library\s*of\s*ruina/.test(
      t
    )
  ) {
    return 'anime-ost';
  }
  if (/vocaloid|ボカロ|hatsune|miku/.test(t)) return 'vocaloid';
  if (/metal|punk/.test(t)) return 'metal';
  if (/rock/.test(t)) return 'rock';
  if (/jazz|blues|swing/.test(t)) return 'jazz';
  if (/lofi|chill|study|beats/.test(t)) return 'lofi';
  if (/hip.?hop|rap|trap/.test(t)) return 'hiphop';
  if (/electronic|synth|edm|house|techno/.test(t)) return 'electronic';
  if (/classical|symphony|orchestra|piano sonata/.test(t)) return 'classical';
  if (/pop|j-pop|jpop|j pop/.test(t)) return 'jpop';
  if (/acoustic|unplugged/.test(t)) return 'acoustic';
  return 'pop';
}

// isGoodTrack: чи трек придатний для рекомендацій (id, тривалість, title)
function isGoodTrack(track) {
  if (!track?.youtubeId) return false;
  let dur = track.duration || 0;
  if (typeof dur === 'string' && dur.includes(':')) {
    const parts = dur.split(':').map(Number);
    if (parts.length === 2) dur = parts[0] * 60 + parts[1];
    else if (parts.length === 3) dur = parts[0] * 3600 + parts[1] * 60 + parts[2];
  }
  return isValidMusicTrack(track.title || '', dur);
}

// relevanceFilter: чи трек релевантний seed-артисту або channelId
function relevanceFilter(item, seedAuthor, seedChannelId) {
  if (!item?.youtubeId) return false;
  const itemCh = item.channelId || '';
  if (seedChannelId && itemCh && itemCh === seedChannelId) return true;
  const sa = normalizeArtistKey(seedAuthor);
  const author = normalizeArtistKey(item.author || '');
  if (!sa) return false;
  if (author.includes(sa) || sa.includes(author)) return true;
  if (sa.length <= 5) return false;
  const title = normalizeArtistKey(item.title || '');
  return `${title} ${author}`.includes(sa);
}

// pickRepresentativeSeedDocs: репрезентативні seed-документи по одному на артиста
function pickRepresentativeSeedDocs(seedSongDocs, max = 15) {
  const seen = new Set();
  const reps = [];
  for (const doc of seedSongDocs) {
    if (!doc?.author) continue;
    const k = normalizeArtistKey(doc.author);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    reps.push(doc);
  }
  return reps.slice(0, max);
}

// interleaveSeedIds: чергує seed-id за артистами для різноманітності
function interleaveSeedIds(seedIds, seedMap) {
  const buckets = new Map();
  for (const id of seedIds) {
    const doc = seedMap.get(id);
    const k = normalizeArtistKey(doc?.author || '_');
    if (!buckets.has(k)) buckets.set(k, []);
    buckets.get(k).push(id);
  }
  const lists = Array.from(buckets.values());
  const out = [];
  let i = 0;
  let added = true;
  while (added) {
    added = false;
    for (const list of lists) {
      if (list[i]) {
        out.push(list[i]);
        added = true;
      }
    }
    i++;
  }
  return out.length ? out : [...seedIds];
}

// getAdjacentGenres: сусідні жанри для exploration
function getAdjacentGenres(genre) {
  return ADJACENT_GENRES[genre] || ADJACENT_GENRES.default;
}

// scoreAdd: додає бали треку в Map з причиною
function scoreAdd(scores, id, delta, reason) {
  if (!id) return;
  const prev = scores.get(id) || { score: 0, reasons: [], meta: {} };
  prev.score += delta;
  if (reason) prev.reasons.push(reason);
  scores.set(id, prev);
}

// mergeScoreMaps: об'єднує кілька Map оцінок треків
function mergeScoreMaps(...maps) {
  const out = new Map();
  for (const m of maps) {
    for (const [id, val] of m.entries()) {
      scoreAdd(out, id, val.score || 0, val.reasons?.[0]);
      if (val.meta) {
        const prev = out.get(id);
        prev.meta = { ...prev.meta, ...val.meta };
      }
    }
  }
  return out;
}

// rankedFromMap: топ youtubeId за score з Map
function rankedFromMap(scored, limit = 120) {
  return Array.from(scored.entries())
    .sort((a, b) => b[1].score - a[1].score)
    .slice(0, limit)
    .map(([youtubeId, meta]) => ({ youtubeId, ...meta }));
}

// toTrackCard: Song/Mongo → картка треку для UI
function toTrackCard(song, extra = {}) {
  if (!song?.youtubeId) return null;
  if (!isGoodTrack(song)) return null;
  const enriched = enrichTrackMedia(song);
  if (!isPlayableTrackMeta(enriched)) return null;
  const title = String(enriched.title || enriched.name || '').trim() || 'Без назви';
  const author = String(enriched.author || enriched.artist || '').trim();
  if (!author) return null;
  return {
    youtubeId: enriched.youtubeId,
    title,
    author,
    image: enriched.image || `https://i.ytimg.com/vi/${enriched.youtubeId}/mqdefault.jpg`,
    imageFallback: enriched.imageFallback,
    duration: enriched.duration || 0,
    channelId: enriched.channelId || '',
    genreHint: inferGenreHint(title, author),
    ...extra
  };
}

// toArtistCard: артист → картка з покращеним зображенням
function toArtistCard(artist, extra = {}) {
  if (!artist?.name) return null;
  const enriched = enrichArtistMedia(artist);
  return { ...enriched, ...extra };
}

// toAlbumCard: альбом → картка для Home/API
function toAlbumCard(album, extra = {}) {
  if (!album?.youtubeId && !album?.channelId) return null;
  const enriched = enrichAlbumMedia(album);
  return {
    youtubeId: enriched.youtubeId || enriched.channelId,
    title: enriched.title || `Альбом: ${enriched.author || 'Music'}`,
    author: enriched.author || '',
    authorSubs: enriched.authorSubs || enriched.subs || '',
    image: enriched.image,
    channelId: enriched.channelId || enriched.youtubeId,
    ...extra
  };
}

// cardsFromSongs: масив пісень → картки треків з лімітом
function cardsFromSongs(songs, limit, extra = {}) {
  return filterTrackList(songs)
    .map((s) => toTrackCard(s.toObject?.() || s, extra))
    .filter(Boolean)
    .slice(0, limit);
}

module.exports = {
  uniq,
  shuffle,
  normalizeArtistKey,
  inferGenreHint,
  isGoodTrack,
  relevanceFilter,
  pickRepresentativeSeedDocs,
  interleaveSeedIds,
  getAdjacentGenres,
  scoreAdd,
  mergeScoreMaps,
  rankedFromMap,
  toTrackCard,
  toArtistCard,
  toAlbumCard,
  cardsFromSongs,
  filterTrackList
};
