const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const CACHE_TTL_MS = 4 * 60 * 1000;
const urlCache = new Map();

const CLIENTS = {
  WEB: 'WEB',
  ANDROID: 'ANDROID',
  MUSIC: 'MUSIC',
  TVHTML5: 'TVHTML5'
};

const CLIENT_TYPE_BY_NAME = {
  WEB: 'WEB',
  ANDROID: 'ANDROID',
  MUSIC: 'WEB_REMIX',
  TVHTML5: 'TVHTML5'
};

let innertubeModule = null;
const clientInstances = new Map();

// parseExpireFromUrl: expire з query signed URL у мс
function parseExpireFromUrl(url) {
  try {
    const u = new URL(url);
    const exp = Number(u.searchParams.get('expire'));
    if (Number.isFinite(exp) && exp > 0) return exp * 1000;
  } catch (_) {}
  return Date.now() + CACHE_TTL_MS;
}

// getCached: кешований audio URL для videoId+client
function getCached(videoId, client) {
  const key = `${videoId}:${client}`;
  const hit = urlCache.get(key);
  if (!hit) return null;
  if (hit.expiresAt <= Date.now()) {
    urlCache.delete(key);
    return null;
  }
  return hit;
}

// setCached: зберігає payload у in-memory кеш
function setCached(videoId, client, payload) {
  const key = `${videoId}:${client}`;
  urlCache.set(key, payload);
}

// normalizeClientOrder: порядок Innertube-клієнтів (prefer/order query)
function normalizeClientOrder({ preferClient, order } = {}) {
  const defaultOrder = ['WEB', 'ANDROID', 'MUSIC', 'TVHTML5'];
  if (order) {
    const parsed = order
      .split(',')
      .map((c) => c.trim().toUpperCase())
      .filter((c) => CLIENTS[c]);
    if (parsed.length) return parsed;
  }
  if (preferClient && CLIENTS[preferClient]) {
    return [preferClient, ...defaultOrder.filter((c) => c !== preferClient)];
  }
  return defaultOrder;
}

// getInnertube: lazy require youtubei.js
async function getInnertube() {
  if (!innertubeModule) {
    // eslint-disable-next-line global-require
    const { Innertube } = require('youtubei.js');
    innertubeModule = Innertube;
  }
  return innertubeModule;
}

// getClient: Innertube instance для WEB/ANDROID/MUSIC/TVHTML5
async function getClient(clientName) {
  const key = String(clientName || '').toUpperCase();
  if (clientInstances.has(key)) return clientInstances.get(key);

  const Innertube = await getInnertube();
  const client_type = CLIENT_TYPE_BY_NAME[key] || CLIENT_TYPE_BY_NAME.WEB;
  const p = Innertube.create({
    client_type,
    retrieve_player: true,
    generate_session_locally: true
  }).catch((e) => {
    clientInstances.delete(key);
    throw e;
  });
  clientInstances.set(key, p);
  return p;
}

// resolveViaYoutubei: direct audio URL через youtubei.js
async function resolveViaYoutubei(videoId, clientName) {
  const cached = getCached(videoId, clientName);
  if (cached) return cached;

  const yt = await getClient(clientName);
  const fmt = await yt.getStreamingData(videoId, { type: 'audio', quality: 'best' });
  if (!fmt) throw new Error('NO_FORMAT');

  let url = fmt.url || null;
  if (!url && typeof fmt.decipher === 'function') {
    url = await fmt.decipher(yt.session?.player);
  }
  if (!url) throw new Error('NO_URL');

  const payload = {
    url,
    mimeType: fmt.mime_type || 'audio/webm',
    client: clientName,
    expiresAt: parseExpireFromUrl(url)
  };
  setCached(videoId, clientName, payload);
  return payload;
}

let ytdlpBinaryPromise = null;

// ensureYtDlpBinary: завантажує yt-dlp у tmp (якщо немає)
async function ensureYtDlpBinary() {
  if (ytdlpBinaryPromise) return ytdlpBinaryPromise;

  ytdlpBinaryPromise = (async () => {
    let YTDlpWrap;
    try {
      // eslint-disable-next-line global-require
      YTDlpWrap = require('yt-dlp-wrap').default || require('yt-dlp-wrap');
    } catch {
      return null;
    }

    const binDir = path.join(os.tmpdir(), 'mikrom-yt-dlp');
    if (!fs.existsSync(binDir)) fs.mkdirSync(binDir, { recursive: true });
    const binName = process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp';
    const binPath = path.join(binDir, binName);

    if (!fs.existsSync(binPath)) {
      await YTDlpWrap.downloadFromGithub(binPath, undefined, process.platform);
    }
    return binPath;
  })();

  return ytdlpBinaryPromise;
}

