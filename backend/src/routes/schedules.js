const router = require('express').Router();

// GET /api/schedules — semua schedule pending & recent
router.get('/', async (req, res) => {
  try {
    const { rows } = await req.db.query(`
      SELECT s.*, c.name as channel_name
      FROM stream_schedules s
      JOIN channels c ON c.channel_id = s.channel_id
      WHERE s.status IN ('pending', 'running')
         OR s.scheduled_at > NOW() - INTERVAL '24 hours'
      ORDER BY s.scheduled_at ASC
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/schedules — buat schedule baru
router.post('/', async (req, res) => {
  const { channelId, scheduledAt, durationSecs, title } = req.body;
  if (!channelId || !scheduledAt) {
    return res.status(400).json({ error: 'channelId dan scheduledAt wajib diisi' });
  }

  const schedTime = new Date(scheduledAt);
  if (isNaN(schedTime.getTime()) || schedTime <= new Date()) {
    return res.status(400).json({ error: 'scheduledAt harus waktu UTC yang belum lewat' });
  }

  try {
    // Cek kalau channel sudah ada schedule pending
    const existing = await req.db.query(
      `SELECT id FROM stream_schedules
       WHERE channel_id = $1 AND status = 'pending'`,
      [channelId]
    );
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'Channel ini sudah punya schedule pending. Cancel dulu yang lama.' });
    }

    const { rows } = await req.db.query(
      `INSERT INTO stream_schedules (channel_id, scheduled_at, duration_secs, title)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [channelId, schedTime.toISOString(), durationSecs || 14400, title || 'Lofi Jazz Radio - Live Stream']
    );

    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/schedules/:id — cancel schedule
router.delete('/:id', async (req, res) => {
  try {
    const { rowCount } = await req.db.query(
      `UPDATE stream_schedules SET status = 'cancelled'
       WHERE id = $1 AND status = 'pending'`,
      [req.params.id]
    );
    if (rowCount === 0) return res.status(404).json({ error: 'Schedule tidak ditemukan atau sudah bukan pending' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
