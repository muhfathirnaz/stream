/**
 * RenderQueueService
 * Job queue buat fitur "Render Video + Lyric Karaoke"
 * - Mode TOTAL DURASI: user set 1 target durasi video keseluruhan,
 *   lagu yang ditandai "loopToFill" akan di-loop buat ngisi sisa waktu
 *   setelah lagu-lagu lain (non-loop) dihitung apa adanya.
 * - Gabung multi-lagu jadi 1 track audio panjang
 * - Loop video sampai total durasi audio
 * - Burn-in subtitle karaoke (.ass) kalau ditoggle per-lagu
 * - Progress real-time via WebSocket
 */

const { spawn, execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');

const WORK_DIR = '/tmp/render-jobs';
if (!fs.existsSync(WORK_DIR)) fs.mkdirSync(WORK_DIR, { recursive: true });

function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { maxBuffer: 1024 * 1024 * 64, ...opts }, (err, stdout, stderr) => {
      if (err) return reject(new Error(`${err.message}\n${(stderr || '').slice(-2000)}`));
      resolve({ stdout, stderr });
    });
  });
}

function ffprobeDuration(filePath) {
  return new Promise((resolve, reject) => {
    execFile('ffprobe', [
      '-v', 'error', '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1', filePath
    ], (err, stdout) => {
      if (err) return reject(err);
      resolve(parseFloat(stdout.trim()));
    });
  });
}

class RenderQueueService {
  constructor(db, wsService, lyricsService) {
    this.db = db;
    this.wsService = wsService;
    this.lyricsService = lyricsService;
    this.activeJobs = {};
    this._queue = [];
    this._processing = false;
  }

  async createJob({ outputName, outputCategory, videoPath, songs, totalDurationSecs }) {
    // songs: [{ path, filename, loopToFill, useLyrics }]
    // totalDurationSecs: target durasi TOTAL video (opsional; kalau kosong, pakai durasi natural gabungan lagu)
    const { rows } = await this.db.query(
      `INSERT INTO render_jobs (output_name, output_category, video_path, status, stage, config)
       VALUES ($1, $2, $3, 'queued', 'queued', $4) RETURNING *`,
      [outputName, outputCategory || 'Uncategorized', videoPath, JSON.stringify({ songs, totalDurationSecs: totalDurationSecs || null })]
    );
    const job = rows[0];
    this._queue.push(job.id);
    this._processNext();
    return job;
  }

  async listJobs() {
    const { rows } = await this.db.query('SELECT * FROM render_jobs ORDER BY created_at DESC LIMIT 50');
    return rows;
  }

  cancelJob(jobId) {
    const active = this.activeJobs[jobId];
    if (active && active.proc) {
      active.cancelled = true;
      try { active.proc.kill('SIGKILL'); } catch (e) {}
    }
  }

  _broadcast(jobId, patch) {
    this.wsService?.broadcast('render:progress', { jobId, ...patch, ts: new Date().toISOString() });
  }

  async _setJobState(jobId, fields) {
    const keys = Object.keys(fields);
    const sets = keys.map((k, i) => `${k} = $${i + 2}`).join(', ');
    await this.db.query(`UPDATE render_jobs SET ${sets} WHERE id = $1`, [jobId, ...keys.map(k => fields[k])]);
    this._broadcast(jobId, fields);
  }

  async _processNext() {
    if (this._processing) return;
    const jobId = this._queue.shift();
    if (!jobId) return;
    this._processing = true;
    try {
      await this._runJob(jobId);
    } catch (err) {
      console.error(`[RenderQueue] Job ${jobId} gagal total:`, err.message);
      await this._setJobState(jobId, { status: 'failed', error_message: err.message, finished_at: new Date() }).catch(() => {});
    } finally {
      this._processing = false;
      delete this.activeJobs[jobId];
      this._processNext();
    }
  }

