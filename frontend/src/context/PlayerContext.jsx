import { createContext, useState, useEffect, useContext, useRef, useCallback, useMemo } from 'react';
import { useAuth } from './AuthContext';
import { useToast } from './ToastContext';
import { useLocale } from './LocaleContext';
import { pushGuestListening, guestSessionQueryParam } from '../utils/guestSession';
import { shortTitle, trackCountLabel } from '../utils/toastHelpers';
import { normalizeTrack, normalizeTrackList } from '../utils/track';
import { savePlaybackSession, loadPlaybackSession } from '../utils/playbackSession';
import * as yt from '../lib/youtubePlayer';
import { ytLog, stateLabel } from '../lib/youtubePlayerDebug';
import * as fb from '../lib/fallbackPlayer';

const PlayerContext = createContext(null);

// PlayerProvider: глобальний плеєр — черга, YouTube iframe, лайки, історія
export function PlayerProvider({ children }) {
    const [queue, setQueue] = useState([]);
    const [currentIndex, setCurrentIndex] = useState(-1);
    const [currentSong, setCurrentSong] = useState(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [isRepeating, setIsRepeating] = useState(false);
    const [isFullPlayerOpen, setIsFullPlayerOpen] = useState(false);
    const [isVideoMode, setIsVideoMode] = useState(false);

    const { user, setUser } = useAuth();
    const { showToast } = useToast();
    const { t } = useLocale();

    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [isPlayerReady, setIsPlayerReady] = useState(false);
    const [isQueueLoading, setIsQueueLoading] = useState(false);
    const [volumePercent, setVolumePercent] = useState(() => yt.getStoredVolumePercent());
    const [isMuted, setIsMuted] = useState(() => yt.getStoredVolumePercent() === 0);
    const [playbackMode, setPlaybackMode] = useState('yt');

    const queueRef = useRef([]);
    const currentIndexRef = useRef(-1);
    const isRepeatingRef = useRef(false);
    const volumePercentRef = useRef(yt.getStoredVolumePercent());
    const preMuteVolumeRef = useRef(volumePercentRef.current > 0 ? volumePercentRef.current : 50);
    const isMutedRef = useRef(volumePercentRef.current === 0);
    const playNextRef = useRef(() => {});
    const playSessionRef = useRef(0);
    const currentSongRef = useRef(null);
    const isPlayingRef = useRef(false);
    const pendingResumeRef = useRef(null);
    const playbackModeRef = useRef('yt');
    const fallbackFailureRef = useRef(new Set());
    const lastUserGestureAtRef = useRef(0);
    const playNextLockRef = useRef(false);
    const radioExpandPromiseRef = useRef(null);

    // abortPendingResumeAndStop: скасовує resume і зупиняє YT + fallback
    const abortPendingResumeAndStop = useCallback(() => {
        playSessionRef.current += 1;
        pendingResumeRef.current = null;
        try { fb.stop(); } catch (_) {}
        try { yt.stop(); } catch (_) {}
        setPlaybackMode('yt');
        playbackModeRef.current = 'yt';
    }, []);

    useEffect(() => { queueRef.current = queue; }, [queue]);
    useEffect(() => { currentSongRef.current = currentSong; }, [currentSong]);
    useEffect(() => { currentIndexRef.current = currentIndex; }, [currentIndex]);
    useEffect(() => { isRepeatingRef.current = isRepeating; }, [isRepeating]);
    useEffect(() => { isPlayingRef.current = isPlaying; }, [isPlaying]);
    useEffect(() => { playbackModeRef.current = playbackMode; }, [playbackMode]);

    // saveToHistory: зберігає прослуховування — API або guest localStorage
    const saveToHistory = (song) => {
        const normalized = normalizeTrack(song);
        if (!normalized?.youtubeId) return;
        if (!user) {
            pushGuestListening(normalized.youtubeId);
            return;
        }
        const payload = {
            youtubeId: normalized.youtubeId,
            title: normalized.title,
            author: normalized.author,
            image: normalized.image,
            duration: normalized.duration,
            channelId: normalized.channelId || undefined
        };
        fetch('/api/history', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ song: payload })
        }).catch((err) => console.error(err));
    };

    // toggleLike: перемикає лайк треку — POST /api/like
    const toggleLike = async (song, options = {}) => {
        const { silent = false } = options;
        if (!user) {
            showToast(t('toast.loginForLikes'), 'error');
            return;
        }

        try {
            const res = await fetch('/api/like', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    song: {
                        youtubeId: song.youtubeId,
                        title: song.title,
                        author: song.author,
                        image: song.image,
                        duration: song.duration,
                        channelId: song.channelId || undefined
                    }
                })
            });

            if (res.ok) {
                const data = await res.json();
                setUser({ ...user, likedSongs: data.likedSongs });
                if (!silent) {
                    const nowLiked = data.likedSongs?.includes(song.youtubeId);
                    showToast(
                        nowLiked
                            ? t('toast.likedAdd', { title: shortTitle(song.title) })
                            : t('toast.likedRemove', { title: shortTitle(song.title) }),
                        'success'
                    );
                }
            } else if (!silent) {
                showToast(t('toast.likesUpdateFail'), 'error');
            }
        } catch (err) {
            console.error('Помилка лайка:', err);
            if (!silent) showToast(t('common.connectionError'), 'error');
        }
    };

    // isLiked: чи трек у улюблених — за youtubeId
    const isLiked = useCallback((id) => user?.likedSongs?.includes(id) || false, [user?.likedSongs]);

    const getYtPlayer = useCallback(() => yt.getPlayer(), []);

    // readActiveSnapshot: час/стан з активного плеєра (YT або fallback)
    const readActiveSnapshot = useCallback(() => {
        if (playbackModeRef.current === 'fallback') return fb.readSnapshot();
        return yt.readPlaybackSnapshot();
    }, []);

    // pauseActive: пауза активного режиму відтворення
    const pauseActive = useCallback(() => {
        if (playbackModeRef.current === 'fallback') {
            fb.pause();
            return;
        }
        yt.pause();
    }, []);

    // resumeActive: resume активного режиму відтворення
    const resumeActive = useCallback(() => {
        if (playbackModeRef.current === 'fallback') {
            return fb.resume();
        }
        yt.resume();
        return Promise.resolve(true);
    }, []);

    // seekActiveTo: перемотка активного плеєра на секунду
    const seekActiveTo = useCallback((seconds) => {
        if (playbackModeRef.current === 'fallback') {
            fb.seekTo(seconds);
            return;
        }
        yt.seekTo(seconds, true);
    }, []);

    // ensureFallbackForCurrent: перемикає поточний трек на HTML5 /api/stream
    const ensureFallbackForCurrent = useCallback(async (reason = 'yt-error') => {
        const song = currentSongRef.current;
        if (!song?.youtubeId) return false;

        if (fallbackFailureRef.current.has(song.youtubeId)) return false;

        try {
            const pending = pendingResumeRef.current?.youtubeId === song.youtubeId
                ? pendingResumeRef.current
                : null;
            const snap = yt.readPlaybackSnapshot();
            const actual = yt.getActualVideoId();
            const intended = yt.getIntendedVideoId();
            const videoMatches =
                (!actual || actual === song.youtubeId) &&
                (!intended || intended === song.youtubeId);
            const at = pending
                ? Math.max(0, Number(pending.resumeAt) || 0)
                : videoMatches
                    ? Math.max(0, Number(snap.currentTime) || 0)
                    : 0;
            const gestureFresh = Date.now() - (lastUserGestureAtRef.current || 0) < 12000;
            const wantPlay = pending
                ? pending.wantPlay !== false
                : (isPlayingRef.current || gestureFresh);
            fb.stop();
            try { yt.pause(); } catch (_) {}
            if (!pending) {
                setCurrentTime(0);
                setDuration(0);
            }
            setPlaybackMode('fallback');
            playbackModeRef.current = 'fallback';
            setIsVideoMode(false);
            yt.setDisplayMode('hidden');
            fb.setVolume01((isMutedRef.current ? 0 : volumePercentRef.current) / 100);
            const ok = await fb.playVideoId(song.youtubeId, {
                startSeconds: at,
                wantPlay,
                order: 'WEB,ANDROID,MUSIC,TVHTML5'
            });
            if (pending) {
                pendingResumeRef.current = null;
                setCurrentTime(at);
            }
            setIsPlaying(Boolean(wantPlay && ok));
            if (wantPlay && !ok) {
                showToast(t('toast.autoplayBlocked'), 'info');
            }
            return Boolean(ok);
        } catch (e) {
            console.error(`[fallback] switch failed (${reason}):`, e);
            fallbackFailureRef.current.add(song.youtubeId);
            setPlaybackMode('yt');
            playbackModeRef.current = 'yt';
            setIsPlaying(false);
            showToast(t('toast.trackUnavailable'), 'error');
            return false;
        }
    }, [showToast]);

    // shouldAdvanceAfterEnd: чи можна викликати playNext після YT ENDED
    const shouldAdvanceAfterEnd = useCallback(() => {
        if (yt.isPlaybackGuardActive()) return false;
        if (pendingResumeRef.current) return false;

        const songId = currentSongRef.current?.youtubeId;
        if (!songId) return false;

        const actual = yt.getActualVideoId();
        const intended = yt.getIntendedVideoId();
        if (actual && actual !== songId) return false;
        if (intended && intended !== songId) return false;

        const snap = yt.readPlaybackSnapshot();
        if (snap.duration > 2 && snap.currentTime < snap.duration - 2) {
            return false;
        }
        return true;
    }, []);

    // applyPendingResume: застосовує збережену позицію після loadVideo
    const applyPendingResume = useCallback(() => {
        const pending = pendingResumeRef.current;
        if (!pending?.youtubeId) return false;
        if (playbackModeRef.current === 'fallback') return false;
        if (!yt.isPlayerReady()) return false;

        const actual = yt.getActualVideoId();
        const intended = yt.getIntendedVideoId();
        if (intended && intended !== pending.youtubeId) return false;
        if (actual && actual !== pending.youtubeId) return false;

        const snap = yt.readPlaybackSnapshot();

        if (snap.duration <= 0) {
            if (pending.wantPlay) {
                yt.resume();
                yt.playKick();
                setIsPlaying(true);
            }
            return false;
        }

        setDuration(snap.duration);

        let targetAt = pending.resumeAt;
        if (snap.duration > 2 && targetAt >= snap.duration - 1) {
            targetAt = Math.max(0, snap.duration - 5);
        }
        if (targetAt > 0 && snap.currentTime < targetAt - 1) {
            yt.seekTo(targetAt, true);
            setCurrentTime(targetAt);
        } else if (snap.currentTime > 0) {
            setCurrentTime(snap.currentTime);
        }

        if (pending.wantPlay) {
            yt.resume();
            if (!snap.isPlaying) {
                yt.playKick();
                yt.scheduleAutoplayBurst('pending-resume');
            }
            const after = yt.readPlaybackSnapshot();
            if (!after.isPlaying) return false;
            setIsPlaying(true);
        } else {
            yt.pause();
            setIsPlaying(false);
        }

        pendingResumeRef.current = null;
        return true;
    }, []);

    // loadTrack: завантажує трек у iframe — через playVideoById
    const loadTrack = useCallback((youtubeId, { force = false, startSeconds = 0 } = {}) => {
        if (!youtubeId) return false;
        let seekStart = Math.max(0, Number(startSeconds) || 0);
        const pending = pendingResumeRef.current;
        if (seekStart > 0 && pending?.youtubeId !== youtubeId) {
            seekStart = 0;
        }
        setPlaybackMode('yt');
        playbackModeRef.current = 'yt';
        fb.stop();
        fetch(`/api/stream/${encodeURIComponent(youtubeId)}?order=WEB,ANDROID,MUSIC,TVHTML5`, { credentials: 'include' })
            .catch(() => {});
        ytLog('PlayerContext.loadTrack', { youtubeId, force, startSeconds: seekStart, ready: yt.isPlayerReady() });
        yt.wakePlayerLayout('loadTrack');
        yt.setVolume(volumePercentRef.current);
        const result = yt.playVideoById(youtubeId, { force, startSeconds: seekStart });
        if (result === true || result === 'pending') {
            setIsPlaying(true);
            if (result === true) {
                window.setTimeout(() => yt.playKick(), 0);
            } else {
                ytLog('PlayerContext.loadTrack: очікуємо YT onReady (pending)');
            }
            return true;
        }
        ytLog('PlayerContext.loadTrack: помилка playVideoById', { result });
        return false;
    }, []);

    // fetchSmartRadio: догружає radio-чергу — GET /api/recommendations/radio
    const fetchSmartRadio = async (song) => {
        const sessionQ = guestSessionQueryParam(queueRef.current.length ? queueRef.current : [song]);
        const url = `/api/recommendations/radio?youtubeId=${song.youtubeId}&title=${encodeURIComponent(song.title || '')}&author=${encodeURIComponent(song.author || '')}${sessionQ}`;
        const res = await fetch(url, { credentials: 'include' });
        if (!res.ok) throw new Error('Radio API error');
        return res.json();
    };

    // mergeRadioTracksIntoQueue: додає radio-треки без зміни поточного індексу
    const mergeRadioTracksIntoQueue = useCallback((tracks, { session } = {}) => {
        if (session != null && session !== playSessionRef.current) return 0;

        const fresh = normalizeTrackList(tracks).filter((t) => t?.youtubeId);
        const seen = new Set();
        const merged = [];

        for (const t of queueRef.current) {
            const n = normalizeTrack(t);
            if (n?.youtubeId && !seen.has(n.youtubeId)) {
                seen.add(n.youtubeId);
                merged.push(n);
            }
        }

        let added = 0;
        for (const t of fresh) {
            if (!seen.has(t.youtubeId)) {
                seen.add(t.youtubeId);
                merged.push(t);
                added += 1;
            }
        }

        if (!added && merged.length === queueRef.current.length) return 0;

        const activeId = currentSongRef.current?.youtubeId;
        let newIndex = activeId
            ? merged.findIndex((t) => t.youtubeId === activeId)
            : currentIndexRef.current;
        if (newIndex < 0) {
            newIndex = Math.min(Math.max(0, currentIndexRef.current), merged.length - 1);
        }

        queueRef.current = merged;
        setQueue(merged);
        currentIndexRef.current = newIndex;
        setCurrentIndex(newIndex);
        return added;
    }, []);

    // expandQueueWithRadio: один запит radio на раз (playNext / playSong)
    const expandQueueWithRadio = useCallback(async (seedSong, { session } = {}) => {
        const seed = normalizeTrack(seedSong);
        if (!seed?.youtubeId) return 0;

        if (radioExpandPromiseRef.current) {
            return radioExpandPromiseRef.current;
        }

        const task = (async () => {
            try {
                const more = await fetchSmartRadio(seed);
                return mergeRadioTracksIntoQueue(more, { session });
            } catch (e) {
                console.error('Radio expand:', e);
                return 0;
            }
        })();

        radioExpandPromiseRef.current = task;
        try {
            return await task;
        } finally {
            if (radioExpandPromiseRef.current === task) {
                radioExpandPromiseRef.current = null;
            }
        }
    }, [mergeRadioTracksIntoQueue]);

    // appendRadioRecommendations: radio в кінець черги після плейлиста
    const appendRadioRecommendations = async (seedSong, { session } = {}) =>
        expandQueueWithRadio(seedSong, { session });

    // playSpecificIndex: грає трек за індексом у черзі — loadTrack і history
    const playSpecificIndex = useCallback((index, options = {}) => {
        if (index < 0 || index >= queueRef.current.length) return false;
        const song = normalizeTrack(queueRef.current[index]);
        if (!song?.youtubeId) return false;

        abortPendingResumeAndStop();

        const silent = options === true || options.silent === true;
        const startSeconds = Math.max(0, Number(options.startSeconds) || 0);
        const forceLoad = options.forceLoad === true;

        const prevYoutubeId = currentSongRef.current?.youtubeId;
        const trackChanged = prevYoutubeId !== song.youtubeId;

        currentIndexRef.current = index;
        setCurrentIndex(index);
        setCurrentSong(song);
        saveToHistory(song);

        const sameAsLoaded = yt.getLoadedVideoId() === song.youtubeId;
        if (trackChanged || !sameAsLoaded) {
            setCurrentTime(startSeconds > 0 ? startSeconds : 0);
            setDuration(0);
        } else if (startSeconds > 0) {
            setCurrentTime(startSeconds);
        }

        const force = forceLoad || !sameAsLoaded || startSeconds > 0;
        if (!loadTrack(song.youtubeId, { force, startSeconds })) {
            setIsPlaying(false);
            return false;
        }
        setIsPlaying(true);
        if (!silent) {
            showToast(t('toast.nowPlaying', { title: shortTitle(song.title) }), 'info');
        }
        return true;
    }, [loadTrack, showToast, abortPendingResumeAndStop]);

    // playNext: наступний трек — або розширення radio в кінці черги
    const playNext = useCallback(async () => {
        if (playNextLockRef.current) return;
        playNextLockRef.current = true;
        lastUserGestureAtRef.current = Date.now();

        try {
            const currentQueue = queueRef.current;
            const currIndex = currentIndexRef.current;
            if (currentQueue.length === 0) return;

            if (isRepeatingRef.current) {
                playSpecificIndex(currIndex, { silent: true });
                return;
            }

            if (currIndex < currentQueue.length - 1) {
                playSpecificIndex(currIndex + 1, { silent: true });
                if (currIndex + 1 >= currentQueue.length - 2) {
                    const seed =
                        normalizeTrack(currentQueue[currIndex + 1]) ||
                        normalizeTrack(currentQueue[currIndex]);
                    expandQueueWithRadio(seed).catch((e) => console.error('Prefetch radio:', e));
                }
                return;
            }

            const song = normalizeTrack(currentQueue[currIndex]);
            const added = await expandQueueWithRadio(song);
            const nextIdx = currentIndexRef.current + 1;
            if (added > 0 && nextIdx < queueRef.current.length) {
                playSpecificIndex(nextIdx, { silent: true });
            }
        } finally {
            playNextLockRef.current = false;
        }
    }, [playSpecificIndex, expandQueueWithRadio]);

    playNextRef.current = playNext;

    // playSong: стартує відтворення — оновлює чергу і викликає loadTrack
    const playSong = useCallback((song, playlistTracks = null, options = {}) => {
        const silent = options === true || options.silent === true;
        const normalized = normalizeTrack(song);
        if (!normalized?.youtubeId) {
            showToast(t('toast.invalidTrack'), 'error');
            return;
        }

        abortPendingResumeAndStop();
        const session = playSessionRef.current;

        setCurrentSong(normalized);
        setCurrentTime(0);
        setDuration(0);
        saveToHistory(normalized);

        if (!loadTrack(normalized.youtubeId, { force: true })) {
            setIsPlaying(false);
        }

        if (playlistTracks) {
            const queueList = normalizeTrackList(playlistTracks);
            queueRef.current = queueList;
            setQueue(queueList);
            const index = queueList.findIndex((t) => t.youtubeId === normalized.youtubeId);
            const newIndex = index !== -1 ? index : 0;
            currentIndexRef.current = newIndex;
            setCurrentIndex(newIndex);

            setIsQueueLoading(true);
            appendRadioRecommendations(normalized, { session })
                .catch((err) => console.error('Помилка догрузки рекомендацій:', err))
                .finally(() => setIsQueueLoading(false));
        } else {
            queueRef.current = [normalized];
            setQueue([normalized]);
            currentIndexRef.current = 0;
            setCurrentIndex(0);

            setIsQueueLoading(true);
            expandQueueWithRadio(normalized, { session })
                .catch((err) => console.error('Помилка побудови smart autoplay:', err))
                .finally(() => setIsQueueLoading(false));
        }

        if (!silent) {
            showToast(t('toast.nowPlaying', { title: shortTitle(normalized.title) }), 'info');
        }
    }, [loadTrack, showToast, abortPendingResumeAndStop]);

    // restorePlaybackSession: відновлює останню сесію з localStorage
    const restorePlaybackSession = useCallback(async ({ autoplay = true } = {}) => {
        const session = loadPlaybackSession(user?.id ?? null);
        if (!session?.song?.youtubeId) return false;

        const playSession = ++playSessionRef.current;

        fb.stop();
        setPlaybackMode('yt');
        playbackModeRef.current = 'yt';

        let queueList = normalizeTrackList(
            session.queue?.length ? session.queue : [session.song]
        );
        if (!queueList.length) {
            const single = normalizeTrack(session.song);
            if (!single) return false;
            queueList = [single];
        }

        const song = normalizeTrack(session.song);
        if (!song) return false;

        if (!queueList.some((t) => t.youtubeId === song.youtubeId)) {
            queueList = [song, ...queueList];
        }

        let index = queueList.findIndex((t) => t.youtubeId === song.youtubeId);
        if (index < 0) index = Math.min(Math.max(0, session.index ?? 0), queueList.length - 1);

        let resumeAt = Math.max(0, Number(session.currentTime) || 0);
        const songDuration = Number(song.duration) || 0;
        if (songDuration > 5 && resumeAt >= songDuration - 2) {
            resumeAt = Math.max(0, songDuration - 5);
        }
        const wantPlay = autoplay !== false;

        yt.armPlaybackGuard(6000);

        queueRef.current = queueList;
        setQueue(queueList);
        currentIndexRef.current = index;
        setCurrentIndex(index);
        setCurrentSong(song);
        setCurrentTime(resumeAt);
        saveToHistory(song);

        pendingResumeRef.current = { youtubeId: song.youtubeId, resumeAt, wantPlay };
        yt.armAutoplayFromGesture();

        const startPlayback = () => {
            if (!wantPlay) return false;
            yt.resume();
            return loadTrack(song.youtubeId, { force: true, startSeconds: resumeAt });
        };

        if (yt.isPlayerReady()) {
            setIsPlayerReady(true);
            startPlayback();
            yt.scheduleAutoplayBurst('restore-sync');
        }

        if (!yt.isPlayerReady()) {
            try {
                await yt.warmupPlayer();
                setIsPlayerReady(true);
            } catch (err) {
                console.error(err);
                pendingResumeRef.current = null;
                showToast(t('toast.playerStartFail'), 'error');
                return false;
            }

            if (!startPlayback()) {
                pendingResumeRef.current = null;
                showToast(t('toast.trackLoadFail'), 'error');
                return false;
            }
            yt.scheduleAutoplayBurst('restore-warmup');
        }

        setIsPlaying(wantPlay);
        yt.wakePlayerLayout('restore');

        let restored = false;
        const isRestoreTargetCurrent = () =>
            currentSongRef.current?.youtubeId === song.youtubeId;

        for (let attempt = 0; attempt < 60; attempt += 1) {
            if (playSession !== playSessionRef.current) return false;
            if (!isRestoreTargetCurrent()) return false;
            await new Promise((resolve) => window.setTimeout(resolve, 200));

            if (playSession !== playSessionRef.current) return false;
            if (!isRestoreTargetCurrent()) return false;

            yt.wakePlayerLayout('restore-retry');
            if (wantPlay) {
                yt.resume();
                yt.playKick();
            }

            if (applyPendingResume()) {
                const snap = yt.readPlaybackSnapshot();
                if (!wantPlay || snap.isPlaying) {
                    restored = true;
                    break;
                }
            }

            const actual = yt.getActualVideoId();
            const intended = yt.getIntendedVideoId();
            if (actual && actual !== song.youtubeId) continue;
            if (intended && intended !== song.youtubeId) continue;

            const snap = yt.readPlaybackSnapshot();
            if (snap.duration > 0) {
                setDuration(snap.duration);
                let targetAt = resumeAt;
                if (targetAt >= snap.duration - 1) {
                    targetAt = Math.max(0, snap.duration - 5);
                }
                if (targetAt > 0 && snap.currentTime < targetAt - 1) {
                    yt.seekTo(targetAt, true);
                    setCurrentTime(targetAt);
                } else {
                    setCurrentTime(snap.currentTime);
                }
                if (wantPlay && snap.isPlaying) {
                    setIsPlaying(true);
                    pendingResumeRef.current = null;
                    restored = true;
                    break;
                }
            }
        }

        yt.armPlaybackGuard(2500);

        if (!restored) {
            pendingResumeRef.current = null;
            showToast(t('toast.pressPlay'), 'info');
            return false;
        }

        const timeLabel =
            resumeAt > 0
                ? `${Math.floor(resumeAt / 60)}:${String(Math.floor(resumeAt % 60)).padStart(2, '0')}`
                : '';
        showToast(
            timeLabel
                ? t('toast.resumeFrom', { time: timeLabel })
                : t('toast.resumeTitle', { title: song.title }),
            'success'
        );
        return true;
    }, [user?.id, loadTrack, applyPendingResume, showToast]);

    // togglePlayPause: play/pause поточного треку — через yt API
    const togglePlayPause = useCallback(() => {
        if (!currentSong) return;
        if (isPlaying) {
            pauseActive();
            setIsPlaying(false);
        } else {
            lastUserGestureAtRef.current = Date.now();
            yt.armAutoplayFromGesture();
            if (playbackModeRef.current === 'yt' && !yt.isPlayerReady()) {
                loadTrack(currentSong.youtubeId, { force: false });
                return;
            }
            void resumeActive().then(async (ok) => {
                if (ok) {
                    setIsPlaying(true);
                    return;
                }
                if (playbackModeRef.current === 'fallback') {
                    const refreshed = await fb.refreshUrlAndResume({ order: 'WEB,ANDROID,MUSIC,TVHTML5' });
                    setIsPlaying(!!refreshed);
                    if (!refreshed) {
                        const dbg = typeof window !== 'undefined' && window.mikromFallbackDebug ? window.mikromFallbackDebug() : null;
                        console.warn('[fallback] play blocked/failed', dbg?.lastPlayError || dbg);
                        showToast(t('toast.playbackBlocked'), 'error');
                    }
                    return;
                }
                setIsPlaying(false);
            });
        }
    }, [currentSong, isPlaying, loadTrack, pauseActive, resumeActive]);

    // playPrev: попередній трек або seek на 0 — якщо currentTime > 3с
    const playPrev = useCallback(() => {
        if (currentTime > 3) {
            yt.seekTo(0);
            setCurrentTime(0);
            return;
        }
        const prevIdx = currentIndexRef.current - 1;
        if (prevIdx >= 0) playSpecificIndex(prevIdx);
    }, [currentTime, playSpecificIndex]);

    // seekTo: перемотка за часткою тривалості — 0..1
    const seekTo = useCallback((percent) => {
        const snap = readActiveSnapshot();
        const d = duration > 0 ? duration : snap.duration;
        if (d <= 0) return;
        const newTime = d * percent;
        seekActiveTo(newTime);
        setCurrentTime(newTime);
    }, [duration, readActiveSnapshot, seekActiveTo]);

    // seekBy: перемотка на N секунд — вперед або назад
    const seekBy = useCallback((deltaSeconds) => {
        const snap = readActiveSnapshot();
        const d = duration > 0 ? duration : snap.duration;
        const cur = currentTime > 0 ? currentTime : snap.currentTime;
        if (d <= 0 && cur <= 0 && deltaSeconds <= 0) return;
        const max = d > 0 ? d : cur + Math.abs(deltaSeconds);
        const newTime = Math.max(0, Math.min(max, cur + deltaSeconds));
        seekActiveTo(newTime);
        setCurrentTime(newTime);
    }, [currentTime, duration, readActiveSnapshot, seekActiveTo]);

    // setPlayerVolume: гучність плеєра — 0..1 → yt.setVolume + localStorage
    const setPlayerVolume = useCallback((percent) => {
        const vol = Math.max(0, Math.min(100, Math.round(percent * 100)));
        volumePercentRef.current = vol;
        yt.setVolume(vol);
        fb.setVolume01((isMutedRef.current ? 0 : vol) / 100);
        if (vol > 0) {
            preMuteVolumeRef.current = vol;
            isMutedRef.current = false;
            setIsMuted(false);
        } else {
            isMutedRef.current = true;
            setIsMuted(true);
        }
        setVolumePercent(vol);
    }, []);

    // adjustVolume: зміна гучності на крок — у відсотках 0..100
    const adjustVolume = useCallback((deltaPercent) => {
        let base = volumePercentRef.current;
        if (isMutedRef.current) {
            if (deltaPercent <= 0) return;
            base = preMuteVolumeRef.current > 0 ? preMuteVolumeRef.current : 50;
        }

        const next = Math.max(0, Math.min(100, base + deltaPercent));
        volumePercentRef.current = next;
        yt.setVolume(next);
        fb.setVolume01((isMutedRef.current ? 0 : next) / 100);
        setVolumePercent(next);

        if (next === 0) {
            if (!isMutedRef.current && base > 0) preMuteVolumeRef.current = base;
            isMutedRef.current = true;
            setIsMuted(true);
        } else {
            preMuteVolumeRef.current = next;
            isMutedRef.current = false;
            setIsMuted(false);
        }
    }, []);

    // toggleMute: вимкнути / увімкнути звук
    const toggleMute = useCallback(() => {
        if (isMutedRef.current) {
            const vol = preMuteVolumeRef.current > 0 ? preMuteVolumeRef.current : 50;
            volumePercentRef.current = vol;
            yt.setVolume(vol);
            fb.setVolume01(vol / 100);
            isMutedRef.current = false;
            setIsMuted(false);
            setVolumePercent(vol);
            return;
        }
        if (volumePercentRef.current > 0) preMuteVolumeRef.current = volumePercentRef.current;
        volumePercentRef.current = 0;
        yt.setVolume(0);
        fb.setVolume01(0);
        isMutedRef.current = true;
        setIsMuted(true);
        setVolumePercent(0);
    }, []);

    useEffect(() => {
        yt.setVolume(volumePercentRef.current);
        fb.setVolume01((isMutedRef.current ? 0 : volumePercentRef.current) / 100);
    }, []);

    // persistPlaybackSession: зберігає чергу/час у localStorage
    const persistPlaybackSession = useCallback(() => {
        const songFromState = normalizeTrack(currentSongRef.current);
        if (!songFromState?.youtubeId) return;

        const activeId =
            yt.getActualVideoId() ||
            yt.getIntendedVideoId() ||
            songFromState.youtubeId;

        let activeSong = songFromState;
        if (activeId !== songFromState.youtubeId) {
            const fromQueue = queueRef.current.find((t) => t.youtubeId === activeId);
            if (fromQueue) activeSong = normalizeTrack(fromQueue) || activeSong;
        }

        let index = queueRef.current.findIndex((t) => t.youtubeId === activeSong.youtubeId);
        if (index < 0) index = Math.max(0, currentIndexRef.current);

        const snap = playbackModeRef.current === 'fallback'
            ? fb.readSnapshot()
            : (yt.isPlayerReady() ? yt.readPlaybackSnapshot() : null);
        const savedTime =
            snap && snap.currentTime >= 0 ? snap.currentTime : currentTime;

        savePlaybackSession({
            userId: user?.id ?? null,
            song: activeSong,
            queue: queueRef.current,
            index,
            currentTime: savedTime,
            isPlaying: snap ? snap.isPlaying : isPlayingRef.current
        });
    }, [currentTime, user?.id]);

    useEffect(() => {
        if (!currentSong?.youtubeId) return undefined;

        const timer = window.setTimeout(persistPlaybackSession, 400);

        const interval = window.setInterval(persistPlaybackSession, 2500);
        const onUnload = () => persistPlaybackSession();
        window.addEventListener('beforeunload', onUnload);
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'hidden') persistPlaybackSession();
        });

        return () => {
            window.clearTimeout(timer);
            window.clearInterval(interval);
            window.removeEventListener('beforeunload', onUnload);
        };
    }, [currentSong?.youtubeId, currentTime, isPlaying, persistPlaybackSession]);

    // toggleRepeat: повтор поточного треку — перемикає isRepeating
    const toggleRepeat = useCallback(() => {
        setIsRepeating((prev) => {
            showToast(prev ? t('toast.repeatOff') : t('toast.repeatOn'), 'info');
            return !prev;
        });
    }, [showToast]);

    // toggleFullPlayer: відкриває/закриває повноекранний плеєр
    const toggleFullPlayer = useCallback(() => setIsFullPlayerOpen((v) => !v), []);
    // closeFullPlayer: закриває повноекранний плеєр
    const closeFullPlayer = useCallback(() => setIsFullPlayerOpen(false), []);
    // toggleVideoMode: перемикає відео-режим (лише для YT embed)
    const toggleVideoMode = useCallback(() => setIsVideoMode((v) => !v), []);

    // shuffleQueue: перемішує чергу — поточний трек лишається першим
    const shuffleQueue = useCallback((options = {}) => {
        const { silent = false } = options;
        if (queueRef.current.length <= 1) {
            if (!silent) showToast(t('toast.shuffleNeedMore'), 'warning');
            return;
        }
        const current = queueRef.current[currentIndexRef.current];
        const rest = queueRef.current.filter((_, i) => i !== currentIndexRef.current);
        for (let i = rest.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [rest[i], rest[j]] = [rest[j], rest[i]];
        }
        const newQueue = [current, ...rest];
        queueRef.current = newQueue;
        setQueue(newQueue);
        currentIndexRef.current = 0;
        setCurrentIndex(0);
        if (!silent) showToast(t('toast.shuffled'), 'success');
    }, [showToast]);

    // queueHasTrack: чи youtubeId уже в черзі
    const queueHasTrack = (youtubeId) =>
        queueRef.current.some((q) => normalizeTrack(q)?.youtubeId === youtubeId);

    // reorderQueue: drag-and-drop порядку — оновлює currentIndex
    const reorderQueue = useCallback((fromIndex, toIndex) => {
        const q = [...queueRef.current];
        if (
            fromIndex === toIndex
            || fromIndex < 0
            || toIndex < 0
            || fromIndex >= q.length
            || toIndex >= q.length
        ) {
            return;
        }
        const [moved] = q.splice(fromIndex, 1);
        q.splice(toIndex, 0, moved);

        let ci = currentIndexRef.current;
        if (fromIndex === ci) ci = toIndex;
        else if (fromIndex < ci && toIndex >= ci) ci -= 1;
        else if (fromIndex > ci && toIndex <= ci) ci += 1;

        queueRef.current = q;
        setQueue(q);
        currentIndexRef.current = ci;
        setCurrentIndex(ci);
    }, []);

    // removeFromQueue: видаляє трек з черги — з переходом на наступний
    const removeFromQueue = useCallback((index) => {
        const q = [...queueRef.current];
        if (index < 0 || index >= q.length) return;

        q.splice(index, 1);
        let ci = currentIndexRef.current;

        if (index < ci) {
            ci -= 1;
        } else if (index === ci) {
            if (q.length === 0) {
                setQueue([]);
                setCurrentIndex(-1);
                setCurrentSong(null);
                setIsPlaying(false);
                currentIndexRef.current = -1;
                queueRef.current = [];
                yt.stop();
                fb.stop();
                setPlaybackMode('yt');
                playbackModeRef.current = 'yt';
                return;
            }
            ci = Math.min(index, q.length - 1);
            queueRef.current = q;
            setQueue(q);
            playSpecificIndex(ci, { silent: true });
            return;
        }

        queueRef.current = q;
        setQueue(q);
        currentIndexRef.current = ci;
        setCurrentIndex(ci);
    }, [playSpecificIndex]);

    // addToQueueEnd: додає трек у кінець черги — або стартує якщо порожня
    const addToQueueEnd = useCallback((song, options = {}) => {
        const silent = options === true || options.silent;
        const normalized = normalizeTrack(song);
        if (!normalized?.youtubeId) return { added: 0, skipped: 0 };

        if (queueRef.current.length === 0) {
            playSong(normalized, null, { silent: true });
            if (!silent) showToast(t('toast.nowPlaying', { title: shortTitle(normalized.title) }), 'info');
            return { added: 1, skipped: 0 };
        }

        if (queueHasTrack(normalized.youtubeId)) {
            if (!silent) showToast(t('toast.alreadyInQueue'), 'info');
            return { added: 0, skipped: 1 };
        }

        const newQueue = [...queueRef.current, normalized];
        queueRef.current = newQueue;
        setQueue(newQueue);
        if (!silent) showToast(t('toast.addedToQueueEnd', { title: shortTitle(normalized.title) }), 'success');
        return { added: 1, skipped: 0 };
    }, [playSong, showToast, t]);

    // addTracksToQueueEnd: пакетне додавання в кінець — з одним toast
    const addTracksToQueueEnd = useCallback((songs = []) => {
        let added = 0;
        let skipped = 0;
        for (const song of normalizeTrackList(songs)) {
            const r = addToQueueEnd(song, { silent: true });
            added += r.added;
            skipped += r.skipped;
        }
        if (added > 0) {
            showToast(t('toast.addedToQueue', { count: trackCountLabel(added, t) }), 'success');
        } else if (skipped > 0) {
            showToast(t('toast.allInQueue'), 'info');
        }
        return { added, skipped };
    }, [addToQueueEnd, showToast]);

    // playNextInQueue: вставляє трек після поточного — у черзі
    const playNextInQueue = useCallback((song, options = {}) => {
        const silent = options === true || options.silent;
        const normalized = normalizeTrack(song);
        if (!normalized?.youtubeId) return;

        if (queueRef.current.length === 0) {
            playSong(normalized, null, { silent: true });
            if (!silent) showToast(t('toast.nowPlaying', { title: shortTitle(normalized.title) }), 'info');
            return;
        }

        const filteredQueue = queueRef.current.filter(
            (q) => normalizeTrack(q)?.youtubeId !== normalized.youtubeId
        );
        const newQueue = [
            ...filteredQueue.slice(0, currentIndexRef.current + 1),
            normalized,
            ...filteredQueue.slice(currentIndexRef.current + 1)
        ];
        queueRef.current = newQueue;
        setQueue(newQueue);
        if (!silent) showToast(t('toast.playNext', { title: shortTitle(normalized.title) }), 'success');
    }, [playSong, showToast, t]);

    // playTracksNextInQueue: кілька треків «наступними» — reverse + playNextInQueue
    const playTracksNextInQueue = useCallback((songs = []) => {
        const list = [...songs].reverse();
        list.forEach((s) => playNextInQueue(s, { silent: true }));
        if (list.length) showToast(t('toast.playNextMany', { count: trackCountLabel(list.length, t) }), 'success');
    }, [playNextInQueue, showToast]);

    useEffect(() => {
        yt.warmupPlayer()
            .then(() => setIsPlayerReady(true))
            .catch(console.error);

        const unsubReady = yt.onYtReady(() => setIsPlayerReady(true));

        return () => {
            unsubReady();
        };
    }, []);

    useEffect(() => {
        const unsubEnded = fb.onFallbackEnded(() => {
            if (!currentSongRef.current?.youtubeId) return;
            if (isRepeatingRef.current) {
                fb.seekTo(0);
                void fb.resume();
                setIsPlaying(true);
            } else {
                playNextRef.current();
            }
        });

        const unsubErr = fb.onFallbackError(() => {
            if (!currentSongRef.current?.youtubeId) return;
            if (playbackModeRef.current !== 'fallback') return;
            void fb.refreshUrlAndResume({ order: 'WEB,ANDROID,MUSIC,TVHTML5' }).then((ok) => {
                if (!ok) {
                    fallbackFailureRef.current.add(currentSongRef.current.youtubeId);
                    setIsPlaying(false);
                    showToast(t('toast.trackUnavailable'), 'error');
                }
            });
        });

        return () => {
            unsubEnded();
            unsubErr();
        };
    }, [showToast]);

    useEffect(() => {
        if (!currentSong?.youtubeId) return undefined;
        let tries = 0;
        const kick = setInterval(() => {
            if (playbackModeRef.current === 'fallback') {
                clearInterval(kick);
                return;
            }
            tries += 1;
            if (!yt.isPlayerReady()) return;
            yt.ensurePlayerSized();
            const snap = yt.readPlaybackSnapshot();
            if (!snap.isPlaying && isPlayingRef.current && !yt.isUserPaused()) {
                ytLog(`kick interval #${tries}`, { state: stateLabel(snap.state), isPlaying: snap.isPlaying });
                yt.playKick();
            }
            if (snap.isPlaying || tries >= 15) clearInterval(kick);
        }, 250);
        return () => clearInterval(kick);
    }, [currentSong?.youtubeId, isPlayerReady]);

    useEffect(() => {
        if (!isPlayerReady || !currentSong?.youtubeId) return undefined;
        if (playbackModeRef.current === 'fallback') return undefined;
        const actual = yt.getActualVideoId();
        const intended = yt.getIntendedVideoId();
        if (actual && intended === currentSong.youtubeId && actual !== currentSong.youtubeId) {
            loadTrack(currentSong.youtubeId, { force: true });
        }
        return undefined;
    }, [isPlayerReady, currentSong?.youtubeId, loadTrack]);

    useEffect(() => {
        if (!isPlayerReady) return undefined;

        const unsubState = yt.onYtStateChange((event) => {
            const YT = window.YT;
            const player = yt.getPlayer();
            if (!player || !YT) return;
            if (playbackModeRef.current === 'fallback') return;

            if (event.data === YT.PlayerState.PLAYING) {
                yt.setVolume(isMutedRef.current ? 0 : volumePercentRef.current);
                setIsPlaying(true);
                const snap = yt.readPlaybackSnapshot();
                if (snap.duration > 0) setDuration(snap.duration);
                applyPendingResume();
            } else if (event.data === YT.PlayerState.CUED) {
                if (yt.isUserPaused()) return;
                const actual = yt.getActualVideoId();
                const intended = yt.getIntendedVideoId();
                if (intended && actual === intended && typeof player.playVideo === 'function') {
                    yt.setVolume(volumePercentRef.current);
                    player.playVideo();
                }
                applyPendingResume();
            } else if (event.data === YT.PlayerState.PAUSED) {
                setIsPlaying(false);
            } else if (event.data === YT.PlayerState.ENDED) {
                if (!shouldAdvanceAfterEnd()) return;
                if (isRepeatingRef.current) {
                    yt.seekTo(0);
                    yt.resume();
                } else {
                    playNextRef.current();
                }
            }
        });

        const unsubErr = yt.onYtError((e) => {
            const code = Number(e?.data);
            const isPlaybackBlocked =
                code === 101 ||
                code === 150 ||
                code === 100 ||
                code === 5 ||
                code === 2;

            if (!isPlaybackBlocked && (yt.isPlaybackGuardActive() || pendingResumeRef.current)) return;

            if (isPlaybackBlocked) {
                ytLog(`YT error ${code} → fallback`, { videoId: currentSongRef.current?.youtubeId });
                if (currentSongRef.current?.youtubeId) {
                    void ensureFallbackForCurrent(`yt-error:${code}`);
                }
                return;
            }

            console.warn('YouTube Player Error:', e?.data);
            void ensureFallbackForCurrent(`yt-error:${code || 'unknown'}`);
        });

        const tick = setInterval(() => {
            const songId = currentSongRef.current?.youtubeId;
            if (!songId) return;

            const snap = readActiveSnapshot();
            if (playbackModeRef.current === 'fallback') {
                if (fb.isSwitching()) return;
                if (snap.videoId && snap.videoId !== songId) return;
            } else {
                const actual = yt.getActualVideoId();
                const intended = yt.getIntendedVideoId();
                if (actual) {
                    if (actual !== songId) return;
                } else if (intended) {
                    if (intended !== songId) return;
                    return;
                }
            }

            if (snap.currentTime >= 0) setCurrentTime(snap.currentTime);
            if (snap.duration > 0) setDuration(snap.duration);
            setIsPlaying(snap.isPlaying);
        }, 400);

        return () => {
            unsubState();
            unsubErr();
            clearInterval(tick);
        };
    }, [isPlayerReady, currentSong?.youtubeId, applyPendingResume, shouldAdvanceAfterEnd, ensureFallbackForCurrent, readActiveSnapshot]);

    const value = useMemo(() => ({
        queue,
        currentIndex,
        currentSong,
        isPlaying,
        isRepeating,
        isFullPlayerOpen,
        isVideoMode,
        currentTime,
        duration,
        isPlayerReady,
        isQueueLoading,
        playbackMode,
        playSong,
        togglePlayPause,
        playNext,
        playPrev,
        seekTo,
        seekBy,
        volumePercent,
        isMuted,
        setPlayerVolume,
        adjustVolume,
        toggleMute,
        restorePlaybackSession,
        toggleRepeat,
        toggleFullPlayer,
        closeFullPlayer,
        toggleVideoMode,
        setIsVideoMode,
        shuffleQueue,
        addToQueueEnd,
        addTracksToQueueEnd,
        playNextInQueue,
        playTracksNextInQueue,
        reorderQueue,
        removeFromQueue,
        playSpecificIndex,
        toggleLike,
        isLiked,
        getYtPlayer
    }), [
        queue,
        currentIndex,
        currentSong,
        isPlaying,
        isRepeating,
        isFullPlayerOpen,
        isVideoMode,
        currentTime,
        duration,
        isPlayerReady,
        isQueueLoading,
        playbackMode,
        playSong,
        togglePlayPause,
        playNext,
        playPrev,
        seekTo,
        seekBy,
        volumePercent,
        isMuted,
        setPlayerVolume,
        adjustVolume,
        toggleMute,
        restorePlaybackSession,
        toggleRepeat,
        toggleFullPlayer,
        closeFullPlayer,
        toggleVideoMode,
        shuffleQueue,
        addToQueueEnd,
        addTracksToQueueEnd,
        playNextInQueue,
        playTracksNextInQueue,
        reorderQueue,
        removeFromQueue,
        playSpecificIndex,
        toggleLike,
        isLiked,
        getYtPlayer
    ]);

    return (
        <PlayerContext.Provider value={value}>
            {children}
        </PlayerContext.Provider>
    );
}

// usePlayer: хук доступу до PlayerContext
export const usePlayer = () => {
    const ctx = useContext(PlayerContext);
    if (!ctx) throw new Error('usePlayer must be used within PlayerProvider');
    return ctx;
};
