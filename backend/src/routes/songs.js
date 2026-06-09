/**
 * GET  /api/songs         — list semua lagu di pool
 * POST /api/songs/refresh — dipanggil n8n Node 7 setelah song sync selesai
 */

const router = require('express').Router();
const fs = require('fs');
const path = require('path');

const SONGS_DIR = process.env.SONGS_DIR || '/opt/songs';

// GET /api/songs
router.get('/', async (req, res) => {
  try {
    // Ambil dari DB + status dari coordinator
    const { rows } = await req.db.query(
      'SELECT * FROM songs ORDER BY created_at DESC'
    );
    const coordStatus = await req.songCoord.getStatus().catch(() => ({ locked: [] }));

    const songs = rows.map((s) => ({
      ...s,
      status: coordStatus.locked?.includes(s.filename) ? 'playing' : 'idle',
    }));

    res.json({ total: songs.length, songs });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/songs/refresh
// Dipanggil n8n setelah download lagu baru ke /opt/songs/
router.post('/refresh', async (req, res) => {
  try {
    const files = fs.readdirSync(SONGS_DIR).filter((f) => f.endsWith('.mp3'));

    // Sync ke DB
    let added = 0;
    for (const filename of files) {
      const fullPath = path.join(SONGS_DIR, filename);
      const stat = fs.statSync(fullPath);
      const result = await req.db.query(
        `INSERT INTO songs (filename, path, size_bytes)
         VALUES ($1, $2, $3)
         ON CONFLICT (filename) DO NOTHING`,
        [filename, fullPath, stat.size]
      );
      if (result.rowCount > 0) added++;
    }

    // Broadcast ke WebSocket supaya dashboard auto-update
    req.wsService.broadcast('songs:refreshed', {
      total: files.length,
      added,
      ts: new Date().toISOString(),
    });

    res.json({ success: true, total: files.length, added });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