  /**
   * Hitung durasi final tiap lagu berdasarkan mode TOTAL DURASI.
   * - Lagu non-loop: pakai durasi asli apa adanya
   * - Lagu loopToFill: dibagi rata dari sisa waktu (totalTarget - jumlah durasi non-loop)
   * - Kalau totalDurationSecs gak diisi: semua lagu pakai durasi asli (gak ada yang di-loop)
   * - Kalau sisa waktu negatif (lagu non-loop aja udah lebih lama dari target): semua lagu apa adanya, target diabaikan
   */
  _computeTargetDurations(songs, origDurations, totalDurationSecs) {
    if (!totalDurationSecs || totalDurationSecs <= 0) {
      return songs.map((s, i) => ({ ...s, finalTargetSecs: origDurations[i] }));
    }

    const loopIdx = [];
    let nonLoopSum = 0;
    songs.forEach((s, i) => {
      if (s.loopToFill) loopIdx.push(i);
      else nonLoopSum += origDurations[i];
    });

    if (loopIdx.length === 0) {
      // Gak ada lagu yang ditandai loop -> gak bisa ngisi sisa waktu, pakai durasi asli semua
      return songs.map((s, i) => ({ ...s, finalTargetSecs: origDurations[i] }));
    }

    const remaining = totalDurationSecs - nonLoopSum;
    if (remaining <= 0) {
      // Lagu-lagu non-loop aja udah >= target, gak ada sisa buat di-loop
      return songs.map((s, i) => ({ ...s, finalTargetSecs: origDurations[i] }));
    }

    const perLoopSong = remaining / loopIdx.length;
    return songs.map((s, i) => ({
      ...s,
      finalTargetSecs: s.loopToFill ? perLoopSong : origDurations[i],
    }));
  }

