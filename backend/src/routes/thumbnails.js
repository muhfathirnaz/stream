/**
 * POST /api/thumbnails/upload
 *   — Terima file gambar dari dashboard
 *   — Simpan langsung ke /opt/thumbnails di VPS
 *   — Trigger rclone sync push ke Google Drive
 *
 * GET /api/thumbnails
 *   — List semua file di /opt/thumbnails
 *
 * DELETE /api/thumbnails/:filename
 *   — Hapus dari lokal + trigger sync ke Drive
 *
 * POST /api/thumbnails/sync
 *   — Manual trigger rclone sync VPS → Drive
 */

const router = require('express').Router();
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

const THUMBNAILS_DIR = process.env.THUMBNAILS_DIR || '/opt/thumbnails';
const DRIVE_FOLDER = process.env.DRIVE_THUMBNAILS_FOLDER || 'thumbnails';
const ALLOWED_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
const MAX_SIZE_MB = 5;

// ─── rclone push VPS → Drive ─────────────────────────────────────────────────
function triggerRcloneSync() {
  return new Promise((resolve) => {
    const cmd = `rclone sync ${THUMBNAILS_DIR} gdrive:${DRIVE_FOLDER} --include "*.jpg" --include "*.jpeg" --include "*.png" --include "*.webp" --log-file /var/log/rclone-sync.log --log-level INFO`;

    console.log('[thumbnails] rclone push VPS → Drive...');
    exec(cmd, { timeout: 60000 }, (err, stdout, stderr) => {
      if (err) {
        console.error('[thumbnails] rclone sync error:', err.message);
        resolve({ success: false, error: err.message });
      } else {
        console.log('[thumbnails] rclone sync done');
        resolve({ success: true });
      }
    });
  });
}

