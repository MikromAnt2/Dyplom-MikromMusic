const express = require('express');
const router = express.Router();
const { User, Artist } = require('../models/pg');
const { Innertube } = require('youtubei.js');
const { fetchFromYouTube } = require('./search');
const { createPersistentCache } = require('../utils/persistentCache');
const { CACHE_TTL_DAYS } = require('../config/cacheTtl');

const ytClientPromise = Innertube.create().then(yt => {
    console.log(`YouTube InnerTube Ready (кеш API: ${CACHE_TTL_DAYS} дн.)`);
    return yt;
}).catch(err => {
    console.error("Innertube помилка :", err);
    return null;
});

const { get: cacheGet, set: cacheSet } = createPersistentCache('channelCache.json');

const {
    isUcArtistId,
    pickUcArtistId,
    extractUcFromArtistItem,
    cleanArtistName
} = require('../utils/artistChannel');

// resolveArtistChannelId: знаходить UC channelId артиста — через API або music.search
async function resolveArtistChannelId(ytClient, inputId, nameHint = '') {
    const rawId = (inputId || '').trim();
    const hintName = cleanArtistName(nameHint);
    let channelId = pickUcArtistId(rawId);
    let name = hintName;

    if (channelId && ytClient) {
        try {
            const channel = await ytClient.getChannel(channelId);
            name = cleanArtistName(getText(channel.metadata?.title)) || hintName || name;
            return { channelId, name: name || hintName || 'Артист' };
        } catch (_) {
            if (hintName && hintName !== 'Артист' && hintName !== 'Unknown') {
                return { channelId, name: hintName };
            }
        }
    }

    const searchName = hintName && hintName !== 'Артист' && hintName !== 'Unknown' ? hintName : null;
    if (!searchName || !ytClient?.music) {
        return { channelId, name: hintName || 'Артист' };
    }

    try {
        const searchRes = await ytClient.music.search(searchName, { type: 'artist' });
        const items = extractItems(searchRes.artists || searchRes.contents);
        if (!items.length) return { channelId, name: searchName };

        const exact = items.find((i) => getText(i.name || i.title).toLowerCase() === searchName.toLowerCase());
        const found = exact || items[0];
        const resolvedId = extractUcFromArtistItem(found);
        const resolvedName = cleanArtistName(getText(found?.name || found?.title)) || searchName;
        return { channelId: resolvedId || channelId, name: resolvedName };
    } catch (_) {
        return { channelId, name: searchName };
    }
}

// safeGetMusicArtist: getArtist без падіння — повертає null при помилці
async function safeGetMusicArtist(ytClient, channelId) {
    if (!ytClient?.music || !isUcArtistId(channelId)) return null;
    try {
        return await ytClient.music.getArtist(channelId);
    } catch (err) {
        console.log('Music API error:', err.message);
        return null;
    }
}

// isAuthenticated: перевіряє сесію — session.userId або passport
const isAuthenticated = (req, res, next) => {
    if (req.session.userId || req.isAuthenticated()) return next();
    res.status(401).json({ error: 'Не авторизовано' });
};

// getText: витягує текст з Innertube — string, text або runs
const getText = (val) => {
    if (!val) return '';
    if (typeof val === 'string') return val;
    if (val.text) return val.text;
    if (Array.isArray(val.runs)) return val.runs.map(r => r.text).join('');
    return String(val);
};

// normalizeMediaUrl: нормалізує URL медіа — https і markdown у кеші
function normalizeMediaUrl(url) {
    if (!url || typeof url !== 'string') return '';
    let u = url.trim();
    const md = u.match(/\[.*?\]\((https?:\/\/[^)]+)\)/);
    if (md) u = md[1];
    if (u.startsWith('//')) u = `https:${u}`;
    if (u.startsWith('http://') || u.startsWith('https://')) return u;
    return '';
}

// upgradeGoogleThumb: підвищує якість Google thumb — параметр size
function upgradeGoogleThumb(url, size = 'w500-h500') {
    const normalized = normalizeMediaUrl(url);
    if (!normalized) return '';
    if ((normalized.includes('googleusercontent.com') || normalized.includes('ggpht.com')) && normalized.includes('=')) {
        return `${normalized.split('=')[0]}=${size}`;
    }
    return normalized;
}

// getThumbUrl: витягує найкращий thumbnail URL — з вкладених структур
const getThumbUrl = (obj) => {
    if (!obj) return '';
    if (typeof obj.url === 'string') return normalizeMediaUrl(obj.url);

    let bestUrl = '';
    let maxWidth = -1;

    const checkThumbs = (thumbs) => {
        if (!Array.isArray(thumbs)) return false;
        let found = false;
        for (const t of thumbs) {
            const raw = t?.url;
            const normalized = typeof raw === 'string' ? normalizeMediaUrl(raw) : '';
            if (normalized) {
                const w = t.width || 0;
                if (w >= maxWidth) {
                    maxWidth = w;
                    bestUrl = normalized;
                    found = true;
                }
            }
        }
        return found;
    };

    const directPaths = [
        obj.thumbnails,
        obj.thumbnail?.thumbnails,
        obj.header?.thumbnails,
        obj.header?.thumbnail?.thumbnails,
        obj.header?.image?.thumbnails,
        obj.thumbnailRenderer?.musicThumbnailRenderer?.thumbnail?.thumbnails,
        obj.musicThumbnailRenderer?.thumbnail?.thumbnails,
        obj.defaultThumbnail?.thumbnails
    ];

    for (const p of directPaths) {
        if (checkThumbs(p)) return bestUrl;
    }

    let foundUrl = '';
    const searchDeep = (node, depth) => {
        if (depth > 5 || !node || typeof node !== 'object' || foundUrl) return;
        const deepUrl = typeof node.url === 'string' ? normalizeMediaUrl(node.url) : '';
        if (deepUrl) {
            foundUrl = deepUrl;
            return;
        }
        if (Array.isArray(node)) {
            for (let i = 0; i < Math.min(node.length, 5); i++) searchDeep(node[i], depth + 1);
            return;
        }
        for (const key in node) {
            if (['endpoint', 'playEndpoint', 'navigationEndpoint', 'author', 'artists'].includes(key)) continue;
            searchDeep(node[key], depth + 1);
        }
    };

    searchDeep(obj, 0);
    return bestUrl || foundUrl;
};