  async _runJob(jobId) {
    const { rows } = await this.db.query('SELECT * FROM render_jobs WHERE id = $1', [jobId]);
    const job = rows[0];
    if (!job) return;

    const config = job.config;
    const songs = config.songs;
    const totalDurationSecs = config.totalDurationSecs;
    this.activeJobs[jobId] = { proc: null, cancelled: false };

    await this._setJobState(jobId, { status: 'running', stage: 'transcribing', progress: 2, started_at: new Date() });

    // ─── TAHAP 1: Transkrip lagu yang butuh lyric & belum punya ───
    const songsNeedingLyrics = songs.filter(s => s.useLyrics);
    for (let i = 0; i < songsNeedingLyrics.length; i++) {
      if (this.activeJobs[jobId].cancelled) throw new Error('Dibatalkan user');
      const s = songsNeedingLyrics[i];
      this._broadcast(jobId, { stage: 'transcribing', detail: `Transkrip: ${s.filename} (${i + 1}/${songsNeedingLyrics.length})` });
      await this.lyricsService.ensureLyrics(s.path);
      await this._setJobState(jobId, { progress: 2 + Math.round(((i + 1) / Math.max(1, songsNeedingLyrics.length)) * 18) });
    }

    // ─── TAHAP 2: Hitung target durasi tiap lagu (mode TOTAL DURASI) ───
    await this._setJobState(jobId, { stage: 'preparing_audio', progress: 21, detail: 'Menghitung distribusi durasi...' });
    const origDurations = [];
    for (const s of songs) origDurations.push(await ffprobeDuration(s.path));

    const songsWithTarget = this._computeTargetDurations(songs, origDurations, totalDurationSecs);

    if (totalDurationSecs) {
      const sumNatural = origDurations.reduce((a, b) => a + b, 0);
      const detail = totalDurationSecs > sumNatural
        ? `Target ${Math.round(totalDurationSecs/60)} menit. Lagu loop akan ngisi sisa ${Math.round((totalDurationSecs - songs.reduce((a,s,i)=> a + (s.loopToFill?0:origDurations[i]),0))/60)} menit.`
        : `Target ${Math.round(totalDurationSecs/60)} menit lebih pendek dari total natural lagu non-loop, target diabaikan.`;
      this._broadcast(jobId, { stage: 'preparing_audio', detail });
    }

    // ─── TAHAP 3: Siapkan tiap lagu (loop/trim sesuai target yang udah dihitung) ───
    const jobTmp = path.join(WORK_DIR, `job_${jobId}_${randomUUID().slice(0, 8)}`);
    fs.mkdirSync(jobTmp, { recursive: true });

    const preparedTracks = []; // { audioPath, assPath|null, durationSecs, filename }

    for (let i = 0; i < songsWithTarget.length; i++) {
      if (this.activeJobs[jobId].cancelled) throw new Error('Dibatalkan user');
      const s = songsWithTarget[i];
      const origDur = origDurations[i];
      const targetDur = s.finalTargetSecs;
      this._broadcast(jobId, { stage: 'preparing_audio', detail: `Menyiapkan audio: ${s.filename} (target ${Math.round(targetDur/60*10)/10} menit)` });

      let finalAudioPath = s.path;
      let finalDur = origDur;

      if (targetDur > origDur + 0.5) {
        const looped = path.join(jobTmp, `loop_${i}.mp3`);
        const loopCount = Math.ceil(targetDur / origDur) + 1;
        await run('ffmpeg', [
          '-y', '-stream_loop', String(loopCount - 1), '-i', s.path,
          '-t', String(targetDur),
          '-c:a', 'libmp3lame', '-qscale:a', '2', looped,
        ]);
        finalAudioPath = looped;
        finalDur = targetDur;
      } else if (targetDur < origDur - 0.5) {
        const trimmed = path.join(jobTmp, `trim_${i}.mp3`);
        await run('ffmpeg', ['-y', '-i', s.path, '-t', String(targetDur), '-c:a', 'libmp3lame', '-qscale:a', '2', trimmed]);
        finalAudioPath = trimmed;
        finalDur = targetDur;
      }

      let assPath = null;
      if (s.useLyrics) {
        const lyric = await this.lyricsService.getLyricForSong(s.path);
        if (lyric && lyric.ass_path && fs.existsSync(lyric.ass_path)) {
          assPath = lyric.ass_path;
          if (finalDur > origDur + 1) {
            assPath = this._loopAssToFitDuration(lyric.ass_path, origDur, finalDur, path.join(jobTmp, `lyric_${i}.ass`));
          }
        }
      }

      preparedTracks.push({ audioPath: finalAudioPath, assPath, durationSecs: finalDur, filename: s.filename });
      await this._setJobState(jobId, { progress: 22 + Math.round(((i + 1) / songsWithTarget.length) * 18) });
    }

    // ─── TAHAP 4: Gabung semua track audio jadi 1 + gabung subtitle dgn offset waktu ───
    await this._setJobState(jobId, { stage: 'merging_audio', progress: 42 });
    const concatListPath = path.join(jobTmp, 'concat.txt');
    fs.writeFileSync(concatListPath, preparedTracks.map(t => `file '${t.audioPath.replace(/'/g, "'\\''")}'`).join('\n'));

    const mergedAudioPath = path.join(jobTmp, 'merged_audio.mp3');
    await run('ffmpeg', ['-y', '-f', 'concat', '-safe', '0', '-i', concatListPath, '-c:a', 'libmp3lame', '-qscale:a', '2', mergedAudioPath]);
    const totalDuration = await ffprobeDuration(mergedAudioPath);

    const mergedAssPath = this._mergeAssWithOffsets(preparedTracks, path.join(jobTmp, 'merged_lyrics.ass'));

    // ─── TAHAP 5: Loop video sampai total durasi audio ───
    await this._setJobState(jobId, { stage: 'rendering_video', progress: 48, detail: `Total durasi final: ${Math.round(totalDuration / 60)} menit` });

    const outputDir = path.join('/opt/media/video-ready', job.output_category || 'Uncategorized');
    fs.mkdirSync(outputDir, { recursive: true });
    const safeName = job.output_name.replace(/[^a-zA-Z0-9_\- ]/g, '_');
    const outputPath = path.join(outputDir, `${safeName}.mp4`);

    const ffmpegArgs = [
      '-y',
      '-stream_loop', '-1', '-i', job.video_path,
      '-i', mergedAudioPath,
      '-t', String(totalDuration),
      '-map', '0:v:0', '-map', '1:a:0',
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23',
      '-vf', mergedAssPath
        ? `scale=1280:720,format=yuv420p,ass=${this._escapeFfmpegPath(mergedAssPath)}`
        : 'scale=1280:720,format=yuv420p',
      '-c:a', 'aac', '-b:a', '192k',
      '-movflags', '+faststart',
      outputPath,
    ];

    await this._runFfmpegWithProgress(jobId, ffmpegArgs, totalDuration, 48, 96);

    if (this.activeJobs[jobId].cancelled) throw new Error('Dibatalkan user');

    await this._setJobState(jobId, {
      status: 'done', stage: 'done', progress: 100,
      output_path: outputPath, finished_at: new Date(),
    });

    try { fs.rmSync(jobTmp, { recursive: true, force: true }); } catch (e) {}
  }

