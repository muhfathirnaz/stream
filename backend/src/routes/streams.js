/**
 * POST /api/streams/start   — dipanggil oleh n8n Node 7 via localhost
 * POST /api/streams/stop    — stop stream
 * GET  /api/streams/status  — status semua stream aktif
 */

const router = require('express').Router();

// POST /api/streams/start
// Body: { channelId, imagePath, durationSecs, title, description, thumbnailPath }
// Dipanggil n8n dengan X-Internal-Key header
router.post('/start', async (req, res) => {
  // 1. Ekstrak parameter baru (streamKey dihapus karena otomatis dari YouTube API)
  const { channelId, imagePath, durationSecs, title, description, thumbnailPath } = req.body;

  if (!channelId) {
    return res.status(400).json({ error: 'channelId required' });
  }

  try {
    // 2. Eksekusi streamService.start() dengan mengirimkan req.db dan options baru
    const result = await req.streamService.start(channelId, req.db, {
      imagePath,
      durationSecs: durationSecs || 21600,
      title,
      description,
      thumbnailPath
    });

    // 3. Simpan status ke DB
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