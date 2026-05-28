import { ytLog, stateLabel, isYtDebugEnabled } from './youtubePlayerDebug.js';

const VOLUME_STORAGE_KEY = 'mikrom-player-volume';

function readStoredVolumePercent() {
    try {
        const raw = localStorage.getItem(VOLUME_STORAGE_KEY);
        if (raw == null) return 100;
        const n = Number(raw);
        if (!Number.isFinite(n)) return 100;
        return Math.max(0, Math.min(100, Math.round(n)));
    } catch (_) {
        return 100;
    }
}

const state = {
    player: null,
    ready: false,
    initStarted: false,
    currentVideoId: null,
    intendedVideoId: null,
    pendingVideoId: null,
    pendingStartSeconds: 0,
    volume: readStoredVolumePercent(),
    displayMode: 'hidden',
    videoOverlayRect: null,
    stateChangeHandlers: new Set(),
    errorHandlers: new Set(),
    readyHandlers: new Set(),
    layoutObserver: null,
    playRetryTimer: null,
    layoutWakeCount: 0,
    flushDoneForVideoId: null,
    flushingPending: false,
    userPaused: false,
    gestureAutoplayUntil: 0,
    playbackGuardUntil: 0
};

const AUDIO_FALLBACK_W = 320;
const AUDIO_FALLBACK_H = 180;
const MIN_VIDEO_W = 854;
const LOW_QUALITIES = new Set(['small', 'medium', 'large']);

let apiPromise = null;
let initPromise = null;
let dockRestoreParent = null;
let pipActive = false;
let savedDisplayBeforePip = null;

export const YT_PLAYER_VARS = {
    autoplay: 0,
    controls: 0,
    disablekb: 1,
    rel: 0,
    fs: 0,
    modestbranding: 1,
    playsinline: 1,
    enablejsapi: 1,
    iv_load_policy: 3,
    cc_load_policy: 0,
    color: 'white'
};

// getPlayerVars: без origin — уникаємо postMessage mismatch (localhost vs 127.0.0.1)
function getPlayerVars() {
    return { ...YT_PLAYER_VARS };
}

function getHost() {
    return document.getElementById('yt-player-host');
}

// readLayoutSize: читання offset без dispatch resize (resize → ensurePlayerSized → цикл)
function readLayoutSize() {
    const host = getHost();
    const dock = getAudioDock();
    if (dock) {
        void dock.offsetWidth;
        void dock.offsetHeight;
    }
    if (host) {
        void host.offsetWidth;
        void host.offsetHeight;
    }
}

function getAudioDock() {
    return document.getElementById('yt-audio-dock');
}

function getYT() {
    return window.YT;
}

function notifySet(set, arg) {
    set.forEach((fn) => {
        try {
            fn(arg);
        } catch (e) {
            console.error(e);
        }
    });
}

// onYtReady: підписка на готовність iframe — викликає одразу якщо ready
export function onYtReady(fn) {
    if (state.ready) {
        fn(state.player);
        return () => {};
    }
    state.readyHandlers.add(fn);
    return () => state.readyHandlers.delete(fn);
}

// onYtStateChange: підписка на стан плеєра — play, pause, end
export function onYtStateChange(fn) {
    state.stateChangeHandlers.add(fn);
    return () => state.stateChangeHandlers.delete(fn);
}

// onYtError: підписка на помилки YouTube iframe
export function onYtError(fn) {
    state.errorHandlers.add(fn);
    return () => state.errorHandlers.delete(fn);
}

