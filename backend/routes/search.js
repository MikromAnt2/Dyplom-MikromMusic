const express = require('express');
const router = express.Router();
const { Playlist, User } = require('../models/pg');
const Song = require('../models/mongo/song');
const { Op } = require('sequelize');
const { createPersistentCache } = require('../utils/persistentCache');
const {
    SEARCH_PAGE_SIZE,
    mapYoutubeSearchToTracks,
    applyNextPageToken,
    enhanceSearchTracksForQuery
} = require('../services/searchLogic');
const { persistTracksBatch, findTracksInMongoByQuery } = require('../services/songCache');
const { matchSitePlaylists, mapSitePlaylistResults } = require('../services/hybridSearch');
const { buildPageSearch } = require('../services/pageSearch');
const {
    mergePlaylistWithMongoSongs,
    collectYoutubeIdsFromPlaylists
} = require('../services/playlistMerge');
const { isMongoConnected } = require('../utils/mongo');

const { get: tracksCacheGet, set: tracksCacheSet } = createPersistentCache('tracksCache.json');

// loadYtApiKeys: збирає ключі YouTube API — з YT_API_KEYS і YT_API_KEY у .env
function loadYtApiKeys() {
    const fromList = (process.env.YT_API_KEYS || '')
        .split(',')
        .map((k) => k.trim())
        .filter(Boolean);
    const single = (process.env.YT_API_KEY || '').trim();
    if (single && !fromList.includes(single)) fromList.unshift(single);
    return fromList;
}

const YT_API_KEYS = loadYtApiKeys();
let currentKeyIndex = 0;
let allKeysQuotaExhausted = false;
let quotaWarnLogged = false;

// isQuotaError: перевіряє вичерпання квоти API — за reason і текстом помилки
function isQuotaError(data) {
    const reason = data?.error?.errors?.[0]?.reason || '';
    const message = (data?.error?.message || '').toLowerCase();
    return (
        reason === 'quotaExceeded' ||
        reason === 'dailyLimitExceeded' ||
        reason === 'rateLimitExceeded' ||
        message.includes('quota') ||
        message.includes('exceeded')
    );
}

// fetchFromYouTube: запит до YouTube Data API — з ротацією ключів при quota
async function fetchFromYouTube(baseUrl) {
    if (!YT_API_KEYS.length) {
        throw new Error('YT_API_KEYS is empty — add keys to .env');
    }
    if (allKeysQuotaExhausted) {
        throw new Error('All YouTube API keys quota exhausted');
    }

    let attempts = 0;
    while (attempts < YT_API_KEYS.length) {
        const key = YT_API_KEYS[currentKeyIndex];
        const url = `${baseUrl}&key=${key}`;

        try {
            const response = await fetch(url);
            const data = await response.json();

            if (data.error) {
                if (isQuotaError(data)) {
                    if (!quotaWarnLogged) {
                        console.warn(`[WARN] Ключ ${currentKeyIndex + 1} вичерпано. Перемикаємось...`);
                    }
                    currentKeyIndex = (currentKeyIndex + 1) % YT_API_KEYS.length;
                    attempts++;
                    if (attempts >= YT_API_KEYS.length) {
                        allKeysQuotaExhausted = true;
                        if (!quotaWarnLogged) {
                            console.warn('[WARN] Усі YouTube Data API ключі вичерпано.');
                            quotaWarnLogged = true;
                        }
                    }
                    continue;
                }
                throw new Error(data.error.message || 'YouTube API error');
            }
            return data;
        } catch (err) {
            if (attempts >= YT_API_KEYS.length - 1) throw err;
            attempts++;
            currentKeyIndex = (currentKeyIndex + 1) % YT_API_KEYS.length;
        }
    }
    throw new Error('All YouTube API keys exhausted or network error');
}

const { isValidMusicContent } = require('../services/recommendation/trackFilter');

// isValidMusicTrack: фільтрує музичні треки — через isValidMusicContent
function isValidMusicTrack(title, durationSeconds) {
    return isValidMusicContent(title, durationSeconds);
}

// runInfiniteTracksSearch: пагінований пошук треків — Double-Fetch, кеш і MongoDB
async function runInfiniteTracksSearch({ query = '', channelId = '', pageToken = '', pageSize = SEARCH_PAGE_SIZE }) {
    if (!query && !channelId) {
        return { items: [], nextPageToken: null };
    }

    const { isUcArtistId } = require('../utils/artistChannel');
    if (channelId && !isUcArtistId(channelId)) {
        return { items: [], nextPageToken: null };
    }

    const cacheKey = `yt_tracks_v2_${channelId}_${encodeURIComponent(query)}_${pageToken || '0'}`;
    const cached = tracksCacheGet(cacheKey);
    if (cached) return cached;

    const ytQuery = query && !channelId ? `${query} song -shorts -cover -reaction -tutorial` : query;

    let url = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=30`;
    if (ytQuery) url += `&q=${encodeURIComponent(ytQuery)}`;
    if (channelId) url += `&channelId=${channelId}&order=viewCount`;
    if (pageToken) url += `&pageToken=${pageToken}`;

    const ytFetch = module.exports.fetchFromYouTube;
    const data = await ytFetch(url);
    if (!data.items) return { items: [], nextPageToken: null };

    const videoIds = data.items.map((item) => item.id.videoId).join(',');
    const durationUrl = `https://www.googleapis.com/youtube/v3/videos?part=contentDetails,statistics&id=${videoIds}`;
    const durationData = await ytFetch(durationUrl);

    const mapped = mapYoutubeSearchToTracks(data.items, durationData.items || [], {
        minDuration: 30,
        pageSize,
        isValidTrack: isValidMusicTrack
    });

    const payload = applyNextPageToken(mapped, data.nextPageToken);

    await persistTracksBatch(payload.items).catch(() => {});

    tracksCacheSet(cacheKey, payload);
    return payload;
}