// ─── GET /api/thumbnails ─────────────────────────────────────────────────────
router.get('/', (req, res) => {
  try {
    if (!fs.existsSync(THUMBNAILS_DIR)) fs.mkdirSync(THUMBNAILS_DIR, { recursive: true });
    const files = [];
    // Root files
    fs.readdirSync(THUMBNAILS_DIR)
      .filter(f => /\.(jpg|jpeg|png|webp)$/i.test(f) && fs.statSync(path.join(THUMBNAILS_DIR, f)).isFile())
      .forEach(filename => {
        const stat = fs.statSync(path.join(THUMBNAILS_DIR, filename));
        files.push({ filename, sizeBytes: stat.size, createdAt: stat.birthtime, category: '' });
      });
    // Subfolder files
    fs.readdirSync(THUMBNAILS_DIR, { withFileTypes: true })
      .filter(i => i.isDirectory())
      .forEach(dir => {
        fs.readdirSync(path.join(THUMBNAILS_DIR, dir.name))
          .filter(f => /\.(jpg|jpeg|png|webp)$/i.test(f))
          .forEach(filename => {
            const fullPath = path.join(THUMBNAILS_DIR, dir.name, filename);
            const stat = fs.statSync(fullPath);
            files.push({ filename, sizeBytes: stat.size, createdAt: stat.birthtime, category: dir.name });
          });
      });
    files.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    res.json({ total: files.length, files });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/thumbnails/upload ─────────────────────────────────────────────
router.post('/upload', async (req, res) => {
  const contentType = req.headers['content-type'] || '';
  if (!contentType.includes('multipart/form-data')) {
    return res.status(400).json({ error: 'Harus multipart/form-data' });
  }

  try {
    const Busboy = require('busboy');
    const bb = Busboy({ headers: req.headers, limits: { fileSize: MAX_SIZE_MB * 1024 * 1024 } });

    let fileBuffer = null, originalName = null, fileTooLarge = false, invalidType = false;
    let category = '';

    bb.on('field', (name, val) => { if (name === 'category') category = val; });

    bb.on('file', (name, stream, info) => {
      const { filename, mimeType } = info;
      originalName = filename;
      if (!ALLOWED_TYPES.includes(mimeType)) { invalidType = true; stream.resume(); return; }
      const chunks = [];
      stream.on('data', chunk => chunks.push(chunk));
      stream.on('limit', () => { fileTooLarge = true; stream.resume(); });
      stream.on('end', () => { if (!fileTooLarge) fileBuffer = Buffer.concat(chunks); });
    });

    bb.on('finish', async () => {
      if (invalidType) return res.status(400).json({ error: 'Tipe file tidak didukung.' });
      if (fileTooLarge) return res.status(400).json({ error: `File terlalu besar. Maks ${MAX_SIZE_MB}MB` });
      if (!fileBuffer) return res.status(400).json({ error: 'File tidak ditemukan di request' });

      try {
        if (!fs.existsSync(THUMBNAILS_DIR)) fs.mkdirSync(THUMBNAILS_DIR, { recursive: true });
        const ext = path.extname(originalName) || '.jpg';
        const safeName = path.basename(originalName, ext).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 40);
        const finalName = `${safeName}_${Date.now()}${ext}`;
        const safeCategory = category.trim().replace(/[^a-zA-Z0-9_\- ]/g, '');
        const targetDir = safeCategory ? path.join(THUMBNAILS_DIR, safeCategory) : THUMBNAILS_DIR;
        fs.mkdirSync(targetDir, { recursive: true });
        const destPath = path.join(targetDir, finalName);
        fs.writeFileSync(destPath, fileBuffer);
        console.log(`[thumbnails] Saved: ${destPath}`);
        triggerRcloneSync().catch(console.error);
        req.wsService?.broadcast('thumbnails:updated', { filename: finalName, ts: new Date().toISOString() });
        res.json({ success: true, filename: finalName, path: destPath, sizeBytes: fileBuffer.length });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    req.pipe(bb);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/thumbnails/sync ────────────────────────────────────────────────
router.post('/sync', async (req, res) => {
  try {
    const result = await triggerRcloneSync();
    const files = fs.existsSync(THUMBNAILS_DIR)
      ? fs.readdirSync(THUMBNAILS_DIR).filter(f => /\.(jpg|jpeg|png|webp)$/i.test(f))
      : [];

    req.wsService?.broadcast('thumbnails:updated', {
      source: 'manual_sync',
      total: files.length,
      ts: new Date().toISOString(),
    });

    res.json({ success: result.success, total: files.length, files, error: result.error });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── DELETE /api/thumbnails/:filename ────────────────────────────────────────
router.delete('/:filename', async (req, res) => {
  const { filename } = req.params;

  if (filename.includes('/') || filename.includes('..')) {
    return res.status(400).json({ error: 'Nama file tidak valid' });
  }

  try {
    const localPath = path.join(THUMBNAILS_DIR, filename);
    if (fs.existsSync(localPath)) {
      fs.unlinkSync(localPath);
      console.log(`[thumbnails] Deleted: ${localPath}`);
    }

    // Sync ke Drive biar Drive juga ikut hapus
    triggerRcloneSync();

    res.json({ success: true, filename });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/thumbnails/categories ──────────────────────────────────────────
router.get('/categories', (req, res) => {
  if (!fs.existsSync(THUMBNAILS_DIR)) return res.json({ categories: [] });
  const items = fs.readdirSync(THUMBNAILS_DIR, { withFileTypes: true });
  const categories = items.filter(i => i.isDirectory()).map(i => i.name);
  res.json({ categories });
});

// ─── POST /api/thumbnails/categories ─────────────────────────────────────────
router.post('/categories', (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'name wajib diisi' });
  const safe = name.trim().replace(/[^a-zA-Z0-9_\- ]/g, '');
  if (!safe) return res.status(400).json({ error: 'name tidak valid' });
  const dir = path.join(THUMBNAILS_DIR, safe);
  fs.mkdirSync(dir, { recursive: true });
  res.json({ success: true, name: safe });
});

// ─── DELETE /api/thumbnails/categories/:name ──────────────────────────────────
router.delete('/categories/:name', (req, res) => {
  const { name } = req.params;
  if (name.includes('..') || name.includes('/')) return res.status(400).json({ error: 'Invalid name' });
  const dir = path.join(THUMBNAILS_DIR, name);
  if (!fs.existsSync(dir)) return res.status(404).json({ error: 'Kategori tidak ditemukan' });
  const files = fs.readdirSync(dir);
  if (files.length > 0) return res.status(409).json({ error: 'Kategori masih ada filenya' });
  fs.rmdirSync(dir);
  res.json({ success: true });
});

// ─── GET /api/thumbnails/preview/:filename ────────────────────────────────────
router.get('/preview/:filename', (req, res) => {
  const { filename } = req.params;
  if (filename.includes('..') || filename.includes('/')) {
    return res.status(400).json({ error: 'Invalid filename' });
  }
  // Cari di root thumbnails dir dan semua subfolder
  let filePath = path.join(THUMBNAILS_DIR, filename);
  if (!fs.existsSync(filePath)) {
    // Cari di subfolder
    try {
      const dirs = fs.readdirSync(THUMBNAILS_DIR, { withFileTypes: true })
        .filter(i => i.isDirectory())
        .map(i => i.name);
      for (const dir of dirs) {
        const candidate = path.join(THUMBNAILS_DIR, dir, filename);
        if (fs.existsSync(candidate)) { filePath = candidate; break; }
      }
    } catch {}
  }
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File tidak ditemukan' });
  const ext = path.extname(filename).toLowerCase();
  const mimeMap = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };
  const mime = mimeMap[ext] || 'image/jpeg';
  res.setHeader('Content-Type', mime);
  res.setHeader('Cache-Control', 'public, max-age=3600');
  fs.createReadStream(filePath).pipe(res);
});

module.exports = router;