// extractItems: нормалізує масив з відповіді — map, contents або items
const extractItems = (data) => {
    if (!data) return [];
    if (typeof data.map === 'function') return Array.from(data);
    if (data.contents && typeof data.contents.map === 'function') return Array.from(data.contents);
    if (data.items && typeof data.items.map === 'function') return Array.from(data.items);
    return [];
};

const { formatSubsLabel, isSubscriberCountText, parseCountFromString } = require('../utils/formatListeners');
const { resolveArtistSubs, resolveMonthlyListeners } = require('../utils/artistSubs');
const formatSubs = (subs) => formatSubsLabel(subs);

// enrichSubscribedArtistsList: subs та image для списку підписок
async function enrichSubscribedArtistsList(artists) {
    const ytClient = await ytClientPromise;
    const list = artists || [];

    return Promise.all(
        list.map(async (a) => {
            let subs = a.subscriberCount > 0 ? formatSubsLabel(a.subscriberCount) : '';
            let image = a.image;
            const cached = cacheGet(`channel_v57_${a.channelId}_`.toLowerCase());
            if (cached) {
                subs = cached.subs || subs;
                image = cached.image || image;
            }
            if (ytClient && isUcArtistId(a.channelId)) {
                try {
                    if (!subs) {
                        subs = (await resolveMonthlyListeners(ytClient, a.channelId, '')) || '';
                    }
                    if (!image) {
                        const musicPage = await safeGetMusicArtist(ytClient, a.channelId);
                        if (musicPage) {
                            image =
                                upgradeGoogleThumb(getThumbUrl(musicPage.header), 's256-c-k-c0x00ffffff-no-rj') ||
                                image;
                        }
                    }
                } catch (_) {}
            }
            return {
                channelId: a.channelId,
                name: a.name,
                image:
                    image ||
                    `https://ui-avatars.com/api/?name=${encodeURIComponent(a.name)}&background=181818&color=fff&size=256`,
                subs: subs || ''
            };
        })
    );
}
// getSafeArtistImage: URL аватара артиста — з fallback ui-avatars
function getSafeArtistImage(a) {
    let url = getThumbUrl(a);
    if (a?.thumbnails?.length) {
        url = normalizeMediaUrl(a.thumbnails[a.thumbnails.length - 1]?.url) || url;
    }
    url = upgradeGoogleThumb(url, 's256-c-k-c0x00ffffff-no-rj');
    if (!url) {
        const name = getText(a?.name) || getText(a?.title) || 'Artist';
        url = `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=181818&color=fff&size=256`;
    }
    return url;
}

// enrichAlbumItemImage: доповнює обкладинку альбому — getAlbum або ytimg
async function enrichAlbumItemImage(ytClient, item) {
    let image = upgradeGoogleThumb(normalizeMediaUrl(item.image) || getThumbUrl(item));
    if (image && !image.includes('ui-avatars.com')) return { ...item, image };

    const id = item.youtubeId;
    if (id?.startsWith('MPRE') && ytClient?.music) {
        try {
            const album = await ytClient.music.getAlbum(id);
            const cover = upgradeGoogleThumb(getThumbUrl(album) || getThumbUrl(album?.header));
            if (cover) return { ...item, image: cover };
        } catch (_) {}
    }
    if (item.type === 'video' && id && !id.startsWith('MPRE') && !id.startsWith('PL') && !id.startsWith('VL')) {
        return { ...item, image: `https://i.ytimg.com/vi/${id}/mqdefault.jpg` };
    }
    return {
        ...item,
        image: `https://ui-avatars.com/api/?name=${encodeURIComponent(item.title || 'Album')}&background=181818&color=fff&size=500`
    };
}

// enrichSimilarArtistImage: обкладинка і subs схожого артиста — getChannel fallback
async function enrichSimilarArtistImage(ytClient, sim) {
    let image = upgradeGoogleThumb(normalizeMediaUrl(sim.image) || getThumbUrl(sim), 's256-c-k-c0x00ffffff-no-rj');
    if (!image || image.includes('ui-avatars.com')) {
        if (sim.channelId && ytClient) {
            try {
                const ch = await ytClient.getChannel(sim.channelId);
                image = upgradeGoogleThumb(getThumbUrl(ch.metadata) || getThumbUrl(ch.header), 's256-c-k-c0x00ffffff-no-rj');
            } catch (_) {}
        }
    }
    if (!image || image.includes('ui-avatars.com')) {
        image = `https://ui-avatars.com/api/?name=${encodeURIComponent(sim.name || 'Artist')}&background=2a2a2a&color=fff&size=256`;
    }

    const subs = sim.channelId
        ? await resolveArtistSubs(ytClient, sim.channelId, { rawSubs: sim.subs })
        : formatSubs(sim.subs);

    return { ...sim, image, subs: subs || '' };
}

