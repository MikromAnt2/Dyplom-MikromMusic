const express = require('express');
const { resolveTrackMetadata } = require('../services/songCache');
const { fetchFromYouTube } = require('./search');

const router = express.Router();
const YT_ID_RE = /^[\w-]{11}$/;

// GET /api/share/track/:youtubeId: метадані треку для deep link ?track=
router.get('/api/share/track/:youtubeId', async (req, res) => {
    const youtubeId = String(req.params.youtubeId || '').trim();
    if (!YT_ID_RE.test(youtubeId)) {
        return res.status(400).json({ error: 'Невірний id відео' });
    }

    try {
        const { track } = await resolveTrackMetadata(youtubeId, fetchFromYouTube);
        if (!track?.youtubeId) {
            return res.status(404).json({ error: 'Трек не знайдено' });
        }
        return res.json({
            track: {
                youtubeId: track.youtubeId,
                title: track.title || '',
                author: track.author || '',
                image: track.image || `https://i.ytimg.com/vi/${youtubeId}/hqdefault.jpg`,
                duration: Number(track.duration) || 0,
                channelId: track.channelId || undefined
            }
        });
    } catch (err) {
        console.error('share/track', youtubeId, err.message);
        return res.status(404).json({ error: 'Трек не знайдено' });
    }
});

module.exports = router;
