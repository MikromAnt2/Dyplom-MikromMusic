import { fallbackImg, formatArtistDisplay, decodeHtmlEntities } from './media';

const INVALID_AUTHOR_RE = /^(unknown|невідомий(\s+виконавець)?|youtube|artist|topic)$/i;

const YT_THUMB = {
    sm: 'hqdefault',
    md: 'hqdefault',
    lg: 'sddefault',
    xl: 'maxresdefault'
};

const YT_COVER_CHAINS = {
    xl: ['maxresdefault', 'sddefault', 'hqdefault', 'mqdefault'],
    lg: ['sddefault', 'hqdefault', 'mqdefault'],
    md: ['hqdefault', 'sddefault', 'mqdefault'],
    sm: ['hqdefault', 'mqdefault']
};

export const YT_COVER_CHAIN = YT_COVER_CHAINS.lg;

// coverTierFromSize: tier обкладинки (sm/md/lg/xl) за розміром UI
function coverTierFromSize(size) {
    const n = Number(size) || 0;
    if (n >= 640) return 'xl';
    if (n >= 200) return 'lg';
    if (n >= 96) return 'md';
    return 'sm';
}

// youtubeThumbUrl: обкладинка YouTube — hq/sd/maxres залежно від tier
export function youtubeThumbUrl(youtubeId, quality = 'md') {
    const id = String(youtubeId || '').trim();
    if (!id) return '';
    const file = YT_THUMB[quality] || YT_THUMB.md;
    return `https://i.ytimg.com/vi/${id}/${file}.jpg`;
}

// upgradeYoutubeImageUrl: підвищує якість ytimg у наявному URL
export function upgradeYoutubeImageUrl(url, quality = 'md') {
    if (!url || typeof url !== 'string') return url;
    const file = YT_THUMB[quality] || YT_THUMB.md;
    const m = url.match(/i\.ytimg\.com\/vi\/([\w-]{11})\/(mq|hq|sd|maxres)default\.jpg/i);
    if (m) return `https://i.ytimg.com/vi/${m[1]}/${file}.jpg`;
    return upgradeGoogleThumbUrl(url);
}

// upgradeGoogleThumbUrl: підвищує googleusercontent / ggphth превʼю
export function upgradeGoogleThumbUrl(url) {
    if (!url || typeof url !== 'string') return '';
    let u = url.trim();
    if (u.startsWith('//')) u = `https:${u}`;
    if (u.includes('googleusercontent.com') || u.includes('ggpht.com')) {
        const base = u.split('=')[0];
        return `${base}=w1200-h630-l90-rj`;
    }
    return u;
}

// isTinyGoogleThumb: чи googleusercontent превʼю занадто мале
function isTinyGoogleThumb(url) {
    if (!url || typeof url !== 'string') return false;
    const m = url.match(/=s(\d+)/);
    return m && parseInt(m[1], 10) < 200;
}

// trackCoverCandidates: URL-и обкладинки від кращого до гіршого
export function trackCoverCandidates(youtubeId, externalUrl = '', tier = 'lg') {
    const urls = [];
    const seen = new Set();
    const add = (u) => {
        const n = String(u || '').trim();
        if (!n || seen.has(n) || n.includes('ui-avatars.com')) return;
        seen.add(n);
        urls.push(n);
    };

    const chainKey = YT_COVER_CHAINS[tier] ? tier : 'lg';
    const upgradeQ = chainKey === 'xl' ? 'xl' : chainKey === 'sm' ? 'sm' : 'lg';

    const ext = String(externalUrl || '').trim();
    if (ext) {
        if (ext.includes('googleusercontent.com') || ext.includes('ggpht.com')) {
            if (!isTinyGoogleThumb(ext)) add(upgradeGoogleThumbUrl(ext));
        } else if (ext.includes('i.ytimg.com/vi/')) {
            add(upgradeYoutubeImageUrl(ext, upgradeQ));
        } else if (!ext.includes('ui-avatars.com')) {
            add(ext);
        }
    }

    const id = String(youtubeId || '').trim();
    if (id) {
        for (const file of YT_COVER_CHAINS[chainKey]) {
            add(`https://i.ytimg.com/vi/${id}/${file}.jpg`);
        }
    }
    return urls;
}

