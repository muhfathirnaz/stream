/**
 * Song Coordinator — HTTP Server (Port 8090)
 * Tugasnya: Anti-duplicate song/video antar channel
 * Hanya accessible dari localhost
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const SONGS_DIR = process.env.SONGS_DIR || '/opt/songs';
const VIDEOS_DIR = process.env.VIDEOS_DIR || '/opt/videos'; // Tambahan path video
const PORT = process.env.PORT || 8090;

// ─── STATE ────────────────────────────────────────────────────────────────────
// { channelId: { songId, filename, lockedAt } }
const songLocks = {};
// { channelId: { videoFile, lockedAt } }
const videoLocks = {};

// ─── HELPERS ─────────────────────────────────────────────────────────────────
function getAllSongs() {
  try {
    return fs.readdirSync(SONGS_DIR)
  .filter(f => f.endsWith('.mp3') || f.endsWith('.wav') || f.endsWith('.flac'))
      .map(f => ({ filename: f, path: path.join(SONGS_DIR, f) }));
  } catch {
    return [];
  }
}

function getLockedSongs() {
  return Object.values(songLocks).map(l => l.filename);
}

function sendJSON(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  res.end(JSON.stringify(data));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => (data += chunk));
    req.on('end', () => {
      try { resolve(data ? JSON.parse(data) : {}); } catch { resolve({}); }
    });
    req.on('error', reject);
  });
}

// ─── SERVER ──────────────────────────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    return res.end();
  }

  const url = req.url.split('?')[0];

  // ── GET /status ────────────────────────────────────────────────────────────
  if (req.method === 'GET' && url === '/status') {
    const songs = getAllSongs();
    return sendJSON(res, 200, {
      songs: {
        total: songs.length,
        locked: getLockedSongs(),
        available: songs.length - getLockedSongs().length,
      },
      songLocks,
      videoLocks,
      ts: new Date().toISOString(),
    });
  }

  // ── POST /next-song ────────────────────────────────────────────────────────
  if (req.method === 'POST' && url === '/next-song') {
    const body = await readBody(req);
    const { channelId } = body;
    if (!channelId) return sendJSON(res, 400, { error: 'channelId required' });

    const allSongs = getAllSongs();
    if (allSongs.length === 0) {
      return sendJSON(res, 404, { error: 'No songs found in ' + SONGS_DIR });
    }

    const locked = getLockedSongs();
    const available = allSongs.filter(s => !locked.includes(s.filename));

    // Kalau semua sedang dipakai, reset lock (fallback)
    const pool = available.length > 0 ? available : allSongs;

    // Pilih random dari pool
    const chosen = pool[Math.floor(Math.random() * pool.length)];

    // Lock untuk channel ini
    songLocks[channelId] = {
      filename: chosen.filename,
      path: chosen.path,
      lockedAt: new Date().toISOString(),
    };

    console.log(`[SongCoord] Channel ${channelId} → ${chosen.filename}`);
    return sendJSON(res, 200, {
      channelId,
      filename: chosen.filename,
      path: chosen.path,
    });
  }

  // ── POST /release-song ─────────────────────────────────────────────────────
  if (req.method === 'POST' && url === '/release-song') {
    const body = await readBody(req);
    const { channelId } = body;
    if (!channelId) return sendJSON(res, 400, { error: 'channelId required' });

    const released = songLocks[channelId]?.filename || null;
    delete songLocks[channelId];

    console.log(`[SongCoord] Channel ${channelId} released ${released}`);
    return sendJSON(res, 200, { channelId, released });
  }

  // ── POST /next-video ───────────────────────────────────────────────────────
  if (req.method === 'POST' && url === '/next-video') {
    const body = await readBody(req);
    const { channelId } = body;
    if (!channelId) return sendJSON(res, 400, { error: 'channelId required' });

    // Placeholder: extend sesuai kebutuhan video pool lo
    const VIDEOS_DIR = process.env.VIDEOS_DIR || '/opt/videos';
    let videos = [];
    try {
      videos = fs.readdirSync(VIDEOS_DIR).filter(f => 
  f.endsWith('.mp4') || f.endsWith('.mov') || f.endsWith('.mkv')
);
    } catch { /* folder belum ada */ }

    if (videos.length === 0) {
      return sendJSON(res, 404, { error: 'No videos found in ' + VIDEOS_DIR });
    }

    const lockedVideos = Object.values(videoLocks).map(v => v.filename);
    const available = videos.filter(v => !lockedVideos.includes(v));
    const pool = available.length > 0 ? available : videos;
    const chosen = pool[Math.floor(Math.random() * pool.length)];
    const videoPath = path.join(VIDEOS_DIR, chosen);

    videoLocks[channelId] = {
      filename: chosen,
      path: videoPath,
      lockedAt: new Date().toISOString(),
    };

    console.log(`[SongCoord] Channel ${channelId} → video: ${chosen}`);
    return sendJSON(res, 200, { channelId, filename: chosen, path: videoPath });
  }

  // ── POST /release-video ────────────────────────────────────────────────────
  if (req.method === 'POST' && url === '/release-video') {
    const body = await readBody(req);
    const { channelId } = body;
    if (!channelId) return sendJSON(res, 400, { error: 'channelId required' });

    const released = videoLocks[channelId]?.filename || null;
    delete videoLocks[channelId];

    console.log(`[SongCoord] Channel ${channelId} released video: ${released}`);
    return sendJSON(res, 200, { channelId, released });
  }

  // 404
  sendJSON(res, 404, { error: 'Not found', url });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[song-coordinator] running on 127.0.0.1:${PORT}`);
  console.log(`[song-coordinator] SONGS_DIR = ${SONGS_DIR}`);
});

process.on('uncaughtException', err => console.error('[song-coordinator] crash:', err));
process.on('unhandledRejection', err => console.error('[song-coordinator] rejection:', err));

// ── GET /next-thumbnail ────────────────────────────────────────────────────
if (req.method === 'GET' && url === '/next-thumbnail') {
  const THUMBNAILS_DIR = process.env.THUMBNAILS_DIR || '/opt/thumbnails';
  let files = [];
  try {
    files = fs.readdirSync(THUMBNAILS_DIR).filter(f =>
      f.endsWith('.jpg') || f.endsWith('.jpeg') || f.endsWith('.png')
    );
  } catch { }

  if (files.length === 0) {
    return sendJSON(res, 404, { error: 'No thumbnails found in ' + THUMBNAILS_DIR });
  }

  // Anti-duplikat — exclude yang sedang dipakai
  const lockedThumbs = Object.values(videoLocks).map(v => v.thumbnail).filter(Boolean);
  const available = files.filter(f => !lockedThumbs.includes(f));
  const pool = available.length > 0 ? available : files;
  const chosen = pool[Math.floor(Math.random() * pool.length)];

  return sendJSON(res, 200, {
    filename: chosen,
    path: path.join(THUMBNAILS_DIR, chosen),
  });
}

// ── GET /next-broadcast-meta ───────────────────────────────────────────────
if (req.method === 'GET' && url === '/next-broadcast-meta') {
  const THUMBNAILS_DIR = process.env.THUMBNAILS_DIR || '/opt/thumbnails';

  // Random thumbnail
  let thumbFile = null, thumbPath = null;
  try {
    const files = fs.readdirSync(THUMBNAILS_DIR).filter(f =>
      f.endsWith('.jpg') || f.endsWith('.jpeg') || f.endsWith('.png')
    );
    const lockedThumbs = Object.values(videoLocks).map(v => v.thumbnail).filter(Boolean);
    const available = files.filter(f => !lockedThumbs.includes(f));
    const pool = available.length > 0 ? available : files;
    if (pool.length > 0) {
      thumbFile = pool[Math.floor(Math.random() * pool.length)];
      thumbPath = path.join(THUMBNAILS_DIR, thumbFile);
    }
  } catch { }

  // Random title
  const adjectives = ['Cozy', 'Chill', 'Late Night', 'Rainy Day', 'Midnight', 'Dreamy', 'Mellow', 'Peaceful', 'Serene', 'Warm'];
  const nouns = ['Vibes', 'Session', 'Beats', 'Flow', 'Journey', 'Escape', 'Mood', 'Space', 'Hour', 'Study'];
  const suffix = ['☕', '🌙', '🎵', '✨', '🌧️', '🎶', '🍵', '🌿', '🕯️', '🎸'];
  const randomAdj = adjectives[Math.floor(Math.random() * adjectives.length)];
  const randomNoun = nouns[Math.floor(Math.random() * nouns.length)];
  const randomSuffix = suffix[Math.floor(Math.random() * suffix.length)];
  const uniqueId = Math.random().toString(36).substring(2, 6).toUpperCase();
  const title = `Lofi Jazz Radio - ${randomAdj} ${randomNoun} ${randomSuffix} [${uniqueId}]`;

  // Random description
  const descriptions = [
    `Sit back and let the music carry you. ${randomAdj} lofi jazz beats for studying, working, or just relaxing. No ads, no interruptions. Just pure chill. 🎵`,
    `Your daily dose of ${randomAdj.toLowerCase()} lofi jazz. Perfect background music for focus, creativity, and relaxation. Subscribe for more! ☕`,
    `${randomAdj} ${randomNoun.toLowerCase()} playlist — handcrafted lofi jazz for your best moments. Whether you're working late or just unwinding, we've got you covered. 🌙`,
    `A continuous stream of ${randomAdj.toLowerCase()} lofi jazz. Zero interruptions. Maximum chill. Perfect for study sessions, work, or sleep. 🎶`,
    `Close your eyes and drift away with our ${randomAdj.toLowerCase()} lofi jazz collection. New tracks added regularly. Hit subscribe to never miss a beat! ✨`,
  ];
  const description = descriptions[Math.floor(Math.random() * descriptions.length)];

  return sendJSON(res, 200, {
    title,
    description,
    thumbnailPath: thumbPath,
    thumbnailFilename: thumbFile,
  });
}