router.get('/api/search', async (req, res) => {
    const query = req.query.q || 'музика';
    try {
        const { items } = await runInfiniteTracksSearch({ query, channelId: '', pageToken: '' });
        res.json(items || []);
    } catch (err) {
        console.error('/api/search', err);
        res.status(500).json([]);
    }
});

router.get('/api/search/tracks', async (req, res) => {
    const query = (req.query.q || '').trim();
    if (!query) {
        return res.json({ items: [], nextPageToken: null });
    }

    const pageToken = req.query.pageToken || '';
    const pageSize = Math.min(Math.max(Number(req.query.pageSize) || 20, 5), 30);

    try {
        const raw = await runInfiniteTracksSearch({
            query,
            channelId: '',
            pageToken,
            pageSize: 30
        });
        const items = enhanceSearchTracksForQuery(raw.items, query, pageSize);
        res.json({ items, nextPageToken: raw.nextPageToken || null });
    } catch (err) {
        console.error('/api/search/tracks', err);
        res.status(500).json({ items: [], nextPageToken: null });
    }
});

router.get('/api/search/infiniteTracks', async (req, res) => {
    const query = req.query.q || '';
    const channelId = req.query.channelId || '';
    const pageToken = req.query.pageToken || '';

    if (!query && !channelId) return res.status(400).json({ error: 'Query or channelId is required' });

    try {
        const out = await runInfiniteTracksSearch({ query, channelId, pageToken, pageSize: 30 });
        const items = query
            ? enhanceSearchTracksForQuery(out.items, query, 20)
            : out.items || [];
        res.json({ items, nextPageToken: out.nextPageToken || null });
    } catch (err) {
        res.status(500).json({ error: 'YouTube API error' });
    }
});

// populateMongoSongs: плейлисти з метаданими треків з Mongo
async function populateMongoSongs(playlists) {
    const youtubeIds = collectYoutubeIdsFromPlaylists(playlists);
    if (!isMongoConnected() || !youtubeIds.size) {
        return mergePlaylistWithMongoSongs(playlists, []);
    }
    const mongoSongs = await Song.find({ youtubeId: { $in: Array.from(youtubeIds) } });
    return mergePlaylistWithMongoSongs(playlists, mongoSongs);
}

// loadSitePlaylistsForQuery: публічні плейлисти сайту за запитом
async function loadSitePlaylistsForQuery(query) {
    let songYoutubeIds = [];
    try {
        const songs = await findTracksInMongoByQuery(query);
        songYoutubeIds = songs.map((s) => s.youtubeId);
    } catch (e) {
        console.error('Mongo search error:', e);
    }

    const allPublicPlaylists = await Playlist.findAll({
        where: { isPublic: true },
        include: [
            { model: User, as: 'owner', attributes: ['displayName'] },
            'tracks'
        ]
    });

    const matched = matchSitePlaylists(allPublicPlaylists, songYoutubeIds, query);
    const populated = await populateMongoSongs(matched);
    return mapSitePlaylistResults(populated);
}

router.get('/api/search/page', async (req, res) => {
    const query = (req.query.q || '').trim();
    if (!query) {
        return res.json({
            query: '',
            bestArtist: null,
            popularTracks: [],
            tracks: [],
            artists: [],
            albums: [],
            sitePlaylists: [],
            nextPageToken: null
        });
    }

    try {
        const channelsRouter = require('./channels');
        const ytClient = await channelsRouter.ytClientPromise;
        const payload = await buildPageSearch(query, {
            ytClient,
            loadSitePlaylists: loadSitePlaylistsForQuery
        });
        res.json(payload);
    } catch (err) {
        console.error('/api/search/page', err);
        res.status(500).json({
            query,
            bestArtist: null,
            popularTracks: [],
            tracks: [],
            artists: [],
            albums: [],
            sitePlaylists: [],
            nextPageToken: null
        });
    }
});

router.get('/api/search/site-playlists', async (req, res) => {
    const query = req.query.q || '';
    if (!query) return res.json([]);

    try {
        res.json(await loadSitePlaylistsForQuery(query));
    } catch (err) {
        console.error('Site Playlists Search Error:', err);
        res.json([]);
    }
});

module.exports = { router, fetchFromYouTube, runInfiniteTracksSearch, isValidMusicTrack, loadSitePlaylistsForQuery };