// enrichDiscographyImages: збагачує дискографію обкладинками — паралельно для всіх секцій
async function enrichDiscographyImages(ytClient, albums, singles, latestRelease, similar) {
    const [enrichedAlbums, enrichedSingles, enrichedSimilar] = await Promise.all([
        Promise.all(albums.map((i) => enrichAlbumItemImage(ytClient, i))),
        Promise.all(singles.map((i) => enrichAlbumItemImage(ytClient, i))),
        Promise.all(similar.map((s) => enrichSimilarArtistImage(ytClient, s)))
    ]);
    const enrichedLatest = latestRelease ? await enrichAlbumItemImage(ytClient, latestRelease) : null;
    return {
        albums: enrichedAlbums,
        singles: enrichedSingles,
        latestRelease: enrichedLatest,
        similar: enrichedSimilar
    };
}
router.get('/api/channels/resolve', async (req, res) => {
    const name = cleanArtistName((req.query.q || req.query.name || '').trim());
    const videoId = (req.query.videoId || '').trim();
    const hintChannelId = pickUcArtistId(req.query.channelId);

    if (!name && !hintChannelId && !videoId) {
        return res.status(400).json({ error: 'Потрібна назва або videoId' });
    }

    const cacheKey = `resolve_v2_${name}_${videoId}_${hintChannelId}`.toLowerCase();
    const cached = cacheGet(cacheKey);
    if (cached) return res.json(cached);

    try {
        const ytClient = await ytClientPromise;
        if (!ytClient) return res.status(503).json({ error: 'YouTube клієнт недоступний' });

        const { resolveChannelIdForAuthor } = require('../services/recommendation/artistAlbums');
        let videoChannelId = hintChannelId;

        if (!videoChannelId && videoId && /^[\w-]{11}$/.test(videoId)) {
            try {
                const url = `https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${videoId}`;
                const data = await fetchFromYouTube(url);
                videoChannelId = pickUcArtistId(data?.items?.[0]?.snippet?.channelId);
            } catch (_) {}
        }

        const channelId = await resolveChannelIdForAuthor(name, hintChannelId, { videoChannelId });
        if (!channelId || !isUcArtistId(channelId)) {
            return res.status(404).json({ error: 'Виконавця не знайдено' });
        }

        let displayName = name || 'Артист';
        let image = '';

        const musicPage = await safeGetMusicArtist(ytClient, channelId);
        if (musicPage) {
            displayName = cleanArtistName(getText(musicPage.header?.title)) || displayName;
            image = getThumbUrl(musicPage.header);
        }

        try {
            const channel = await ytClient.getChannel(channelId);
            if (!displayName || displayName === 'Артист') {
                displayName = cleanArtistName(getText(channel.metadata?.title)) || displayName;
            }
            if (!image) image = getThumbUrl(channel.metadata) || getThumbUrl(channel.header);
        } catch (_) {}

        const rawSubsHint =
            getText(musicPage?.header?.subscribers) ||
            getText(musicPage?.header?.subscription_count) ||
            getText(musicPage?.header?.subtitle) ||
            '';

        const subs =
            (await resolveMonthlyListeners(ytClient, channelId, rawSubsHint)) ||
            formatSubs(rawSubsHint);

        if (!image && isUcArtistId(channelId)) {
            try {
                const url = `https://www.googleapis.com/youtube/v3/channels?part=snippet&id=${channelId}`;
                const data = await fetchFromYouTube(url);
                if (data?.items?.length) {
                    image =
                        data.items[0].snippet.thumbnails?.high?.url ||
                        data.items[0].snippet.thumbnails?.medium?.url;
                }
            } catch (_) {}
        }

        const payload = {
            name: displayName,
            image:
                upgradeGoogleThumb(image, 's256-c-k-c0x00ffffff-no-rj') ||
                `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=181818&color=fff&size=220`,
            subs: subs || formatSubs(rawSubsHint),
            channelId
        };

        cacheSet(cacheKey, payload);
        res.json(payload);
    } catch (err) {
        console.error('resolve artist:', err);
        res.status(500).json({ error: 'Помилка пошуку виконавця' });
    }
});

router.get('/api/channels', async (req, res) => {
    const q = (req.query.q || 'music').trim();
    const cacheKey = `ytm_artists_v3_${q}`.toLowerCase();

    const cached = cacheGet(cacheKey);
    if (cached) return res.json(cached);

    try {
        const yt = await ytClientPromise;
        if (!yt) return res.json([]);

        const { searchArtists } = require('../services/pageSearch');
        const results = await searchArtists(yt, q);

        cacheSet(cacheKey, results);
        res.json(results);
    } catch (err) {
        console.error("YTM Artist Search Error:", err);
        res.json([]);
    }
});

router.get('/api/ytm-albums', async (req, res) => {
    const q = (req.query.q || 'music').trim();
    const cacheKey = `ytm_albums_v2_${q}`.toLowerCase();

    const cached = cacheGet(cacheKey);
    if (cached) return res.json(cached);

    try {
        const yt = await ytClientPromise;
        if (!yt) return res.json([]);

        const { searchArtists, searchAlbumsForArtist } = require('../services/pageSearch');
        const artists = await searchArtists(yt, q);
        const best = artists[0];
        if (!best) {
            cacheSet(cacheKey, []);
            return res.json([]);
        }

        const results = await searchAlbumsForArtist(yt, best, q);
        cacheSet(cacheKey, results);
        res.json(results);
    } catch (err) {
        console.error("YTM Album Search Error:", err);
        res.json([]);
    }
});

