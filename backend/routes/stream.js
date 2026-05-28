const express = require('express');
const router = express.Router();

const { resolveAudioStreamUrl } = require('../services/streamResolver');

// isValidVideoId: перевірка формату YouTube video id (11 символів)
function isValidVideoId(id) {
  return typeof id === 'string' && /^[\w-]{11}$/.test(id);
}

router.get('/api/stream/:videoId', async (req, res) => {
  const videoId = String(req.params.videoId || '').trim();
  if (!isValidVideoId(videoId)) {
    return res.status(400).json({ error: 'Invalid videoId' });
  }

  const prefer = String(req.query.prefer || '').trim().toUpperCase();
  const order = String(req.query.order || '').trim().toUpperCase();
  const debug = String(req.query.debug || '') === '1';

  try {
    const out = await resolveAudioStreamUrl(videoId, {
      preferClient: prefer || null,
      order: order || null
    });

    res.set('Cache-Control', 'no-store');
    res.json(out);
  } catch (err) {
    const msg = err?.message || String(err);
    if (msg.includes('TEMP_UNAVAILABLE')) {
      const body = { error: 'TEMP_UNAVAILABLE' };
      if (debug && err?.details) body.details = err.details;
      return res.status(503).json(body);
    }
    console.error('[stream]', videoId, err);
    return res.status(500).json({ error: 'STREAM_ERROR' });
  }
});

module.exports = router;
