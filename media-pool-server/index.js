require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { exec, execSync } = require('child_process');

const app = express();
const PORT = process.env.MEDIA_POOL_PORT || 3002;
const MEDIA_BASE_DIR = process.env.MEDIA_BASE_DIR || '/opt/media';
const RCLONE_REMOTE = process.env.RCLONE_REMOTE || 'gdrive:media-pool';
const RCLONE_ENABLED = process.env.RCLONE_ENABLED !== 'false';

app.use(cors({ origin: '*' }));
app.use(express.json());

// ─── AUTO CONVERT WAV → MP3 ───────────────────────────────────────────────────
function convertWavToMp3(wavPath) {
  return new Promise((resolve, reject) => {
    const mp3Path = wavPath.replace(/\.wav$/i, '.mp3');
    console.log(`[convert] WAV → MP3: ${path.basename(wavPath)}`);
    exec(
      `ffmpeg -y -i "${wavPath}" -codec:a libmp3lame -qscale:a 2 "${mp3Path}"`,
      { timeout: 10 * 60 * 1000 },
      (err, stdout, stderr) => {
        if (err) {
          console.error(`[convert] Gagal: ${err.message}`);
          return reject(err);
        }
        fs.unlinkSync(wavPath);
        console.log(`[convert] Selesai → ${path.basename(mp3Path)}`);
        resolve(mp3Path);
      }
    );
  });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const { type, category } = req.body;
    if (!['music', 'video', 'video-ready'].includes(type)) return cb(new Error('type harus music atau video'));
    if (!category || !category.trim()) return cb(new Error('category wajib diisi'));
    const safeCategory = category.trim().replace(/[^a-zA-Z0-9_\- ]/g, '');
    const destDir = path.join(MEDIA_BASE_DIR, type, safeCategory);
    fs.mkdirSync(destDir, { recursive: true });
    cb(null, destDir);
  },
  filename: (req, file, cb) => {
    cb(null, file.originalname.replace(/[^a-zA-Z0-9._\- ]/g, '_'));
  },
});


const fileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  const type = req.body.type;
  const okMusic = ['.mp3', '.wav', '.flac', '.ogg', '.aac', '.m4a'];
  const okVideo = ['.mp4', '.webm', '.mkv', '.mov', '.avi'];
  if (type === 'music' && okMusic.includes(ext)) return cb(null, true);
  if (type === 'video' && okVideo.includes(ext)) return cb(null, true);
  if (type === 'video-ready' && okVideo.includes(ext)) return cb(null, true);
  cb(new Error(`File ${ext} tidak diizinkan untuk tipe "${type}"`));
};

const upload = multer({ storage, fileFilter, limits: { fileSize: 25 * 1024 * 1024 * 1024 } });

app.get('/health', (_req, res) => res.json({ status: 'ok', ts: new Date().toISOString(), MEDIA_BASE_DIR }));

// ── POST /upload ──────────────────────────────────────────────────────────────
app.post('/upload', (req, res) => {
  upload.single('file')(req, res, async (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: 'Tidak ada file' });

    const { type, category } = req.body;
    const ext = path.extname(req.file.filename).toLowerCase();

    // Auto-convert WAV ke MP3 kalau upload musik
    if (type === 'music' && ext === '.wav') {
      try {
        const mp3Path = await convertWavToMp3(req.file.path);
        const mp3Filename = path.basename(mp3Path);
        const stat = fs.statSync(mp3Path);
        console.log(`[upload] ✓ ${req.file.originalname} → converted to MP3 → ${type}/${category}`);
        return res.json({
          success: true,
          filename: mp3Filename,
          original: req.file.originalname,
          converted: true,
          size: stat.size,
          type,
          category,
        });
      } catch (convErr) {
        // Gagal convert tapi file WAV masih ada, kembalikan WAV
        console.error(`[upload] Convert gagal, simpan sebagai WAV: ${convErr.message}`);
        return res.json({
          success: true,
          filename: req.file.filename,
          converted: false,
          convertError: convErr.message,
          size: req.file.size,
          type,
          category,
        });
      }
    }

    const _ext = require('path').extname(req.file.filename).toLowerCase();
    if (type === 'music' && _ext === '.wav') {
      const _mp3 = req.file.path.replace(/\.wav$/i, '.mp3');
      require('child_process').exec(`ffmpeg -y -nostdin -i "${req.file.path}" -codec:a libmp3lame -qscale:a 2 "${_mp3}" -loglevel error`, { timeout: 600000 }, (err) => {
        if (!err) { require('fs').unlinkSync(req.file.path); res.json({ success: true, filename: require('path').basename(_mp3), converted: true, size: require('fs').statSync(_mp3).size, type, category }); }
        else { res.json({ success: true, filename: req.file.filename, converted: false, size: req.file.size, type, category }); }
      });
      return;
    }
    console.log(`[upload] ✓ ${req.file.originalname} → ${type}/${category}`);
    res.json({ success: true, filename: req.file.filename, size: req.file.size, type, category });
  });
});

