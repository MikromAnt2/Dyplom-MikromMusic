const SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const STORAGE_PREFIX = 'mikrom-playback';

// storageKey: ключ localStorage для сесії відтворення (guest або user)
function storageKey(userId) {
    return userId ? `${STORAGE_PREFIX}-${userId}` : `${STORAGE_PREFIX}-guest`;
}

// savePlaybackSession: зберігає чергу та позицію для «Продовжити слухати»
export function savePlaybackSession({ userId, song, queue, index, currentTime, isPlaying }) {
    if (!song?.youtubeId) return;
    try {
        const payload = {
            song: {
                youtubeId: song.youtubeId,
                title: song.title,
                author: song.author,
                image: song.image,
                duration: song.duration,
                channelId: song.channelId || ''
            },
            queue: (queue || [])
                .slice(0, 80)
                .map((t) => ({
                    youtubeId: t.youtubeId,
                    title: t.title,
                    author: t.author,
                    image: t.image,
                    duration: t.duration,
                    channelId: t.channelId || ''
                }))
                .filter((t) => t.youtubeId),
            index: typeof index === 'number' ? index : 0,
            currentTime: Math.max(0, Number(currentTime) || 0),
            isPlaying: Boolean(isPlaying),
            savedAt: Date.now()
        };
        localStorage.setItem(storageKey(userId), JSON.stringify(payload));
    } catch (_) {}
}

// loadPlaybackSession: читає збережену сесію — null якщо прострочена
export function loadPlaybackSession(userId) {
    try {
        const raw = localStorage.getItem(storageKey(userId));
        if (!raw) return null;
        const data = JSON.parse(raw);
        if (!data?.song?.youtubeId || !data.savedAt) return null;
        if (Date.now() - data.savedAt > SESSION_MAX_AGE_MS) {
            localStorage.removeItem(storageKey(userId));
            return null;
        }
        return data;
    } catch (_) {
        return null;
    }
}

// clearPlaybackSession: видаляє збережену сесію
export function clearPlaybackSession(userId) {
    try {
        localStorage.removeItem(storageKey(userId));
    } catch (_) {}
}

// formatResumeTime: форматує секунди для підпису кнопки
export function formatResumeTime(seconds) {
    const s = Math.floor(Number(seconds) || 0);
    if (s <= 0) return '';
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec < 10 ? '0' : ''}${sec}`;
}