router.get('/api/channels/:id', async (req, res) => {
    const originalId = (req.params.id || '').trim();
    const nameHint = (req.query.name || '').trim();
    const cacheKey = `channel_v57_${originalId}_${nameHint.toLowerCase()}`;

    const cached = cacheGet(cacheKey);
    if (cached) return res.json(cached);

    try {
        const ytClient = await ytClientPromise;
        if (!ytClient) return res.status(503).json({ error: 'YouTube клієнт недоступний' });

        const { channelId: realChannelId, name: resolvedName } = await resolveArtistChannelId(ytClient, originalId, nameHint);
        if (!realChannelId || !isUcArtistId(realChannelId)) {
            return res.status(404).json({ error: 'Виконавця не знайдено' });
        }

        let displayName = resolvedName || nameHint || 'Артист';
        let image = '';

        const musicPage = await safeGetMusicArtist(ytClient, realChannelId);
        if (musicPage) {
            displayName = cleanArtistName(getText(musicPage.header?.title)) || displayName;
            image = getThumbUrl(musicPage.header);
        }

        try {
            const channel = await ytClient.getChannel(realChannelId);
            if (!displayName || displayName === 'Артист') {
                displayName = cleanArtistName(getText(channel.metadata?.title)) || displayName;
            }
            if (!image) image = getThumbUrl(channel.metadata) || getThumbUrl(channel.header);
        } catch (_) {}

        const rawSubsHint =
            getText(musicPage?.header?.subscribers) ||
            getText(musicPage?.header?.subscription_count) ||
            getText(musicPage?.header?.subtitle) ||
            '';

        const subs =
            (await resolveMonthlyListeners(ytClient, realChannelId, rawSubsHint)) ||
            formatSubs(rawSubsHint);

        if (!image && isUcArtistId(realChannelId)) {
            try {
                const url = `https://www.googleapis.com/youtube/v3/channels?part=snippet&id=${realChannelId}`;
                const data = await fetchFromYouTube(url);
                if (data?.items?.length) {
                    image = data.items[0].snippet.thumbnails?.high?.url || data.items[0].snippet.thumbnails?.medium?.url;
                }
            } catch (_) {}
        }

        const result = {
            name: displayName,
            image: upgradeGoogleThumb(image, 's256-c-k-c0x00ffffff-no-rj') || `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=181818&color=fff&size=220`,
            subs: subs || formatSubs(rawSubsHint),
            channelId: realChannelId
        };

        cacheSet(cacheKey, result);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: 'Помилка завантаження даних каналу' });
    }
});

