/**
 * POST /api/streams/start   — dipanggil oleh n8n Node 7 via localhost
 * POST /api/streams/stop    — stop stream
 * GET  /api/streams/status  — status semua stream aktif
 */

const router = require('express').Router();

// POST /api/streams/start
// Body: { channelId, streamKey, imagePath, durationSecs }
// Dipanggil n8n dengan X-Internal-Key header
router.post('/start', async (req, res) => {
  const { channelId, streamKey, imagePath, durationSecs } = req.body;

  if (!channelId || !streamKey) {
    return res.status(400).json({ error: 'channelId and streamKey required' });
  }

  try {
    const result = await req.streamService.start({
      channelId,
      streamKey,
      durationSecs: durationSecs || 21600,
    });

    // Simpan ke DB
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

// POST /api/streams/stop
router.post('/stop', async (req, res) => {
  const { channelId } = req.body;
  if (!channelId) return res.status(400).json({ error: 'channelId required' });

  try {
    const result = req.streamService.stop(channelId);
    await req.db.query(
      `UPDATE stream_sessions SET status = 'stopped', ended_at = NOW() WHERE channel_id = $1`,
      [channelId]
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
