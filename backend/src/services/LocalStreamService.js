const { spawn } = require('child_process');
const { randomUUID } = require('crypto');
const YouTubeService = require('./YouTubeService');
const fs = require('fs');
const path = require('path');
const COORDINATOR_URL = 'http://localhost:8090';

class LocalStreamService {
  constructor(wsService, coordinatorService) {
    this.processes = {}; 
    this.startTimes = {}; 
    this.channelMap = {}; 
    this.activeAssets = {}; 
    this.youtubeService = new YouTubeService();
    this.wsService = wsService;
    this.coord = coordinatorService;
    
    this.crashCounts = {};
    this.savedConfigs = {};
    this.channelYoutubeData = {}; 
    this.reconnectingMap = {}; 
  }

  getUsedAssets() {
    const titles = []; const descs = []; const thumbs = [];
    for (const id in this.activeAssets) {
      if (this.activeAssets[id].title) titles.push(this.activeAssets[id].title);
      if (this.activeAssets[id].description) descs.push(this.activeAssets[id].description);
      if (this.activeAssets[id].thumbnailPath) thumbs.push(this.activeAssets[id].thumbnailPath);
    }
    return { titles, descs, thumbs };
  }

  buildPlaylist(folder, songPath, streamId) {
    const playlistPath = `/tmp/playlist_${streamId}.txt`;
    let files = [];
    
    if (songPath && fs.existsSync(songPath)) {
      files.push(songPath);
    } else {
      const MUSIC_DIR = '/opt/media/music';
      let selectedFolders = [];
      if (folder && folder !== 'Semua' && folder !== 'default') {
          selectedFolders = folder.split(',').map(f => f.trim()).filter(Boolean);
      }
      
      if (fs.existsSync(MUSIC_DIR)) {
        if (selectedFolders.length === 0) {
          const items = fs.readdirSync(MUSIC_DIR);
          for (const item of items) {
            const itemPath = path.join(MUSIC_DIR, item);
            if (fs.statSync(itemPath).isDirectory()) {
              files.push(...fs.readdirSync(itemPath).filter(f => f.match(/\.(mp3|wav|flac|ogg|m4a|aac)$/i)).map(f => path.join(itemPath, f)));
            } else if (item.match(/\.(mp3|wav|flac|ogg|m4a|aac)$/i)) {
              files.push(itemPath);
            }
          }
        } else {
          for (const fName of selectedFolders) {
            const targetDir = path.join(MUSIC_DIR, fName);
            if (fs.existsSync(targetDir) && fs.statSync(targetDir).isDirectory()) {
                files.push(...fs.readdirSync(targetDir).filter(f => f.match(/\.(mp3|wav|flac|ogg|m4a|aac)$/i)).map(f => path.join(targetDir, f)));
            }
          }
        }
      }
    }
    
    if (files.length === 0) throw new Error("Tidak ada lagu ditemukan di Media Pool / Folder yang dipilih.");

    const firstExt = path.extname(files[0]).toLowerCase();
    const safeFiles = files.filter(f => path.extname(f).toLowerCase() === firstExt);
    
    let contentFiles = [];
    for (let loop = 0; loop < 100; loop++) {
        let roundFiles = [...safeFiles];
        for (let i = roundFiles.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [roundFiles[i], roundFiles[j]] = [roundFiles[j], roundFiles[i]];
        }
        contentFiles.push(...roundFiles);
    }
    
    const content = contentFiles.map(f => `file '${f.replace(/'/g, "'\\''")}'`).join('\n');
    fs.writeFileSync(playlistPath, content);
    
    return { playlistPath, firstSong: path.basename(safeFiles[0]), count: safeFiles.length };
  }

