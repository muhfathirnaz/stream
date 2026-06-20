const router = require('express').Router();
const fs = require('fs');
const path = require('path');

router.get('/titles', async (req, res) => {
  try { const { rows } = await req.db.query("SELECT * FROM broadcast_assets WHERE type = 'title' ORDER BY created_at DESC"); res.json(rows); } 
  catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/descriptions', async (req, res) => {
  try { const { rows } = await req.db.query("SELECT * FROM broadcast_assets WHERE type = 'description' ORDER BY created_at DESC"); res.json(rows); } 
  catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/', async (req, res) => {
  const { type, value, label, category = 'Uncategorized' } = req.body;
  try { const { rows } = await req.db.query("INSERT INTO broadcast_assets (type, value, label, category) VALUES ($1, $2, $3, $4) RETURNING *", [type, value, label, category]); res.json(rows[0]); } 
  catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/:id', async (req, res) => {
  try { await req.db.query("DELETE FROM broadcast_assets WHERE id = $1", [req.params.id]); res.json({ success: true }); } 
  catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/folders', (req, res) => {
  const MUSIC_DIR = '/opt/media/music';
  let folders = [];
  if (fs.existsSync(MUSIC_DIR)) {
    folders = fs.readdirSync(MUSIC_DIR).filter(f => fs.statSync(path.join(MUSIC_DIR, f)).isDirectory()).map(name => {
      const count = fs.readdirSync(path.join(MUSIC_DIR, name)).filter(f => fs.statSync(path.join(MUSIC_DIR, name, f)).isFile()).length;
      return { name, count };
    });
  }
  res.json({ folders });
});

router.get('/mediaFiles', (req, res) => {
  const getFiles = (dir) => {
    if (!fs.existsSync(dir)) return [];
    let files = [];
    const items = fs.readdirSync(dir);
    for (const item of items) {
      const itemPath = path.join(dir, item);
      if (fs.statSync(itemPath).isDirectory()) {
        const sub = fs.readdirSync(itemPath).filter(f => fs.statSync(path.join(itemPath, f)).isFile());
        files.push(...sub.map(f => ({ filename: f, category: item, path: path.join(itemPath, f) })));
      } else if (fs.statSync(itemPath).isFile()) {
        files.push({ filename: item, category: 'Uncategorized', path: itemPath });
      }
    }
    return files;
  };
  res.json({ videos: getFiles('/opt/media/video'), songs: getFiles('/opt/media/music') });
});

router.get('/videoReadyFiles', (req, res) => {
  const VIDEO_READY_DIR = '/opt/media/video-ready';
  if (!fs.existsSync(VIDEO_READY_DIR)) return res.json({ files: [] });
  const files = [];
  try {
    fs.readdirSync(VIDEO_READY_DIR).forEach(cat => {
      const catDir = path.join(VIDEO_READY_DIR, cat);
      if (!fs.statSync(catDir).isDirectory()) return;
      fs.readdirSync(catDir)
        .filter(f => fs.statSync(path.join(catDir, f)).isFile() && /\.(mp4|mkv|mov|avi|webm)$/i.test(f))
        .forEach(f => {
          const fp = path.join(catDir, f);
          const stat = fs.statSync(fp);
          files.push({ filename: f, category: cat, path: fp, size: stat.size });
        });
    });
  } catch(e) { console.error(e); }
  res.json({ files });
});

router.post('/move', async (req, res) => {
  try { await req.db.query("UPDATE broadcast_assets SET category = $1 WHERE id = $2", [req.body.category, req.body.id]); res.json({ success: true }); } catch(e) { res.status(500).json({error: e.message}); }
});

router.get('/text-categories', async (req, res) => {
  try { const { rows } = await req.db.query("SELECT DISTINCT category FROM broadcast_assets WHERE category IS NOT NULL AND category != ''"); res.json({ categories: rows.map(r => r.category) }); } catch(e) { res.status(500).json({error: e.message}); }
});

// --- LOGIKA BARU UNTUK MEMBUAT & MENGHAPUS FOLDER TEKS ---
router.post('/text-categories', async (req, res) => {
  try {
    try {
      await req.db.query("INSERT INTO broadcast_assets (type, value, label, category) VALUES ('category_marker', '', '', $1)", [req.body.name]);
    } catch(err) {
      await req.db.query("ALTER TABLE broadcast_assets ADD COLUMN IF NOT EXISTS category VARCHAR(100) DEFAULT 'Uncategorized'");
      await req.db.query("INSERT INTO broadcast_assets (type, value, label, category) VALUES ('category_marker', '', '', $1)", [req.body.name]);
    }
    res.json({ success: true });
  } catch(e) { res.status(500).json({error: e.message}); }
});

router.delete('/text-categories/:name', async (req, res) => {
  try {
    const cat = req.params.name;
    await req.db.query("DELETE FROM broadcast_assets WHERE type = 'category_marker' AND category = $1", [cat]);
    await req.db.query("UPDATE broadcast_assets SET category = 'Uncategorized' WHERE category = $1", [cat]);
    res.json({ success: true });
  } catch(e) { res.status(500).json({error: e.message}); }
});

module.exports = router;