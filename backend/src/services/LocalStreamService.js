const { spawn } = require('child_process');
const { randomUUID } = require('crypto');
const YouTubeService = require('./YouTubeService');
const fs = require('fs');

const COORDINATOR_URL = 'http://localhost:8090';

class LocalStreamService {
  constructor(wsService, coordinatorService) {
    this.processes = {};
    this.wsService = wsService;
    this.coord = coordinatorService;
    this.startTimes = {};
    this.channelMap = {};
    this.youtubeService = new YouTubeService();
  }

  async fetchNextVideo(channelId) {
    try {
      const response = await fetch(`${COORDINATOR_URL}/next-video`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelId })
      });
      return await response.json();
    } catch (err) {
      console.error(`[LocalStreamService] Gagal ambil video untuk ${channelId}:`, err);
      return null;
    }
  }

  async releaseVideo(channelId) {
    try {
      await fetch(`${COORDINATOR_URL}/release-video`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelId })
      });
      console.log(`[LocalStreamService] Video untuk ${channelId} di-release.`);
    } catch (err) {
      console.error(`[LocalStreamService] Gagal release video untuk ${channelId}:`, err);
    }
  }

  async fetchNextSong(channelId) {
    try {
      const response = await fetch(`${COORDINATOR_URL}/next-song`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelId })
      });
      return await response.json();
    } catch (err) {
      console.error(`[LocalStreamService] Gagal ambil lagu untuk ${channelId}:`, err);
      return null;
    }
  }

  async releaseSong(channelId) {
    try {
      await fetch(`${COORDINATOR_URL}/release-song`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelId })
      });
    } catch (err) {
      console.error(`[LocalStreamService] Gagal release lagu untuk ${channelId}:`, err);
    }
  }

  async start(channelId, dbClient, options = {}) {
    const { durationSecs = 21600, title, description, thumbnailPath } = options;

    const streamId = randomUUID();

    console.log(`[LocalStreamService] Mengambil token untuk ${channelId}...`);
    const { rows } = await dbClient.query(
      'SELECT google_refresh_token FROM channels WHERE channel_id = $1',
      [channelId]
    );

    const refreshToken = rows[0]?.google_refresh_token;
    if (!refreshToken) {
      throw new Error(`google_refresh_token tidak ditemukan di DB untuk channel ${channelId}`);
    }

    console.log(`[LocalStreamService] Mempersiapkan YouTube Broadcast...`);
    const { rtmpUrl, broadcastId, youtubeStreamId } = await this.youtubeService.createBroadcast({
      refreshToken,
      title,
      description,
      thumbnailPath
    });

    const video = await this.fetchNextVideo(channelId);
    if (!video || video.error) {
      throw new Error(`Tidak bisa mulai stream: ${video?.error || 'No video available'}`);
    }

    const song = await this.fetchNextSong(channelId);
    if (!song || song.error) {
      await this.releaseVideo(channelId);
      throw new Error(`Tidak bisa mulai stream: ${song?.error || 'No song available'}`);
    }

    console.log(`[LocalStreamService] Channel ${channelId} → video: ${video.filename}, audio: ${song.filename}`);
    console.log(`[FFmpeg] YouTube Ready! Nembak ke URL: ${rtmpUrl}`);

    const ffmpegArgs = [
      '-y',
      '-stream_loop', '-1',
      '-i', video.path,
      '-stream_loop', '-1',
      '-i', song.path,
      '-t', String(durationSecs),
      '-c:v', 'libx264',
      '-preset', 'veryfast',
      '-b:v', '2500k',
      '-maxrate', '2500k',
      '-bufsize', '5000k',
      '-vf', 'scale=1920:1080,format=yuv420p',
      '-r', '30',
      '-g', '60',
      '-c:a', 'aac',
      '-b:a', '128k',
      '-ar', '44100',
      '-ac', '2',
      '-map', '0:v:0',
      '-map', '1:a:0',
      '-max_interleave_delta', '0',
      '-f', 'flv',
      rtmpUrl,
    ];

    const ffmpeg = spawn('ffmpeg', ffmpegArgs);
    this.processes[streamId] = ffmpeg;
    this.startTimes[streamId] = new Date();
    this.channelMap[streamId] = channelId;

    console.log(`[DEBUG] streamId: ${streamId}, broadcastId: ${broadcastId}`);

    setTimeout(() => {
      this.youtubeService.goLive({ refreshToken, broadcastId, streamId: youtubeStreamId })
        .then(() => {
          this.wsService.broadcast('stream:live', { channelId, streamId, ts: new Date().toISOString() });
        })
        .catch((err) => {
          console.error(`[LocalStreamService] goLive gagal untuk ${channelId}:`, err.message);
        });
    }, 10000);

    ffmpeg.stderr.on('data', (data) => {
      const log = data.toString();
      if (log.includes('frame=') || log.includes('Error') || log.includes('error')) {
        console.log(`[FFmpeg/${channelId}/${streamId.slice(0,8)}] ${log.substring(0, 300)}`);
      }
      this.wsService.broadcastLog(channelId, log);
    });

    ffmpeg.on('close', (code) => {
      console.log(`[LocalStreamService] FFmpeg closed for ${channelId}/${streamId} with exit code ${code}`);
      this.releaseVideo(channelId);
      this.releaseSong(channelId);
      delete this.processes[streamId];
      delete this.startTimes[streamId];
      delete this.channelMap[streamId];
      this.wsService.broadcast('stream:stopped', {
        channelId,
        streamId,
        exitCode: code,
        ts: new Date().toISOString()
      });
    });

    ffmpeg.on('error', (err) => {
      console.error(`[LocalStreamService] FFmpeg spawn error for ${channelId}:`, err);
    });

    this.wsService.broadcast('stream:started', {
      channelId,
      streamId,
      video: video.filename,
      song: song.filename,
      ts: new Date().toISOString()
    });

    return { streamId, channelId, video: video.filename, song: song.filename, pid: ffmpeg.pid };
  }

  stop(streamId) {
    const proc = this.processes[streamId];
    if (!proc) throw new Error(`No stream found: ${streamId}`);
    proc.kill('SIGTERM');
    return { streamId, channelId: this.channelMap[streamId], stopped: true };
  }

  stopAllByChannel(channelId) {
    const streamIds = Object.keys(this.channelMap).filter(id => this.channelMap[id] === channelId);
    streamIds.forEach(id => {
      this.processes[id]?.kill('SIGTERM');
    });
    return { channelId, stopped: streamIds.length };
  }

  isRunning(channelId) {
    return Object.values(this.channelMap).includes(channelId);
  }

  getStatus() {
    return Object.keys(this.processes).map(id => ({
      streamId: id,
      channelId: this.channelMap[id],
      pid: this.processes[id].pid,
      startedAt: this.startTimes[id],
      elapsedSeconds: Math.floor((Date.now() - this.startTimes[id]) / 1000),
    }));
  }
}

module.exports = LocalStreamService;