// ── GET /files ────────────────────────────────────────────────────────────────
app.get('/files', (req, res) => {
  const { type, category } = req.query;
  const results = [];
  const types = type ? [type] : ['music', 'video', 'video-ready'];
  for (const t of types) {
    const typeDir = path.join(MEDIA_BASE_DIR, t);
    if (!fs.existsSync(typeDir)) continue;
    const cats = category ? [category] : fs.readdirSync(typeDir).filter(d => fs.statSync(path.join(typeDir, d)).isDirectory());
    for (const cat of cats) {
      const catDir = path.join(MEDIA_BASE_DIR, t, cat);
      if (!fs.existsSync(catDir)) continue;
      const okExt = t === 'music' ? ['.mp3', '.wav', '.flac', '.ogg', '.aac', '.m4a'] : ['.mp4', '.webm', '.mkv', '.mov', '.avi'];
      fs.readdirSync(catDir).filter(f => okExt.includes(path.extname(f).toLowerCase())).forEach(filename => {
        const stat = fs.statSync(path.join(catDir, filename));
        results.push({ id: `${t}-${cat}-${filename}`, name: filename, type: t, category: cat, size: stat.size });
      });
    }
  }
  res.json({ total: results.length, files: results });
});

// ── DELETE /files/:type/:category/:filename ───────────────────────────────────
app.delete('/files/:type/:category/:filename', (req, res) => {
  const { type, category, filename } = req.params;
  if (filename.includes('..') || category.includes('..') || !['music', 'video', 'video-ready'].includes(type))
    return res.status(400).json({ error: 'Invalid path' });
  const filePath = path.join(MEDIA_BASE_DIR, type, category, filename);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File tidak ditemukan' });
  fs.unlinkSync(filePath);
  res.json({ success: true, deleted: filename });
});

// ── GET /media/:type/:category/:filename ──────────────────────────────────────
app.get('/media/:type/:category/:filename', (req, res) => {
  const { type, category, filename } = req.params;
  if (filename.includes('..') || category.includes('..') || !['music', 'video', 'video-ready'].includes(type))
    return res.status(400).json({ error: 'Invalid path' });
  const filePath = path.join(MEDIA_BASE_DIR, type, category, filename);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File tidak ditemukan' });
  const stat = fs.statSync(filePath);
  const range = req.headers.range;
  const mimeMap = { '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.flac': 'audio/flac', '.ogg': 'audio/ogg', '.aac': 'audio/aac', '.m4a': 'audio/mp4', '.mp4': 'video/mp4', '.webm': 'video/webm', '.mkv': 'video/x-matroska', '.mov': 'video/quicktime' };
  const mime = mimeMap[path.extname(filename).toLowerCase()] || 'application/octet-stream';
  if (range) {
    const [startStr, endStr] = range.replace(/bytes=/, '').split('-');
    const start = parseInt(startStr, 10);
    const end = endStr ? parseInt(endStr, 10) : stat.size - 1;
    res.writeHead(206, { 'Content-Range': `bytes ${start}-${end}/${stat.size}`, 'Accept-Ranges': 'bytes', 'Content-Length': end - start + 1, 'Content-Type': mime });
    fs.createReadStream(filePath, { start, end }).pipe(res);
  } else {
    res.writeHead(200, { 'Content-Length': stat.size, 'Content-Type': mime, 'Accept-Ranges': 'bytes' });
    fs.createReadStream(filePath).pipe(res);
  }
});

// ── POST /categories ──────────────────────────────────────────────────────────
app.post('/categories', (req, res) => {
  const { type, name } = req.body;
  if (!['music', 'video', 'video-ready'].includes(type)) return res.status(400).json({ error: 'type harus music atau video' });
  if (!name || !name.trim()) return res.status(400).json({ error: 'name wajib diisi' });
  const safe = name.trim().replace(/[^a-zA-Z0-9_\- ]/g, '');
  if (!safe) return res.status(400).json({ error: 'name tidak valid' });
  const dir = path.join(MEDIA_BASE_DIR, type, safe);
  fs.mkdirSync(dir, { recursive: true });
  res.json({ success: true, type, name: safe });
});

// ── DELETE /categories/:type/:name ────────────────────────────────────────────
app.delete('/categories/:type/:name', (req, res) => {
  const { type, name } = req.params;
  if (!['music', 'video', 'video-ready'].includes(type) || name.includes('..') || name.includes('/'))
    return res.status(400).json({ error: 'Invalid path' });
  const dir = path.join(MEDIA_BASE_DIR, type, name);
  if (!fs.existsSync(dir)) return res.status(404).json({ error: 'Kategori tidak ditemukan' });
  const files = fs.readdirSync(dir);
  if (files.length > 0) return res.status(409).json({ error: 'Kategori masih ada filenya' });
  fs.rmdirSync(dir);
  res.json({ success: true });
});