// loadArtistDiscography: збирає дискографію артиста — YT Music або fallback getChannel
async function loadArtistDiscography(channelId, nameHint = '') {
    const ytClient = await ytClientPromise;
    if (!ytClient) throw new Error('Клієнт YouTube не запущено');

    const { channelId: resolvedId, name: resolvedName } = await resolveArtistChannelId(ytClient, channelId, nameHint);
    const effectiveId = resolvedId || (isUcArtistId(channelId) ? channelId.trim() : null);
    if (!effectiveId) {
        return { albums: [], eps: [], singles: [], similar: [], latestRelease: null };
    }

    const cacheKey = `disco_v56_${effectiveId}`;

    const cached = cacheGet(cacheKey);
    if (cached) return cached;

    try {
        let albums = [], singles = [], similar = [], artistName = resolvedName || 'Unknown', scrapedLatestRelease = null;
        let artistSubs = '';

        const parseItems = (items, fallbackAuthor, defaultReleaseType) => {
            return extractItems(items).map(item => {
                let id = item.id, type = 'video', realReleaseType = defaultReleaseType, extractedVideoId = null;

                if (item.play_endpoint?.payload?.videoId) extractedVideoId = item.play_endpoint.payload.videoId;
                else if (item.playEndpoint?.payload?.videoId) extractedVideoId = item.playEndpoint.payload.videoId;
                else if (item.endpoint?.payload?.videoId) extractedVideoId = item.endpoint.payload.videoId;

                if (!extractedVideoId && item.videoId) extractedVideoId = item.videoId;

                if (!id && item.endpoint?.payload?.browseId) { id = item.endpoint.payload.browseId; type = 'playlist'; }
                else if (!id && item.endpoint?.payload?.videoId) { id = item.endpoint.payload.videoId; type = 'video'; }

                if (id && (id.startsWith('PL') || id.startsWith('VL') || id.startsWith('RD') || id.startsWith('MPRE'))) type = 'playlist';

                const subtitleText = getText(item.subtitle);
                const subtitleLower = subtitleText.toLowerCase();

                if ((subtitleLower.includes('album') || subtitleLower.includes('альбом')) && !subtitleLower.includes('mini') && !subtitleLower.includes('міні') && !subtitleLower.includes('ep')) realReleaseType = 'Альбом';
                else if (subtitleLower.includes('mini') || subtitleLower.includes('міні') || subtitleLower.includes('ep')) realReleaseType = 'Мініальбом';
                else realReleaseType = 'Сингл';

                const titleText = getText(item.title) || getText(item.name) || 'Unknown Title';

                let bestImg = upgradeGoogleThumb(getThumbUrl(item));
                const validVideoId = extractedVideoId || (type === 'video' && id && !id.startsWith('PL') && !id.startsWith('MPRE') ? id : null);
                if (!bestImg && validVideoId) bestImg = `https://i.ytimg.com/vi/${validVideoId}/mqdefault.jpg`;

                let trackAuthor = fallbackAuthor;
                if (item.artists?.length) trackAuthor = item.artists.map(a => getText(a.name)).join(', ');
                else if (item.authors?.length) trackAuthor = item.authors.map(a => getText(a.name)).join(', ');
                else if (subtitleText) {
                    if (!subtitleLower.includes('single') && !subtitleLower.includes('сингл') && !subtitleLower.includes('album') && !subtitleLower.includes('альбом') && !subtitleLower.includes('ep') && !subtitleLower.includes('mini') && !subtitleLower.includes('міні')) trackAuthor = subtitleText;
                }

                return {
                    youtubeId: id, title: titleText, image: bestImg, author: trackAuthor, type, releaseType: realReleaseType
                };
            }).filter(i => i.youtubeId && !i.title.toLowerCase().includes('most played') && !i.title.toLowerCase().includes('latest'));
        };

        const getCleanKey = (str, artistStr) => {
            let c = str.toLowerCase();
            const a = (artistStr || '').toLowerCase();
            if (a && c.startsWith(a + ' - ')) c = c.replace(a + ' - ', '');
            else if (a && c.startsWith(a + '-')) c = c.replace(a + '-', '');
            c = c.replace(/\(.*?\)/g, '').replace(/\[.*?\]/g, '').replace(/【.*?】/g, '').replace(/<.*?>/g, '').split('/')[0].split('|')[0].split('~')[0].trim();
            c = c.replace(/ending theme|opening theme|soundtrack|ost|tv size|version|ver\.|lyric video|music video|official/gi, '');
            return c.replace(/[^\p{L}\p{N}]/gu, '');
        };

        let isYtMusicSuccess = false;

        try {
            const musicPage = await safeGetMusicArtist(ytClient, effectiveId);
            if (!musicPage) throw new Error('Music artist unavailable');
            artistName = cleanArtistName(getText(musicPage.header?.title)) || artistName;
            artistSubs = formatSubs(
                getText(musicPage.header?.subscribers) ||
                    getText(musicPage.header?.subscription_count) ||
                    getText(musicPage.header?.subtitle)
            );

            if (musicPage.sections?.length > 0) {
                for (const section of musicPage.sections) {
                    const title = getText(section.header?.title || section.title).toLowerCase();
                    let items = extractItems(section.items || section.contents);

                    if (title.includes('album') || title.includes('альбом') || title.includes('single') || title.includes('сингл') || title.includes('ep')) {
                        let mBrowseId = null;
                        const headerStr = JSON.stringify(section.header || {});
                        const match = headerStr.match(/"browseId":"([^"]+)"/);
                        if (match && match[1]) mBrowseId = match[1];

                        if (mBrowseId) {
                            try {
                                const response = await ytClient.actions.execute('/browse', { browseId: mBrowseId, client: 'YTMUSIC' });
                                const extractRenderers = (obj) => {
                                    let found = [];
                                    if (!obj) return found;
                                    if (Array.isArray(obj)) {
                                        for (const item of obj) found.push(...extractRenderers(item));
                                    } else if (typeof obj === 'object') {
                                        if (obj.musicTwoRowItemRenderer) found.push(obj.musicTwoRowItemRenderer);
                                        else for (const key of Object.keys(obj)) found.push(...extractRenderers(obj[key]));
                                    }
                                    return found;
                                };
                                const renderers = extractRenderers(response.data);

                                if (renderers.length > 0) {
                                    const existingIds = new Set(items.map(i => i.id || i.endpoint?.payload?.browseId || i.endpoint?.payload?.videoId));
                                    const mappedMore = renderers.map(r => {
                                        const bId = r.navigationEndpoint?.browseEndpoint?.browseId;
                                        let extractedThumbs = [];
                                        if (r.thumbnailRenderer?.musicThumbnailRenderer?.thumbnail?.thumbnails) {
                                            extractedThumbs = r.thumbnailRenderer.musicThumbnailRenderer.thumbnail.thumbnails;
                                        }
                                        let extractedVid = r.videoId || r.navigationEndpoint?.watchEndpoint?.videoId || null;
                                        return {
                                            id: bId || extractedVid,
                                            title: { text: getText(r.title) || 'Unknown' },
                                            subtitle: { text: getText(r.subtitle) || '' },
                                            thumbnails: extractedThumbs,
                                            endpoint: { payload: { browseId: bId, videoId: extractedVid } },
                                            play_endpoint: { payload: { videoId: extractedVid } }
                                        };
                                    });

                                    mappedMore.forEach(m => {
                                        if (m.id && !existingIds.has(m.id)) {
                                            items.push(m);
                                            existingIds.add(m.id);
                                        }
                                    });
                                }
                            } catch(e) { }
                        }
                    }

                    if (title.includes('latest') || title.includes('останній') || title.includes('реліз') || title.includes('release') || title.includes('новинка')) {
                        const parsedLatest = parseItems(items, artistName, 'Останній реліз');
                        if (parsedLatest.length > 0) scrapedLatestRelease = parsedLatest[0];
                    } else if (title.includes('album') || title.includes('альбом')) {
                        albums.push(...parseItems(items, artistName, 'Альбом'));
                    } else if (title.includes('single') || title.includes('сингл') || title.includes('ep')) {
                        singles.push(...parseItems(items, artistName, 'Сингл'));
                    } else if (title.includes('fans might also like') || title.includes('related') || title.includes('схожі')) {
                        similar = items.map(item => {
                            const simChannelId = extractUcFromArtistItem(item) || pickUcArtistId(item.endpoint?.payload?.browseId, item.id);
                            return {
                                channelId: simChannelId,
                                name: getText(item.title) || getText(item.name) || 'Unknown',
                                image: upgradeGoogleThumb(getThumbUrl(item)) || getSafeArtistImage(item),
                                subs: getText(item.subtitle) || getText(item.subscribers) || ''
                            };
                        }).filter(a => a.channelId && isUcArtistId(a.channelId));
                    }
                }
            }
            if (albums.length > 0 || singles.length > 0 || scrapedLatestRelease) isYtMusicSuccess = true;
        } catch (_) {}

        if (!isYtMusicSuccess) {
            try {
                const channel = await ytClient.getChannel(effectiveId);
                if (artistName === 'Unknown') artistName = getText(channel.metadata?.title) || 'Unknown';
                let videosList = await channel.getVideos();
                let items = extractItems(videosList.videos);

                for (let i = 0; i < 2; i++) {
                    if (videosList.has_continuation) {
                        videosList = await videosList.getContinuation();
                        items.push(...extractItems(videosList.videos));
                    } else break;
                }

                const parsedVideos = parseItems(items, artistName, 'Сингл');
                parsedVideos.forEach(p => {
                    if (p.type === 'video') singles.push(p);
                });
            } catch (err2) { }
        }

        const deduplicateByTitle = (items, artistStr) => {
            const uniqueMap = new Map();
            for (const item of items) {
                const compareKey = getCleanKey(item.title, artistStr);
                if (!uniqueMap.has(compareKey)) {
                    uniqueMap.set(compareKey, item);
                } else {
                    const existing = uniqueMap.get(compareKey);
                    if (item.image && !item.image.includes('ui-avatars.com') && existing.image.includes('ui-avatars.com')) existing.image = item.image;
                }
            }
            return Array.from(uniqueMap.values());
        };

        const finalAlbums = deduplicateByTitle(albums, artistName);
        const rawSingles = deduplicateByTitle(singles, artistName);
        const albumKeys = new Set(finalAlbums.map(a => getCleanKey(a.title, artistName)));
        const finalSingles = rawSingles.filter(s => !albumKeys.has(getCleanKey(s.title, artistName)));

        let latestRelease = scrapedLatestRelease;
        if (!latestRelease) latestRelease = finalSingles.length > 0 ? finalSingles[0] : (finalAlbums.length > 0 ? finalAlbums[0] : null);

        const finalSimilar = similar.slice(0, 10);

        const enriched = await enrichDiscographyImages(
            ytClient,
            finalAlbums,
            finalSingles,
            latestRelease,
            finalSimilar
        );

        const result = {
            albums: enriched.albums,
            eps: [],
            singles: enriched.singles,
            similar: enriched.similar,
            latestRelease: enriched.latestRelease,
            artistSubs
        };

        cacheSet(cacheKey, result);
        return result;
    } catch (err) {
        return { albums: [], eps: [], singles: [], similar: [], latestRelease: null };
    }
}