// resolveViaYtDlp: audio URL через yt-dlp -g (основний шлях)
async function resolveViaYtDlp(videoId) {
  const cached = getCached(videoId, 'YT_DLP');
  if (cached) return cached;

  const binPath = await ensureYtDlpBinary();
  if (!binPath) return null;

  let YTDlpWrap;
  try {
    // eslint-disable-next-line global-require
    YTDlpWrap = require('yt-dlp-wrap').default || require('yt-dlp-wrap');
  } catch {
    return null;
  }

  const ytdlp = new YTDlpWrap(binPath);
  const out = await ytdlp.execPromise([
    '--no-playlist',
    '-f',
    'bestaudio',
    '-g',
    `https://www.youtube.com/watch?v=${videoId}`
  ]);

  const url = String(out || '').trim().split('\n')[0].trim();
  if (!url.startsWith('http')) return null;

  const payload = {
    url,
    mimeType: 'audio/webm',
    client: 'YT_DLP',
    expiresAt: parseExpireFromUrl(url)
  };
  setCached(videoId, 'YT_DLP', payload);
  return payload;
}

// resolveViaYtdlCore: резервний audio URL через @distube/ytdl-core
async function resolveViaYtdlCore(videoId) {
  let ytdl;
  try {
    // eslint-disable-next-line global-require
    ytdl = require('@distube/ytdl-core');
  } catch {
    return null;
  }

  try {
    const info = await ytdl.getInfo(videoId);
    const format = ytdl.chooseFormat(info.formats, { quality: 'highestaudio', filter: 'audioonly' });
    if (!format?.url) return null;
    const payload = {
      url: format.url,
      mimeType: format.mimeType || 'audio/webm',
      client: 'YTDLP_CORE',
      expiresAt: parseExpireFromUrl(format.url)
    };
    setCached(videoId, 'YTDLP_CORE', payload);
    return payload;
  } catch {
    return null;
  }
}

// resolveAudioStreamUrl: Innertube (опційно) → yt-dlp → ytdl-core
async function resolveAudioStreamUrl(videoId, options = {}) {
  const preferClient = options.preferClient ? String(options.preferClient).toUpperCase() : null;
  const order = options.order ? String(options.order) : null;
  const clients = normalizeClientOrder({ preferClient, order });
  const errors = [];

  if (process.env.ENABLE_INNERTUBE_STREAMS === '1') {
    for (const client of clients) {
      try {
        const r = await resolveViaYoutubei(videoId, client);
        return {
          videoId,
          url: r.url,
          mimeType: r.mimeType,
          client: r.client,
          expiresAt: r.expiresAt,
          degraded: true
        };
      } catch (e) {
        errors.push({ client, error: e?.message || String(e) });
      }
    }
  }

  try {
    const r = await resolveViaYtDlp(videoId);
    if (r?.url) {
      return {
        videoId,
        url: r.url,
        mimeType: r.mimeType,
        client: r.client,
        expiresAt: r.expiresAt,
        degraded: true
      };
    }
    errors.push({ client: 'YT_DLP', error: 'NO_URL' });
  } catch (e) {
    errors.push({ client: 'YT_DLP', error: e?.message || String(e) });
  }

  try {
    const r = await resolveViaYtdlCore(videoId);
    if (r?.url) {
      return {
        videoId,
        url: r.url,
        mimeType: r.mimeType,
        client: r.client,
        expiresAt: r.expiresAt,
        degraded: true
      };
    }
    errors.push({ client: 'YTDLP_CORE', error: 'NO_URL' });
  } catch (e) {
    errors.push({ client: 'YTDLP_CORE', error: e?.message || String(e) });
  }

  const err = new Error('TEMP_UNAVAILABLE');
  err.details = { errors };
  throw err;
}

module.exports = {
  resolveAudioStreamUrl,
  CLIENTS
};
