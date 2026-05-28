// coerceMediaText: title/author з Innertube (Text) → рядок
function coerceMediaText(value) {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  if (typeof value?.toString === 'function') {
    const s = value.toString();
    if (s && s !== '[object Object]') return s;
  }
  if (typeof value?.text === 'string') return value.text;
  if (value?.text?.toString) return value.text.toString();
  return '';
}

// isJunkTitle: відсіює shorts, топ-списки, компіляції та сміттєві title
function isJunkTitle(title) {
  const t = coerceMediaText(title).toLowerCase();
  if (!t.trim()) return true;

  const blockedPatterns = [
    /#shorts?\b/,
    /\bshorts\b/,
    /\bshort\b.*\bvideo/,
    /#tiktok/,
    /\btik\s*tok\b/,
    /\breels?\b/,
    /\bvertical\s*video/,
    /\btop\s*\d{1,3}\b/,
    /\btop\d{1,3}\b/,
    /\b\d{1,3}\s*(best|greatest|popular)\s*(anime|song|opening|ending|op|ed)/,
    /\banime\s*(song|opening|ending|op|ed)s?\s*(top|best|ranking)/,
    /\b(top|best|ultimate)\s*\d{1,3}\s*(anime|opening|ending)/,
    /\branking\b.*\banime/,
    /\bparty\s*rank/,
    /\bcompilation\b/,
    /\bfull\s*album\b/,
    /\bcomplete\s*album/,
    /\bplaylist\b/,
    /\bmix\b(?!.*\bremix)/,
    /\bhour\s*(mix|compilation)/,
    /\b\d+\s*hour/,
    /\blive\s*stream/,
    /\b24\s*\/\s*7\s*live/,
    /\bnews\b/,
    /\binterview\b/,
    /\bpodcast\b/,
    /\breaction\b/,
    /\btrailer\b/,
    /\bgameplay\b/,
    /\btutorial\b/,
    /\bhow\s*to\b/,
    /\bprank\b/,
    /\bvlog\b/,
    /\bbehind\s*the\s*scenes\b/,
    /\blyrics\s*video\s*4k\s*hours/,
    /\bsuper\s*cut/,
    /\bmegamix\b/,
    /\bnon\s*stop\b/,
    /\bcontinuous\b/,
    /\bmarathon\b/,
    /\b所有歌曲/,
    /\b全曲/,
    /\bメドレー/,
    /\bまとめ/,
    /\b集\b/
  ];

  for (const re of blockedPatterns) {
    if (re.test(t)) return true;
  }

  if (/\bmix\b/.test(t) && !/\bremix\b/.test(t) && !/\bofficial\s*mix\b/.test(t)) return true;
  if (/\bbest\s*of\b/.test(t) && !/\bofficial\b/.test(t)) return true;

  return false;
}

// isValidDuration: допустима тривалість музичного треку (секунди)
function isValidDuration(durationSeconds) {
  const d = Number(durationSeconds) || 0;
  if (d <= 0) return true;
  if (d <= 65) return false;
  if (d > 720) return false;
  return true;
}

const INVALID_AUTHOR_RE = /^(unknown|невідомий(\s+виконавець)?|youtube|artist|topic)$/i;

// isValidTrackAuthor: чи author не placeholder і достатньо довгий
function isValidTrackAuthor(author) {
  const a = coerceMediaText(author).trim();
  if (!a || a.length < 2) return false;
  if (INVALID_AUTHOR_RE.test(a)) return false;
  return true;
}

// isValidYoutubeVideoId: 11-символьний id відео (не playlist/UC)
function isValidYoutubeVideoId(id) {
  if (!id || typeof id !== 'string') return false;
  const s = id.trim();
  if (s.startsWith('MPRE') || s.startsWith('PL') || s.startsWith('VL') || s.startsWith('UC')) {
    return false;
  }
  return /^[\w-]{11}$/.test(s);
}

// isValidMusicContent: title не junk і duration в межах
function isValidMusicContent(title, durationSeconds) {
  if (isJunkTitle(title)) return false;
  return isValidDuration(durationSeconds);
}

// isPlayableTrackMeta: повна перевірка картки треку для відтворення
function isPlayableTrackMeta(track) {
  if (!track?.youtubeId || !isValidYoutubeVideoId(track.youtubeId)) return false;
  const title = coerceMediaText(track.title || track.name).trim();
  const author = coerceMediaText(track.author || track.artist).trim();
  if (!title || !isValidTrackAuthor(author)) return false;
  let dur = Number(track.duration) || 0;
  if (typeof track.duration === 'string' && track.duration.includes(':')) {
    const p = track.duration.split(':').map(Number);
    dur = p.length === 3 ? p[0] * 3600 + p[1] * 60 + p[2] : p[0] * 60 + p[1];
  }
  return isValidMusicContent(title, dur);
}

// filterTrackList: лишає лише playable треки з масиву
function filterTrackList(items) {
  return (items || []).filter((item) => isPlayableTrackMeta(item));
}

module.exports = {
  coerceMediaText,
  isJunkTitle,
  isValidDuration,
  isValidMusicContent,
  isValidTrackAuthor,
  isValidYoutubeVideoId,
  isPlayableTrackMeta,
  filterTrackList
};
