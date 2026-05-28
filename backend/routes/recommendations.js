const express = require('express');
const router = express.Router();

const {
  buildHomeBlocks,
  buildGuestHome,
  buildPublicFeed,
  buildSmartQueue,
  buildUserProfile,
  getHomeCache,
  setHomeCache,
  invalidateHomeCache
} = require('../services/recommendation');
const { highQualityTrackImage } = require('../services/recommendation/mediaQuality');
const {
  enrichMissingHomeBlocks,
  buildBlockCounts,
  dedupeBlocksGlobally,
} = require('../services/recommendation/homeBlocks');
const { buildArtistsYouMayLike } = require('../services/recommendation/homeArtists');
const { buildGuestBlocks } = require('../services/recommendation/guestHome');
const { blocksHaveContent, rehydrateHomeBlocks } = require('../services/recommendation/cache');

// isAuthenticated: перевіряє сесію — session.userId або passport
const isAuthenticated = (req, res, next) => {
  if (req.session.userId || req.isAuthenticated()) return next();
  res.status(401).json({ error: 'Не авторизовано' });
};

// getUserId: повертає ID авторизованого користувача — з сесії або passport
const getUserId = (req) => String(req.session.userId || req.user.id);

// parseGuestSeeds: парсить seeds гостя з query/body — до 30 youtubeId
function parseGuestSeeds(req) {
  const raw = req.query.seeds || req.body?.seeds || '';
  if (Array.isArray(raw)) return raw.filter(Boolean).slice(0, 30);
  return String(raw)
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
    .slice(0, 30);
}

// parseSessionIds: парсить session ids з query — до 40 youtubeId
function parseSessionIds(req) {
  const raw = req.query.session || req.query.sessionIds || '';
  return String(raw)
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
    .slice(0, 40);
}

router.get('/api/recommendations/public', async (req, res) => {
  try {
    const q = String(req.query.q || 'music trending top hits').slice(0, 80);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 30);
    const items = await buildPublicFeed(q, limit);
    res.json({ items, meta: { mode: 'public', q, limit } });
  } catch (err) {
    console.error('Public recommendations error:', err);
    res.json({ items: [], meta: { mode: 'public', error: true } });
  }
});

router.get('/api/recommendations/home-guest', async (req, res) => {
  const guestSeeds = parseGuestSeeds(req);
  try {
    const { blocks, meta } = await buildGuestHome(guestSeeds);
    res.json({ blocks, meta, mode: 'guest' });
  } catch (err) {
    console.error('Guest home error:', err.message || err);
    try {
      const { blocks, meta } = await buildGuestBlocks({
        mode: 'guest',
        exclude: new Set(guestSeeds),
        strength: 0,
        seedDocs: []
      });
      res.json({ blocks, meta, mode: 'guest', degraded: true });
    } catch (fallbackErr) {
      console.error('Guest home fallback error:', fallbackErr.message || fallbackErr);
      res.status(500).json({ error: 'Internal error', blocks: {} });
    }
  }
});

// sendHomeJson: відповідь Home без кешування браузером — заголовки Cache-Control
function sendHomeJson(res, payload) {
  res.set('Cache-Control', 'private, no-cache, no-store, must-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  res.status(200).json(payload);
}

router.get('/api/recommendations/home-full', isAuthenticated, async (req, res) => {
  try {
    const userId = getUserId(req);
    const force = req.query.refresh === '1';
    if (force) await invalidateHomeCache(userId);

    if (!force) {
      const cached = await getHomeCache(userId);
      if (cached?.blocks && blocksHaveContent(cached.blocks)) {
        let blocks = dedupeBlocksGlobally(rehydrateHomeBlocks(cached.blocks));
        const artistsPending = !blocks.artistsYouMayLike?.length;
        const blockCounts = buildBlockCounts(blocks);
        const meta = {
          ...(cached.meta || {}),
          blockCounts,
          fromCache: true,
          artistsPending
        };
        return sendHomeJson(res, {
          blocks,
          meta,
          recommendations: blocks.forYou || cached.recommendations || [],
          newReleases: blocks.newForYou || cached.newReleases || [],
          soundtracks: blocks.similarToRecent || cached.soundtracks || [],
          albumsForYou: blocks.albumsForYou || [],
          artistsYouMayLike: blocks.artistsYouMayLike || []
        });
      }
    }

    const profile = await buildUserProfile(userId);
    let { blocks, meta } = await buildHomeBlocks(profile);
    blocks = await enrichMissingHomeBlocks(blocks, profile, { skipArtists: true });

    const payload = {
      blocks,
      meta: {
        ...meta,
        blockCounts: buildBlockCounts(blocks),
        artistsPending: !blocks.artistsYouMayLike?.length
      },
      recommendations: blocks.forYou || [],
      newReleases: blocks.newForYou || [],
      soundtracks: blocks.similarToRecent || [],
      albumsForYou: blocks.albumsForYou || [],
      quickPick: blocks.quickPick || [],
      newFromSubscribed: blocks.newFromSubscribed || [],
      artistsYouMayLike: blocks.artistsYouMayLike || []
    };

    await setHomeCache(userId, payload);
    sendHomeJson(res, payload);
  } catch (err) {
    console.error('Home Full Error:', err);
    res.status(500).json({
      error: 'Не вдалося сформувати персональні рекомендації. Спробуйте оновити сторінку.',
      blocks: {},
      meta: { error: true, message: err.message }
    });
  }
});

router.get('/api/recommendations/radio', async (req, res) => {
  try {
    const { youtubeId, title, author } = req.query;
    if (!youtubeId) return res.status(400).json({ error: 'Не вказано youtubeId треку' });

    const userId = req.session?.userId || (req.user && req.user.id);
    const guestSeeds = parseGuestSeeds(req);
    const sessionIds = parseSessionIds(req);

    const seedTrack = {
      youtubeId,
      title: title || '',
      author: author || '',
      image: highQualityTrackImage(youtubeId)
    };

    const queue = await buildSmartQueue(seedTrack, {
      userId: userId ? String(userId) : null,
      guestSeeds,
      sessionIds: [youtubeId, ...sessionIds]
    });

    res.json(queue);
  } catch (err) {
    console.error('Radio generation error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/api/recommendations/home-artists', isAuthenticated, async (req, res) => {
  try {
    const userId = getUserId(req);
    const profile = await buildUserProfile(userId);
    const artistsYouMayLike = await buildArtistsYouMayLike(profile);

    const cached = await getHomeCache(userId);
    if (cached?.blocks) {
      cached.blocks.artistsYouMayLike = artistsYouMayLike;
      await setHomeCache(userId, {
        ...cached,
        blocks: { ...cached.blocks, artistsYouMayLike }
      });
    }

    sendHomeJson(res, {
      artistsYouMayLike,
      meta: { blockCounts: { artistsYouMayLike: artistsYouMayLike.length } }
    });
  } catch (err) {
    console.error('Home artists error:', err);
    res.status(500).json({ error: 'Не вдалося підібрати виконавців', artistsYouMayLike: [] });
  }
});

module.exports = router;
