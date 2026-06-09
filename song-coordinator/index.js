const http = require('http');
const fs = require('fs');

const SONGS_DIR = process.env.SONGS_DIR || '/opt/songs';
const PORT = process.env.PORT || 8090;
const locked = {};

const server = http.createServer((req, res) => {
  res.setHeader('Content-Type', 'application/json');
  
  if (req.method === 'POST' && req.url === '/next-song') {
    const songs = fs.readdirSync(SONGS_DIR).filter(f => f.endsWith('.mp3') || f.endsWith('.wav'));
    const available = songs.filter(s => !Object.values(locked).includes(s));
    if (!available.length) return res.end(JSON.stringify({ error: 'No songs available' }));
    let body = '';
    req.on('data', d => body += d);
    req.on('end', () => {
      const { channelId } = JSON.parse(body || '{}');
      const song = available[Math.floor(Math.random() * available.length)];
      locked[channelId] = song;
      res.end(JSON.stringify({ filename: song, path: SONGS_DIR + '/' + song, id: song }));
    });
  } else if (req.method === 'POST' && req.url === '/release-song') {
    let body = '';
    req.on('data', d => body += d);
    req.on('end', () => {
      const { channelId } = JSON.parse(body || '{}');
      delete locked[channelId];
      res.end(JSON.stringify({ released: true }));
const songs = fs.readdirSync(SONGS_DIR).filter(f => f.endsWith('.mp3') || f.endsWith('.wav'));    });
  } } else if (req.url === '/status') {
        // PERBAIKAN: Baca ulang direktori saat status dipanggil
        const songs = fs.readdirSync(SONGS_DIR).filter(f => f.endsWith('.mp3') || f.endsWith('.wav'));
        res.end(JSON.stringify({ count: songs.length, songs: songs, locked: locked }));
    } else {
    res.end(JSON.stringify({ ok: true }));
  }
});

server.listen(PORT, () => console.log('[song-coordinator] running on :' + PORT));