  async fetchNextVideo(channelId, folder, exactPath) {
    try {
      const res = await fetch(`${COORDINATOR_URL}/next-video`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ channelId, folder, exactPath }) }); 
      return await res.json();
    } catch (err) { return null; }
  }

  async releaseVideo(channelId) { try { await fetch(`${COORDINATOR_URL}/release-video`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ channelId }) }); } catch (err) {} }

  async start(channelId, dbClient, options = {}, isRestart = false) {
    if (!isRestart) {
      this.crashCounts[channelId] = 0;
      this.channelYoutubeData[channelId] = null; 
    }
    
    delete this.reconnectingMap[channelId];
    this.savedConfigs[channelId] = { dbClient, options };

    try {
      const { durationSecs = 21600, title, description, thumbnailPath, folder, videoPath, songPath } = options;
      const streamId = randomUUID();

      const { rows } = await dbClient.query('SELECT google_refresh_token FROM channels WHERE channel_id = $1', [channelId]);
      const refreshToken = rows[0]?.google_refresh_token;
      if (!refreshToken) throw new Error(`Token Google tidak ditemukan di DB`);

      let rtmpUrl, broadcastId, youtubeStreamId, targetEndTime, originalStartTime;

      // ATURAN RESUME DAN MASTER CLOCK
      if (isRestart && this.channelYoutubeData[channelId]) {
        const savedYt = this.channelYoutubeData[channelId];
        rtmpUrl = savedYt.rtmpUrl;
        broadcastId = savedYt.broadcastId;
        youtubeStreamId = savedYt.youtubeStreamId;
        targetEndTime = savedYt.targetEndTime;
        originalStartTime = savedYt.originalStartTime;
        console.log(`🔄 [Engine] Melanjutkan stream. Sisa waktu aktual dari target awal akan dihitung...`);
      } else {
        const ytRes = await this.youtubeService.createBroadcast({ refreshToken, title, description, thumbnailPath });
        rtmpUrl = ytRes.rtmpUrl;
        broadcastId = ytRes.broadcastId;
        youtubeStreamId = ytRes.streamId;
        
        // Merekam total durasi dan waktu start paling pertama
        targetEndTime = Date.now() + (durationSecs * 1000);
        originalStartTime = new Date();
        
        this.channelYoutubeData[channelId] = { rtmpUrl, broadcastId, youtubeStreamId, refreshToken, targetEndTime, originalStartTime };
      }

      // PERHITUNGAN SISA WAKTU STREAM (Mencegah melar berjam-jam)
      const remainingSecs = Math.floor((targetEndTime - Date.now()) / 1000);
      if (remainingSecs <= 0) {
        console.log(`🛑 [Engine] Batas waktu aktual 4 jam telah habis saat mencoba resume.`);
        const savedYt = this.channelYoutubeData[channelId];
        if (savedYt) {
          await this.youtubeService.endBroadcast({ refreshToken: savedYt.refreshToken, broadcastId: savedYt.broadcastId });
          this.channelYoutubeData[channelId] = null;
        }
        throw new Error('Batas waktu tayang siaran ini telah habis secara keseluruhan.');
      }

      const video = await this.fetchNextVideo(channelId, folder, videoPath);
      if (!video || video.error) throw new Error(`Video Gagal: ${video?.error || 'File tidak ditemukan'}`);

      const { playlistPath, firstSong, count } = this.buildPlaylist(folder, songPath, streamId);

      await new Promise(resolve => setTimeout(resolve, 8000));

      const ffmpegArgs = [
        '-y', 
        '-fflags', '+genpts', 
        '-re', '-stream_loop', '-1', '-i', video.path, 
        '-fflags', '+genpts',
        '-re', '-f', 'concat', '-safe', '0', '-i', playlistPath, 
        '-t', String(remainingSecs), // FFmpeg HANYA JALAN SESUAI SISA WAKTU YANG ADA
        '-c:v', 'libx264', '-preset', 'veryfast', '-b:v', '2500k', '-maxrate', '2500k', '-bufsize', '5000k',
        '-vf', 'scale=1920:1080,format=yuv420p', '-r', '30', '-g', '60',
        '-c:a', 'aac', '-b:a', '128k', '-ar', '44100', '-ac', '2',
        '-async', '1', 
        '-map', '0:v:0', '-map', '1:a:0', 
        '-max_muxing_queue_size', '4096', 
        '-flvflags', 'no_duration_filesize', 
        '-rw_timeout', '10000000', 
        '-f', 'flv', rtmpUrl,
      ];

      const ffmpeg = spawn('ffmpeg', ffmpegArgs);
      this.processes[streamId] = ffmpeg; this.startTimes[streamId] = new Date(); 
      this.channelMap[streamId] = channelId; this.activeAssets[streamId] = { title, description, thumbnailPath, playlistPath };

      const stabilizationTimer = setTimeout(() => {
        if (this.processes[streamId]) {
          console.log(`[Engine] Stream channel ${channelId} stabil selama 5 menit. Counter restart di-reset.`);
          this.crashCounts[channelId] = 0;
        }
      }, 300000);

      setTimeout(() => {
        this.youtubeService.goLive({ refreshToken, broadcastId, streamId: youtubeStreamId })
          .then(() => this.wsService.broadcast('stream:live', { channelId, streamId, ts: new Date().toISOString() }))
          .catch(async err => {
            try { await dbClient.query('INSERT INTO system_logs (channel_id, message) VALUES ($1, $2)', [channelId, `YouTube API: ${err.message}`]); } catch(e){}
          });
      }, 5000); 

      let ffmpegLogs = [];
      ffmpeg.stderr.on('data', (data) => {
        const text = data.toString().trim();
        if (text) {
          ffmpegLogs.push(text);
          if (ffmpegLogs.length > 8) ffmpegLogs.shift();
        }
        this.wsService.broadcastLog(channelId, text);
      });

      ffmpeg.on('close', async (code, signal) => {
        clearTimeout(stabilizationTimer);
        this.releaseVideo(channelId); 
        try { if (fs.existsSync(playlistPath)) fs.unlinkSync(playlistPath); } catch(e){}
        
        delete this.processes[streamId]; delete this.startTimes[streamId]; delete this.channelMap[streamId]; delete this.activeAssets[streamId];

        // LOGIKA PENENTU APAKAH INI STOP MANUAL / WAKTU HABIS ATAU CRASH BENARAN
        const isManualStop = signal === 'SIGTERM' || signal === 'SIGKILL' || code === 0 || code === 255;

        if (!isManualStop) {
          const fullLogText = ffmpegLogs.join(' ').toLowerCase();
          let diagCategory = 'UNKNOWN_CRASH';

          if (code === 137 || code === 152 || fullLogText.includes('killed') || fullLogText.includes('out of memory')) {
            diagCategory = 'OOM_KILLED';
          } else if (fullLogText.includes('broken pipe') || fullLogText.includes('connection reset')) {
            diagCategory = 'BROKEN_PIPE';
          } else if (fullLogText.includes('rtmp server sent error') || fullLogText.includes('unauthorized') || fullLogText.includes('handshake failed')) {
            diagCategory = 'RTMP_DROPPED';
          } else if (fullLogText.includes('input/output error') || fullLogText.includes('tidak ditemukan') || fullLogText.includes('error opening')) {
            diagCategory = 'IO_ERROR';
          }

          const cleanErrorText = ffmpegLogs.join(' | ').replace(/\n/g, ' ').substring(0, 140);
          const diagnosticMessage = `[${diagCategory}] (Exit Code: ${code}) -> ${cleanErrorText}`;
          
          try { await dbClient.query('INSERT INTO system_logs (channel_id, message) VALUES ($1, $2)', [channelId, diagnosticMessage]); } catch(e){}

          if (diagCategory !== 'OOM_KILLED') {
            this.reconnectingMap[channelId] = true; 
            this.executeAutoRestart(channelId);
          } else {
            try { await dbClient.query('INSERT INTO system_logs (channel_id, message) VALUES ($1, $2)', [channelId, `[Engine] Auto-restart dihentikan karena status OOM_KILLED.`]); } catch(e){}
            this.wsService.broadcast('stream:stopped', { channelId, streamId, exitCode: code, ts: new Date().toISOString() });
          }
        } else {
          // WAKTU HABIS (CODE 0) ATAU TOMBOL STOP DITEKAN
          console.log(`🛑 [Engine] Penutupan normal/manual (Waktu habis/Stop ditekan). Menyelesaikan Live Stream YouTube...`);
          delete this.reconnectingMap[channelId];
          const savedYt = this.channelYoutubeData[channelId];
          if (savedYt) {
            await this.youtubeService.endBroadcast({ refreshToken: savedYt.refreshToken, broadcastId: savedYt.broadcastId });
            this.channelYoutubeData[channelId] = null; 
          }
          this.wsService.broadcast('stream:stopped', { channelId, streamId, exitCode: code, ts: new Date().toISOString() });
        }
      });

      this.wsService.broadcast('stream:started', { channelId, streamId, video: video.filename, song: `Playlist (${count} lagu)`, ts: new Date().toISOString() });
      return { streamId, channelId, video: video.filename, song: `Playlist (${count} lagu, Diacak)`, pid: ffmpeg.pid };

    } catch (error) {
      try { await dbClient.query('INSERT INTO system_logs (channel_id, message) VALUES ($1, $2)', [channelId, `Gagal Start Engine: ${error.message}`]); } catch(e){}
      if (!isRestart) {
        this.executeAutoRestart(channelId);
      }
      throw error;
    }
  }

  async executeAutoRestart(channelId) {
    const config = this.savedConfigs[channelId];
    if (!config) return;

    this.crashCounts[channelId] = (this.crashCounts[channelId] || 0) + 1;
    const attempt = this.crashCounts[channelId];

    if (attempt <= 5) {
      const backoffDelay = attempt * 15000;
      try { await config.dbClient.query('INSERT INTO system_logs (channel_id, message) VALUES ($1, $2)', [channelId, `[RESUME ACTIVE] Mencoba menyambung ke link YouTube yang sama dalam ${backoffDelay/1000}s (${attempt}/5)`]); } catch(e){}

      setTimeout(async () => {
        try { await this.start(channelId, config.dbClient, config.options, true); } 
        catch (err) {}
      }, backoffDelay);
    } else {
      delete this.reconnectingMap[channelId];
      try { 
        await config.dbClient.query('INSERT INTO system_logs (channel_id, message) VALUES ($1, $2)', [channelId, `[CRASH TOTAL] Gagal 5 kali beruntun. Menutup paksa broadcast.`]); 
        const savedYt = this.channelYoutubeData[channelId];
        if (savedYt) {
          await this.youtubeService.endBroadcast({ refreshToken: savedYt.refreshToken, broadcastId: savedYt.broadcastId });
          this.channelYoutubeData[channelId] = null;
        }
      } catch(e){}
      this.crashCounts[channelId] = 0;
    }
  }

  stop(streamId) {
    if (streamId.startsWith('reconnecting-')) {
      const channelId = streamId.split('-')[1];
      delete this.reconnectingMap[channelId];
      const savedYt = this.channelYoutubeData[channelId];
      if (savedYt) {
        this.youtubeService.endBroadcast({ refreshToken: savedYt.refreshToken, broadcastId: savedYt.broadcastId });
        this.channelYoutubeData[channelId] = null;
      }
      return { streamId, channelId, stopped: true };
    }
    const proc = this.processes[streamId];
    if (!proc) throw new Error(`No stream found`);
    proc.kill('SIGTERM');
    return { streamId, channelId: this.channelMap[streamId], stopped: true };
  }
  
  stopAllByChannel(channelId) {
    delete this.reconnectingMap[channelId];
    const streamIds = Object.keys(this.channelMap).filter(id => this.channelMap[id] === channelId);
    streamIds.forEach(id => this.processes[id]?.kill('SIGTERM'));
    return { channelId, stopped: streamIds.length };
  }
  
  isRunning(channelId) { return Object.values(this.channelMap).includes(channelId) || !!this.reconnectingMap[channelId]; }
  
  // MENCEGAH TIMER DASHBOARD UI KEMBALI KE NOL SAAT RESTART
  getStatus() {
    const active = Object.keys(this.processes).map(id => {
      const cId = this.channelMap[id];
      const ytData = this.channelYoutubeData[cId];
      // Jika punya waktu original (master clock), pakai itu. Jika tidak, pakai waktu proses.
      const startedAt = (ytData && ytData.originalStartTime) ? ytData.originalStartTime : this.startTimes[id];
      return {
        streamId: id, channelId: cId, pid: this.processes[id].pid,
        startedAt: startedAt, 
        elapsedSeconds: Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000),
      };
    });
    
    const reconnecting = Object.keys(this.reconnectingMap).map(cId => {
      const ytData = this.channelYoutubeData[cId];
      const startedAt = (ytData && ytData.originalStartTime) ? ytData.originalStartTime : new Date();
      return {
        streamId: 'reconnecting-' + cId, channelId: cId, pid: 0,
        startedAt: startedAt, 
        elapsedSeconds: Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000),
      };
    });
    
    return [...active, ...reconnecting];
  }
}
module.exports = LocalStreamService;
