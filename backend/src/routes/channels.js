// src/routes/channels.js
const express = require('express');
const router = express.Router();

// GET /api/channels — semua channel + status live
router.get('/', async (req, res) => {
  try {
    const { rows } = await req.db.query(`
      SELECT c.*, s.status as stream_status, s.started_at
      FROM channels c
      LEFT JOIN stream_sessions s ON s.channel_id = c.channel_id
      ORDER BY c.created_at
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/channels/:id
router.get('/:id', async (req, res) => {
  const { rows } = await req.db.query(
    'SELECT * FROM channels WHERE channel_id = $1', [req.params.id]
  );
  if (!rows.length) return res.status(404).json({ error: 'Not found' });
  res.json(rows[0]);
});

module.exports = router;
