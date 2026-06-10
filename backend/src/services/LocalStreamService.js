const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const COORDINATOR_URL = 'http://localhost:8090';

class LocalStreamService {
  constructor(wsService, coordinatorService) {
    this.processes = {};
    this.wsService = wsService;
    this.coord = coordinatorService;
    this.startTimes = {};
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

  async start({ channelId, streamKey, durationSecs = 21600 }) {
    if (this.processes[channelId]) {
      throw new Error(`Channel ${channelId} already streaming`);
    }

    // 1. Ambil video dari coordinator (anti-duplicate)
    const video = await this.fetchNextVideo(channelId);
    if (!video || video.error) {
      throw new Error(`Tidak bisa mulai stream: ${video?.error || 'No video available'}`);
    }

    // 2. Ambil audio dari coordinator (anti-duplicate)
    const song = await this.fetchNextSong(channelId);
    if (!song || song.error) {
      await this.releaseVideo(channelId); // rollback video lock
      throw new Error(`Tidak bisa mulai stream: ${song?.error || 'No song available'}`);
    }

    console.log(`[LocalStreamService] Channel ${channelId} → video: ${video.filename}, audio: ${song.filename}`);

    // 3. Spawn FFmpeg: video loop + audio loop → RTMP
    const ffmpegArgs = [
      '-y',
      // Video input — loop terus
      '-stream_loop', '-1',
      '-i', video.path,
      // Audio input — loop terus
      '-stream_loop', '-1',
      '-i', song.path,
      // Durasi total
      '-t', String(durationSecs),
      // Video encoding
      '-c:v', 'libx264',
      '-preset', 'veryfast',
      '-b:v', '2500k',
      '-maxrate', '2500k',
      '-bufsize', '5000k',
      '-vf', 'scale=1920:1080,format=yuv420p',
      '-r', '30',
      '-g', '60',
      // Audio encoding
      '-c:a', 'aac',
      '-b:a', '128k',
      '-ar', '44100',
      '-ac', '2',
      // Map: video dari input 0, audio dari input 1
      '-map', '0:v:0',
      '-map', '1:a:0',
      // Fix timestamp
      '-max_interleave_delta', '0',
      '-f', 'flv',
      `rtmp://a.rtmp.youtube.com/live2/${streamKey}`,
    ];

    console.log(`[LocalStreamService] FFmpeg args: ffmpeg ${ffmpegArgs.join(' ')}`);

    const ffmpeg = spawn('ffmpeg', ffmpegArgs);
    this.processes[channelId] = ffmpeg;
    this.startTimes[channelId] = new Date();

    ffmpeg.stderr.on('data', (data) => {
      const log = data.toString();
      // Hanya log progress, bukan full ffmpeg header
      if (log.includes('frame=') || log.includes('Error') || log.includes('error')) {
        console.log(`[FFmpeg/${channelId}] ${log.substring(0, 300)}`);
      }
      this.wsService.broadcastLog(channelId, log);
    });

    ffmpeg.on('close', (code) => {
      console.log(`[LocalStreamService] FFmpeg closed for ${channelId} with exit code ${code}`);
      this.releaseVideo(channelId);
      this.releaseSong(channelId);
      delete this.processes[channelId];
      delete this.startTimes[channelId];
      this.wsService.broadcast('stream:stopped', {
        channelId,
        exitCode: code,
        ts: new Date().toISOString()
      });
    });

    ffmpeg.on('error', (err) => {
      console.error(`[LocalStreamService] FFmpeg spawn error for ${channelId}:`, err);
    });

    this.wsService.broadcast('stream:started', {
      channelId,
      video: video.filename,
      song: song.filename,
      ts: new Date().toISOString()
    });

    return { channelId, video: video.filename, song: song.filename, pid: ffmpeg.pid };
  }

  stop(channelId) {
    const proc = this.processes[channelId];
    if (!proc) throw new Error(`No stream running for ${channelId}`);
    proc.kill('SIGTERM');
    return { channelId, stopped: true };
  }

  isRunning(channelId) { return !!this.processes[channelId]; }

  getStatus() {
    return Object.keys(this.processes).map(id => ({
      channelId: id,
      pid: this.processes[id].pid,
      startedAt: this.startTimes[id],
      elapsedSeconds: Math.floor((Date.now() - this.startTimes[id]) / 1000),
    }));
  }
}

module.exports = LocalStreamService;