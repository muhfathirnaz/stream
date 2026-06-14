const http = require('http');
const fs = require('fs');
const path = require('path');

const SONGS_DIR = process.env.SONGS_DIR || '/opt/songs';
const VIDEOS_DIR = process.env.VIDEOS_DIR || '/opt/videos';
const THUMBNAILS_DIR = process.env.THUMBNAILS_DIR || '/opt/thumbnails';
const PORT = process.env.PORT || 8090;

const songLocks = {};
const videoLocks = {};
const assetLocks = {}; // { channelId: { thumbnail, title, description } }

function getSongsInFolder(folder) {
  const dir = folder ? path.join(SONGS_DIR, folder) : SONGS_DIR;
  try {
    return fs.readdirSync(dir)
      .filter(f => f.endsWith('.mp3') || f.endsWith('.wav') || f.endsWith('.flac'))
      .map(f => ({ filename: f, path: path.join(dir, f), folder: folder || 'default' }));
  } catch { return []; }
}

function getAllFolders() {
  try {
    const items = fs.readdirSync(SONGS_DIR, { withFileTypes: true });
    const folders = items.filter(i => i.isDirectory()).map(i => i.name);
    // Tambah root sebagai 'default'
    const rootSongs = fs.readdirSync(SONGS_DIR).filter(f => f.endsWith('.mp3') || f.endsWith('.wav') || f.endsWith('.flac'));
    if (rootSongs.length > 0) folders.unshift('default');
    return folders;
  } catch { return ['default']; }
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

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    return res.end();
  }

  const url = req.url.split('?')[0];

  // GET /status
  if (req.method === 'GET' && url === '/status') {
    const folders = getAllFolders();
    const allSongs = getSongsInFolder(null);
    return sendJSON(res, 200, {
      songs: {
        total: allSongs.length,
        locked: getLockedSongs(),
        available: allSongs.length - getLockedSongs().length,
      },
      folders,
      songLocks,
      videoLocks,
      assetLocks,
      ts: new Date().toISOString(),
    });
  }

  // GET /folders
  if (req.method === 'GET' && url === '/folders') {
    const folders = getAllFolders();
    const result = folders.map(f => {
      const songs = getSongsInFolder(f === 'default' ? null : f);
      return { name: f, count: songs.length };
    });
    return sendJSON(res, 200, { folders: result });
  }

  // POST /next-song
  if (req.method === 'POST' && url === '/next-song') {
    const body = await readBody(req);
    const { channelId, folder } = body;
    if (!channelId) return sendJSON(res, 400, { error: 'channelId required' });

    const songs = getSongsInFolder(folder && folder !== 'default' ? folder : null);
    if (songs.length === 0) {
      return sendJSON(res, 404, { error: 'No songs found in folder: ' + (folder || 'default') });
    }

    const locked = getLockedSongs();
    const available = songs.filter(s => !locked.includes(s.filename));
    const pool = available.length > 0 ? available : songs;
    const chosen = pool[Math.floor(Math.random() * pool.length)];

    songLocks[channelId] = {
      filename: chosen.filename,
      path: chosen.path,
      folder: chosen.folder,
      lockedAt: new Date().toISOString(),
    };

    console.log(`[SongCoord] ${channelId} → song: ${chosen.filename} (folder: ${chosen.folder})`);
    return sendJSON(res, 200, { channelId, filename: chosen.filename, path: chosen.path, folder: chosen.folder });
  }

  // POST /release-song
  if (req.method === 'POST' && url === '/release-song') {
    const body = await readBody(req);
    const { channelId } = body;
    if (!channelId) return sendJSON(res, 400, { error: 'channelId required' });
    const released = songLocks[channelId]?.filename || null;
    delete songLocks[channelId];
    console.log(`[SongCoord] ${channelId} released song: ${released}`);
    return sendJSON(res, 200, { channelId, released });
  }

  // POST /next-video
  if (req.method === 'POST' && url === '/next-video') {
    const body = await readBody(req);
    const { channelId } = body;
    if (!channelId) return sendJSON(res, 400, { error: 'channelId required' });

    let videos = [];
    try {
      videos = fs.readdirSync(VIDEOS_DIR).filter(f =>
        f.endsWith('.mp4') || f.endsWith('.mov') || f.endsWith('.mkv')
      );
    } catch {}

    if (videos.length === 0) return sendJSON(res, 404, { error: 'No videos found in ' + VIDEOS_DIR });

    const lockedVideos = Object.values(videoLocks).map(v => v.filename);
    const available = videos.filter(v => !lockedVideos.includes(v));
    const pool = available.length > 0 ? available : videos;
    const chosen = pool[Math.floor(Math.random() * pool.length)];
    const videoPath = path.join(VIDEOS_DIR, chosen);

    videoLocks[channelId] = { filename: chosen, path: videoPath, lockedAt: new Date().toISOString() };
    console.log(`[SongCoord] ${channelId} → video: ${chosen}`);
    return sendJSON(res, 200, { channelId, filename: chosen, path: videoPath });
  }

  // POST /release-video
  if (req.method === 'POST' && url === '/release-video') {
    const body = await readBody(req);
    const { channelId } = body;
    if (!channelId) return sendJSON(res, 400, { error: 'channelId required' });
    const released = videoLocks[channelId]?.filename || null;
    delete videoLocks[channelId];
    return sendJSON(res, 200, { channelId, released });
  }

  // POST /lock-assets — lock thumbnail/title/desc untuk channel
  if (req.method === 'POST' && url === '/lock-assets') {
    const body = await readBody(req);
    const { channelId, thumbnail, title, description } = body;
    if (!channelId) return sendJSON(res, 400, { error: 'channelId required' });
    assetLocks[channelId] = { thumbnail, title, description, lockedAt: new Date().toISOString() };
    console.log(`[SongCoord] ${channelId} locked assets`);
    return sendJSON(res, 200, { channelId, locked: true });
  }

  // POST /release-assets
  if (req.method === 'POST' && url === '/release-assets') {
    const body = await readBody(req);
    const { channelId } = body;
    if (!channelId) return sendJSON(res, 400, { error: 'channelId required' });
    delete assetLocks[channelId];
    return sendJSON(res, 200, { channelId, released: true });
  }

  // GET /assets — list semua thumbnail/title/desc dari DB via file (coordinator tidak konek DB)
  // Ini akan dipanggil frontend langsung ke backend API

  // GET /next-thumbnail (legacy)
  if (req.method === 'GET' && url === '/next-thumbnail') {
    let files = [];
    try { files = fs.readdirSync(THUMBNAILS_DIR).filter(f => f.endsWith('.jpg') || f.endsWith('.jpeg') || f.endsWith('.png')); } catch {}
    if (files.length === 0) return sendJSON(res, 404, { error: 'No thumbnails found' });
    const lockedThumbs = Object.values(assetLocks).map(a => a.thumbnail).filter(Boolean);
    const available = files.filter(f => !lockedThumbs.includes(path.join(THUMBNAILS_DIR, f)));
    const pool = available.length > 0 ? available : files;
    const chosen = pool[Math.floor(Math.random() * pool.length)];
    return sendJSON(res, 200, { filename: chosen, path: path.join(THUMBNAILS_DIR, chosen) });
  }

  // GET /next-broadcast-meta (legacy + updated)
  if (req.method === 'GET' && url === '/next-broadcast-meta') {
    let thumbFile = null, thumbPath = null;
    try {
      const files = fs.readdirSync(THUMBNAILS_DIR).filter(f => f.endsWith('.jpg') || f.endsWith('.jpeg') || f.endsWith('.png'));
      const lockedThumbs = Object.values(assetLocks).map(a => a.thumbnail).filter(Boolean);
      const available = files.filter(f => !lockedThumbs.includes(path.join(THUMBNAILS_DIR, f)));
      const pool = available.length > 0 ? available : files;
      if (pool.length > 0) { thumbFile = pool[Math.floor(Math.random() * pool.length)]; thumbPath = path.join(THUMBNAILS_DIR, thumbFile); }
    } catch {}

    const adjectives = ['Cozy','Chill','Late Night','Rainy Day','Midnight','Dreamy','Mellow','Peaceful','Serene','Warm'];
    const nouns = ['Vibes','Session','Beats','Flow','Journey','Escape','Mood','Space','Hour','Study'];
    const suffix = ['☕','🌙','🎵','✨','🌧️','🎶','🍵','🌿','🕯️','🎸'];
    const title = `Lofi Jazz Radio - ${adjectives[Math.floor(Math.random()*adjectives.length)]} ${nouns[Math.floor(Math.random()*nouns.length)]} ${suffix[Math.floor(Math.random()*suffix.length)]} [${Math.random().toString(36).substring(2,6).toUpperCase()}]`;
    const descriptions = [
      'Sit back and let the music carry you. Lofi jazz beats for studying, working, or just relaxing. No ads, no interruptions. 🎵',
      'Your daily dose of lofi jazz. Perfect background music for focus, creativity, and relaxation. ☕',
      'A continuous stream of lofi jazz. Zero interruptions. Maximum chill. Perfect for study sessions, work, or sleep. 🎶',
    ];
    const description = descriptions[Math.floor(Math.random()*descriptions.length)];
    return sendJSON(res, 200, { title, description, thumbnailPath: thumbPath, thumbnailFilename: thumbFile });
  }

  sendJSON(res, 404, { error: 'Not found', url });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[song-coordinator] running on 127.0.0.1:${PORT}`);
  console.log(`[song-coordinator] SONGS_DIR=${SONGS_DIR} VIDEOS_DIR=${VIDEOS_DIR} THUMBNAILS_DIR=${THUMBNAILS_DIR}`);
});

process.on('uncaughtException', err => console.error('[song-coordinator] crash:', err));
process.on('unhandledRejection', err => console.error('[song-coordinator] rejection:', err));