router.get('/api/artist-discography/:channelId', async (req, res) => {
    try {
        const nameHint = (req.query.name || '').trim();
        const data = await loadArtistDiscography(req.params.channelId, nameHint);
        res.json(data);
    } catch (err) {
        res.json({ albums: [], eps: [], singles: [], similar: [], latestRelease: null });
    }
});

router.loadArtistDiscography = loadArtistDiscography;

router.post('/api/subscribe', isAuthenticated, async (req, res) => {
    const { artist } = req.body;
    try {
        const userId = req.session.userId || req.user.id;
        const user = await User.findByPk(userId);

        let [dbArtist] = await Artist.findOrCreate({
            where: { channelId: artist.channelId },
            defaults: { name: artist.name, image: artist.image }
        });

        const wasSubscribed = await user.hasSubscribedArtist(dbArtist);
        if (wasSubscribed) {
            await user.removeSubscribedArtist(dbArtist);
        } else {
            await user.addSubscribedArtist(dbArtist);
            const updates = {};
            if (artist.image) updates.image = artist.image;
            const count = parseCountFromString(artist.subs || '');
            if (count > 0) updates.subscriberCount = count;
            if (Object.keys(updates).length) await dbArtist.update(updates);
        }

        const { invalidateHomeCache } = require('../services/recommendation/cache');
        await invalidateHomeCache(userId).catch(() => {});

        const updatedUser = await User.findByPk(userId, { include: [{ model: Artist, as: 'subscribedArtists' }] });
        const enriched = await enrichSubscribedArtistsList(updatedUser.subscribedArtists || []);
        res.json({ subscribedArtists: enriched });
    } catch (err) { res.status(500).json({ error: 'Помилка' }); }
});

router.get('/api/subscriptions', isAuthenticated, async (req, res) => {
    try {
        const userId = req.session.userId || req.user.id;
        const user = await User.findByPk(userId, { include: [{ model: Artist, as: 'subscribedArtists' }] });
        const enriched = await enrichSubscribedArtistsList(user.subscribedArtists || []);
        res.json(enriched);
    } catch (err) { res.status(500).json({ error: 'Помилка' }); }
});

