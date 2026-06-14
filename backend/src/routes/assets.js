const router = require('express').Router();
const fs = require('fs');
const path = require('path');

const THUMBNAILS_DIR = process.env.THUMBNAILS_DIR || '/opt/thumbnails';
const SONGS_DIR = process.env.SONGS_DIR || '/opt/songs';

// GET /api/assets/folders — list folder lagu
router.get('/folders', (req, res) => {
  try {
    const items = fs.readdirSync(SONGS_DIR, { withFileTypes: true });
    const folders = items.filter(i => i.isDirectory()).map(i => {
      const songs = fs.readdirSync(path.join(SONGS_DIR, i.name))
        .filter(f => f.endsWith('.mp3') || f.endsWith('.wav') || f.endsWith('.flac'));
      return { name: i.name, count: songs.length };
    });
    // Root folder
    const rootSongs = items.filter(i => !i.isDirectory() && (i.name.endsWith('.mp3') || i.name.endsWith('.wav') || i.name.endsWith('.flac')));
    if (rootSongs.length > 0) folders.unshift({ name: 'default', count: rootSongs.length });
    res.json({ folders });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/assets/thumbnails — list semua thumbnail
router.get('/thumbnails', async (req, res) => {
  try {
    const { rows } = await req.db.query(
      "SELECT * FROM broadcast_assets WHERE type = 'thumbnail' ORDER BY id"
    );
    // Cek juga yang di-lock coordinator
    const coordStatus = await fetch('http://localhost:8090/status').then(r => r.json()).catch(() => ({ assetLocks: {} }));
    const lockedThumbs = Object.values(coordStatus.assetLocks || {}).map(a => a.thumbnail).filter(Boolean);
    const result = rows.map(r => ({ ...r, in_use: lockedThumbs.includes(r.value) }));
    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/assets/titles
router.get('/titles', async (req, res) => {
  try {
    const { rows } = await req.db.query(
      "SELECT * FROM broadcast_assets WHERE type = 'title' ORDER BY id"
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/assets/descriptions
router.get('/descriptions', async (req, res) => {
  try {
    const { rows } = await req.db.query(
      "SELECT * FROM broadcast_assets WHERE type = 'description' ORDER BY id"
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/assets — tambah asset baru
router.post('/', async (req, res) => {
  const { type, value, label } = req.body;
  if (!type || !value) return res.status(400).json({ error: 'type dan value wajib' });
  if (!['thumbnail', 'title', 'description'].includes(type)) return res.status(400).json({ error: 'type tidak valid' });
  try {
    const { rows } = await req.db.query(
      'INSERT INTO broadcast_assets (type, value, label) VALUES ($1, $2, $3) RETURNING *',
      [type, value, label || value]
    );
    res.status(201).json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE /api/assets/:id
router.delete('/:id', async (req, res) => {
  try {
    const { rowCount } = await req.db.query('DELETE FROM broadcast_assets WHERE id = $1', [req.params.id]);
    if (rowCount === 0) return res.status(404).json({ error: 'Not found' });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