// loadYouTubeApi: завантажує youtube iframe_api — один раз на сторінку
export function loadYouTubeApi() {
    if (apiPromise) return apiPromise;

    apiPromise = new Promise((resolve) => {
        if (getYT()?.Player) {
            resolve();
            return;
        }

        window.__ytReadyQueue = window.__ytReadyQueue || [];
        window.__ytReadyQueue.push(() => resolve());

        if (!document.querySelector('script[src*="youtube.com/iframe_api"]')) {
            const tag = document.createElement('script');
            tag.src = 'https://www.youtube.com/iframe_api';
            const prev = window.onYouTubeIframeAPIReady;
            window.onYouTubeIframeAPIReady = function ytApiReady() {
                if (typeof prev === 'function') prev();
                const q = window.__ytReadyQueue || [];
                window.__ytReadyQueue = [];
                q.forEach((fn) => {
                    try {
                        fn();
                    } catch (e) {
                        console.error(e);
                    }
                });
            };
            document.head.appendChild(tag);
        } else {
            const poll = setInterval(() => {
                if (getYT()?.Player) {
                    clearInterval(poll);
                    resolve();
                }
            }, 50);
            setTimeout(() => clearInterval(poll), 15000);
        }
    });

    return apiPromise;
}

function getDockMetrics() {
    const dock = getAudioDock();
    const host = getHost();
    const iframe = host?.querySelector('iframe');
    const dockRect = dock?.getBoundingClientRect?.();
    return {
        ready: state.ready,
        displayMode: state.displayMode,
        intendedVideoId: state.intendedVideoId,
        currentVideoId: state.currentVideoId,
        pendingVideoId: state.pendingVideoId,
        dock: dock
            ? {
                offsetW: dock.offsetWidth,
                offsetH: dock.offsetHeight,
                clientW: dock.clientWidth,
                clientH: dock.clientHeight,
                rect: dockRect
                    ? { w: Math.round(dockRect.width), h: Math.round(dockRect.height), x: Math.round(dockRect.x), y: Math.round(dockRect.y) }
                    : null
            }
            : null,
        host: host ? { offsetW: host.offsetWidth, offsetH: host.offsetHeight } : null,
        iframe: iframe ? { offsetW: iframe.offsetWidth, offsetH: iframe.offsetHeight } : null,
        playback: readPlaybackSnapshot()
    };
}

function resetDockLayout() {
    const dock = getAudioDock();
    if (!dock) return;
    dock.classList.remove('yt-dock--video');
    dock.style.left = '';
    dock.style.top = '';
    dock.style.right = '';
    dock.style.bottom = '';
    dock.style.width = '';
    dock.style.height = '';
    dock.style.opacity = '';
}

function applyVideoOverlayRect(rect) {
    const dock = getAudioDock();
    const host = getHost();
    if (!dock || !host || !rect || rect.width < 8 || rect.height < 8) return null;

    mountHostToAudioDock();
    dock.classList.add('yt-dock--video');
    dock.style.left = `${Math.round(rect.left)}px`;
    dock.style.top = `${Math.round(rect.top)}px`;
    dock.style.right = 'auto';
    dock.style.bottom = 'auto';
    const displayW = Math.max(Math.round(rect.width), 1);
    const displayH = Math.max(Math.round(rect.height), 1);
    dock.style.width = `${displayW}px`;
    dock.style.height = `${displayH}px`;
    dock.style.opacity = '1';

    host.style.width = '100%';
    host.style.height = '100%';

    const apiW = Math.max(displayW, MIN_VIDEO_W);
    const apiH = Math.max(displayH, Math.round((MIN_VIDEO_W * 9) / 16));

    const p = getPlayer();
    if (p?.setSize) {
        try {
            p.setSize(apiW, apiH);
        } catch (_) {
        }
    }
    requestPreferredQuality();
    return { w: displayW, h: displayH };
}

// requestPreferredQuality: hd720+ у video-режимі (API може ігнорувати, але розмір iframe допомагає)
function requestPreferredQuality() {
    if (state.displayMode !== 'video') return;
    const p = getPlayer();
    if (!p || typeof p.setPlaybackQuality !== 'function') return;
    try {
        const levels =
            typeof p.getAvailableQualityLevels === 'function' ? p.getAvailableQualityLevels() : [];
        if (levels.includes('hd1080')) {
            p.setPlaybackQuality('hd1080');
        } else if (levels.includes('hd720')) {
            p.setPlaybackQuality('hd720');
        } else {
            p.setPlaybackQuality('hd720');
        }
    } catch (_) {
    }
}

