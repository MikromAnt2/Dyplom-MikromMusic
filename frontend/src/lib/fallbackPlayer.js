let audioEl = null;

const state = {
  videoId: null,
  url: null,
  expiresAt: 0,
  mimeType: '',
  client: '',
  lastGoodTime: 0,
  wantPlay: false,
  switching: false,
  lastPlayError: null,
  endedHandlers: new Set(),
  timeHandlers: new Set(),
  errorHandlers: new Set()
};

let playGeneration = 0;

// ensureAudio: створює прихований <audio> і підписує timeupdate/ended/error
function ensureAudio() {
  if (audioEl) {
    try {
      audioEl.removeAttribute('crossorigin');
      audioEl.crossOrigin = null;
    } catch (_) {}
    return audioEl;
  }
  const el = document.createElement('audio');
  el.id = 'mikrom-fallback-audio';
  el.preload = 'auto';
  el.setAttribute('playsinline', 'true');
  el.style.position = 'fixed';
  el.style.left = '-9999px';
  el.style.bottom = '-9999px';
  el.style.width = '1px';
  el.style.height = '1px';
  el.style.opacity = '0';
  document.body.appendChild(el);

  el.addEventListener('timeupdate', () => {
    if (Number.isFinite(el.currentTime)) state.lastGoodTime = el.currentTime;
    state.timeHandlers.forEach((fn) => {
      try { fn(readSnapshot()); } catch (e) { console.error(e); }
    });
  });
  el.addEventListener('ended', () => {
    state.endedHandlers.forEach((fn) => {
      try { fn(); } catch (e) { console.error(e); }
    });
  });
  el.addEventListener('error', () => {
    state.errorHandlers.forEach((fn) => {
      try { fn(); } catch (e) { console.error(e); }
    });
  });

  audioEl = el;
  if (typeof window !== 'undefined') {
    window.mikromFallbackAudio = el;
    window.mikromFallbackDebug = () => ({ ...state, snapshot: readSnapshot() });
  }
  return audioEl;
}

// silenceAudioNow: пауза і скидання src без зміни state.wantPlay
function silenceAudioNow() {
  const el = ensureAudio();
  try { el.pause(); } catch (_) {}
  try { el.removeAttribute('src'); el.load(); } catch (_) {}
}

// isSwitching: чи триває підміна джерела (ігнорувати таймер UI)
export function isSwitching() {
  return state.switching;
}

// buildStreamUrl: URL GET /api/stream для videoId
function buildStreamUrl(videoId, { preferClient = '', order = '' } = {}) {
  const params = new URLSearchParams();
  if (preferClient) params.set('prefer', preferClient);
  if (order) params.set('order', order);
  const qs = params.toString();
  return `/api/stream/${encodeURIComponent(videoId)}${qs ? `?${qs}` : ''}`;
}

