const express = require('express');
const router = express.Router();
const { runInfiniteTracksSearch } = require('./search');
const { Innertube } = require('youtubei.js');
const { normalizeMediaUrl, upgradeGoogleThumb } = require('../utils/mediaUrl');
const { createPersistentCache } = require('../utils/persistentCache');
const { isSubscriberCountText } = require('../utils/formatListeners');
const { enrichArtistsMonthlyListeners } = require('../utils/artistSubs');
const { enrichArtistMedia } = require('../services/recommendation/mediaQuality');
const { toArtistCard } = require('../services/recommendation/utils');
const { searchTracksViaInnertube, searchAlbumsViaInnertube } = require('../services/recommendation/sources');

const ytClientPromise = Innertube.create();
const { get: cacheGet, set: cacheSet } = createPersistentCache('genreCache.json');

// getText: витягує текст з Innertube-об'єкта — string, text або runs
const getText = (val) => {
    if (!val) return '';
    if (typeof val === 'string') return val;
    if (val.text) return val.text;
    if (Array.isArray(val.runs)) return val.runs.map((r) => r.text).join('');
    return String(val);
};

const UC_ARTIST_ID_RE = /^UC[\w-]{10,}$/i;

// pickUcId: повертає перший UC channel id — з переданих рядків
function pickUcId(...ids) {
    for (const raw of ids) {
        const c = typeof raw === 'string' ? raw.trim() : '';
        if (UC_ARTIST_ID_RE.test(c)) return c;
    }
    return null;
}

// getThumbUrl: найкращий URL обкладинки — з thumbnails об'єкта
function getThumbUrl(obj) {
    if (!obj) return '';
    if (typeof obj.url === 'string') return normalizeMediaUrl(obj.url);

    let best = '';
    let max = 0;
    const lists = [
        obj.thumbnails,
        obj.thumbnail?.thumbnails,
        obj.image?.thumbnails,
        obj.thumbnailRenderer?.musicThumbnailRenderer?.thumbnail?.thumbnails
    ];

    for (const list of lists) {
        if (!Array.isArray(list)) continue;
        for (const t of list) {
            const u = normalizeMediaUrl(t?.url);
            if (u && (t.width || 0) >= max) {
                max = t.width || 0;
                best = u;
            }
        }
    }
    return best;
}

// getSafeArtistImage: URL аватара артиста — з fallback ui-avatars
function getSafeArtistImage(a) {
    let url = upgradeGoogleThumb(getThumbUrl(a), 's256-c-k-c0x00ffffff-no-rj');
    if (!url && a?.thumbnails?.length) {
        url = upgradeGoogleThumb(a.thumbnails[a.thumbnails.length - 1]?.url, 's256-c-k-c0x00ffffff-no-rj');
    }
    if (!url) {
        const name = getText(a?.name) || getText(a?.title) || 'Artist';
        url = `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=181818&color=fff&size=256`;
    }
    return url;
}

// extractArray: нормалізує масив з відповіді Innertube — contents/items/results
const extractArray = (data) => {
    if (!data) return [];
    if (Array.isArray(data)) return data;
    if (Array.isArray(data.contents)) return data.contents;
    if (Array.isArray(data.items)) return data.items;
    if (Array.isArray(data.results)) return data.results;
    return [];
};

// flattenNodes: збирає вузли з деревоподібних відповідей Innertube
function flattenNodes(node, acc, depth = 0) {
    if (!node || depth > 20) return;
    if (Array.isArray(node)) {
        node.forEach((n) => flattenNodes(n, acc, depth + 1));
        return;
    }
    if (typeof node === 'object') acc.push(node);
    if (node.contents) flattenNodes(node.contents, acc, depth + 1);
    if (node.items) flattenNodes(node.items, acc, depth + 1);
    if (node.results) flattenNodes(node.results, acc, depth + 1);
    if (node.sections) flattenNodes(node.sections, acc, depth + 1);
}


const GENRE_QUERIES = {
    classical: ['classical instrumental', 'symphony orchestra'],
    jazz: ['smooth jazz', 'jazz instrumental'],
    lofi: ['lofi beats', 'study lofi'],
    acoustic: ['acoustic guitar', 'acoustic songs'],
    piano: ['piano solo', 'calm piano'],
    orchestral: ['orchestral soundtrack', 'movie score'],
    pop: ['pop music hits', 'top pop songs'],
    rock: ['rock music hits', 'classic rock'],
    hiphop: ['hip hop music', 'rap hits'],
    'anime-ost': ['anime opening songs', 'anime soundtrack'],
    vocaloid: ['vocaloid music', 'hatsune miku'],
    electronic: ['electronic dance music', 'edm hits']
};