function handlePlayerStateForQuality(ev) {
    const YT = getYT();
    if (!YT || state.displayMode !== 'video') return;
    const st = ev?.data;
    if (st === YT.PlayerState.BUFFERING || st === YT.PlayerState.PLAYING) {
        requestPreferredQuality();
    }
}

function handlePlaybackQualityChange(ev) {
    const q = ev?.data;
    if (state.displayMode !== 'video' || !q || !LOW_QUALITIES.has(q)) return;
    window.setTimeout(requestPreferredQuality, 0);
}

// wakePlayerLayout: layout iframe — iframe лишається в #yt-audio-dock (без reparent)
export function wakePlayerLayout(reason = 'manual') {
    state.layoutWakeCount += 1;
    mountHostToAudioDock();
    const sizes = ensurePlayerSized();
    readLayoutSize();
    const p = getPlayer();
    if (p?.setSize && sizes) {
        try {
            p.setSize(sizes.w, sizes.h);
        } catch (_) {
        }
    }
    const metrics = getDockMetrics();
    ytLog(`wakeLayout #${state.layoutWakeCount}: ${reason}`, metrics);
    return metrics;
}

// nudgeLayoutAfterReady: мікро-зсув layout (як при відкритті DevTools) без window.resize
function nudgeLayoutAfterReady() {
    requestAnimationFrame(() => {
        ensurePlayerSized();
        readLayoutSize();
        const dock = getAudioDock();
        if (!dock) return;
        const prev = dock.style.height;
        dock.style.height = '179px';
        requestAnimationFrame(() => {
            dock.style.height = prev || '180px';
            ensurePlayerSized();
            readLayoutSize();
        });
    });
}

function bindGlobalBridge() {
    window.__mikromYtOnStateChange = (ev) => {
        ytLog('onStateChange', {
            code: ev?.data,
            label: stateLabel(ev?.data),
            intended: state.intendedVideoId,
            actual: getActualVideoId(),
            metrics: getDockMetrics()
        });
        notifySet(state.stateChangeHandlers, ev);
    };
    window.__mikromYtOnError = (ev) => {
        ytLog('onError', { code: ev?.data, intended: state.intendedVideoId });
        notifySet(state.errorHandlers, ev);
    };
}

// getYtDebugInfo: знімок стану — для консолі mikromYtDebug()
export function getYtDebugInfo() {
    return getDockMetrics();
}

function mountHostToAudioDock() {
    const host = getHost();
    let dock = getAudioDock();
    if (!dock) {
        dock = document.createElement('div');
        dock.id = 'yt-audio-dock';
        dock.setAttribute('aria-hidden', 'true');
        document.body.appendChild(dock);
    }
    if (host && host.parentElement !== dock) {
        dock.appendChild(host);
    }
    return !!host;
}

// ensurePlayerSized: 320×180 у dock; у video — fixed overlay за координатами слота
export function ensurePlayerSized() {
    mountHostToAudioDock();
    const host = getHost();
    if (!host) return { w: AUDIO_FALLBACK_W, h: AUDIO_FALLBACK_H };

    if (state.displayMode === 'video' && state.videoOverlayRect) {
        const sized = applyVideoOverlayRect(state.videoOverlayRect);
        if (sized) return sized;
    }

    const w = AUDIO_FALLBACK_W;
    const h = AUDIO_FALLBACK_H;
    host.style.width = `${w}px`;
    host.style.height = `${h}px`;

    const p = getPlayer();
    if (p?.setSize) {
        try {
            p.setSize(w, h);
        } catch (_) {
        }
    }

    return { w, h };
}

