const UC_ARTIST_ID_RE = /^UC[\w-]{10,}$/i;

// isUcArtistId: чи рядок схожий на UC channel id артиста
function isUcArtistId(id) {
  return typeof id === 'string' && UC_ARTIST_ID_RE.test(id.trim());
}

// pickUcArtistId: перший валідний UC id з кандидатів
function pickUcArtistId(...candidates) {
  for (const raw of candidates) {
    const c = typeof raw === 'string' ? raw.trim() : '';
    if (isUcArtistId(c)) return c;
  }
  return null;
}

// extractUcFromArtistItem: UC channel id з елемента пошуку артиста
function extractUcFromArtistItem(item) {
  if (!item) return null;
  const direct = pickUcArtistId(item.channelId, item.channel_id, item.id, item.browseId);
  if (direct) return direct;
  const runs = item.subtitle?.runs || item.name?.runs || [];
  for (const run of runs) {
    const bid = run?.endpoint?.payload?.browseId;
    if (isUcArtistId(bid)) return bid;
  }
  return null;
}

// cleanArtistName: прибирає суфікс «- Topic» з імені артиста
function cleanArtistName(name) {
  return (name || '')
    .replace(/\s*-\s*Topic\s*$/i, '')
    .replace(/\s+topic\s*$/i, '')
    .trim();
}

// isTopicStyleArtistName: чи ім'я виглядає як Topic-канал без реального імені
function isTopicStyleArtistName(name) {
  const n = cleanArtistName(name).toLowerCase();
  return !n || /\btopic\b/.test(n);
}

module.exports = {
  UC_ARTIST_ID_RE,
  isUcArtistId,
  pickUcArtistId,
  extractUcFromArtistItem,
  cleanArtistName,
  isTopicStyleArtistName
};
