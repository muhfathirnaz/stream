const router = require('express').Router();

router.get('/', async (req, res) => {
  try {
    const { rows } = await req.db.query(`SELECT s.*, c.name as channel_name FROM schedules s JOIN channels c ON s.channel_id = c.channel_id ORDER BY s.scheduled_at DESC`);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/', async (req, res) => {
  const { channelId, scheduledAt, durationSecs, title, folder, auto, repeatType, videoPath, songPath, videoReadyPath, thumbnailPath, mode } = req.body;
  try {
    const { rows } = await req.db.query(
      `INSERT INTO schedules (channel_id, scheduled_at, duration_secs, title, status, folder, auto, repeat_type, video_path, song_path, video_ready_path, thumbnail_path, mode) 
       VALUES ($1, $2, $3, $4, 'pending', $5, $6, $7, $8, $9, $10, $11, $12) RETURNING *`,
      [channelId, scheduledAt, durationSecs, title || 'Live Stream', folder || 'Semua', !!auto, repeatType || 'none', videoPath, songPath, videoReadyPath, thumbnailPath, mode || 'encode']
    );
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/:id', async (req, res) => {
  try {
    await req.db.query('DELETE FROM schedules WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});
module.exports = router;