// tryPlayVideo: один виклик play + unmute (не після явної паузи користувача)
function tryPlayVideo(tag = 'tryPlayVideo') {
    if (state.userPaused) return false;
    const p = getPlayer();
    if (!p?.playVideo || !state.intendedVideoId) {
        ytLog(`${tag}: skip`, { hasPlayer: !!p, intended: state.intendedVideoId });
        return false;
    }
    try {
        applyVolume();
        if (typeof p.unMute === 'function') p.unMute();
        p.playVideo();
        const snap = readPlaybackSnapshot();
        ytLog(`${tag}: playVideo()`, { state: stateLabel(snap.state), isPlaying: snap.isPlaying });
        return true;
    } catch (err) {
        ytLog(`${tag}: помилка`, err);
        return false;
    }
}

// armPlaybackGuard: ігнорувати ENDED / playNext під час load/seek/resume
export function armPlaybackGuard(ms = 3500) {
    state.playbackGuardUntil = Date.now() + Math.max(500, ms);
}

export function isPlaybackGuardActive() {
    return state.playbackGuardUntil > Date.now();
}

// armAutoplayFromGesture: викликати синхронно з onClick — зберігає право autoplay
export function armAutoplayFromGesture() {
    state.userPaused = false;
    state.gestureAutoplayUntil = Date.now() + 8000;
    if (isPlayerReady()) {
        tryPlayVideo('gesture-arm');
    }
    return true;
}

function gestureAutoplayActive() {
    return state.gestureAutoplayUntil > Date.now();
}

// scheduleAutoplayBurst: серія playVideo після resume / load
export function scheduleAutoplayBurst(tag = 'burst', maxAttempts = 18) {
    state.userPaused = false;
    if (state.autoplayBurstTimer) clearTimeout(state.autoplayBurstTimer);

    let attempts = 0;
    const tick = () => {
        attempts += 1;
        if (!isPlayerReady()) {
            if (attempts < maxAttempts) {
                state.autoplayBurstTimer = setTimeout(tick, 150);
            }
            return;
        }
        wakePlayerLayout(tag);
        tryPlayVideo(`${tag}#${attempts}`);
        const snap = readPlaybackSnapshot();
        if (snap.isPlaying || attempts >= maxAttempts) {
            state.autoplayBurstTimer = null;
            return;
        }
        state.autoplayBurstTimer = setTimeout(tick, 150);
    };
    tick();
}

// playKick: старт після layout — без рекурсивних resize/mount
export function playKick() {
    if (!isPlayerReady()) {
        ytLog('playKick: player не ready');
        return false;
    }
    wakePlayerLayout('playKick');
    tryPlayVideo('playKick');
    const retries = gestureAutoplayActive() ? 12 : 5;
    schedulePlayRetries(retries);
    if (gestureAutoplayActive()) scheduleAutoplayBurst('playKick-burst');
    return true;
}

// schedulePlayRetries: кілька повторів playVideo (без ensurePlayerSized у кожному тіку)
function schedulePlayRetries(maxAttempts = 5) {
    if (state.playRetryTimer) clearTimeout(state.playRetryTimer);
    let attempts = 0;
    const tick = () => {
        attempts += 1;
        const snap = readPlaybackSnapshot();
        if (!snap.isPlaying) tryPlayVideo(`retry#${attempts}`);
        ytLog(`schedulePlayRetries #${attempts}`, { isPlaying: snap.isPlaying, state: stateLabel(snap.state) });
        if (attempts < maxAttempts && !readPlaybackSnapshot().isPlaying) {
            state.playRetryTimer = setTimeout(tick, 200);
        }
    };
    state.playRetryTimer = setTimeout(tick, 120);
}

