/**
 * LocalStreamService
 * Menggantikan VPS Agent (Flask). Spawn FFmpeg langsung via child_process.spawn()
 * Tidak ada HTTP round-trip — zero latency, log langsung ke WebSocket
 */

const { spawn } = require('child_process');

class LocalStreamService {
  constructor(wsService, coordinatorService) {
    this.processes  = {};   // { channelId: childProcess }
    this.wsService  = wsService;
    this.coord      = coordinatorService;
    this.startTimes = {};   // { channelId: Date }
  }

  /**
   * Start FFmpeg stream untuk satu channel
   * @param {string} channelId  - e.g. 'ch_monet'
   * @param {string} streamKey  - YouTube stream key
   * @param {string} imagePath  - path ke static JPG, e.g. /opt/images/ch_monet.jpg
   * @param {number} durationSecs - panjang sesi, default 21600 (6 jam)
   */
  async start({ channelId, streamKey, imagePath, durationSecs = 21600 }) {
    if (this.processes[channelId]) {
      throw new Error(`Channel ${channelId} already streaming`);
    }

    const song = await this.coord.getNextSong(channelId);
    if (!song) throw new Error('No song available from coordinator');

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

    // Pipe FFmpeg stderr ke WebSocket realtime
    ffmpeg.stderr.on('data', (data) => {
      this.wsService.broadcast('stream:log', {
        channelId,
        log: data.toString(),
        ts: new Date().toISOString(),
      });
    });

    ffmpeg.on('close', (code) => {
      delete this.processes[channelId];
      delete this.startTimes[channelId];
      this.coord.releaseSong(channelId, song.id).catch(() => {});
      this.wsService.broadcast('stream:stopped', {
        channelId,
        exitCode: code,
        ts: new Date().toISOString(),
      });
    });

    ffmpeg.on('error', (err) => {
      this.wsService.broadcast('stream:error', {
        channelId,
        error: err.message,
        ts: new Date().toISOString(),
      });
    });

    this.wsService.broadcast('stream:started', {
      channelId,
      song: song.filename,
      ts: new Date().toISOString(),
    });

    return { channelId, song: song.filename, pid: ffmpeg.pid };
  }

  stop(channelId) {
    const proc = this.processes[channelId];
    if (!proc) throw new Error(`No stream running for ${channelId}`);
    proc.kill('SIGTERM');
    return { channelId, stopped: true };
  }

  isRunning(channelId) {
    return !!this.processes[channelId];
  }

  getStatus() {
    const active = Object.keys(this.processes);
    return active.map((id) => ({
      channelId: id,
      pid: this.processes[id].pid,
      startedAt: this.startTimes[id],
      elapsedSeconds: Math.floor((Date.now() - this.startTimes[id]) / 1000),
    }));
  }
}

module.exports = LocalStreamService;
