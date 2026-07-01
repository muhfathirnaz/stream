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
    this.streamYoutubeData = {};
    this.reconnectingMap = {};

    this.STATE_FILE = '/tmp/lofi_yt_state.json';
    if (fs.existsSync(this.STATE_FILE)) {
      try { this.streamYoutubeData = JSON.parse(fs.readFileSync(this.STATE_FILE)); } catch(e) {}
    }

    try { execSync('pkill -f "ffmpeg -y -fflags \\+genpts -re -stream_loop"'); } catch(e) {}
  }

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

  _resolvePath(baseDir, inputPath, extRegex) {
    if (!inputPath || inputPath.startsWith('RANDOM_')) return inputPath;
    if (inputPath.startsWith('/opt/media') && fs.existsSync(inputPath)) return inputPath;
    const allFiles = this._getFilesRecursive(baseDir, extRegex);
    const found = allFiles.find(f => path.basename(f) === path.basename(inputPath) || f.endsWith(inputPath));
    return found || inputPath;
  }

  saveYtState() {
    try { fs.writeFileSync(this.STATE_FILE, JSON.stringify(this.streamYoutubeData)); } catch(e) {}
  }

  getChannelYtData(channelId) {
    return Object.entries(this.streamYoutubeData)
      .filter(([, data]) => data && data.channelId === channelId)
      .map(([streamId, data]) => ({ streamId, ...data }));
  }

  getActiveYtData(channelId) {
    const entries = this.getChannelYtData(channelId);
    return entries.find(e => Date.now() < e.targetEndTime) || null;
  }

  async reconcileOrphans(db) {
    const streamIds = Object.keys(this.streamYoutubeData);
    for (const streamId of streamIds) {
      const ytData = this.streamYoutubeData[streamId];
      if (!ytData) continue;
      const channelId = ytData.channelId;
      
      if (this.processes[streamId]) continue;
      
      console.log(`[Reconcile] Stream ${streamId} channel ${channelId} orphan terdeteksi.`);
      try {
        if (Date.now() < ytData.targetEndTime) {
          await db.query('INSERT INTO system_logs (channel_id, message) VALUES ($1, $2)', 
            [channelId, '[RECONCILE] Backend restart. Mencoba resume engine...']);
          const remainingSecs = Math.floor((ytData.targetEndTime - Date.now()) / 1000);
          await this.start(channelId, db, { 
            durationSecs: remainingSecs, 
            folder: 'Semua', 
            auto: true 
          }, true, streamId);
        } else {
          if (!ytData.broadcastId.startsWith('manual_')) {
            await this.youtubeService.endBroadcast({ 
              refreshToken: ytData.refreshToken, 
              broadcastId: ytData.broadcastId, 
              deleteAfterStream: false 
            });
          }
          delete this.streamYoutubeData[streamId];
          this.saveYtState();
          await db.query('INSERT INTO system_logs (channel_id, message) VALUES ($1, $2)', 
            [channelId, '[RECONCILE] Sesi sudah expired. Broadcast ditutup.']);
        }
      } catch (e) {
        console.error('[Reconcile] Error:', e.message);
      }
    }
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
    let singleSongMode = false;
    
    if (actualSongPath && fs.existsSync(actualSongPath)) {
      files.push(actualSongPath);
      singleSongMode = true;
    } else {
      const MUSIC_DIR = '/opt/media/music';
      let selectedFolders = [];
      if (folder && folder !== 'Semua' && folder !== 'default') 
        selectedFolders = folder.split(',').map(f => f.trim()).filter(Boolean);
      if (fs.existsSync(MUSIC_DIR)) {
        if (selectedFolders.length === 0) {
          files = this._getFilesRecursive(MUSIC_DIR, /\.(mp3|wav|flac|ogg|m4a|aac)$/i);
        } else {
          for (const fName of selectedFolders) {
            const targetDir = path.join(MUSIC_DIR, fName);
            if (fs.existsSync(targetDir) && fs.statSync(targetDir).isDirectory()) 
              files.push(...fs.readdirSync(targetDir)
                .filter(f => f.match(/\.(mp3|wav|flac|ogg|m4a|aac)$/i))
                .map(f => path.join(targetDir, f)));
          }
        }
      }
    }
    if (files.length === 0) throw new Error("Tidak ada lagu ditemukan di Media Pool.");
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
    return {
      playlistPath,
      firstSong: path.basename(safeFiles[0]),
      count: safeFiles.length,
      // Cuma dianggap "single song" kalau memang 1 file spesifik dipilih manual (bukan playlist library)
      singleSongPath: (singleSongMode && safeFiles.length === 1) ? safeFiles[0] : null,
    };
  }

  async fetchNextVideo(channelId, folder, exactPath) {
    try { 
      const res = await fetch(`${COORDINATOR_URL}/next-video`, { 
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' }, 
        body: JSON.stringify({ channelId, folder, exactPath }) 
      }); 
      return await res.json(); 
    } catch (err) { return null; }
  }

  async releaseVideo(channelId) { 
    try { 
      await fetch(`${COORDINATOR_URL}/release-video`, { 
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' }, 
        body: JSON.stringify({ channelId }) 
      }); 
    } catch (err) {} 
  }

  async start(channelId, dbClient, options = {}, isRestart = false, existingStreamId = null) {
    if (!isRestart) this.crashCounts[channelId] = 0;
    delete this.reconnectingMap[channelId];

    const streamId = existingStreamId || randomUUID();
    this.savedConfigs[streamId] = { channelId, dbClient, options };
    this.deleteAfterStreamMap[streamId] = !!(options && options.deleteAfterStream);

    try {
      const { 
        durationSecs = 21600, title, description, thumbnailPath, 
        folder, videoPath, songPath, videoReadyPath, deleteAfterStream = false,
        deleteVpsAfterStream = false
      } = options;

      // ─── BYPASS LOGIC: CEK STREAM KEY ATAU TOKEN ───
      const { rows } = await dbClient.query(
        'SELECT google_refresh_token, stream_key FROM channels WHERE channel_id = $1', [channelId]
      );
      const refreshToken = rows[0]?.google_refresh_token;
      const streamKey = rows[0]?.stream_key;

      if (!refreshToken && !streamKey) {
        throw new Error(`Kredensial Kosong. Isi Stream Key atau Google Token untuk memulai.`);
      }

      let rtmpUrl, broadcastId, youtubeStreamId, targetEndTime, originalStartTime;
      
      let actualThumb = this._resolvePath('/opt/media/thumbnails', thumbnailPath, /\.(jpg|jpeg|png|webp)$/i);
      let actualVideoReadyPath = this._resolvePath('/opt/media/video-ready', videoReadyPath, /\.(mp4|mkv|mov|avi|flv)$/i);

      const savedYt = this.streamYoutubeData[streamId];
      if (savedYt && savedYt.rtmpUrl && Date.now() < savedYt.targetEndTime) {
        rtmpUrl = savedYt.rtmpUrl;
        broadcastId = savedYt.broadcastId;
        youtubeStreamId = savedYt.youtubeStreamId;
        targetEndTime = savedYt.targetEndTime;
        originalStartTime = savedYt.originalStartTime;
        console.log(`[Stream] Reusing broadcast untuk streamId ${streamId}`);
      } else {
        if (actualThumb === 'RANDOM_THUMBNAIL') {
          const files = this._getFilesRecursive('/opt/media/thumbnails', /\.(jpg|jpeg|png|webp)$/i);
          actualThumb = files.length > 0 ? files[Math.floor(Math.random() * files.length)] : null;
        }
        
        // JIKA ADA STREAM KEY, SELALU GUNAKAN MANUAL MODE (BYPASS API YOUTUBE)
        if (streamKey) {
          rtmpUrl = `rtmp://a.rtmp.youtube.com/live2/${streamKey}`;
          broadcastId = `manual_${streamId}`;
          youtubeStreamId = `manual_${streamId}`;
          console.log(`[Stream] BYPASS API: Menggunakan Manual Stream Key untuk ${channelId}`);
        } else {
          // JIKA TIDAK ADA STREAM KEY TAPI ADA TOKEN, GUNAKAN YOUTUBE API
          const ytRes = await this.youtubeService.createBroadcast({ 
            refreshToken, title, description, thumbnailPath: actualThumb 
          });
          rtmpUrl = ytRes.rtmpUrl;
          broadcastId = ytRes.broadcastId;
          youtubeStreamId = ytRes.streamId;
          console.log(`[Stream] API SUCCESS: Broadcast BARU dibuat ${broadcastId}`);
        }
        
        targetEndTime = Date.now() + (durationSecs * 1000);
        originalStartTime = new Date();
        
        this.streamYoutubeData[streamId] = { 
          channelId, rtmpUrl, broadcastId, youtubeStreamId, 
          refreshToken, targetEndTime, originalStartTime 
        };
        this.saveYtState();
      }

      const remainingSecs = Math.floor((targetEndTime - Date.now()) / 1000);
      if (remainingSecs <= 0) {
        const ytData = this.streamYoutubeData[streamId];
        if (ytData) {
          if (!ytData.broadcastId.startsWith('manual_')) {
            await this.youtubeService.endBroadcast({ 
              refreshToken: ytData.refreshToken, broadcastId: ytData.broadcastId, deleteAfterStream: !!this.deleteAfterStreamMap[streamId] 
            });
          }
          delete this.streamYoutubeData[streamId];
          this.saveYtState();
        }
        throw new Error('Batas waktu tayang habis.');
      }

      if (actualVideoReadyPath === 'RANDOM_VIDEO_READY') {
        actualVideoReadyPath = this.getRandomVideoReady();
        if (!actualVideoReadyPath) throw new Error("Tidak ada file video di folder Video Jadi.");
      }

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

      let playlistPath = ''; let count = 0; let ffmpegArgs = []; let singleSongFilePath = null;

      if (useStreamCopy) {
        await new Promise(resolve => setTimeout(resolve, 8000));
        ffmpegArgs = [
          '-y', '-fflags', '+genpts', '-re', '-stream_loop', '-1', '-i', finalVideoPath, 
          ...(remainingSecs < 3596000 ? ['-t', String(remainingSecs)] : []),
          '-c:v', 'copy', '-c:a', 'copy', 
          '-flvflags', 'no_duration_filesize', 
          '-rw_timeout', '10000000', '-f', 'flv', rtmpUrl,
        ];
      } else {
        const playlistData = this.buildPlaylist(folder, songPath, streamId);
        playlistPath = playlistData.playlistPath;
        count = playlistData.count;
        singleSongFilePath = playlistData.singleSongPath;
        await new Promise(resolve => setTimeout(resolve, 8000));
        ffmpegArgs = [
          '-y', '-fflags', '+genpts', '-re', '-stream_loop', '-1', '-i', finalVideoPath, 
          '-fflags', '+genpts', '-re', '-f', 'concat', '-safe', '0', '-i', playlistPath, 
          ...(remainingSecs < 3596000 ? ['-t', String(remainingSecs)] : []),
          '-c:v', 'libx264', '-preset', 'ultrafast', '-tune', 'zerolatency', 
          '-b:v', '1500k', '-maxrate', '1800k', '-bufsize', '3000k',
          '-vf', 'scale=1280:720,format=yuv420p', '-r', '24', '-g', '48',
          '-c:a', 'aac', '-b:a', '128k', '-ar', '44100', '-ac', '2', '-async', '1', 
          '-map', '0:v:0', '-map', '1:a:0', 
          '-max_muxing_queue_size', '4096', 
          '-flvflags', 'no_duration_filesize', 
          '-rw_timeout', '10000000', '-f', 'flv', rtmpUrl,
        ];
      }

      const ffmpeg = spawn('ffmpeg', ffmpegArgs);
      this.processes[streamId] = ffmpeg;
      this.startTimes[streamId] = new Date();
      this.channelMap[streamId] = channelId;
      this.activeAssets[streamId] = { 
        title, description, 
        thumbnailPath: actualThumb, 
        playlistPath, 
        videoReadyPath: useStreamCopy ? finalVideoPath : null, 
        // Audio cuma dihapus kalau ini lagu manual single-file, BUKAN playlist/library acak
        songFilePath: useStreamCopy ? null : singleSongFilePath,
        deleteAfterStream: !!deleteAfterStream, 
        deleteVpsAfterStream: !!deleteVpsAfterStream, 
        finalVideoPath, 
        mode: useStreamCopy ? 'copy' : 'encode', 
        videoFilename: finalVideoFilename, 
        songInfo: useStreamCopy ? 'Audio Asli Video' : `Playlist (${count} lagu)` 
      };

      const stabilizationTimer = setTimeout(() => {
        if (this.processes[streamId]) this.crashCounts[channelId] = 0;
      }, 300000);

      setTimeout(() => {
        const ytData = this.streamYoutubeData[streamId];
        if (!ytData) return;
        
        // BYPASS GO-LIVE JIKA MENGGUNAKAN MANUAL STREAM KEY
        if (ytData.broadcastId.startsWith('manual_')) {
           this.wsService.broadcast('stream:live', { channelId, streamId, ts: new Date().toISOString() });
        } else {
           this.youtubeService.goLive({ refreshToken, broadcastId: ytData.broadcastId, streamId: ytData.youtubeStreamId })
             .then(() => this.wsService.broadcast('stream:live', { channelId, streamId, ts: new Date().toISOString() }))
             .catch(async err => { try { await dbClient.query('INSERT INTO system_logs (channel_id, message) VALUES ($1, $2)', [channelId, `YouTube API: ${err.message}`]); } catch(e) {} });
        }
      }, 5000);

      let ffmpegLogs = [];
      ffmpeg.stderr.on('data', (data) => {
        const text = data.toString().trim();
        if (text) { ffmpegLogs.push(text); if (ffmpegLogs.length > 8) ffmpegLogs.shift(); }
        this.wsService.broadcastLog(channelId, text);
      });

      ffmpeg.on('close', async (code, signal) => {
        clearTimeout(stabilizationTimer);
        this.releaseVideo(channelId);
        try { if (fs.existsSync(playlistPath)) fs.unlinkSync(playlistPath); } catch(e) {}
        
        delete this.processes[streamId];
        delete this.startTimes[streamId];
        delete this.channelMap[streamId];
        
        const assetInfo = this.activeAssets[streamId];
        delete this.activeAssets[streamId];

        const isManualStop = signal === 'SIGTERM' || signal === 'SIGKILL' || code === 0 || code === 255;

        if (!isManualStop) {
          const fullLogText = ffmpegLogs.join(' ').toLowerCase();
          let diagCategory = 'UNKNOWN_CRASH';

          if (code === 137 || code === 152 || fullLogText.includes('killed') || fullLogText.includes('out of memory')) { diagCategory = 'OOM_KILLED'; } 
          else if (code === 146 || fullLogText.includes('broken pipe') || fullLogText.includes('connection reset')) { diagCategory = 'RTMP_DROPPED'; } 
          else if (fullLogText.includes('input/output error')) { diagCategory = 'IO_ERROR'; }

          const cleanErrorText = ffmpegLogs.join(' | ').replace(/\n/g, ' ').substring(0, 140);
          const diagnosticMessage = `[${diagCategory}] (Exit Code: ${code}) -> ${cleanErrorText}`;
          
          try { await dbClient.query('INSERT INTO system_logs (channel_id, message) VALUES ($1, $2)', [channelId, diagnosticMessage]); } catch(e) {}

          if (diagCategory !== 'OOM_KILLED') {
            this.reconnectingMap[channelId] = streamId;
            this.executeAutoRestart(streamId, channelId);
          } else {
            this.wsService.broadcast('stream:stopped', { channelId, streamId, exitCode: code, ts: new Date().toISOString() });
          }
        } else {
          delete this.reconnectingMap[channelId];
          
          const ytData = this.streamYoutubeData[streamId];
          if (ytData) {
            if (!ytData.broadcastId.startsWith('manual_')) {
              await this.youtubeService.endBroadcast({ refreshToken: ytData.refreshToken, broadcastId: ytData.broadcastId, deleteAfterStream: !!this.deleteAfterStreamMap[streamId] });
            }
            delete this.streamYoutubeData[streamId];
            this.saveYtState();
          }
          delete this.deleteAfterStreamMap[streamId];

          // ─── HAPUS SEMUA: VIDEO + AUDIO + THUMBNAIL + METADATA (JUDUL/DESKRIPSI) ───
          if (assetInfo && assetInfo.deleteVpsAfterStream) {
            // Video
            if (assetInfo.finalVideoPath) {
              try { if (fs.existsSync(assetInfo.finalVideoPath)) fs.unlinkSync(assetInfo.finalVideoPath); } catch(delErr) {}
            }
            // Audio (cuma kalau lagu manual single-file, bukan playlist acak dari library)
            if (assetInfo.songFilePath) {
              try { if (fs.existsSync(assetInfo.songFilePath)) fs.unlinkSync(assetInfo.songFilePath); } catch(delErr) {}
            }
            // Thumbnail
            if (assetInfo.thumbnailPath) {
              try { if (fs.existsSync(assetInfo.thumbnailPath)) fs.unlinkSync(assetInfo.thumbnailPath); } catch(delErr) {}
            }
            // Metadata (judul & deskripsi) dari database supaya gak kepakai ulang
            try {
              if (assetInfo.title) {
                await dbClient.query("DELETE FROM broadcast_assets WHERE type = 'title' AND value = $1", [assetInfo.title]);
              }
              if (assetInfo.description) {
                await dbClient.query("DELETE FROM broadcast_assets WHERE type = 'description' AND value = $1", [assetInfo.description]);
              }
            } catch (metaErr) {
              console.error('[Cleanup] Gagal hapus metadata judul/deskripsi:', metaErr.message);
            }
          }

          this.wsService.broadcast('stream:stopped', { channelId, streamId, exitCode: code, ts: new Date().toISOString() });
        }
      });

      this.wsService.broadcast('stream:started', { 
        channelId, streamId, video: finalVideoFilename, 
        song: useStreamCopy ? 'Audio Asli Video' : `Playlist (${count} lagu)`, 
        mode: useStreamCopy ? 'COPY ⚡' : 'ENCODE', ts: new Date().toISOString() 
      });

      return { streamId, channelId, video: finalVideoFilename, mode: useStreamCopy ? 'copy' : 'encode', pid: ffmpeg.pid };

    } catch (error) {
      if (this.streamYoutubeData[streamId] && !existingStreamId) {
        delete this.streamYoutubeData[streamId];
        this.saveYtState();
      }
      try { await dbClient.query('INSERT INTO system_logs (channel_id, message) VALUES ($1, $2)', [channelId, `Gagal Start Engine: ${error.message}`]); } catch(e) {}
      if (!isRestart) this.executeAutoRestart(streamId, channelId);
      throw error;
    }
  }

  async executeAutoRestart(streamId, channelId) {
    const config = this.savedConfigs[streamId];
    if (!config) return;

    this.crashCounts[channelId] = (this.crashCounts[channelId] || 0) + 1;
    const attempt = this.crashCounts[channelId];

    if (attempt <= 5) {
      const backoffDelay = attempt * 15000;
      try { await config.dbClient.query('INSERT INTO system_logs (channel_id, message) VALUES ($1, $2)', [channelId, `[RESUME ACTIVE] Menyambung dalam ${backoffDelay/1000}s (${attempt}/5)`]); } catch(e) {}
      setTimeout(async () => { try { await this.start(channelId, config.dbClient, config.options, true, streamId); } catch (err) {} }, backoffDelay);
    } else {
      delete this.reconnectingMap[channelId];
      try { 
        await config.dbClient.query('INSERT INTO system_logs (channel_id, message) VALUES ($1, $2)', [channelId, `[CRASH TOTAL] Gagal 5 kali. Menutup broadcast.`]);
        const ytData = this.streamYoutubeData[streamId];
        if (ytData) {
          if (!ytData.broadcastId.startsWith('manual_')) {
             await this.youtubeService.endBroadcast({ refreshToken: ytData.refreshToken, broadcastId: ytData.broadcastId, deleteAfterStream: !!this.deleteAfterStreamMap[streamId] });
          }
          delete this.streamYoutubeData[streamId];
          this.saveYtState();
        }
      } catch(e) {}
      this.crashCounts[channelId] = 0;
      delete this.savedConfigs[streamId];
    }
  }

  stop(streamId) {
    if (streamId.startsWith('reconnecting-') || streamId.startsWith('orphaned-')) {
      const channelId = streamId.replace('reconnecting-', '').replace('orphaned-', '');
      delete this.reconnectingMap[channelId];
      
      const channelYtEntries = this.getChannelYtData(channelId);
      for (const entry of channelYtEntries) {
        if (!entry.broadcastId.startsWith('manual_')) {
          this.youtubeService.endBroadcast({ refreshToken: entry.refreshToken, broadcastId: entry.broadcastId, deleteAfterStream: !!this.deleteAfterStreamMap[entry.streamId] });
        }
        delete this.streamYoutubeData[entry.streamId];
      }
      this.saveYtState();
      return { streamId, channelId, stopped: true };
    }

    const proc = this.processes[streamId];
    if (!proc) throw new Error(`No stream found: ${streamId}`);
    proc.kill('SIGTERM');
    return { streamId, channelId: this.channelMap[streamId], stopped: true };
  }
  
  stopAllByChannel(channelId) {
    delete this.reconnectingMap[channelId];
    const streamIds = Object.keys(this.channelMap).filter(id => this.channelMap[id] === channelId);
    streamIds.forEach(id => this.processes[id]?.kill('SIGTERM'));
    return { channelId, stopped: streamIds.length };
  }
  
  isRunning(channelId) { 
    return Object.values(this.channelMap).includes(channelId) || !!this.reconnectingMap[channelId]; 
  }
  
  getStatus() {
    const active = Object.keys(this.processes).map(id => {
      const cId = this.channelMap[id];
      const ytData = this.streamYoutubeData[id];
      const startedAt = (ytData && ytData.originalStartTime) ? ytData.originalStartTime : this.startTimes[id];
      const assets = this.activeAssets[id] || {};
      const isCopyMode = !!assets.videoReadyPath;
      return {
        streamId: id,
        channelId: cId,
        pid: this.processes[id].pid,
        startedAt,
        elapsedSeconds: Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000),
        title: assets.title || null,
        thumbnailPath: assets.thumbnailPath || null,
        mode: isCopyMode ? 'copy' : 'encode',
        videoFilename: assets.finalVideoPath ? path.basename(assets.finalVideoPath) : null,
        songInfo: isCopyMode ? 'Audio Asli Video' : (assets.playlistPath ? 'Playlist Lagu' : null),
      };
    });
    
    const reconnecting = Object.keys(this.reconnectingMap).map(cId => {
      const ytEntries = this.getChannelYtData(cId);
      const startedAt = ytEntries[0]?.originalStartTime || new Date();
      return { streamId: 'reconnecting-' + cId, channelId: cId, pid: 0, startedAt, elapsedSeconds: Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000) };
    });

    const activeChannels = new Set(Object.values(this.channelMap));
    const reconnectingChannels = new Set(Object.keys(this.reconnectingMap));
    
    const orphaned = Object.entries(this.streamYoutubeData)
      .filter(([streamId, data]) => {
        if (!data) return false;
        return !this.processes[streamId] && !reconnectingChannels.has(data.channelId);
      })
      .map(([streamId, data]) => {
        const startedAt = data.originalStartTime || new Date();
        return { streamId: 'orphaned-' + data.channelId, channelId: data.channelId, pid: 0, startedAt, elapsedSeconds: Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000) };
      });
    
    return [...active, ...reconnecting, ...orphaned];
  }

  get channelYoutubeData() {
    const result = {};
    for (const [streamId, data] of Object.entries(this.streamYoutubeData)) {
      if (data && !result[data.channelId]) { result[data.channelId] = { ...data, _streamId: streamId }; }
    }
    return result;
  }
}

module.exports = LocalStreamService;
