const express = require('express');
const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const { rows } = await req.db.query(`
      SELECT
        c.id, c.channel_id, c.name, c.image_path, c.stream_key, c.youtube_channel_id,
        c.google_refresh_token,
        s.status as stream_status, s.started_at
      FROM channels c
      LEFT JOIN stream_sessions s ON s.channel_id = c.channel_id
      ORDER BY c.created_at
    `);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/:id', async (req, res) => {
  try {
    const { rows } = await req.db.query('SELECT * FROM channels WHERE channel_id = $1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/', async (req, res) => {
  const { name, refresh_token, stream_key } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'name wajib diisi' });

  try {
    const channelId = 'ch_' + name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 20);
    const { rows } = await req.db.query(
      `INSERT INTO channels (channel_id, name, google_refresh_token, stream_key) 
       VALUES ($1, $2, $3, $4) RETURNING id, channel_id, name`,
      [channelId, name.trim(), refresh_token ? refresh_token.trim() : null, stream_key ? stream_key.trim() : null]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Channel sudah ada' });
    res.status(500).json({ error: err.message });
  }
});

// PATCH FIX: Sekarang bisa menerima input kosong untuk menghapus Stream Key
router.patch('/:id', async (req, res) => {
  const { refresh_token, stream_key } = req.body;
  try {
    let updates = [];
    let values = [];
    let count = 1;
    
    if (refresh_token !== undefined) {
      updates.push(`google_refresh_token = $${count++}`);
      values.push(refresh_token.trim() === '' ? null : refresh_token.trim());
    }
    if (stream_key !== undefined) {
      updates.push(`stream_key = $${count++}`);
      values.push(stream_key.trim() === '' ? null : stream_key.trim());
    }

    if (updates.length === 0) return res.status(400).json({ error: 'Tidak ada data' });

    values.push(req.params.id);
    const query = `UPDATE channels SET ${updates.join(', ')} WHERE channel_id = $${count}`;
    const { rowCount } = await req.db.query(query, values);
    
    if (rowCount === 0) return res.status(404).json({ error: 'Channel tidak ditemukan' });
    res.json({ success: true, channel_id: req.params.id });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/:id/oauth', async (req, res) => {
  const { google_refresh_token, youtube_channel_id } = req.body;
  try {
    await req.db.query(
      'UPDATE channels SET google_refresh_token = $1, youtube_channel_id = $2 WHERE channel_id = $3',
      [google_refresh_token, youtube_channel_id, req.params.id]
    );
    res.json({ message: 'OAuth data updated successfully' });
  } catch (err) { res.status(500).json({ error: 'Failed to update OAuth data' }); }
});

router.delete('/:id', async (req, res) => {
  try {
    await req.db.query('DELETE FROM stream_sessions WHERE channel_id = $1', [req.params.id]);
    const { rowCount } = await req.db.query('DELETE FROM channels WHERE channel_id = $1', [req.params.id]);
    if (rowCount === 0) return res.status(404).json({ error: 'Channel tidak ditemukan' });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
