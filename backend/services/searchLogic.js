const { isValidMusicContent } = require('./recommendation/trackFilter');
const { normalizeSearchKey, nameSimilarity } = require('../utils/searchFuzzy');
const { cleanArtistName } = require('../utils/artistChannel');

const SEARCH_PAGE_SIZE = 15;

const JUNK_CHANNEL_RE =
  /\b(tv|records|vevo|media|entertainment|official\s*channel|lyrics|nightcore|hour|compilation|ranking|reacts?)\b/i;

// decodeHtmlEntities: декодує HTML-сутності в рядку
function decodeHtmlEntities(str) {
  if (!str || typeof str !== 'string') return str || '';
  return str
    .replace(/&quot;/g, '"')
    .replace(/&#0*39;/gi, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'");
}

// extractArtistFromTitle: ім'я артиста з title до роздільника
function extractArtistFromTitle(title) {
  const t = decodeHtmlEntities(title);
  const m = t.match(/^(.+?)\s*[-–—|:]\s+/);
  if (!m) return '';
  const candidate = cleanArtistName(m[1].trim());
  if (!candidate || candidate.length < 2 || candidate.length > 64) return '';
  if (/^\d+$/.test(candidate)) return '';
  if (/^(official|video|audio|lyric)/i.test(candidate)) return '';
  return candidate;
}

// resolveSearchTrackAuthor: author треку з title, channel і запиту
function resolveSearchTrackAuthor(title, channelTitle, query = '') {
  const channel = cleanArtistName(channelTitle || '');
  const fromTitle = extractArtistFromTitle(title);
  const qKey = normalizeSearchKey(query);

  const channelKey = normalizeSearchKey(channel);
  const titleKey = normalizeSearchKey(fromTitle);

  if (fromTitle) {
    if (!channel || JUNK_CHANNEL_RE.test(channel) || /- topic$/i.test(channel)) {
      return fromTitle;
    }
    if (qKey && (titleKey.includes(qKey) || nameSimilarity(fromTitle, query) >= 0.55)) {
      return fromTitle;
    }
    if (qKey && channelKey.includes(qKey)) return channel;
    return fromTitle;
  }

  if (channel && !JUNK_CHANNEL_RE.test(channel)) return channel;
  return channel || fromTitle || 'Unknown';
}

// scoreSearchTrack: релевантність треку пошуковому запиту
function scoreSearchTrack(track, query) {
  const q = String(query || '').trim();
  if (!q) return Math.log10((track.views || 0) + 1);

  let score = nameSimilarity(track.title, q) * 1200;
  score += nameSimilarity(track.author, q) * 2500;

  const qKey = normalizeSearchKey(q);
  const authorKey = normalizeSearchKey(track.author);
  const titleKey = normalizeSearchKey(track.title);

  if (authorKey === qKey) score += 8000;
  if (authorKey.includes(qKey) || qKey.includes(authorKey)) score += 3500;
  if (titleKey.includes(qKey)) score += 1500;

  if (JUNK_CHANNEL_RE.test(track._channelRaw || '')) score -= 4000;
  if (/\b(cover|reaction|live stream|1 hour|24\/7)\b/i.test(track.title)) score -= 2500;

  score += Math.log10((track.views || 0) + 1) * 80;
  return score;
}

// enhanceSearchTracksForQuery: author, скоринг і сортування для UI пошуку
function enhanceSearchTracksForQuery(items, query, limit = 20) {
  const q = String(query || '').trim();
  const list = dedupeTracksByYoutubeId(items || []);

  const enhanced = list.map((t) => {
    const title = decodeHtmlEntities(t.title);
    const author = resolveSearchTrackAuthor(title, t.author, q);
    return {
      ...t,
      title,
      author,
      album: t.album || 'Single',
      _channelRaw: t.author
    };
  });

  if (!q) return enhanced.slice(0, limit);

  return enhanced
    .map((t) => ({ ...t, _score: scoreSearchTrack(t, q) }))
    .filter((t) => t._score > -800)
    .sort((a, b) => b._score - a._score)
    .slice(0, limit)
    .map(({ _score, _channelRaw, ...t }) => t);
}

// parseIso8601Duration: парсить ISO 8601 тривалість — у секунди
function parseIso8601Duration(iso) {
  if (!iso) return 0;
  const match = String(iso).match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;
  const hours = parseInt(match[1], 10) || 0;
  const minutes = parseInt(match[2], 10) || 0;
  const seconds = parseInt(match[3], 10) || 0;
  return hours * 3600 + minutes * 60 + seconds;
}

// buildVideoStatsMap: будує мапу статистики відео — duration і views за id
function buildVideoStatsMap(durationItems = []) {
  const map = {};
  for (const video of durationItems) {
    map[video.id] = {
      duration: parseIso8601Duration(video.contentDetails?.duration),
      views: parseInt(video.statistics?.viewCount, 10) || 0
    };
  }
  return map;
}

// mapYoutubeSearchToTracks: мапить результати YouTube search — фільтр ≥30 с, до pageSize
function mapYoutubeSearchToTracks(searchItems, durationItems, options = {}) {
  const minDuration = options.minDuration ?? 30;
  const pageSize = options.pageSize ?? SEARCH_PAGE_SIZE;
  const isValid = options.isValidTrack || isValidMusicContent;

  const statsMap = buildVideoStatsMap(durationItems);

  const results = (searchItems || [])
    .filter((item) => {
      const videoId = item?.id?.videoId;
      if (!videoId) return false;
      const duration = statsMap[videoId]?.duration || 0;
      return duration > minDuration && isValid(item.snippet?.title, duration);
    })
    .map((item) => {
      const videoId = item.id.videoId;
      const rawTitle = decodeHtmlEntities(item.snippet?.title);
      const rawChannel = item.snippet?.channelTitle || '';
      return {
        title: rawTitle,
        author: rawChannel,
        channelId: item.snippet.channelId || '',
        image: `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`,
        youtubeId: videoId,
        duration: statsMap[videoId]?.duration || 0,
        views: statsMap[videoId]?.views || 0,
        album: 'Single',
        type: 'video'
      };
    });

  const cap = pageSize > 0 ? pageSize : results.length;
  return {
    items: results.slice(0, cap)
  };
}

// applyNextPageToken: додає nextPageToken до payload — для пагінації
function applyNextPageToken(payload, token) {
  return { ...payload, nextPageToken: token || null };
}

// dedupeTracksByYoutubeId: прибирає дублікати треків — за youtubeId
function dedupeTracksByYoutubeId(items) {
  const seen = new Set();
  return (items || []).filter((t) => {
    if (!t?.youtubeId || seen.has(t.youtubeId)) return false;
    seen.add(t.youtubeId);
    return true;
  });
}

module.exports = {
  SEARCH_PAGE_SIZE,
  parseIso8601Duration,
  buildVideoStatsMap,
  mapYoutubeSearchToTracks,
  applyNextPageToken,
  dedupeTracksByYoutubeId,
  decodeHtmlEntities,
  enhanceSearchTracksForQuery
};