const GENRE_META = {
    classical: { title: 'Класична', emoji: '🎻', gradient: 'linear-gradient(135deg,#1e3a5f,#0f172a)' },
    jazz: { title: 'Джаз', emoji: '🎷', gradient: 'linear-gradient(135deg,#4a3728,#1a1208)' },
    lofi: { title: 'Lo‑Fi / Chill', emoji: '🌙', gradient: 'linear-gradient(135deg,#2d1f4e,#0f0a1a)' },
    acoustic: { title: 'Акустична', emoji: '🎸', gradient: 'linear-gradient(135deg,#3d4a2a,#1a2210)' },
    piano: { title: 'Фортепіано', emoji: '🎹', gradient: 'linear-gradient(135deg,#2a2a3d,#12121f)' },
    orchestral: { title: 'Оркестрова', emoji: '🎺', gradient: 'linear-gradient(135deg,#1a3d4a,#0a1a22)' },
    pop: { title: 'Поп', emoji: '🎤', gradient: 'linear-gradient(135deg,#4a1942,#1a0a18)' },
    rock: { title: 'Рок', emoji: '⚡', gradient: 'linear-gradient(135deg,#3d1a1a,#120808)' },
    hiphop: { title: 'Хіп-Хоп', emoji: '🎧', gradient: 'linear-gradient(135deg,#2a2a1a,#0f0f08)' },
    'anime-ost': { title: 'Аніме OST', emoji: '✨', gradient: 'linear-gradient(135deg,#3d2a5c,#150f28)' },
    vocaloid: { title: 'Vocaloid', emoji: '📱', gradient: 'linear-gradient(135deg,#1a4a4a,#081818)' },
    electronic: { title: 'Електроніка', emoji: '🎛️', gradient: 'linear-gradient(135deg,#1a3d3d,#081414)' }
};