// setupLayoutWatcher: ResizeObserver host — flush pending playback
function setupLayoutWatcher() {
    const host = getHost();
    if (!host || state.layoutObserver) return;

    const dock = document.getElementById('yt-audio-dock') || host;
    let resizeRaf = 0;
    const onResize = () => {
        if (resizeRaf) cancelAnimationFrame(resizeRaf);
        resizeRaf = requestAnimationFrame(() => {
            resizeRaf = 0;
            ensurePlayerSized();
        });
    };

    state.layoutObserver = new ResizeObserver(onResize);
    state.layoutObserver.observe(dock);
    state.layoutObserver.observe(host);
    window.addEventListener('resize', () => {
        onResize();
        ytLog('window resize → ensurePlayerSized');
    }, { passive: true });
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState !== 'visible' || !state.intendedVideoId || !isPlayerReady()) return;
        wakePlayerLayout('visibility-visible');
        if (!state.userPaused) {
            tryPlayVideo('visibility');
        }
    });
    if (typeof window !== 'undefined') {
        window.addEventListener('load', () => wakePlayerLayout('window-load'), { once: true });
    }
}

// flushPendingPlayback: завантажує pending-трек після onReady
export function flushPendingPlayback() {
    if (state.flushingPending) return false;
    const vid = state.pendingVideoId || state.intendedVideoId;
    if (!vid || !isPlayerReady()) {
        ytLog('flushPendingPlayback: skip', { vid, ready: isPlayerReady() });
        return false;
    }
    if (state.flushDoneForVideoId === vid && !state.pendingVideoId) {
        ytLog('flushPendingPlayback: вже завантажено', { vid });
        return true;
    }

    state.flushingPending = true;
    state.pendingVideoId = null;
    ytLog('flushPendingPlayback: старт', { vid });
    const ok = playVideoById(vid, { force: true, startSeconds: state.pendingStartSeconds || 0 });
    state.flushingPending = false;

    if (ok === true || ok === 'pending') {
        state.flushDoneForVideoId = vid;
        playKick();
        nudgeLayoutAfterReady();
    }
    return ok === true;
}


function createPlayerInstance() {
    const el = document.getElementById('yt-player');
    if (!el || !getYT()?.Player) return null;

    bindGlobalBridge();
    mountHostToAudioDock();
    ensurePlayerSized();

    const player = new window.YT.Player('yt-player', {
        width: AUDIO_FALLBACK_W,
        height: AUDIO_FALLBACK_H,
        playerVars: getPlayerVars(),
        events: {
            onReady: (ev) => {
                state.player = ev.target;
                state.ready = true;
                window.__mikromYtPlayerReady = ev.target;
                ytLog('onReady: YT.Player готовий');
                applyVolume();
                mountHostToAudioDock();
                ensurePlayerSized();
                applyDisplayMode();
                setupLayoutWatcher();
                wakePlayerLayout('onReady');
                const iframe = getHost()?.querySelector('iframe');
                if (iframe) {
                    const allow = iframe.getAttribute('allow') || '';
                    if (!/picture-in-picture/i.test(allow)) {
                        iframe.setAttribute('allow', allow ? `${allow}; picture-in-picture` : 'picture-in-picture');
                    }
                }
                flushPendingPlayback();
                notifySet(state.readyHandlers, state.player);
                window.dispatchEvent(new Event('mikrom-yt-player-ready'));
            },
            onStateChange: (ev) => {
                handlePlayerStateForQuality(ev);
                notifySet(state.stateChangeHandlers, ev);
            },
            onPlaybackQualityChange: handlePlaybackQualityChange,
            onError: (ev) => notifySet(state.errorHandlers, ev)
        }
    });

    return player;
}

// warmupPlayer: ініціалізує єдиний YT.Player — при старті додатку
export function warmupPlayer() {
    if (initPromise) return initPromise;

    initPromise = loadYouTubeApi().then(() => {
        if (state.ready && state.player) {
            ensurePlayerSized();
            return state.player;
        }

        if (window.__mikromYtPlayerReady && typeof window.__mikromYtPlayerReady.loadVideoById === 'function') {
            state.player = window.__mikromYtPlayerReady;
            state.ready = true;
            applyVolume();
            mountHostToAudioDock();
            ensurePlayerSized();
            applyDisplayMode();
            setupLayoutWatcher();
            notifySet(state.readyHandlers, state.player);
            return state.player;
        }

        if (state.initStarted || window.__mikromPlayerInitStarted) {
            return waitUntilReady().then(() => state.player);
        }

        state.initStarted = true;
        window.__mikromPlayerInitStarted = true;

        if (typeof window.mikromCreateYtPlayer === 'function') {
            window.mikromCreateYtPlayer();
        } else {
            createPlayerInstance();
        }

        return waitUntilReady().then(() => state.player);
    });

    return initPromise;
}

