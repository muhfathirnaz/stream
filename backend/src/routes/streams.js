const router = require('express').Router();
const fs = require('fs');
const path = require('path');
const THUMB_DIR = '/opt/thumbnails';
const VIDEO_READY_DIR = '/opt/media/video-ready';

// Helper agar backend bisa mencari gambar ke sub-folder manapun di Media Pool
function resolveThumbPath(inputPath) {
  if (!inputPath) return null;
  if (inputPath.startsWith('/opt/')) return inputPath; 
  
  const baseName = path.basename(inputPath);
  if (fs.existsSync(path.join(THUMB_DIR, baseName))) return path.join(THUMB_DIR, baseName);
  
  if (fs.existsSync(THUMB_DIR)) {
    const folders = fs.readdirSync(THUMB_DIR).filter(f => fs.statSync(path.join(THUMB_DIR, f)).isDirectory());
    for (const folder of folders) {
      const checkPath = path.join(THUMB_DIR, folder, baseName);
      if (fs.existsSync(checkPath)) return checkPath;
    }
  }
  return inputPath; 
}

// Acak file Video Jadi, dengan prioritas ke kategori yang dipilih (folder bisa "Cat1,Cat2" atau "Semua")
function pickRandomVideoReady(folder) {
  try {
    if (!fs.existsSync(VIDEO_READY_DIR)) return null;
    let allFiles = []; let priorityFiles = [];
    const selectedFolders = folder && folder !== 'Semua' ? folder.split(',').map(f => f.trim()).filter(Boolean) : [];
    const items = fs.readdirSync(VIDEO_READY_DIR);
    for (const item of items) {
      const itemPath = path.join(VIDEO_READY_DIR, item);
      if (fs.statSync(itemPath).isDirectory()) {
        const subFiles = fs.readdirSync(itemPath).filter(f => /\.(mp4|mkv|mov|avi|webm)$/i.test(f)).map(f => path.join(itemPath, f));
        allFiles.push(...subFiles);
        if (selectedFolders.includes(item)) priorityFiles.push(...subFiles);
      } else if (/\.(mp4|mkv|mov|avi|webm)$/i.test(item)) {
        allFiles.push(itemPath);
      }
    }
    const pool = selectedFolders.length > 0 ? (priorityFiles.length > 0 ? priorityFiles : allFiles) : allFiles;
    if (pool.length === 0) return null;
    return pool[Math.floor(Math.random() * pool.length)];
  } catch (e) { console.error('Gagal ngacak video jadi:', e); return null; }
}