// ── GET /categories ───────────────────────────────────────────────────────────
app.get('/categories', (req, res) => {
  const { type } = req.query;
  const types = type ? [type] : ['music', 'video', 'video-ready'];
  const result = {};
  for (const t of types) {
    const dir = path.join(MEDIA_BASE_DIR, t);
    result[t] = fs.existsSync(dir) ? fs.readdirSync(dir).filter(d => fs.statSync(path.join(dir, d)).isDirectory()) : [];
  }
  res.json(result);
});

app.patch('/files/:type/:category/:filename', (req, res) => {
  const { type, category, filename } = req.params;
  const { newName } = req.body;
  if (!newName || filename.includes('..') || category.includes('..') || !['music','video','video-ready'].includes(type))
    return res.status(400).json({ error: 'Invalid' });
  const oldPath = path.join(MEDIA_BASE_DIR, type, category, filename);
  const newPath = path.join(MEDIA_BASE_DIR, type, category, newName.replace(/[^a-zA-Z0-9._\- ]/g, '_'));
  if (!fs.existsSync(oldPath)) return res.status(404).json({ error: 'File tidak ditemukan' });
  fs.renameSync(oldPath, newPath);
  res.json({ success: true, newName: path.basename(newPath) });
});

app.patch('/categories/:type/:name', (req, res) => {
  const { type, name } = req.params;
  const { newName } = req.body;
  if (!newName || name.includes('..') || !['music','video','video-ready'].includes(type))
    return res.status(400).json({ error: 'Invalid' });
  const oldPath = path.join(MEDIA_BASE_DIR, type, name);
  const safeName = newName.trim().replace(/[^a-zA-Z0-9_\- ]/g, '');
  const newPath = path.join(MEDIA_BASE_DIR, type, safeName);
  if (!fs.existsSync(oldPath)) return res.status(404).json({ error: 'Kategori tidak ditemukan' });
  if (fs.existsSync(newPath)) return res.status(409).json({ error: 'Nama sudah ada' });
  fs.renameSync(oldPath, newPath);
  res.json({ success: true, newName: safeName });
});

// ── POST /sync ────────────────────────────────────────────────────────────────

app.post('/files/move', (req, res) => {
  const { type, oldCategory, newCategory, filename } = req.body;
  const oldPath = require('path').join(process.env.MEDIA_BASE_DIR || '/opt/media', type, oldCategory, filename);
  const newDir = require('path').join(process.env.MEDIA_BASE_DIR || '/opt/media', type, newCategory);
  const newPath = require('path').join(newDir, filename);
  require('fs').mkdirSync(newDir, { recursive: true });
  require('fs').renameSync(oldPath, newPath);
  res.json({ success: true });
});
app.post('/sync', (_req, res) => {
  if (!RCLONE_ENABLED) return res.json({ success: true, skipped: true, reason: 'RCLONE_ENABLED=false' });
  exec(`rclone sync "${MEDIA_BASE_DIR}" "${RCLONE_REMOTE}" 2>&1`, { timeout: 300000 }, (err, stdout) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true, output: stdout.slice(-300) });
  });
});

// ── POST /convert-existing ────────────────────────────────────────────────────
// Trigger manual: convert semua WAV yang sudah ada di /opt/media/music
app.post('/convert-existing', async (req, res) => {
  const musicDir = path.join(MEDIA_BASE_DIR, 'music');
  if (!fs.existsSync(musicDir)) return res.json({ converted: 0, errors: 0, files: [] });

  const wavFiles = [];
  const walk = (dir) => {
    fs.readdirSync(dir).forEach(f => {
      const full = path.join(dir, f);
      if (fs.statSync(full).isDirectory()) walk(full);
      else if (f.toLowerCase().endsWith('.wav')) wavFiles.push(full);
    });
  };
  walk(musicDir);

  console.log(`[convert-existing] Ditemukan ${wavFiles.length} file WAV`);
  res.json({ message: `Memulai konversi ${wavFiles.length} file WAV di background`, total: wavFiles.length });

  // Jalankan di background setelah response dikirim
  let converted = 0, errors = 0;
  for (const wavPath of wavFiles) {
    try {
      await convertWavToMp3(wavPath);
      converted++;
    } catch (e) {
      errors++;
    }
  }
  console.log(`[convert-existing] Selesai: ${converted} berhasil, ${errors} gagal`);
});

// ── Init dirs ─────────────────────────────────────────────────────────────────
fs.mkdirSync(path.join(MEDIA_BASE_DIR, 'music'), { recursive: true });
fs.mkdirSync(path.join(MEDIA_BASE_DIR, 'video'), { recursive: true });
fs.mkdirSync(path.join(MEDIA_BASE_DIR, 'video-ready'), { recursive: true });

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[media-pool-server] ✓ Port ${PORT} | Dir: ${MEDIA_BASE_DIR} | rclone: ${RCLONE_ENABLED}`);
});