function waitUntilReady(timeoutMs = 60000) {
    if (state.ready && state.player) return Promise.resolve(state.player);

    return new Promise((resolve, reject) => {
        const t0 = Date.now();
        const unsub = onYtReady((p) => {
            unsub();
            clearInterval(poll);
            resolve(p);
        });
        const poll = setInterval(() => {
            if (state.ready && state.player) {
                unsub();
                clearInterval(poll);
                resolve(state.player);
                return;
            }
            if (Date.now() - t0 > timeoutMs) {
                unsub();
                clearInterval(poll);
                window.__mikromPlayerInitStarted = false;
                state.initStarted = false;
                reject(new Error('YouTube player init timeout'));
            }
        }, 80);
    });
}

// isPlayerReady: чи готовий iframe-плеєр — ready і getPlayerState
export function isPlayerReady() {
    return state.ready && state.player && typeof state.player.getPlayerState === 'function';
}

// getPlayer: повертає інстанс YT.Player — або null
export function getPlayer() {
    if (!isPlayerReady()) return null;
    return state.player;
}

// getLoadedVideoId: youtubeId завантаженого відео — зі state
export function getLoadedVideoId() {
    return state.currentVideoId;
}

// getIntendedVideoId: цільовий videoId — що має грати
export function getIntendedVideoId() {
    return state.intendedVideoId;
}

// getActualVideoId: фактичний videoId з getVideoData — для drift-фіксу
export function getActualVideoId() {
    const p = getPlayer();
    if (!p?.getVideoData) return null;
    try {
        return p.getVideoData()?.video_id || null;
    } catch (_) {
        return null;
    }
}

function applyVolume() {
    const p = getPlayer();
    if (!p) return;
    try {
        if (typeof p.unMute === 'function') p.unMute();
        if (typeof p.setVolume === 'function') p.setVolume(state.volume);
    } catch (_) {
    }
}

// getStoredVolumePercent: остання гучність з localStorage (0–100)
export function getStoredVolumePercent() {
    return readStoredVolumePercent();
}

// setVolume: встановлює гучність — 0–100 для iframe, зберігає в localStorage
export function setVolume(percent) {
    state.volume = Math.max(0, Math.min(100, Math.round(percent)));
    try {
        localStorage.setItem(VOLUME_STORAGE_KEY, String(state.volume));
    } catch (_) {
    }
    applyVolume();
}

// setDisplayMode: video — fixed overlay над слотом; hidden — dock у куті (без reparent DOM)
export function setDisplayMode(mode, rect = null) {
    const host = getHost();
    if (!host) return;

    mountHostToAudioDock();
    state.displayMode = mode === 'video' ? 'video' : 'hidden';
    state.videoOverlayRect =
        state.displayMode === 'video' && rect && rect.width > 0 && rect.height > 0 ? rect : null;

    host.classList.remove('yt-host--hidden', 'yt-host--video');

    if (state.displayMode === 'video' && state.videoOverlayRect) {
        host.classList.add('yt-host--video');
        applyVideoOverlayRect(state.videoOverlayRect);
        ytLog('setDisplayMode: video overlay', state.videoOverlayRect);
    } else {
        host.classList.add('yt-host--hidden');
        resetDockLayout();
        ensurePlayerSized();
        ytLog('setDisplayMode: hidden (audio dock)');
    }
}

// syncVideoOverlayRect: оновлює позицію overlay при resize/scroll
export function syncVideoOverlayRect(rect) {
    if (state.displayMode !== 'video' || !rect || rect.width < 8 || rect.height < 8) return false;
    state.videoOverlayRect = rect;
    applyVideoOverlayRect(rect);
    return true;
}