router.get('/api/genre/:slug', async (req, res) => {
    const slug = req.params.slug;
    const meta = GENRE_META[slug];
    if (!GENRE_QUERIES[slug]) {
        return res.json({ meta: null, topTracks: [], topArtists: [], albums: [] });
    }

    const cacheKey = `genre_v10_${slug}`;
    const cached = cacheGet(cacheKey);
    if (cached) return res.json(cached);

    try {
        const queries = GENRE_QUERIES[slug];
        const yt = await ytClientPromise;

        const seenTracks = new Set();
        const topTracks = [];
        const pushTracks = (items) => {
            for (const t of items || []) {
                if (!t?.youtubeId || seenTracks.has(t.youtubeId)) continue;
                seenTracks.add(t.youtubeId);
                topTracks.push({
                    ...t,
                    image: t.image || `https://i.ytimg.com/vi/${t.youtubeId}/hqdefault.jpg`
                });
                if (topTracks.length >= 24) break;
            }
        };

        const [t1, t2] = await Promise.all([
            runInfiniteTracksSearch({ query: queries[0] }),
            runInfiniteTracksSearch({ query: queries[1] })
        ]);
        pushTracks([...(t1.items || []), ...(t2.items || [])]);

        if (topTracks.length < 12) {
            const extraQueries = [
                `${queries[0]} mix`,
                `${queries[1]} mix`,
                `${slug} music`,
                `${slug} mix`
            ];
            for (const q of extraQueries) {
                if (topTracks.length >= 12) break;
                try {
                    const r = await runInfiniteTracksSearch({ query: q });
                    pushTracks(r.items || []);
                } catch (_) {}
            }
        }

        // Додаткове джерело: YT Music Innertube (часто дає більше релевантних треків для жанрів)
        if (topTracks.length < 12) {
            const exclude = new Set(seenTracks);
            const musicQueries = [
                queries[0],
                queries[1],
                `${queries[0]} mix`,
                `${queries[1]} mix`,
                `${slug} music`
            ];
            for (const q of musicQueries) {
                if (topTracks.length >= 12) break;
                try {
                    const more = await searchTracksViaInnertube(q, exclude, 12);
                    for (const t of more) {
                        if (!t?.youtubeId || seenTracks.has(t.youtubeId)) continue;
                        seenTracks.add(t.youtubeId);
                        exclude.add(t.youtubeId);
                        topTracks.push({
                            ...t,
                            image: t.image || `https://i.ytimg.com/vi/${t.youtubeId}/hqdefault.jpg`
                        });
                        if (topTracks.length >= 24) break;
                    }
                } catch (_) {}
            }
        }

        // Артисти: кілька спроб з різними запитами + пласка нормалізація
        const artistSeen = new Set();
        const rawTopArtists = [];
        const artistQueries = [
            queries[0],
            queries[1],
            `${queries[0]} artist`,
            `${queries[1]} artist`,
            `${slug} artist`
        ];
        for (const q of artistQueries) {
            if (rawTopArtists.length >= 12) break;
            try {
                const res = await yt.music.search(q, { type: 'artist' });
                const flat = [];
                flattenNodes(res?.artists || res?.contents || res?.results, flat);
                for (const a of flat) {
                    const channelId = pickUcId(a.channelId, a.browseId, a.id);
                    const name = getText(a.name) || getText(a.title);
                    if (!channelId || !name || artistSeen.has(channelId)) continue;
                    artistSeen.add(channelId);
                    const subtitle = getText(a.subtitle);
                    const subscribers = getText(a.subscribers);
                    const monthlyListeners = subscribers || (isSubscriberCountText(subtitle) ? subtitle : subtitle || '');
                    rawTopArtists.push({
                        name,
                        image: getSafeArtistImage(a),
                        channelId,
                        subs: '',
                        monthlyListeners
                    });
                    if (rawTopArtists.length >= 12) break;
                }
            } catch (_) {}
        }

        const enrichedArtists = await enrichArtistsMonthlyListeners(yt, rawTopArtists, 4);
        const topArtists = enrichedArtists
            .map((a) =>
                toArtistCard(
                    enrichArtistMedia({
                        channelId: a.channelId,
                        name: a.name,
                        image: a.image,
                        subs: a.subs || '',
                        listenerCount: a.listenerCount
                    })
                )
            )
            .filter(Boolean);

        // Альбоми: спочатку YT Music search, при нестачі — Innertube album search з recommendation/sources
        const albumSeen = new Set();
        const albums = [];
        const albumQueries = [
            queries[0],
            queries[1],
            `${queries[0]} album`,
            `${queries[1]} album`,
            `${slug} album`
        ];

        const pushAlbumObj = (a) => {
            const browseId = a?.youtubeId || a?.id || a?.browseId || a?.channelId;
            if (!browseId || albumSeen.has(browseId)) return;
            albumSeen.add(browseId);
            const title = getText(a?.title) || getText(a?.name);
            if (!title) return;
            let img = upgradeGoogleThumb(getThumbUrl(a));
            if (!img && String(browseId).startsWith('MPRE')) {
                img = upgradeGoogleThumb(getThumbUrl(a.thumbnail || a));
            }
            albums.push({
                youtubeId: String(browseId),
                title,
                author: getText(a?.author?.name) || getText(a?.author) || '',
                image: img || `https://ui-avatars.com/api/?name=${encodeURIComponent(title || 'Album')}&background=181818&color=fff&size=500`,
                type: 'playlist'
            });
        };

        for (const q of albumQueries) {
            if (albums.length >= 12) break;
            try {
                const res = await yt.music.search(q, { type: 'album' });
                const flat = [];
                flattenNodes(res?.albums || res?.contents || res?.results, flat);
                for (const a of flat) {
                    pushAlbumObj(a);
                    if (albums.length >= 12) break;
                }
            } catch (_) {}
        }

        if (albums.length < 8) {
            try {
                const more = await searchAlbumsViaInnertube(`${queries[0]}`, 12);
                for (const a of more || []) {
                    pushAlbumObj(a);
                    if (albums.length >= 12) break;
                }
            } catch (_) {}
        }

        const payload = {
            meta: { slug, ...meta },
            topTracks,
            topArtists,
            albums
        };
        cacheSet(cacheKey, payload);
        res.json(payload);
    } catch (err) {
        console.error('Genre error:', err);
        res.json({ meta: meta ? { slug, ...meta } : null, topTracks: [], topArtists: [], albums: [] });
    }
});

module.exports = router;
