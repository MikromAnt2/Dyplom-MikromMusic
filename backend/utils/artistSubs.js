const { fetchFromYouTube } = require('../routes/search');
const { formatSubsLabel, parseCountFromString } = require('./formatListeners');
const { isUcArtistId } = require('./artistChannel');

// getText: витягує текст з Innertube-об'єкта
function getText(val) {
  if (!val) return '';
  if (typeof val === 'string' || typeof val === 'number') return String(val);
  if (val.text) return val.text;
  if (Array.isArray(val.runs)) return val.runs.map((r) => r.text).join('');
  if (typeof val.toString === 'function') return val.toString();
  return '';
}

// countFromRaw: число слухачів з сирого поля header/API
function countFromRaw(raw) {
  if (!raw) return 0;
  if (typeof raw === 'number' && raw > 0) return Math.round(raw);
  return parseCountFromString(getText(raw));
}

// monthlyListenerTextsFromHeader: рядки про monthly listeners з header артиста
function monthlyListenerTextsFromHeader(header) {
  if (!header) return [];
  const parts = [
    getText(header.subscribers),
    getText(header.subscription_count),
    getText(header.subtitle)
  ].filter(Boolean);

  return parts.filter((p) =>
    /subscriber|listener|слухач|підписник|monthly|subscribers|fans?/i.test(p)
    && (/[km]\b|млн|тис|million|thousand/i.test(p) || /\d/.test(p))
  );
}

// fetchYoutubeSubscriberCount: кількість підписників через YouTube Data API
async function fetchYoutubeSubscriberCount(channelId) {
  if (!isUcArtistId(channelId)) return 0;
  try {
    const url = `https://www.googleapis.com/youtube/v3/channels?part=statistics&id=${channelId}`;
    const data = await fetchFromYouTube(url);
    const raw = data?.items?.[0]?.statistics?.subscriberCount;
    const n = parseInt(raw, 10);
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch {
    return 0;
  }
}

// pickListenerCount: найкраще число слухачів зі зібраних джерел
function pickListenerCount(counts) {
  if (!counts.length) return 0;
  const filtered = counts.filter((n) => n >= 10_000);
  const pool = filtered.length ? filtered : counts;
  return Math.max(...pool);
}

// gatherListenerCounts: збирає кандидати на кількість слухачів
async function gatherListenerCounts(ytClient, channelId, rawHint = '') {
  if (!isUcArtistId(channelId)) return [];

  const counts = [];
  const fromHint = countFromRaw(rawHint);
  if (fromHint > 0) counts.push(fromHint);

  if (ytClient?.music?.getArtist) {
    try {
      const musicPage = await ytClient.music.getArtist(channelId);
      for (const part of monthlyListenerTextsFromHeader(musicPage?.header)) {
        const n = countFromRaw(part);
        if (n > 0) counts.push(n);
      }
    } catch (_) {}
  }

  const fromApi = await fetchYoutubeSubscriberCount(channelId);
  if (fromApi > 0) counts.push(fromApi);

  return counts;
}

// resolveMonthlyListenersData: label + число для клієнтського форматування
async function resolveMonthlyListenersData(ytClient, channelId, rawHint = '') {
  const counts = await gatherListenerCounts(ytClient, channelId, rawHint);
  const count = pickListenerCount(counts);
  if (!count) return { label: '', count: 0 };
  return { label: formatSubsLabel(count), count };
}

// resolveMonthlyListeners: monthly listeners з YT Music → «1,44 млн слухачів»
async function resolveMonthlyListeners(ytClient, channelId, rawHint = '') {
  const { label } = await resolveMonthlyListenersData(ytClient, channelId, rawHint);
  return label;
}

// resolveArtistSubs: підписники/слухачі артиста — максимум з доступних джерел
async function resolveArtistSubs(ytClient, channelId, opts = {}) {
  const { label } = await resolveMonthlyListenersData(ytClient, channelId, opts.rawSubs);
  return label;
}

// enrichArtistsMonthlyListeners: додає subs до масиву артистів паралельно
async function enrichArtistsMonthlyListeners(ytClient, artists, concurrency = 5) {
  if (!Array.isArray(artists) || !artists.length) return [];

  const results = new Array(artists.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(concurrency, artists.length) }, async () => {
    while (next < artists.length) {
      const i = next++;
      const a = artists[i];
      const hint = a.monthlyListeners || a.subtitle || a.subscribers || a.subs;
      const { label, count } = await resolveMonthlyListenersData(ytClient, a.channelId, hint);
      results[i] = {
        ...a,
        subs: label || '',
        listenerCount: count > 0 ? count : undefined
      };
    }
  });
  await Promise.all(workers);
  return results;
}

module.exports = {
  resolveArtistSubs,
  resolveMonthlyListeners,
  resolveMonthlyListenersData,
  enrichArtistsMonthlyListeners,
  fetchYoutubeSubscriberCount
};