export function isPipDockActive() {
    return pipActive;
}

// mountDockForPip: переносить YT iframe у вікно Picture-in-Picture
export function mountDockForPip(pipDocument, videoRect = null) {
    const dock = getAudioDock();
    const host = getHost();
    if (!dock || !host || !pipDocument?.body) return;

    if (!dockRestoreParent) {
        dockRestoreParent = dock.parentElement || document.body;
    }

    savedDisplayBeforePip = {
        mode: state.displayMode,
        rect: state.videoOverlayRect ? { ...state.videoOverlayRect } : null
    };

    pipActive = true;
    pipDocument.body.appendChild(dock);
    dock.style.right = 'auto';
    dock.style.bottom = 'auto';

    if (videoRect && videoRect.width >= 8 && videoRect.height >= 8) {
        mountHostToAudioDock();
        state.displayMode = 'video';
        state.videoOverlayRect = { ...videoRect };
        host.classList.remove('yt-host--hidden');
        host.classList.add('yt-host--video');
        applyVideoOverlayRect(state.videoOverlayRect);
        dock.style.opacity = '1';
        dock.style.pointerEvents = 'none';
        ytLog('mountDockForPip: video', state.videoOverlayRect);
        return;
    }

    resetDockLayout();
    state.displayMode = 'hidden';
    state.videoOverlayRect = null;
    host.classList.remove('yt-host--video');
    host.classList.add('yt-host--hidden');
    ensurePlayerSized();
    dock.style.opacity = '0';
    dock.style.pointerEvents = 'none';
    dock.style.position = 'absolute';
    dock.style.left = '0';
    dock.style.top = '0';
    dock.style.width = '1px';
    dock.style.height = '1px';
    ytLog('mountDockForPip: audio (hidden dock)');
}

// unmountDockFromPip: повертає dock на головну сторінку
export function unmountDockFromPip() {
    if (!pipActive) return;
    const dock = getAudioDock();
    pipActive = false;

    if (dock) {
        dock.style.opacity = '';
        dock.style.pointerEvents = '';
        dock.style.position = '';
        if (dockRestoreParent) {
            dockRestoreParent.appendChild(dock);
        } else {
            document.body.appendChild(dock);
        }
    }

    resetDockLayout();

    const saved = savedDisplayBeforePip;
    savedDisplayBeforePip = null;

    if (saved?.mode === 'video' && saved.rect) {
        setDisplayMode('video', saved.rect);
    } else {
        setDisplayMode('hidden');
    }

    ytLog('unmountDockFromPip: restored', saved);
}

// syncPipVideoRect: оновлює позицію відео у PiP-вікні
export function syncPipVideoRect(rect) {
    if (!pipActive || state.displayMode !== 'video' || !rect) return false;
    state.videoOverlayRect = { ...rect };
    applyVideoOverlayRect(state.videoOverlayRect);
    return true;
}

function applyDisplayMode() {
    const host = getHost();
    if (!host) return;
    host.classList.remove('yt-host--hidden', 'yt-host--video');
    host.classList.add(state.displayMode === 'video' ? 'yt-host--video' : 'yt-host--hidden');
}

