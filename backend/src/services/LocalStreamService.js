const { spawn } = require('child_process');

class LocalStreamService {
  constructor(wsService, coordinatorService) {
    this.processes = {};   // { channelId: childProcess }
    this.wsService = wsService;
    this.coord = coordinatorService;
    this.startTimes = {};  // { channelId: Date }
  }

  /**
   * Helper untuk fetch lagu dari Song Coordinator (Port 8090)
   */
  async fetchNextSong(channelId) {
    try {
      const response = await fetch('http://localhost:8090/next-song', {
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

  /**
   * Helper untuk release lagu dari Song Coordinator
   */
  async releaseSong(channelId) {
    try {
      await fetch('http://localhost:8090/release-song', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelId })
      });
      console.log(`[LocalStreamService] Lagu untuk channel ${channelId} di-release.`);
    } catch (err) {
      console.error(`[LocalStreamService] Gagal release lagu untuk ${channelId}:`, err);
    }
  }

  async start({ channelId, streamKey, imagePath, durationSecs = 21600 }) {
    if (this.processes[channelId]) {
      throw new Error(`Channel ${channelId} already streaming`);
    }

    // 1. Ambil lagu baru
    const song = await this.fetchNextSong(channelId);
    if (!song || song.error) {
      throw new Error(`Tidak bisa mulai stream: ${song?.error || 'No song available'}`);
    }

    // 2. Spawn FFmpeg
    const ffmpeg = spawn('ffmpeg', [
      '-y',
      '-loop', '1', '-i', imagePath,
      '-stream_loop', '-1', '-i', song.path,
      '-t', String(durationSecs),
      '-c:v', 'libx264', '-preset', 'veryfast', '-tune', 'stillimage',
      '-c:a', 'aac', '-b:a', '128k',
      '-vf', 'scale=1920:1080,format=yuv420p',
      '-shortest', '-f', 'flv',
      `rtmp://a.rtmp.youtube.com/live2/${streamKey}`,
    ]);

    this.processes[channelId] = ffmpeg;
    this.startTimes[channelId] = new Date();

    // Log ke WebSocket
    ffmpeg.stderr.on('data', (data) => {
      this.wsService.broadcastLog(channelId, data.toString());
    });

    ffmpeg.on('close', (code) => {
      this.releaseSong(channelId); // Otomatis release saat FFmpeg mati
      delete this.processes[channelId];
      delete this.startTimes[channelId];
      this.wsService.broadcast('stream:stopped', { channelId, exitCode: code, ts: new Date().toISOString() });
    });

    this.wsService.broadcast('stream:started', { channelId, song: song.filename, ts: new Date().toISOString() });

    return { channelId, song: song.filename, pid: ffmpeg.pid };
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