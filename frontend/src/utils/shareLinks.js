const YT_ID_RE = /^[\w-]{11}$/;

// getShareOrigin: публічний origin (VITE_PUBLIC_URL або window.location)
export function getShareOrigin() {
    const fromEnv = import.meta.env.VITE_PUBLIC_URL;
    if (fromEnv && typeof fromEnv === 'string') {
        return fromEnv.replace(/\/$/, '');
    }
    if (typeof window !== 'undefined' && window.location?.origin) {
        return window.location.origin;
    }
    return '';
}

// isValidYoutubeId: перевірка формату YouTube video id
export function isValidYoutubeId(id) {
    return YT_ID_RE.test(String(id || '').trim());
}

// buildTrackShareUrl: посилання ?track=VIDEO_ID
export function buildTrackShareUrl(youtubeId) {
    const id = String(youtubeId || '').trim();
    if (!isValidYoutubeId(id)) return getShareOrigin() || '/';
    const origin = getShareOrigin();
    return `${origin}/?track=${encodeURIComponent(id)}`;
}

// buildPlaylistShareUrl: посилання /playlist/ID
export function buildPlaylistShareUrl(playlistId) {
    const id = String(playlistId || '').trim();
    if (!id) return getShareOrigin() || '/';
    const origin = getShareOrigin();
    return `${origin}/playlist/${encodeURIComponent(id)}`;
}

// isValidChannelId: перевірка YouTube channel id (UC…)
function isValidChannelId(id) {
    return /^UC[\w-]{10,}$/i.test(String(id || '').trim());
}

// buildAuthorShareUrl: посилання /artist/CHANNEL_ID
export function buildAuthorShareUrl(channelId) {
    const id = String(channelId || '').trim();
    if (!isValidChannelId(id)) return getShareOrigin() || '/';
    const origin = getShareOrigin();
    return `${origin}/artist/${encodeURIComponent(id)}`;
}

// copyTextToClipboard: копіювання тексту в буфер обміну
export async function copyTextToClipboard(text) {
    if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
    }
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;left:-9999px;top:0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
}

// shareUrl: Web Share API або копіювання — 'shared'|'copied'|'failed'|'cancelled'
export async function shareUrl({ url, title = 'Mikrom', text = '' }) {
    if (!url) return 'failed';

    if (navigator.share) {
        try {
            await navigator.share({ title, text: text || title, url });
            return 'shared';
        } catch (err) {
            if (err?.name === 'AbortError') return 'cancelled';
        }
    }

    try {
        const ok = await copyTextToClipboard(url);
        return ok ? 'copied' : 'failed';
    } catch (_) {
        return 'failed';
    }
}
