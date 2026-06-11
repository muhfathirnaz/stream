const router = require('express').Router();

// POST /api/streams/start
router.post('/start', async (req, res) => {
  const { channelId, imagePath, durationSecs, title, description, thumbnailPath } = req.body;
  if (!channelId) return res.status(400).json({ error: 'channelId required' });

  try {
    const result = await req.streamService.start(channelId, req.db, {
      imagePath,
      durationSecs: durationSecs || 21600,
      title,
      description,
      thumbnailPath
    });

    await req.db.query(
      `INSERT INTO stream_sessions (channel_id, started_at, status)
       VALUES ($1, NOW(), 'live')
       ON CONFLICT (channel_id) DO UPDATE SET started_at = NOW(), status = 'live'`,
      [channelId]
    );

    res.json({ success: true, ...result });
  } catch (err) {
    console.error('[streams/start]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/streams/stop — stop by streamId
router.post('/stop', async (req, res) => {
  const { streamId, channelId } = req.body;

  try {
    let result;
    if (streamId) {
      // Stop stream spesifik
      result = req.streamService.stop(streamId);
    } else if (channelId) {
      // Stop semua stream di channel ini
      result = req.streamService.stopAllByChannel(channelId);
    } else {
      return res.status(400).json({ error: 'streamId or channelId required' });
    }

    await req.db.query(
      `UPDATE stream_sessions SET status = 'stopped', ended_at = NOW() WHERE channel_id = $1`,
      [result.channelId || channelId]
    );

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/streams/status
router.get('/status', (_req, res) => {
  res.json(res.req.streamService.getStatus());
});

module.exports = router;