// resolveTrackImage: найкращий URL обкладинки для треку
export function resolveTrackImage(raw, youtubeId, quality = 'lg') {
    const id = String(youtubeId || '').trim();
    const fromYt = id ? youtubeThumbUrl(id, quality) : '';
    const rawUrl = String(raw?.image || raw?.thumbnail || '').trim();

    if (!rawUrl || rawUrl.includes('ui-avatars.com')) return fromYt;
    if (rawUrl.includes('i.ytimg.com/vi/')) {
        return upgradeYoutubeImageUrl(rawUrl, quality) || fromYt;
    }
    if ((rawUrl.includes('googleusercontent.com') || rawUrl.includes('ggpht.com')) && !isTinyGoogleThumb(rawUrl)) {
        return upgradeGoogleThumbUrl(rawUrl) || fromYt;
    }
    return fromYt;
}

// advanceCoverImage: наступний URL після onError / низької роздільності
export function advanceCoverImage(imgEl, youtubeId, externalUrl = '', title = 'Music', tier = 'lg') {
    if (!imgEl) return false;
    const candidates = trackCoverCandidates(youtubeId, externalUrl, tier);
    let step = Number(imgEl.dataset.coverStep || 0) + 1;
    if (step < candidates.length) {
        imgEl.dataset.coverStep = String(step);
        imgEl.src = candidates[step];
        return true;
    }
    imgEl.onerror = null;
    imgEl.src = fallbackImg(title, 512);
    return false;
}

// onCoverLoadCheck: maxres/битий thumb часто 120×90 — перемикаємо на hq/sd
export function onCoverLoadCheck(imgEl, youtubeId, externalUrl = '', title = 'Music', tier = 'lg') {
    if (!imgEl?.naturalWidth) return;
    const w = imgEl.naturalWidth;
    const h = imgEl.naturalHeight || 0;
    const greyYtPlaceholder = w <= 160 && h <= 120;
    const tooSmall = w < 200;
    if (greyYtPlaceholder || tooSmall) {
        advanceCoverImage(imgEl, youtubeId, externalUrl, title, tier);
    }
}

// isPlayableTrack: чи можна відтворити трек — валідний youtubeId і автор
export function isPlayableTrack(raw) {
    if (!raw) return false;
    const youtubeId = raw.youtubeId || raw.videoId || raw.id;
    if (!youtubeId || typeof youtubeId !== 'string') return false;
    if (!/^[\w-]{11}$/.test(String(youtubeId).trim())) return false;
    const author = String(raw.author || raw.artist || raw.channel || '').trim();
    if (!author || INVALID_AUTHOR_RE.test(author)) return false;
    return true;
}

// normalizeTrack: єдиний формат треку — для плеєра, карток і меню
export function normalizeTrack(raw) {
    if (!raw) return null;
    const youtubeId = raw.youtubeId || raw.videoId || raw.id;
    if (!youtubeId || typeof youtubeId !== 'string') return null;

    const title = decodeHtmlEntities(String(raw.title || raw.name || '')).trim();
    const authorRaw = String(raw.author || raw.artist || raw.channel || '').trim();
    const author = formatArtistDisplay(authorRaw);
    if (!isPlayableTrack({ youtubeId, author: authorRaw })) return null;

    return {
        ...raw,
        youtubeId: String(youtubeId).trim(),
        title: title || 'Без назви',
        author,
        authorDisplay: author,
        image: resolveTrackImage(raw, youtubeId, 'lg'),
        imageFallback: youtubeThumbUrl(youtubeId, 'md'),
        duration: Number(raw.duration) || 0,
        channelId: raw.channelId || raw.channel_id || ''
    };
}

// normalizeTrackList: нормалізує масив треків — map normalizeTrack
export function normalizeTrackList(list) {
    if (!Array.isArray(list)) return [];
    return list.map(normalizeTrack).filter(Boolean);
}

// trackCoverSrc: URL обкладинки треку — з fallback ui-avatars; size керує якістю
export function trackCoverSrc(track, fallbackTitle = 'Music', size = 300) {
    const t = normalizeTrack(track);
    if (!t) return fallbackImg(fallbackTitle, size);
    const tier = coverTierFromSize(size);
    const candidates = trackCoverCandidates(t.youtubeId, t.image, tier);
    if (candidates.length) return candidates[0];
    return fallbackImg(t.title || fallbackTitle, size);
}
