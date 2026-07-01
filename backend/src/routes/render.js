/**
 * Render feature routes
 * GET  /api/render/songs           — list lagu dari Media Pool (buat dipilih multi-select)
 * GET  /api/render/videos          — list video dari Media Pool (buat dipilih sumber loop)
 * GET  /api/render/lyrics          — list status lyric semua lagu
 * POST /api/render/lyrics/transcribe   — trigger transkrip manual 1 lagu (tanpa nunggu job render)
 * POST /api/render/lyrics/upload       — upload lyric manual (.srt/.vtt/.lrc/.ass)
 * DELETE /api/render/lyrics            — hapus lyric 1 lagu (body: { songPath })
 * POST /api/render/jobs            — buat job render baru
 * GET  /api/render/jobs            — list job render (history + yang lagi proses)
 * POST /api/render/jobs/:id/cancel — batalin job yang lagi proses
 */

const router = require('express').Router();
const fs = require('fs');
const path = require('path');
const Busboy = require('busboy');
const { execSync } = require('child_process');

function getDuration(filePath) {
  try {
    const out = execSync(
      `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${filePath}"`,
      { timeout: 5000 }
    ).toString().trim();
    const secs = parseFloat(out);
    return isNaN(secs) ? null : secs;
  } catch { return null; }
}

const MUSIC_DIR = '/opt/media/music';
const VIDEO_DIR = '/opt/media/video';
const VIDEO_READY_DIR = '/opt/media/video-ready';

function listFilesRecursive(baseDir, extRegex) {
  const out = [];
  if (!fs.existsSync(baseDir)) return out;
  const items = fs.readdirSync(baseDir);
  for (const item of items) {
    const itemPath = path.join(baseDir, item);
    const stat = fs.statSync(itemPath);
    if (stat.isDirectory()) {
      fs.readdirSync(itemPath)
        .filter(f => extRegex.test(f))
        .forEach(f => {
          const fp = path.join(itemPath, f);
          out.push({ filename: f, category: item, path: fp, size: fs.statSync(fp).size });
        });
    } else if (extRegex.test(item)) {
      out.push({ filename: item, category: 'Uncategorized', path: itemPath, size: stat.size });
    }
  }
  return out;
}

// GET /api/render/songs
router.get('/songs', (req, res) => {
  try {
    const songs = listFilesRecursive(MUSIC_DIR, /\.(mp3|wav|flac|ogg|m4a|aac)$/i);
    const songsWithDur = songs.map(s => ({ ...s, duration: getDuration(s.path) }));
    res.json({ songs: songsWithDur });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/render/videos  (loop source: video biasa ATAU video-ready)
router.get('/videos', (req, res) => {
  try {
    const videos = listFilesRecursive(VIDEO_DIR, /\.(mp4|mkv|mov|avi|webm)$/i);
    const videoReady = listFilesRecursive(VIDEO_READY_DIR, /\.(mp4|mkv|mov|avi|webm)$/i);
    res.json({ videos: [...videos, ...videoReady] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/render/lyrics
router.get('/lyrics', async (req, res) => {
  try {
    const lyrics = await req.lyricsService.listAllLyrics();
    res.json({ lyrics });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/render/lyrics/transcribe  { songPath }
router.post('/lyrics/transcribe', async (req, res) => {
  const { songPath } = req.body;
  if (!songPath) return res.status(400).json({ error: 'songPath wajib diisi' });
  try {
    // Jalan di background, langsung respond supaya UI gak nge-block
    res.json({ success: true, message: 'Transkrip dimulai di background' });
    req.lyricsService.ensureLyrics(songPath).catch(err => {
      console.error('[render/lyrics/transcribe] gagal:', err.message);
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE /api/render/lyrics  { songPath }
router.delete('/lyrics', async (req, res) => {
  const { songPath } = req.body;
  if (!songPath) return res.status(400).json({ error: 'songPath wajib diisi' });
  try {
    await req.lyricsService.deleteLyric(songPath);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/render/lyrics/upload  (multipart: file + songPath)
router.post('/lyrics/upload', (req, res) => {
  const contentType = req.headers['content-type'] || '';
  if (!contentType.includes('multipart/form-data')) {
    return res.status(400).json({ error: 'Harus multipart/form-data' });
  }
  const bb = Busboy({ headers: req.headers, limits: { fileSize: 5 * 1024 * 1024 } });
  let songPath = '';
  let fileBuffer = null;
  let originalExt = '';

  bb.on('field', (name, val) => { if (name === 'songPath') songPath = val; });
  bb.on('file', (name, stream, info) => {
    originalExt = path.extname(info.filename).toLowerCase();
    const chunks = [];
    stream.on('data', c => chunks.push(c));
    stream.on('end', () => { fileBuffer = Buffer.concat(chunks); });
  });

  bb.on('finish', async () => {
    if (!songPath || !fileBuffer) return res.status(400).json({ error: 'songPath dan file wajib ada' });
    if (!['.srt', '.vtt', '.lrc', '.ass'].includes(originalExt)) {
      return res.status(400).json({ error: 'Format harus .srt, .vtt, .lrc, atau .ass' });
    }
    try {
      const tmpPath = `/tmp/lyric_upload_${Date.now()}${originalExt}`;
      fs.writeFileSync(tmpPath, fileBuffer);
      const assPath = await req.lyricsService.saveManualLyric(songPath, tmpPath, originalExt);
      fs.unlinkSync(tmpPath);
      res.json({ success: true, assPath });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  req.pipe(bb);
});

// POST /api/render/jobs
// body: { outputName, outputCategory, videoPath, songs: [{ path, filename, loopToTargetDuration, targetDurationSecs, useLyrics }] }
router.post('/jobs', async (req, res) => {
  const { outputName, outputCategory, videoPath, songs, totalDurationSecs } = req.body;
  if (!outputName || !videoPath || !Array.isArray(songs) || songs.length === 0) {
    return res.status(400).json({ error: 'outputName, videoPath, dan songs (min 1) wajib diisi' });
  }
  try {
    const job = await req.renderQueue.createJob({ outputName, outputCategory, videoPath, songs, totalDurationSecs });
    res.json({ success: true, job });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/render/jobs
router.get('/jobs', async (req, res) => {
  try {
    const jobs = await req.renderQueue.listJobs();
    res.json({ jobs });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE /api/render/jobs — hapus semua jobs (kecuali yang sedang running)
router.delete('/jobs', async (req, res) => {
  try {
    await req.db.query("DELETE FROM render_jobs WHERE status NOT IN ('running', 'queued')");
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/render/jobs/:id/cancel
router.post('/jobs/:id/cancel', (req, res) => {
  try {
    req.renderQueue.cancelJob(parseInt(req.params.id, 10));
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