  _escapeFfmpegPath(p) {
    return p.replace(/:/g, '\\:').replace(/'/g, "\\'");
  }

  _runFfmpegWithProgress(jobId, args, totalDuration, progStart, progEnd) {
    return new Promise((resolve, reject) => {
      const proc = spawn('ffmpeg', [...args, '-progress', 'pipe:1', '-nostats']);
      this.activeJobs[jobId].proc = proc;

      let buf = '';
      proc.stdout.on('data', (chunk) => {
        buf += chunk.toString();
        const match = buf.match(/out_time_ms=(\d+)/g);
        if (match) {
          const last = match[match.length - 1];
          const ms = parseInt(last.split('=')[1], 10);
          const sec = ms / 1000000;
          const ratio = Math.min(1, sec / totalDuration);
          const progress = Math.round(progStart + ratio * (progEnd - progStart));
          this._setJobState(jobId, { progress }).catch(() => {});
        }
      });

      let stderrTail = '';
      proc.stderr.on('data', (d) => { stderrTail += d.toString(); if (stderrTail.length > 4000) stderrTail = stderrTail.slice(-4000); });

      proc.on('close', (code) => {
        if (this.activeJobs[jobId]?.cancelled) return reject(new Error('Dibatalkan user'));
        if (code === 0) resolve();
        else reject(new Error(`ffmpeg exit code ${code}: ${stderrTail.slice(-500)}`));
      });
      proc.on('error', reject);
    });
  }

  _loopAssToFitDuration(srcAssPath, origDur, targetDur, outPath) {
    const raw = fs.readFileSync(srcAssPath, 'utf-8');
    const [header, eventsBlock] = raw.split('[Events]');
    const lines = eventsBlock.split('\n').filter(l => l.startsWith('Dialogue:'));
    const loops = Math.ceil(targetDur / origDur);

    const allLines = [];
    for (let loop = 0; loop < loops; loop++) {
      const offset = loop * origDur;
      for (const line of lines) {
        const parts = line.split(',');
        const start = this._assTimeToSec(parts[1]) + offset;
        const end = this._assTimeToSec(parts[2]) + offset;
        if (start >= targetDur) continue;
        parts[1] = this._secToAssTime(start);
        parts[2] = this._secToAssTime(Math.min(end, targetDur));
        allLines.push(parts.join(','));
      }
    }
    fs.writeFileSync(outPath, header + '[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n' + allLines.join('\n') + '\n');
    return outPath;
  }

  _mergeAssWithOffsets(tracks, outPath) {
    const tracksWithLyrics = tracks.filter(t => t.assPath && fs.existsSync(t.assPath));
    if (tracksWithLyrics.length === 0) return null;

    let header = null;
    const allLines = [];
    let cumulativeOffset = 0;

    for (const t of tracks) {
      if (t.assPath && fs.existsSync(t.assPath)) {
        const raw = fs.readFileSync(t.assPath, 'utf-8');
        const [h, eventsBlock] = raw.split('[Events]');
        if (!header) header = h;
        const lines = eventsBlock.split('\n').filter(l => l.startsWith('Dialogue:'));
        for (const line of lines) {
          const parts = line.split(',');
          const start = this._assTimeToSec(parts[1]) + cumulativeOffset;
          const end = this._assTimeToSec(parts[2]) + cumulativeOffset;
          parts[1] = this._secToAssTime(start);
          parts[2] = this._secToAssTime(end);
          allLines.push(parts.join(','));
        }
      }
      cumulativeOffset += t.durationSecs;
    }

    if (!header) return null;
    fs.writeFileSync(outPath, header + '[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n' + allLines.join('\n') + '\n');
    return outPath;
  }

  _assTimeToSec(t) {
    const m = t.trim().match(/(\d+):(\d+):(\d+)\.(\d+)/);
    if (!m) return 0;
    const [, h, mi, s, cs] = m.map(Number);
    return h * 3600 + mi * 60 + s + cs / 100;
  }

  _secToAssTime(sec) {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = Math.floor(sec % 60);
    const cs = Math.round((sec - Math.floor(sec)) * 100);
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
  }
}

module.exports = RenderQueueService;