router.get('/api/yt-album/:id', async (req, res) => {
    try {
        const ytClient = await ytClientPromise;
        if (!ytClient) throw new Error("Клієнт не готовий");

        const findFirstChannelId = (obj) => {
            let found = null;
            const seen = new Set();
            const walk = (node, depth) => {
                if (!node || found || depth > 6) return;
                if (typeof node !== 'object') return;
                if (seen.has(node)) return;
                seen.add(node);

                const candidates = [
                    node.channel_id,
                    node.channelId,
                    node.browseId,
                    node.browse_id,
                    node.id
                ];
                for (const c of candidates) {
                    if (typeof c === 'string' && (c.startsWith('UC') || c.startsWith('HC'))) {
                        found = c;
                        return;
                    }
                }

                if (Array.isArray(node)) {
                    for (let i = 0; i < Math.min(node.length, 8); i++) walk(node[i], depth + 1);
                    return;
                }

                for (const k of Object.keys(node)) {
                    if (['endpoint', 'playEndpoint', 'navigationEndpoint'].includes(k)) continue;
                    walk(node[k], depth + 1);
                    if (found) return;
                }
            };
            walk(obj, 0);
            return found;
        };

        const id = req.params.id;
        let data;

        const looksLikePlaylistId =
            id.startsWith('PL') ||
            id.startsWith('VL') ||
            id.startsWith('RD') ||
            id.startsWith('MPRE') ||
            id.startsWith('OLAK5uy');

        if (looksLikePlaylistId) {
            try {
                data = await ytClient.music.getPlaylist(id);
            } catch (e) {
                data = await ytClient.music.getAlbum(id);
            }
        } else {
            try {
                data = await ytClient.music.getAlbum(id);
            } catch (e) {
                data = await ytClient.music.getPlaylist(id);
            }
        }

        let tracks = extractItems(data.contents || data.items);
        if ((!tracks || tracks.length === 0) && (id.startsWith('MPRE') || id.startsWith('OLAK5uy'))) {
            try {
                const browseRes = await ytClient.actions.execute('/browse', { browseId: id, client: 'YTMUSIC' });
                const raw = JSON.stringify(browseRes?.data || {});
                const match =
                    raw.match(/"playlistId":"(OLAK5uy[^"]+)"/) ||
                    raw.match(/"listId":"(OLAK5uy[^"]+)"/) ||
                    raw.match(/(OLAK5uy[a-zA-Z0-9_-]+)/);

                const listId = match?.[1] || match?.[0];
                if (listId && typeof listId === 'string' && listId.startsWith('OLAK5uy')) {
                    data = await ytClient.music.getPlaylist(listId);
                    tracks = extractItems(data.contents || data.items);
                }
            } catch (e) { }
        }

        let albumName =
            getText(data.title) ||
            getText(data.header?.title) ||
            getText(data.name) ||
            '';

        if ((!albumName || albumName === 'Unknown Album') && tracks.length > 0) {
            const fromTrack = tracks
                .map((t) => getText(t.album?.name))
                .find((n) => n && n.length > 1 && !/unknown/i.test(n));
            if (fromTrack) albumName = fromTrack;
        }

        if (!albumName) albumName = 'Unknown Album';

        let albumAuthor = 'Unknown';
        let albumAuthorId = null;

        const looksLikeNonAuthorMeta = (s) => {
            const v = (s || '').toLowerCase();
            return (
                v.includes('single') ||
                v.includes('album') ||
                v.includes('ep') ||
                v.includes('ост') ||
                v.includes('soundtrack') ||
                v.includes('official') ||
                /\b(19|20)\d{2}\b/.test(v) || // рік
                v.includes('youtube music')
            );
        };

        if (data.authors?.length) {
            albumAuthor = data.authors.map(a => getText(a.name)).join(', ');
            albumAuthorId = data.authors[0].channel_id || null;
        } else if (data.header?.authors?.length) {
            albumAuthor = data.header.authors.map(a => getText(a.name)).join(', ');
            albumAuthorId = data.header.authors[0].channel_id || null;
        } else if (data.header?.author?.name) {
            albumAuthor = getText(data.header.author.name);
            albumAuthorId = data.header.author.channel_id || null;
        } else if (data.author?.name) {
            albumAuthor = getText(data.author.name);
            albumAuthorId = data.author.channel_id || null;
        }

        if (data.header) {
            const maybeId = findFirstChannelId(data.header);
            if (maybeId) albumAuthorId = maybeId;

            if (albumAuthor === 'Unknown') {
                const headerName =
                    getText(data.header.author?.name) ||
                    (Array.isArray(data.header.authors) ? data.header.authors.map(a => getText(a.name)).filter(Boolean).join(', ') : '');
                if (headerName && !headerName.toLowerCase().includes('song') && !looksLikeNonAuthorMeta(headerName)) {
                    albumAuthor = headerName;
                }
            }
        }

        if ((!albumAuthorId || albumAuthor === 'Unknown') && tracks.length > 0) {
            const first = tracks[0];
            const firstAuthors = first.artists || first.authors || (first.author ? [first.author] : []);
            if (Array.isArray(firstAuthors) && firstAuthors.length > 0) {
                if (albumAuthor === 'Unknown') {
                    const n = firstAuthors.map(a => getText(a.name)).filter(Boolean).join(', ');
                    if (n && !looksLikeNonAuthorMeta(n)) albumAuthor = n;
                }
                if (!albumAuthorId) {
                    const a0 = firstAuthors[0];
                    albumAuthorId = a0?.channel_id || a0?.channelId || findFirstChannelId(a0) || albumAuthorId;
                }
            }
        }

        if ((albumAuthor === 'Unknown' || looksLikeNonAuthorMeta(albumAuthor)) && tracks.length > 0) {
            const first = tracks[0];
            const fromText =
                getText(first.author) ||
                getText(first.artists?.[0]?.name) ||
                getText(first.subtitle);
            if (fromText && !looksLikeNonAuthorMeta(fromText)) albumAuthor = fromText;
        }

        albumAuthorId = pickUcArtistId(albumAuthorId) || null;

        const primaryArtistName = cleanArtistName((albumAuthor || '').split(',')[0].trim());
        if ((!albumAuthorId || !isUcArtistId(albumAuthorId)) && primaryArtistName && !looksLikeNonAuthorMeta(primaryArtistName)) {
            try {
                const searchRes = await ytClient.music.search(primaryArtistName, { type: 'artist' });
                const items = extractItems(searchRes.artists || searchRes.contents || searchRes.results);
                if (items.length > 0) {
                    const exact = items.find(
                        (i) => cleanArtistName(getText(i.name)).toLowerCase() === primaryArtistName.toLowerCase()
                    );
                    const pick = exact || items[0];
                    albumAuthorId =
                        extractUcFromArtistItem(pick) ||
                        pickUcArtistId(pick?.channelId, pick?.id, pick?.browseId) ||
                        albumAuthorId;
                }
            } catch (_) {}
        }

        albumAuthorId = pickUcArtistId(albumAuthorId) || null;

        let albumCover = getThumbUrl(data.header) || getThumbUrl(data);
        if (albumCover && (albumCover.includes('googleusercontent.com') || albumCover.includes('ggpht.com')) && albumCover.includes('=')) {
            albumCover = albumCover.split('=')[0] + '=w500-h500';
        }

        if (!albumCover && tracks.length > 0) {
            const firstTrackId = tracks[0].video_id || tracks[0].id;
            if (firstTrackId) {
                albumCover = `https://i.ytimg.com/vi/${firstTrackId}/mqdefault.jpg`;
            }
        }

        if (!albumCover) {
            albumCover = `https://ui-avatars.com/api/?name=${encodeURIComponent(albumName)}&background=181818&color=fff&size=500`;
        }

        let ownerSubs = '';
        if (albumAuthorId && isUcArtistId(albumAuthorId)) {
            try {
                ownerSubs =
                    (await resolveMonthlyListeners(ytClient, albumAuthorId, '')) ||
                    (await resolveArtistSubs(ytClient, albumAuthorId, {})) ||
                    '';
            } catch (_) {}
        }

        const mappedPlaylist = {
            id: id,
            name: albumName,
            description: getText(data.description) || getText(data.header?.description) || `${albumAuthor} • ${data.year || 'YouTube Music'}`,
            ownerName: albumAuthor,
            ownerId: albumAuthorId,
            ownerSubs,
            coverImage: albumCover,
            isYoutube: true,
            tracks: tracks.map(track => {
                const trackId = track.video_id || track.id;

                const mapTrackAuthor = (a) => {
                    const name = cleanArtistName(getText(a?.name) || getText(a));
                    const id =
                        pickUcArtistId(a?.channel_id, a?.channelId, a?.id) ||
                        albumAuthorId ||
                        '';
                    return { name: name || albumAuthor, id };
                };

                let trackAuthors = [];
                if (track.artists?.length) {
                    trackAuthors = track.artists.map(mapTrackAuthor).filter((a) => a.name);
                } else if (track.authors?.length) {
                    trackAuthors = track.authors.map(mapTrackAuthor).filter((a) => a.name);
                } else if (track.author?.name) {
                    trackAuthors = [mapTrackAuthor(track.author)];
                } else if (albumAuthor && albumAuthor !== 'Unknown') {
                    const parts = albumAuthor.split(',').map((s) => cleanArtistName(s.trim())).filter(Boolean);
                    trackAuthors = (parts.length ? parts : [albumAuthor]).map((name) => ({
                        name,
                        id: albumAuthorId || ''
                    }));
                }

                let trackAlbumInfo = { name: albumName, id: id };
                if (track.album?.name) trackAlbumInfo = { name: getText(track.album.name), id: track.album.id || id };

                let trackImage = getThumbUrl(track);
                if (trackImage && (trackImage.includes('googleusercontent.com') || trackImage.includes('ggpht.com')) && trackImage.includes('=')) {
                    trackImage = trackImage.split('=')[0] + '=w500-h500';
                }

                if (!trackImage && trackId) {
                    trackImage = `https://i.ytimg.com/vi/${trackId}/mqdefault.jpg`;
                } else if (!trackImage) {
                    trackImage = albumCover;
                }

                return {
                    youtubeId: trackId,
                    title: getText(track.title) || getText(track.name) || 'Unknown',
                    author: trackAuthors.map(a => a.name).join(', '),
                    authors: trackAuthors,
                    image: trackImage,
                    album: trackAlbumInfo.name,
                    albumInfo: trackAlbumInfo,
                    duration: track.duration?.seconds || 0,
                    addedAt: new Date().toISOString()
                };
            }).filter(t => t.youtubeId)
        };

        res.json(mappedPlaylist);
    } catch (err) {
        console.error("YT Album Error:", err.message);
        res.status(404).json({ error: 'Альбом не знайдено' });
    }
});

router.ytClientPromise = ytClientPromise;
module.exports = router;