router.post('/start', async (req, res) => {
  const { channelId, durationSecs, title, description, thumbnailPath, folder, auto, videoPath, songPath, videoReadyPath, mode, deleteAfterStream } = req.body;
  if (!channelId) return res.status(400).json({ error: 'channelId required' });

  try {
    let finalTitle = title; 
    let finalDesc = description; 
    let finalThumb = resolveThumbPath(thumbnailPath);
    let finalVideoReadyPath = videoReadyPath || null;
    
    const used = req.streamService.getUsedAssets();

    // JIKA AUTO ON ATAU JIKA FIELD SENGAJA DIBIARKAN KOSONG ("acak otomatis" di mode manual)
    if (auto || !finalTitle) {
      const tRes = await req.db.query("SELECT value FROM broadcast_assets WHERE type = 'title'");
      const availTitles = tRes.rows.filter(r => !used.titles.includes(r.value));
      const poolTitles = availTitles.length > 0 ? availTitles : tRes.rows;
      if (poolTitles.length > 0) finalTitle = poolTitles[Math.floor(Math.random() * poolTitles.length)].value;
    }

    if (auto || !finalDesc) {
      const dRes = await req.db.query("SELECT value FROM broadcast_assets WHERE type = 'description'");
      const availDescs = dRes.rows.filter(r => !used.descs.includes(r.value));
      const poolDescs = availDescs.length > 0 ? availDescs : dRes.rows;
      if (poolDescs.length > 0) finalDesc = poolDescs[Math.floor(Math.random() * poolDescs.length)].value;
    }

    if (auto || !finalThumb) {
      try {
        if (fs.existsSync(THUMB_DIR)) {
          let allFiles = []; let priorityFiles = [];
          const items = fs.readdirSync(THUMB_DIR);
          for (const item of items) {
            const itemPath = path.join(THUMB_DIR, item);
            if (fs.statSync(itemPath).isDirectory()) {
              const subFiles = fs.readdirSync(itemPath).filter(f => f.match(/\.(jpg|jpeg|png|webp)$/i)).map(f => path.join(itemPath, f));
              allFiles.push(...subFiles);
              if (folder && item === folder) priorityFiles.push(...subFiles);
            } else if (item.match(/\.(jpg|jpeg|png|webp)$/i)) { allFiles.push(itemPath); }
          }
          
          const availPrio = priorityFiles.filter(f => !used.thumbs.includes(f));
          const poolPrio = availPrio.length > 0 ? availPrio : priorityFiles;

          const availAll = allFiles.filter(f => !used.thumbs.includes(f));
          const poolAll = availAll.length > 0 ? availAll : allFiles;

          const pool = priorityFiles.length > 0 ? poolPrio : poolAll;
          if (pool.length > 0) finalThumb = pool[Math.floor(Math.random() * pool.length)];
        }
      } catch(e) { console.error('Gagal ngacak thumbnail:', e); }
    }

    // BARU: Mode Video Jadi (copy) + (AUTO atau belum ada file spesifik) -> acak dari kategori yang dipilih
    if (mode === 'copy' && (auto || !finalVideoReadyPath)) {
      finalVideoReadyPath = pickRandomVideoReady(folder);
      if (!finalVideoReadyPath) {
        return res.status(400).json({ error: 'Tidak ada file di Video Jadi untuk kategori yang dipilih.' });
      }
    }

    const result = await req.streamService.start(channelId, req.db, {
      durationSecs: durationSecs || 21600, title: finalTitle, description: finalDesc, thumbnailPath: finalThumb, deleteAfterStream: !!deleteAfterStream,
      folder: folder || 'Semua', videoPath: auto ? null : videoPath, songPath: auto ? null : songPath, videoReadyPath: finalVideoReadyPath
    });

    await req.db.query(`INSERT INTO stream_sessions (channel_id, started_at, status) VALUES ($1, NOW(), 'live') ON CONFLICT (channel_id) DO UPDATE SET started_at = NOW(), status = 'live'`, [channelId]);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/stop', async (req, res) => {
  const { streamId, channelId } = req.body;
  try {
    let result;
    if (streamId) result = req.streamService.stop(streamId);
    else if (channelId) result = req.streamService.stopAllByChannel(channelId);
    else return res.status(400).json({ error: 'streamId or channelId required' });
    await req.db.query(`UPDATE stream_sessions SET status = 'stopped', ended_at = NOW() WHERE channel_id = $1`, [result.channelId || channelId]);
    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/status', (_req, res) => { res.json(res.req.streamService.getStatus()); });
// ── GET /api/streams/live-stats/:channelId ───────────────────────────────────
const liveStatsCache = {}; // { channelId: { data, ts } }
const LIVE_STATS_TTL = 20000; // 20s, biar gak boros quota YouTube API

router.get('/live-stats/:channelId', async (req, res) => {
  const { channelId } = req.params;
  const cached = liveStatsCache[channelId];
  if (cached && Date.now() - cached.ts < LIVE_STATS_TTL) {
    return res.json(cached.data);
  }
  try {
    if (!req.streamService.isRunning(channelId)) {
      return res.json({ concurrentViewers: null, totalViews: null, live: false });
    }
    const ytData = req.streamService.channelYoutubeData[channelId];
    if (!ytData) return res.json({ concurrentViewers: null, totalViews: null, live: false });

    const stats = await req.streamService.youtubeService.getLiveViewerCount({
      refreshToken: ytData.refreshToken,
      videoId: ytData.broadcastId,
    });
    const data = { ...stats, live: true };
    liveStatsCache[channelId] = { data, ts: Date.now() };
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
