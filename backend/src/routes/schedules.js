const router = require('express').Router();

router.get('/', async (req, res) => {
  try {
    const { rows } = await req.db.query(
      `SELECT s.*, c.name as channel_name 
       FROM schedules s 
       JOIN channels c ON s.channel_id = c.channel_id 
       ORDER BY s.scheduled_at DESC`
    );
    
    // Membongkar JSONB 'options' agar frontend versi lama tetap bisa membaca datanya
    const formattedRows = rows.map(row => {
      const opts = row.options || {};
      return {
        ...row,
        video_ready_path: opts.videoReadyPath || null,
        thumbnail_path: opts.thumbnailPath || null,
        mode: opts.mode || 'encode'
      };
    });

    res.json(formattedRows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/', async (req, res) => {
  const { channelId, scheduledAt, durationSecs, title, folder, auto, repeatType, videoPath, songPath, videoReadyPath, thumbnailPath, mode, titleId, descriptionId } = req.body;
  
  try {
    let finalTitle = title;
    let finalDesc = '';
    
    if (!auto) {
      if (titleId) {
        const resTitle = await req.db.query("SELECT value FROM broadcast_assets WHERE id = $1", [titleId]);
        if (resTitle.rows.length > 0) finalTitle = resTitle.rows[0].value;
      }
      if (descriptionId) {
        const resDesc = await req.db.query("SELECT value FROM broadcast_assets WHERE id = $1", [descriptionId]);
        if (resDesc.rows.length > 0) finalDesc = resDesc.rows[0].value;
      }
    }

    const options = {
      videoReadyPath: videoReadyPath || null,
      thumbnailPath: thumbnailPath || null,
      mode: mode || 'encode',
      description: finalDesc
    };

    const { rows } = await req.db.query(
      `INSERT INTO schedules (channel_id, scheduled_at, duration_secs, title, status, folder, auto, repeat_type, video_path, song_path, options) 
       VALUES ($1, $2, $3, $4, 'pending', $5, $6, $7, $8, $9, $10) RETURNING *`,
      [
        channelId, scheduledAt, durationSecs, finalTitle || (auto ? 'Auto Scheduled Stream' : 'Live Stream'), folder || 'Semua', 
        !!auto, repeatType || 'none', videoPath, songPath, options 
      ]
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
