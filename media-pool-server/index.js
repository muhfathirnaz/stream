require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');

const app = express();
const PORT = process.env.MEDIA_POOL_PORT || 3002;
const MEDIA_BASE_DIR = process.env.MEDIA_BASE_DIR || '/opt/media';
const RCLONE_REMOTE = process.env.RCLONE_REMOTE || 'gdrive:media-pool';
const RCLONE_ENABLED = process.env.RCLONE_ENABLED !== 'false';

app.use(cors({ origin: '*' }));
app.use(express.json());

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const { type, category } = req.body;
    if (!['music', 'video'].includes(type)) return cb(new Error('type harus music atau video'));
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
  const okMusic = ['.mp3','.wav','.flac','.ogg','.aac','.m4a'];
  const okVideo = ['.mp4','.webm','.mkv','.mov','.avi'];
  if (type === 'music' && okMusic.includes(ext)) return cb(null, true);
  if (type === 'video' && okVideo.includes(ext)) return cb(null, true);
  cb(new Error(`File ${ext} tidak diizinkan untuk tipe "${type}"`));
};

const upload = multer({ storage, fileFilter, limits: { fileSize: 500 * 1024 * 1024 } });

app.get('/health', (_req, res) => res.json({ status: 'ok', ts: new Date().toISOString(), MEDIA_BASE_DIR }));

app.post('/upload', (req, res) => {
  upload.single('file')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: 'Tidak ada file' });
    const { type, category } = req.body;
    console.log(`[upload] ✓ ${req.file.originalname} → ${type}/${category}`);
    res.json({ success: true, filename: req.file.filename, size: req.file.size, type, category });
  });
});

app.get('/files', (req, res) => {
  const { type, category } = req.query;
  const results = [];
  const types = type ? [type] : ['music', 'video'];
  for (const t of types) {
    const typeDir = path.join(MEDIA_BASE_DIR, t);
    if (!fs.existsSync(typeDir)) continue;
    const cats = category ? [category] : fs.readdirSync(typeDir).filter(d => fs.statSync(path.join(typeDir, d)).isDirectory());
    for (const cat of cats) {
      const catDir = path.join(MEDIA_BASE_DIR, t, cat);
      if (!fs.existsSync(catDir)) continue;
      const okExt = t === 'music' ? ['.mp3','.wav','.flac','.ogg','.aac','.m4a'] : ['.mp4','.webm','.mkv','.mov','.avi'];
      fs.readdirSync(catDir).filter(f => okExt.includes(path.extname(f).toLowerCase())).forEach(filename => {
        const stat = fs.statSync(path.join(catDir, filename));
        results.push({ id: `${t}-${cat}-${filename}`, name: filename, type: t, category: cat, size: stat.size });
      });
    }
  }
  res.json({ total: results.length, files: results });
});

app.delete('/files/:type/:category/:filename', (req, res) => {
  const { type, category, filename } = req.params;
  if (filename.includes('..') || category.includes('..') || !['music','video'].includes(type))
    return res.status(400).json({ error: 'Invalid path' });
  const filePath = path.join(MEDIA_BASE_DIR, type, category, filename);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File tidak ditemukan' });
  fs.unlinkSync(filePath);
  res.json({ success: true, deleted: filename });
});

app.get('/media/:type/:category/:filename', (req, res) => {
  const { type, category, filename } = req.params;
  if (filename.includes('..') || category.includes('..') || !['music','video'].includes(type))
    return res.status(400).json({ error: 'Invalid path' });
  const filePath = path.join(MEDIA_BASE_DIR, type, category, filename);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File tidak ditemukan' });
  const stat = fs.statSync(filePath);
  const range = req.headers.range;
  const mimeMap = { '.mp3':'audio/mpeg','.wav':'audio/wav','.flac':'audio/flac','.ogg':'audio/ogg','.aac':'audio/aac','.m4a':'audio/mp4','.mp4':'video/mp4','.webm':'video/webm','.mkv':'video/x-matroska','.mov':'video/quicktime' };
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

app.get('/categories', (req, res) => {
  const { type } = req.query;
  const types = type ? [type] : ['music', 'video'];
  const result = {};
  for (const t of types) {
    const dir = path.join(MEDIA_BASE_DIR, t);
    result[t] = fs.existsSync(dir) ? fs.readdirSync(dir).filter(d => fs.statSync(path.join(dir, d)).isDirectory()) : [];
  }
  res.json(result);
});

app.post('/sync', (_req, res) => {
  if (!RCLONE_ENABLED) return res.json({ success: true, skipped: true, reason: 'RCLONE_ENABLED=false' });
  exec(`rclone sync "${MEDIA_BASE_DIR}" "${RCLONE_REMOTE}" 2>&1`, { timeout: 300000 }, (err, stdout) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true, output: stdout.slice(-300) });
  });
});

fs.mkdirSync(path.join(MEDIA_BASE_DIR, 'music'), { recursive: true });
fs.mkdirSync(path.join(MEDIA_BASE_DIR, 'video'), { recursive: true });

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[media-pool-server] ✓ Port ${PORT} | Dir: ${MEDIA_BASE_DIR} | rclone: ${RCLONE_ENABLED}`);
});
