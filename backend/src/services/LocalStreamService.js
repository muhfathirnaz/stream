const { spawn } = require('child_process');
const { randomUUID } = require('crypto');
const YouTubeService = require('./YouTubeService');
const fs = require('fs');
const COORDINATOR_URL = 'http://localhost:8090';

class LocalStreamService {
  constructor(wsService, coordinatorService) {
    this.processes = {}; this.wsService = wsService; this.coord = coordinatorService;
    this.startTimes = {}; this.channelMap = {}; this.activeAssets = {}; 
    this.youtubeService = new YouTubeService();
  }

  // Mengambil daftar thumbnail, title, & desc yang sedang LIVE
  getUsedAssets() {
    const titles = []; const descs = []; const thumbs = [];
    for (const id in this.activeAssets) {
      if (this.activeAssets[id].title) titles.push(this.activeAssets[id].title);
      if (this.activeAssets[id].description) descs.push(this.activeAssets[id].description);
      if (this.activeAssets[id].thumbnailPath) thumbs.push(this.activeAssets[id].thumbnailPath);
    }
    return { titles, descs, thumbs };
  }

  async fetchNextVideo(channelId, folder, exactPath) {
    try {
      const res = await fetch(`${COORDINATOR_URL}/next-video`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelId, folder, exactPath })
      }); return await res.json();
    } catch (err) { return null; }
  }

  async releaseVideo(channelId) {
    try { await fetch(`${COORDINATOR_URL}/release-video`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ channelId }) }); } catch (err) {}
  }

  async fetchNextSong(channelId, folder, exactPath) {
    try {
      const res = await fetch(`${COORDINATOR_URL}/next-song`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelId, folder, exactPath })
      }); return await res.json();
    } catch (err) { return null; }
  }

  async releaseSong(channelId) {
    try { await fetch(`${COORDINATOR_URL}/release-song`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ channelId }) }); } catch (err) {}
  }

  async start(channelId, dbClient, options = {}) {
    const { durationSecs = 21600, title, description, thumbnailPath, folder, videoPath, songPath } = options;
    const streamId = randomUUID();

    const { rows } = await dbClient.query('SELECT google_refresh_token FROM channels WHERE channel_id = $1', [channelId]);
    const refreshToken = rows[0]?.google_refresh_token;
    if (!refreshToken) throw new Error(`google_refresh_token tidak ditemukan di DB`);

    const { rtmpUrl, broadcastId, streamId: youtubeStreamId } = await this.youtubeService.createBroadcast({ refreshToken, title, description, thumbnailPath });

    const video = await this.fetchNextVideo(channelId, folder, videoPath);
    if (!video || video.error) throw new Error(`Gagal stream: ${video?.error || 'Video tidak ditemukan'}`);

    const song = await this.fetchNextSong(channelId, folder, songPath);
    if (!song || song.error) {
      await this.releaseVideo(channelId);
      throw new Error(`Gagal stream: ${song?.error || 'Lagu tidak ditemukan'}`);
    }

    const ffmpegArgs = [
      '-y', '-stream_loop', '-1', '-i', video.path,
      '-stream_loop', '-1', '-i', song.path,
      '-t', String(durationSecs),
      '-c:v', 'libx264', '-preset', 'veryfast', '-b:v', '2500k', '-maxrate', '2500k', '-bufsize', '5000k',
      '-vf', 'scale=1920:1080,format=yuv420p', '-r', '30', '-g', '60',
      '-c:a', 'aac', '-b:a', '128k', '-ar', '44100', '-ac', '2',
      '-map', '0:v:0', '-map', '1:a:0', '-max_interleave_delta', '0',
      '-f', 'flv', rtmpUrl,
    ];

    const ffmpeg = spawn('ffmpeg', ffmpegArgs);
    this.processes[streamId] = ffmpeg; 
    this.startTimes[streamId] = new Date(); 
    this.channelMap[streamId] = channelId;
    this.activeAssets[streamId] = { title, description, thumbnailPath }; // Simpan ke memori

    setTimeout(() => {
      this.youtubeService.goLive({ refreshToken, broadcastId, streamId: youtubeStreamId })
        .then(() => this.wsService.broadcast('stream:live', { channelId, streamId, ts: new Date().toISOString() }))
        .catch(err => console.error(`[LocalStreamService] goLive gagal:`, err.message));
    }, 10000);

    ffmpeg.stderr.on('data', (data) => {
      const log = data.toString();
      this.wsService.broadcastLog(channelId, log);
    });

    ffmpeg.on('close', (code) => {
      this.releaseVideo(channelId); this.releaseSong(channelId);
      delete this.processes[streamId]; delete this.startTimes[streamId]; 
      delete this.channelMap[streamId]; delete this.activeAssets[streamId]; // Hapus dari memori
      this.wsService.broadcast('stream:stopped', { channelId, streamId, exitCode: code, ts: new Date().toISOString() });
    });

    this.wsService.broadcast('stream:started', { channelId, streamId, video: video.filename, song: song.filename, ts: new Date().toISOString() });
    return { streamId, channelId, video: video.filename, song: song.filename, pid: ffmpeg.pid };
  }

  stop(streamId) {
    const proc = this.processes[streamId];
    if (!proc) throw new Error(`No stream found`);
    proc.kill('SIGTERM');
    return { streamId, channelId: this.channelMap[streamId], stopped: true };
  }

  stopAllByChannel(channelId) {
    const streamIds = Object.keys(this.channelMap).filter(id => this.channelMap[id] === channelId);
    streamIds.forEach(id => this.processes[id]?.kill('SIGTERM'));
    return { channelId, stopped: streamIds.length };
  }

  isRunning(channelId) { return Object.values(this.channelMap).includes(channelId); }
  getStatus() {
    return Object.keys(this.processes).map(id => ({
      streamId: id, channelId: this.channelMap[id], pid: this.processes[id].pid,
      startedAt: this.startTimes[id], elapsedSeconds: Math.floor((Date.now() - this.startTimes[id]) / 1000),
    }));
  }
}
module.exports = LocalStreamService;
