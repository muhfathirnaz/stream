
const { spawn, execSync } = require('child_process');
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
    this.deleteAfterStreamMap = {};
    this.savedConfigs = {};
    this.channelYoutubeData = {}; 
    this.reconnectingMap = {}; 

    this.STATE_FILE = '/tmp/lofi_yt_state.json';
    if (fs.existsSync(this.STATE_FILE)) {
      try { this.channelYoutubeData = JSON.parse(fs.readFileSync(this.STATE_FILE)); } catch(e){}
    }

    try { execSync('pkill -f "ffmpeg -y -fflags \\+genpts -re -stream_loop"'); } catch(e) {}
  }

  // FUNGSI BARU: Buat nyari file sampai ke dalam folder kategori
  _getFilesRecursive(dir, extRegex) {
    let results = [];
    if (!fs.existsSync(dir)) return results;
    const list = fs.readdirSync(dir);
    for (const item of list) {
        const fullPath = path.join(dir, item);
        if (fs.statSync(fullPath).isDirectory()) {
            results = results.concat(fs.readdirSync(fullPath).filter(f => f.match(extRegex)).map(f => path.join(fullPath, f)));
        } else if (item.match(extRegex)) {
            results.push(fullPath);
        }
    }
    return results;
  }

  // FUNGSI BARU: Cocokin nama file yang dikirim UI dengan lokasi aslinya di VPS
  _resolvePath(baseDir, inputPath, extRegex) {
    if (!inputPath || inputPath.startsWith('RANDOM_')) return inputPath;
    if (inputPath.startsWith('/opt/media') && fs.existsSync(inputPath)) return inputPath;
    
    const allFiles = this._getFilesRecursive(baseDir, extRegex);
    const found = allFiles.find(f => path.basename(f) === path.basename(inputPath) || f.endsWith(inputPath));
    return found || inputPath; 
  }

  saveYtState() {
    try { fs.writeFileSync(this.STATE_FILE, JSON.stringify(this.channelYoutubeData)); } catch(e) {}
  }

  getUsedAssets() {
    const titles = []; const descs = []; const thumbs = []; const videos = [];
    for (const id in this.activeAssets) {
      if (this.activeAssets[id].title)          titles.push(this.activeAssets[id].title);
      if (this.activeAssets[id].description)    descs.push(this.activeAssets[id].description);
      if (this.activeAssets[id].thumbnailPath)  thumbs.push(this.activeAssets[id].thumbnailPath);
      if (this.activeAssets[id].videoReadyPath) videos.push(this.activeAssets[id].videoReadyPath);
    }
    return { titles, descs, thumbs, videos };
  }
  
  getRandomVideoReady() {
    const allFiles = this._getFilesRecursive('/opt/media/video-ready', /\.(mp4|mkv|mov|avi|flv)$/i);
    const usedFiles = Object.values(this.activeAssets).map(a => a.videoReadyPath).filter(Boolean);
    let available = allFiles.filter(f => !usedFiles.includes(f));
    if (available.length === 0) available = allFiles; 
    if (available.length === 0) return null;
    return available[Math.floor(Math.random() * available.length)];
  }

  buildPlaylist(folder, songPath, streamId) {
    const playlistPath = `/tmp/playlist_${streamId}.txt`;
    let files = [];
    let actualSongPath = this._resolvePath('/opt/media/music', songPath, /\.(mp3|wav|flac|ogg|m4a|aac)$/i);
    
    if (actualSongPath && fs.existsSync(actualSongPath)) {
      files.push(actualSongPath);
    } else {
      const MUSIC_DIR = '/opt/media/music';
      let selectedFolders = [];
      if (folder && folder !== 'Semua' && folder !== 'default') selectedFolders = folder.split(',').map(f => f.trim()).filter(Boolean);
      if (fs.existsSync(MUSIC_DIR)) {
        if (selectedFolders.length === 0) {
          files = this._getFilesRecursive(MUSIC_DIR, /\.(mp3|wav|flac|ogg|m4a|aac)$/i);
        } else {
          for (const fName of selectedFolders) {
            const targetDir = path.join(MUSIC_DIR, fName);
            if (fs.existsSync(targetDir) && fs.statSync(targetDir).isDirectory()) files.push(...fs.readdirSync(targetDir).filter(f => f.match(/\.(mp3|wav|flac|ogg|m4a|aac)$/i)).map(f => path.join(targetDir, f)));
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
        for (let i = roundFiles.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [roundFiles[i], roundFiles[j]] = [roundFiles[j], roundFiles[i]]; }
        contentFiles.push(...roundFiles);
    }
    const content = contentFiles.map(f => `file '${f.replace(/'/g, "'\\''")}'`).join('\n');
    fs.writeFileSync(playlistPath, content);
    return { playlistPath, firstSong: path.basename(safeFiles[0]), count: safeFiles.length };
  }

  async fetchNextVideo(channelId, folder, exactPath) {
    try { const res = await fetch(`${COORDINATOR_URL}/next-video`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ channelId, folder, exactPath }) }); return await res.json(); } catch (err) { return null; }
  }

  async releaseVideo(channelId) { try { await fetch(`${COORDINATOR_URL}/release-video`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ channelId }) }); } catch (err) {} }

  async start(channelId, dbClient, options = {}, isRestart = false) {
    if (!isRestart) this.crashCounts[channelId] = 0;
    delete this.reconnectingMap[channelId];
    this.savedConfigs[channelId] = { dbClient, options };
    this.deleteAfterStreamMap[channelId] = !!(options && options.deleteAfterStream);

    try {
      const { durationSecs = 21600, title, description, thumbnailPath, folder, videoPath, songPath, videoReadyPath, deleteAfterStream = false } = options;
      const streamId = randomUUID();

      const { rows } = await dbClient.query('SELECT google_refresh_token FROM channels WHERE channel_id = $1', [channelId]);
      const refreshToken = rows[0]?.google_refresh_token;
      if (!refreshToken) throw new Error(`Token Google tidak ditemukan di DB`);

      let rtmpUrl, broadcastId, youtubeStreamId, targetEndTime, originalStartTime;
      
      // CARI LOKASI ASLI SEMUA ASET BERDASARKAN NAMA
      let actualThumb = this._resolvePath('/opt/media/thumbnails', thumbnailPath, /\.(jpg|jpeg|png|webp)$/i);
      let actualVideoReadyPath = this._resolvePath('/opt/media/video-ready', videoReadyPath, /\.(mp4|mkv|mov|avi|flv)$/i);

      if (this.channelYoutubeData[channelId] && this.channelYoutubeData[channelId].rtmpUrl) {
        const savedYt = this.channelYoutubeData[channelId];
        if (Date.now() < savedYt.targetEndTime) {
           rtmpUrl = savedYt.rtmpUrl; broadcastId = savedYt.broadcastId; youtubeStreamId = savedYt.youtubeStreamId;
           targetEndTime = savedYt.targetEndTime; originalStartTime = savedYt.originalStartTime;
        } else {
           try { await this.youtubeService.endBroadcast({ refreshToken, broadcastId: savedYt.broadcastId }); } catch(e){}
           this.channelYoutubeData[channelId] = null; this.saveYtState();
        }
      }

      if (!rtmpUrl) {
        if (actualThumb === 'RANDOM_THUMBNAIL') {
          const files = this._getFilesRecursive('/opt/media/thumbnails', /\.(jpg|jpeg|png|webp)$/i);
          actualThumb = files.length > 0 ? files[Math.floor(Math.random() * files.length)] : null;
        }
        
        const ytRes = await this.youtubeService.createBroadcast({ refreshToken, title, description, thumbnailPath: actualThumb });
        rtmpUrl = ytRes.rtmpUrl; broadcastId = ytRes.broadcastId; youtubeStreamId = ytRes.streamId;
        
        targetEndTime = Date.now() + (durationSecs * 1000);
        originalStartTime = new Date();
        
        this.channelYoutubeData[channelId] = { rtmpUrl, broadcastId, youtubeStreamId, refreshToken, targetEndTime, originalStartTime };
        this.saveYtState();
      }

      const remainingSecs = Math.floor((targetEndTime - Date.now()) / 1000);
      if (remainingSecs <= 0) {
        const savedYt = this.channelYoutubeData[channelId];
        if (savedYt) {
          await this.youtubeService.endBroadcast({ refreshToken: savedYt.refreshToken, broadcastId: savedYt.broadcastId, deleteAfterStream: !!this.deleteAfterStreamMap[channelId] });
          this.channelYoutubeData[channelId] = null; this.saveYtState();
        }
        throw new Error('Batas waktu tayang siaran habis.');
      }

      if (actualVideoReadyPath === 'RANDOM_VIDEO_READY') {
         actualVideoReadyPath = this.getRandomVideoReady();
         if (!actualVideoReadyPath) throw new Error("Gagal! Tidak ada file video di folder Video Jadi untuk diacak.");
      }

      this.activeAssets[streamId] = { videoReadyPath: actualVideoReadyPath };

      // KARENA ACTUAL PATH UDAH KETEMU, fs.existsSync BAKAL TRUE DAN MODE COPY JALAN!
      const useStreamCopy = !!(actualVideoReadyPath && fs.existsSync(actualVideoReadyPath));
      let finalVideoPath, finalVideoFilename;
      
      if (useStreamCopy) {
        finalVideoPath = actualVideoReadyPath;
        finalVideoFilename = path.basename(actualVideoReadyPath);
      } else {
        const video = await this.fetchNextVideo(channelId, folder, videoPath);
        if (!video || video.error) throw new Error(`Video Gagal: ${video?.error || 'File tidak ditemukan'}`);
        finalVideoPath = video.path;
        finalVideoFilename = video.filename;
      }

      let playlistPath = ''; let count = 0; let ffmpegArgs = [];

      if (useStreamCopy) {
        await new Promise(resolve => setTimeout(resolve, 8000));
        ffmpegArgs = [
          '-y', '-fflags', '+genpts', '-re', '-stream_loop', '-1', '-i', finalVideoPath, '-t', String(remainingSecs),
          '-c:v', 'copy', '-c:a', 'copy', '-flvflags', 'no_duration_filesize', '-rw_timeout', '10000000', '-f', 'flv', rtmpUrl,
        ];
      } else {
        const playlistData = this.buildPlaylist(folder, songPath, streamId);
        playlistPath = playlistData.playlistPath; count = playlistData.count;
        await new Promise(resolve => setTimeout(resolve, 8000));
        ffmpegArgs = [
          '-y', '-fflags', '+genpts', '-re', '-stream_loop', '-1', '-i', finalVideoPath, '-fflags', '+genpts',
          '-re', '-f', 'concat', '-safe', '0', '-i', playlistPath, '-t', String(remainingSecs),
          '-c:v', 'libx264', '-preset', 'ultrafast', '-tune', 'zerolatency', '-b:v', '1500k', '-maxrate', '1800k', '-bufsize', '3000k',
          '-vf', 'scale=1280:720,format=yuv420p', '-r', '24', '-g', '48',
          '-c:a', 'aac', '-b:a', '128k', '-ar', '44100', '-ac', '2', '-async', '1', 
          '-map', '0:v:0', '-map', '1:a:0', '-max_muxing_queue_size', '4096', '-flvflags', 'no_duration_filesize', 
          '-rw_timeout', '10000000', '-f', 'flv', rtmpUrl,
        ];
      }

      const ffmpeg = spawn('ffmpeg', ffmpegArgs);
      this.processes[streamId] = ffmpeg; this.startTimes[streamId] = new Date(); 
      this.channelMap[streamId] = channelId; 
      this.activeAssets[streamId] = { title, description, thumbnailPath: actualThumb, playlistPath, videoReadyPath: useStreamCopy ? finalVideoPath : null, deleteAfterStream: !!deleteAfterStream, finalVideoPath };

      const stabilizationTimer = setTimeout(() => {
        if (this.processes[streamId]) { this.crashCounts[channelId] = 0; }
      }, 300000);

      setTimeout(() => {
        this.youtubeService.goLive({ refreshToken, broadcastId, streamId: youtubeStreamId })
          .then(() => this.wsService.broadcast('stream:live', { channelId, streamId, ts: new Date().toISOString() }))
          .catch(async err => { try { await dbClient.query('INSERT INTO system_logs (channel_id, message) VALUES ($1, $2)', [channelId, `YouTube API: ${err.message}`]); } catch(e){} });
      }, 5000); 

      let ffmpegLogs = [];
      ffmpeg.stderr.on('data', (data) => {
        const text = data.toString().trim();
        if (text) { ffmpegLogs.push(text); if (ffmpegLogs.length > 8) ffmpegLogs.shift(); }
        this.wsService.broadcastLog(channelId, text);
      });

      ffmpeg.on('close', async (code, signal) => {
        clearTimeout(stabilizationTimer); this.releaseVideo(channelId); 
        try { if (fs.existsSync(playlistPath)) fs.unlinkSync(playlistPath); } catch(e){}
        delete this.processes[streamId]; delete this.startTimes[streamId]; delete this.channelMap[streamId]; delete this.activeAssets[streamId];

        const isManualStop = signal === 'SIGTERM' || signal === 'SIGKILL' || code === 0 || code === 255;

        if (!isManualStop) {
          const fullLogText = ffmpegLogs.join(' ').toLowerCase();
          let diagCategory = 'UNKNOWN_CRASH';

          if (code === 137 || code === 152 || fullLogText.includes('killed') || fullLogText.includes('out of memory')) {
            diagCategory = 'OOM_KILLED';
          } else if (code === 146 || fullLogText.includes('broken pipe') || fullLogText.includes('connection reset') || fullLogText.includes('rtmp server sent error')) {
            diagCategory = 'RTMP_DROPPED';
          } else if (fullLogText.includes('input/output error') || fullLogText.includes('tidak ditemukan')) {
            diagCategory = 'IO_ERROR';
          }

          const cleanErrorText = ffmpegLogs.join(' | ').replace(/\n/g, ' ').substring(0, 140);
          const diagnosticMessage = `[${diagCategory}] (Exit Code: ${code}) -> ${cleanErrorText}`;
          
          try { await dbClient.query('INSERT INTO system_logs (channel_id, message) VALUES ($1, $2)', [channelId, diagnosticMessage]); } catch(e){}

          if (diagCategory !== 'OOM_KILLED') {
            this.reconnectingMap[channelId] = true; 
            this.executeAutoRestart(channelId);
          } else {
            this.wsService.broadcast('stream:stopped', { channelId, streamId, exitCode: code, ts: new Date().toISOString() });
          }
        } else {
          delete this.reconnectingMap[channelId];
          const savedYt = this.channelYoutubeData[channelId];
          if (savedYt) {
            await this.youtubeService.endBroadcast({ refreshToken: savedYt.refreshToken, broadcastId: savedYt.broadcastId, deleteAfterStream: !!this.deleteAfterStreamMap[channelId] });
            this.channelYoutubeData[channelId] = null; this.saveYtState();
          }
          // Hapus file video jika opsi deleteAfterStream diaktifkan
          const assetInfo = this.activeAssets && this.activeAssets[streamId];
          const shouldDelete = assetInfo && assetInfo.deleteAfterStream && assetInfo.finalVideoPath;
          if (shouldDelete) {
            try {
              const delPath = assetInfo.finalVideoPath;
              if (require('fs').existsSync(delPath)) {
                require('fs').unlinkSync(delPath);
                console.log(`[DELETE-AFTER-STREAM] Dihapus: ${delPath}`);
              }
            } catch(delErr) {
              console.error('[DELETE-AFTER-STREAM] Gagal hapus:', delErr.message);
            }
          }
          this.wsService.broadcast('stream:stopped', { channelId, streamId, exitCode: code, ts: new Date().toISOString() });
        }
      });

      this.wsService.broadcast('stream:started', { channelId, streamId, video: finalVideoFilename, song: useStreamCopy ? 'Audio Asli Video' : `Playlist (${count} lagu)`, mode: useStreamCopy ? 'COPY ⚡' : 'ENCODE', ts: new Date().toISOString() });
      return { streamId, channelId, video: finalVideoFilename, song: useStreamCopy ? 'Audio Asli Video' : `Playlist (${count} lagu, Diacak)`, mode: useStreamCopy ? 'copy' : 'encode', pid: ffmpeg.pid };

    } catch (error) {
      try { await dbClient.query('INSERT INTO system_logs (channel_id, message) VALUES ($1, $2)', [channelId, `Gagal Start Engine: ${error.message}`]); } catch(e){}
      if (!isRestart) this.executeAutoRestart(channelId);
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
      try { await config.dbClient.query('INSERT INTO system_logs (channel_id, message) VALUES ($1, $2)', [channelId, `[RESUME ACTIVE] Menyambung ke link YouTube yg sama dalam ${backoffDelay/1000}s (${attempt}/5)`]); } catch(e){}
      setTimeout(async () => { try { await this.start(channelId, config.dbClient, config.options, true); } catch (err) {} }, backoffDelay);
    } else {
      delete this.reconnectingMap[channelId];
      try { 
        await config.dbClient.query('INSERT INTO system_logs (channel_id, message) VALUES ($1, $2)', [channelId, `[CRASH TOTAL] Gagal 5 kali beruntun. Menutup paksa broadcast.`]); 
        const savedYt = this.channelYoutubeData[channelId];
        if (savedYt) {
          await this.youtubeService.endBroadcast({ refreshToken: savedYt.refreshToken, broadcastId: savedYt.broadcastId, deleteAfterStream: !!this.deleteAfterStreamMap[channelId] });
          this.channelYoutubeData[channelId] = null; this.saveYtState();
        }
      } catch(e){}
      this.crashCounts[channelId] = 0;
    }
  }

  stop(streamId) {
    if (streamId.startsWith('reconnecting-') || streamId.startsWith('orphaned-')) {
      const channelId = streamId.split('-')[1];
      delete this.reconnectingMap[channelId];
      const savedYt = this.channelYoutubeData[channelId];
      if (savedYt) {
        this.youtubeService.endBroadcast({ refreshToken: savedYt.refreshToken, broadcastId: savedYt.broadcastId, deleteAfterStream: !!this.deleteAfterStreamMap[channelId] });
        this.channelYoutubeData[channelId] = null; this.saveYtState();
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
  
  getStatus() {
    const active = Object.keys(this.processes).map(id => {
      const cId = this.channelMap[id]; const ytData = this.channelYoutubeData[cId];
      const startedAt = (ytData && ytData.originalStartTime) ? ytData.originalStartTime : this.startTimes[id];
      return { streamId: id, channelId: cId, pid: this.processes[id].pid, startedAt: startedAt, elapsedSeconds: Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000) };
    });
    
    const reconnecting = Object.keys(this.reconnectingMap).map(cId => {
      const ytData = this.channelYoutubeData[cId]; const startedAt = (ytData && ytData.originalStartTime) ? ytData.originalStartTime : new Date();
      return { streamId: 'reconnecting-' + cId, channelId: cId, pid: 0, startedAt: startedAt, elapsedSeconds: Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000) };
    });

    const orphaned = Object.keys(this.channelYoutubeData).filter(cId => this.channelYoutubeData[cId] && !this.isRunning(cId)).map(cId => {
      const ytData = this.channelYoutubeData[cId]; const startedAt = ytData.originalStartTime || new Date();
      return { streamId: 'orphaned-' + cId, channelId: cId, pid: 0, startedAt: startedAt, elapsedSeconds: Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000) };
    });
    
    return [...active, ...reconnecting, ...orphaned];
  }
}
module.exports = LocalStreamService;