// playVideoById: loadVideoById і play — з force та startSeconds
export function playVideoById(videoId, options = {}) {
    const { force = false, startSeconds = 0 } = options;
    const seekStart = Math.max(0, Number(startSeconds) || 0);
    if (!videoId) return false;

    const switchingVideo = Boolean(state.currentVideoId && state.currentVideoId !== videoId);
    if (switchingVideo || force || seekStart > 0) {
        armPlaybackGuard(switchingVideo ? 4500 : 3000);
    }

    state.intendedVideoId = videoId;
    state.pendingStartSeconds = seekStart;
    state.userPaused = false;
    if (state.flushDoneForVideoId && state.flushDoneForVideoId !== videoId) {
        state.flushDoneForVideoId = null;
    }
    ytLog('playVideoById', { videoId, force, startSeconds, ready: isPlayerReady() });

    if (!isPlayerReady()) {
        state.pendingVideoId = videoId;
        ytLog('playVideoById: в черзі (pending) — чекаємо onReady', { videoId, seekStart });
        warmupPlayer()
            .then(() => flushPendingPlayback())
            .catch((e) => ytLog('warmup fail', e));
        return 'pending';
    }

    wakePlayerLayout('playVideoById');
    const p = getPlayer();
    applyVolume();

    if (!force && state.currentVideoId === videoId) {
        const YT = getYT();
        const st = typeof p.getPlayerState === 'function' ? p.getPlayerState() : -1;
        if (YT && st === YT.PlayerState.PAUSED && typeof p.playVideo === 'function') {
            p.playVideo();
            schedulePlayRetries();
            return true;
        }
        if (YT && (st === YT.PlayerState.PLAYING || st === YT.PlayerState.BUFFERING)) {
            return true;
        }
    }

    try {
        if (seekStart > 0) {
            p.loadVideoById({ videoId, startSeconds: seekStart });
        } else {
            p.loadVideoById(videoId);
        }
    } catch (_) {
        try {
            p.loadVideoById({ videoId, startSeconds: seekStart });
        } catch (err) {
            console.error('loadVideoById failed:', err);
            return false;
        }
    }

    state.currentVideoId = videoId;
    state.pendingVideoId = null;
    state.pendingStartSeconds = 0;
    const retries = gestureAutoplayActive() ? 12 : 5;
    schedulePlayRetries(retries);
    if (gestureAutoplayActive()) scheduleAutoplayBurst('load');
    ytLog('playVideoById: loadVideoById ok', getDockMetrics());
    return true;
}

if (typeof window !== 'undefined' && isYtDebugEnabled()) {
    window.mikromYtDebug = () => getYtDebugInfo();
    window.mikromYtWake = (reason) => wakePlayerLayout(reason || 'console');
    ytLog('Діагностика: mikromYtDebug() | mikromYtWake() | ?yt_debug=1');
}

// pause: ставить відтворення на паузу
export function pause() {
    state.userPaused = true;
    const p = getPlayer();
    if (p?.pauseVideo) p.pauseVideo();
}

// resume: продовжує відтворення — playVideo
export function resume() {
    state.userPaused = false;
    const p = getPlayer();
    if (!p) return;
    applyVolume();
    if (p.playVideo) p.playVideo();
}

// isUserPaused: чи користувач сам поставив на паузу
export function isUserPaused() {
    return state.userPaused;
}

// seekTo: перемотка на секунду — allowSeekAhead для YT API
export function seekTo(seconds, allowSeekAhead = true) {
    const p = getPlayer();
    if (p?.seekTo) p.seekTo(seconds, allowSeekAhead);
}

// stop: зупиняє відео — скидає current і intended id
export function stop() {
    state.userPaused = true;
    const p = getPlayer();
    if (p?.stopVideo) p.stopVideo();
    state.currentVideoId = null;
    state.intendedVideoId = null;
}

// readPlaybackSnapshot: час, тривалість і isPlaying — для UI-таймера
export function readPlaybackSnapshot() {
    const p = getPlayer();
    if (!p) return { currentTime: 0, duration: 0, isPlaying: false, state: -1 };

    const YT = getYT();
    let currentTime = 0;
    let duration = 0;
    let playerState = -1;

    try {
        if (typeof p.getCurrentTime === 'function') currentTime = p.getCurrentTime();
        if (typeof p.getDuration === 'function') duration = p.getDuration();
        if (typeof p.getPlayerState === 'function') playerState = p.getPlayerState();
    } catch (_) {
    }

    return {
        currentTime: Number.isFinite(currentTime) ? currentTime : 0,
        duration: Number.isFinite(duration) ? duration : 0,
        isPlaying: YT ? playerState === YT.PlayerState.PLAYING : false,
        state: playerState
    };
}