// fetchStream: завантажує JSON з прямим URL потоку
async function fetchStream(videoId, opts = {}) {
  const res = await fetch(buildStreamUrl(videoId, opts), { credentials: 'include' });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const err = new Error(body?.error || `STREAM_${res.status}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

// setVolume01: гучність HTML5 audio 0..1
export function setVolume01(v) {
  const el = ensureAudio();
  const vol = Math.max(0, Math.min(1, Number(v) || 0));
  el.volume = vol;
}

// pause: пауза fallback і скидання wantPlay
export function pause() {
  const el = ensureAudio();
  state.wantPlay = false;
  try { el.pause(); } catch (_) {}
}

// resume: продовження відтворення fallback
export async function resume() {
  const el = ensureAudio();
  state.wantPlay = true;
  try {
    state.lastPlayError = null;
    await el.play();
    return true;
  } catch (e) {
    state.lastPlayError = String(e?.name || e?.message || e);
    return false;
  }
}

// seekTo: перемотка fallback на секунду
export function seekTo(seconds) {
  const el = ensureAudio();
  const t = Math.max(0, Number(seconds) || 0);
  try { el.currentTime = t; } catch (_) {}
  state.lastGoodTime = t;
}

// stop: зупинка fallback і інвалідація поточного playGeneration
export function stop() {
  playGeneration += 1;
  state.switching = false;
  state.wantPlay = false;
  state.videoId = null;
  state.url = null;
  state.expiresAt = 0;
  state.mimeType = '';
  state.client = '';
  silenceAudioNow();
}

// readSnapshot: час/тривалість/стан для UI-таймера
export function readSnapshot() {
  const el = ensureAudio();
  if (state.switching || !state.url) {
    return {
      mode: 'fallback',
      videoId: state.videoId,
      currentTime: 0,
      duration: 0,
      isPlaying: false,
      paused: true,
      urlExpiresAt: state.expiresAt || 0
    };
  }
  const duration = Number.isFinite(el.duration) ? el.duration : 0;
  const currentTime = Number.isFinite(el.currentTime) ? el.currentTime : 0;
  const paused = !!el.paused;
  return {
    mode: 'fallback',
    videoId: state.videoId,
    currentTime,
    duration,
    isPlaying: !paused && currentTime >= 0 && duration >= 0,
    paused,
    urlExpiresAt: state.expiresAt || 0
  };
}

// onFallbackEnded: підписка на кінець треку
export function onFallbackEnded(fn) {
  state.endedHandlers.add(fn);
  return () => state.endedHandlers.delete(fn);
}

// onFallbackTime: підписка на timeupdate
export function onFallbackTime(fn) {
  state.timeHandlers.add(fn);
  return () => state.timeHandlers.delete(fn);
}

// onFallbackError: підписка на помилку <audio>
export function onFallbackError(fn) {
  state.errorHandlers.add(fn);
  return () => state.errorHandlers.delete(fn);
}

// swapSourceKeepingTime: нова URL з збереженням позиції та autoplay
async function swapSourceKeepingTime({ url }, keepTime, generation, shouldPlay) {
  const el = ensureAudio();
  const t = Math.max(0, Number(keepTime) || 0);
  const wantAutoplay = shouldPlay !== false;

  state.switching = true;
  try {
    if (generation != null && generation !== playGeneration) return false;

    try { el.pause(); } catch (_) {}
    el.src = url;
    try { el.load(); } catch (_) {}

    await new Promise((resolve) => {
      const onLoaded = () => resolve();
      const onFail = () => resolve();
      el.addEventListener('loadedmetadata', onLoaded, { once: true });
      el.addEventListener('canplay', onLoaded, { once: true });
      el.addEventListener('error', onFail, { once: true });
      window.setTimeout(resolve, 1200);
    });

    if (generation != null && generation !== playGeneration) {
      try { el.pause(); } catch (_) {}
      return false;
    }

    try {
      el.currentTime = t;
      state.lastGoodTime = t;
    } catch (_) {}

    if (wantAutoplay) {
      for (let attempt = 0; attempt < 4; attempt += 1) {
        if (generation != null && generation !== playGeneration) return false;
        try {
          state.lastPlayError = null;
          await el.play();
          return true;
        } catch (e) {
          state.lastPlayError = String(e?.name || e?.message || e);
          if (attempt < 3) {
            await new Promise((r) => window.setTimeout(r, 120 * (attempt + 1)));
          }
        }
      }
      return false;
    }
    return false;
  } finally {
    state.switching = false;
  }
}

// playVideoId: старт відтворення через /api/stream
export async function playVideoId(videoId, options = {}) {
  const {
    startSeconds = 0,
    wantPlay = true,
    preferClient = '',
    order = ''
  } = options;

  if (!videoId) return false;

  const gen = ++playGeneration;
  const shouldPlay = wantPlay !== false;
  ensureAudio();
  state.switching = true;
  state.url = null;
  state.videoId = videoId;
  state.wantPlay = shouldPlay;
  silenceAudioNow();

  const keepTime = Math.max(0, Number(startSeconds) || 0);

  const data = await fetchStream(videoId, { preferClient, order });
  if (gen !== playGeneration) return false;

  state.url = data.url;
  state.expiresAt = Number(data.expiresAt) || 0;
  state.mimeType = data.mimeType || '';
  state.client = data.client || '';

  const played = await swapSourceKeepingTime(
    { url: state.url },
    keepTime,
    gen,
    shouldPlay
  );
  if (gen !== playGeneration) return false;

  state.timeHandlers.forEach((fn) => {
    try { fn(readSnapshot()); } catch (e) { console.error(e); }
  });

  return played || !shouldPlay;
}

// refreshUrlAndResume: новий signed URL після 403/expiry
export async function refreshUrlAndResume(options = {}) {
  if (!state.videoId) return false;

  const el = ensureAudio();
  const at = Number.isFinite(el.currentTime) ? el.currentTime : state.lastGoodTime || 0;

  try {
    const data = await fetchStream(state.videoId, options);
    state.url = data.url;
    state.expiresAt = Number(data.expiresAt) || 0;
    state.mimeType = data.mimeType || '';
    state.client = data.client || '';
    const gen = playGeneration;
    const shouldPlay = state.wantPlay;
    const played = await swapSourceKeepingTime({ url: state.url }, at, gen, shouldPlay);
    return gen === playGeneration && (played || !shouldPlay);
  } catch (e) {
    console.error('[fallback] refreshUrl failed:', e);
    return false;
  }
}
