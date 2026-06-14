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
    if (!fs.existsSync(THUMBNAILS_DIR)) {
      fs.mkdirSync(THUMBNAILS_DIR, { recursive: true });
    }
    const files = fs.readdirSync(THUMBNAILS_DIR)
      .filter(f => /\.(jpg|jpeg|png|webp)$/i.test(f))
      .map(filename => {
        const fullPath = path.join(THUMBNAILS_DIR, filename);
        const stat = fs.statSync(fullPath);
        return {
          filename,
          path: fullPath,
          sizeBytes: stat.size,
          createdAt: stat.birthtime,
        };
      })
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

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
    const bb = Busboy({
      headers: req.headers,
      limits: { fileSize: MAX_SIZE_MB * 1024 * 1024 },
    });

    let fileBuffer = null;
    let originalName = null;
    let mimeType = null;
    let fileTooLarge = false;
    let invalidType = false;

    bb.on('file', (name, stream, info) => {
      const { filename, mimeType: mime } = info;
      originalName = filename;
      mimeType = mime;

      if (!ALLOWED_TYPES.includes(mime)) {
        invalidType = true;
        stream.resume();
        return;
      }

      const chunks = [];
      stream.on('data', chunk => chunks.push(chunk));
      stream.on('limit', () => { fileTooLarge = true; stream.resume(); });
      stream.on('end', () => {
        if (!fileTooLarge) fileBuffer = Buffer.concat(chunks);
      });
    });

    bb.on('finish', async () => {
      if (invalidType) {
        return res.status(400).json({ error: 'Tipe file tidak didukung. Gunakan JPG, PNG, atau WebP.' });
      }
      if (fileTooLarge) {
        return res.status(400).json({ error: `File terlalu besar. Maksimum ${MAX_SIZE_MB}MB` });
      }
      if (!fileBuffer) {
        return res.status(400).json({ error: 'File tidak ditemukan di request' });
      }

      try {
        // Pastikan folder ada
        if (!fs.existsSync(THUMBNAILS_DIR)) {
          fs.mkdirSync(THUMBNAILS_DIR, { recursive: true });
        }

        // Generate nama file unik
        const ext = path.extname(originalName) || '.jpg';
        const safeName = path.basename(originalName, ext)
          .replace(/[^a-zA-Z0-9_-]/g, '_')
          .slice(0, 40);
        const timestamp = Date.now();
        const finalName = `${safeName}_${timestamp}${ext}`;
        const destPath = path.join(THUMBNAILS_DIR, finalName);

        // Simpan ke VPS
        fs.writeFileSync(destPath, fileBuffer);
        console.log(`[thumbnails] Saved to VPS: ${destPath}`);

        // Trigger rclone push ke Drive (async, tidak block response)
        triggerRcloneSync().then(syncResult => {
          if (!syncResult.success) {
            console.error('[thumbnails] Drive sync gagal:', syncResult.error);
          }
          // Broadcast ke WebSocket kalau ada
          req.wsService?.broadcast('thumbnails:updated', {
            filename: finalName,
            ts: new Date().toISOString(),
          });
        });

        // Response langsung setelah file tersimpan di VPS
        res.json({
          success: true,
          filename: finalName,
          path: destPath,
          sizeBytes: fileBuffer.length,
        });

      } catch (err) {
        console.error('[thumbnails] save error:', err.message);
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

module.exports = router;