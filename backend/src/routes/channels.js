const express = require('express');
const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const { rows } = await req.db.query(`
      SELECT
        c.id, c.channel_id, c.name, c.image_path, c.youtube_channel_id,
        CASE WHEN c.google_refresh_token IS NOT NULL AND c.google_refresh_token != ''
             THEN '***' ELSE NULL END as google_refresh_token,
        s.status as stream_status, s.started_at
      FROM channels c
      LEFT JOIN stream_sessions s ON s.channel_id = c.channel_id
      ORDER BY c.created_at
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', async (req, res) => {
  const { rows } = await req.db.query(
    'SELECT id, channel_id, name, image_path FROM channels WHERE channel_id = $1',
    [req.params.id]
  );
  if (!rows.length) return res.status(404).json({ error: 'Not found' });
  res.json(rows[0]);
});

router.post('/', async (req, res) => {
  const { name, refresh_token } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'name wajib diisi' });
  if (!refresh_token || !refresh_token.trim()) return res.status(400).json({ error: 'refresh_token wajib diisi' });

  try {
    const channelId = 'ch_' + name.toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 20);

    const { rows } = await req.db.query(
      `INSERT INTO channels (channel_id, name, google_refresh_token)
       VALUES ($1, $2, $3)
       RETURNING id, channel_id, name`,
      [channelId, name.trim(), refresh_token.trim()]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Channel dengan nama ini sudah ada' });
    res.status(500).json({ error: err.message });
  }
});

router.patch('/:id/token', async (req, res) => {
  const { refresh_token } = req.body;
  if (!refresh_token || !refresh_token.trim()) return res.status(400).json({ error: 'refresh_token wajib diisi' });

  try {
    const { rowCount } = await req.db.query(
      'UPDATE channels SET google_refresh_token = $1 WHERE channel_id = $2',
      [refresh_token.trim(), req.params.id]
    );
    if (rowCount === 0) return res.status(404).json({ error: 'Channel tidak ditemukan' });
    res.json({ success: true, channel_id: req.params.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    await req.db.query('DELETE FROM stream_sessions WHERE channel_id = $1', [req.params.id]);
    const { rowCount } = await req.db.query('DELETE FROM channels WHERE channel_id = $1', [req.params.id]);
    if (rowCount === 0) return res.status(404).json({ error: 'Channel tidak ditemukan' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
