const fs = require('fs');
const path = require('path');

class SchedulerService {
  constructor(db, streamService, wsService) {
    this.db = db;
    this.streamService = streamService;
    this.wsService = wsService;
    this._processing = false;
    this._timer = null;
    this.start();
  }

  start() {
    if (this._timer) return;
    this._timer = setInterval(() => this.checkSchedules(), 60000);
    setTimeout(() => this.checkSchedules(), 5000);
  }

  pickRandomVideoReady(folder) {
    try {
      const VIDEO_READY_DIR = '/opt/media/video-ready';
      if (!fs.existsSync(VIDEO_READY_DIR)) return null;
      let allFiles = []; let priorityFiles = [];
      const selectedFolders = folder && folder !== 'Semua' ? folder.split(',').map(f => f.trim()).filter(Boolean) : [];
      const items = fs.readdirSync(VIDEO_READY_DIR);
      for (const item of items) {
        const itemPath = path.join(VIDEO_READY_DIR, item);
        if (fs.statSync(itemPath).isDirectory()) {
          const subFiles = fs.readdirSync(itemPath).filter(f => /\.(mp4|mkv|mov|avi|webm)$/i.test(f)).map(f => path.join(itemPath, f));
          allFiles.push(...subFiles);
          if (selectedFolders.includes(item)) priorityFiles.push(...subFiles);
        } else if (/\.(mp4|mkv|mov|avi|webm)$/i.test(item)) {
          allFiles.push(itemPath);
        }
      }
      const pool = selectedFolders.length > 0 ? (priorityFiles.length > 0 ? priorityFiles : allFiles) : allFiles;
      if (pool.length === 0) return null;
      return pool[Math.floor(Math.random() * pool.length)];
    } catch (e) { return null; }
  }

  async checkSchedules() {
    if (this._processing) {
      console.log('[Scheduler] Masih processing, skip...');
      return;
    }
    this._processing = true;

    try {
      const { rows } = await this.db.query(
        "SELECT * FROM schedules WHERE status = 'pending' AND scheduled_at <= NOW()"
      );

      for (const schedule of rows) {
        try {
          // Lock row dulu biar nggak double-fire
          const { rows: fresh } = await this.db.query(
            "SELECT status FROM schedules WHERE id = $1 FOR UPDATE SKIP LOCKED",
            [schedule.id]
          );
          if (!fresh.length || fresh[0].status !== 'pending') {
            console.log(`[Scheduler] Schedule ${schedule.id} sudah diproses, skip.`);
            continue;
          }

          // Mark 'running' sebelum eksekusi apapun
          await this.db.query(
            "UPDATE schedules SET status = 'running' WHERE id = $1",
            [schedule.id]
          );

          if (this.streamService.isRunning(schedule.channel_id)) {
            console.log(`[Scheduler] Channel ${schedule.channel_id} sudah live, skip jadwal ${schedule.id}`);
            await this.db.query("UPDATE schedules SET status = 'failed' WHERE id = $1", [schedule.id]);
            await this.handleRepeat(schedule);
            continue;
          }

          let finalTitle = schedule.title;
          let finalDesc = '';
          let finalThumb = schedule.auto ? null : (schedule.thumbnail_path || null);
          let finalVideoReadyPath = schedule.auto ? null : (schedule.video_ready_path || null);

          if (schedule.auto) {
            const used = this.streamService.getUsedAssets();

            const tRes = await this.db.query("SELECT value FROM broadcast_assets WHERE type = 'title'");
            const availTitles = tRes.rows.filter(r => !used.titles.includes(r.value));
            const poolTitles = availTitles.length > 0 ? availTitles : tRes.rows;
            if (poolTitles.length > 0) finalTitle = poolTitles[Math.floor(Math.random() * poolTitles.length)].value;

            const dRes = await this.db.query("SELECT value FROM broadcast_assets WHERE type = 'description'");
            const availDescs = dRes.rows.filter(r => !used.descs.includes(r.value));
            const poolDescs = availDescs.length > 0 ? availDescs : dRes.rows;
            if (poolDescs.length > 0) finalDesc = poolDescs[Math.floor(Math.random() * poolDescs.length)].value;

            const THUMB_DIR = '/opt/thumbnails';
            try {
              if (fs.existsSync(THUMB_DIR)) {
                let allFiles = []; let priorityFiles = [];
                const items = fs.readdirSync(THUMB_DIR);
                for (const item of items) {
                  const itemPath = path.join(THUMB_DIR, item);
                  if (fs.statSync(itemPath).isDirectory()) {
                    const subFiles = fs.readdirSync(itemPath).filter(f => f.match(/\.(jpg|jpeg|png|webp)$/i)).map(f => path.join(itemPath, f));
                    allFiles.push(...subFiles);
                    if (schedule.folder && item === schedule.folder) priorityFiles.push(...subFiles);
                  } else if (item.match(/\.(jpg|jpeg|png|webp)$/i)) { allFiles.push(itemPath); }
                }
                const availPrio = priorityFiles.filter(f => !used.thumbs.includes(f));
                const poolPrio = availPrio.length > 0 ? availPrio : priorityFiles;
                const availAll = allFiles.filter(f => !used.thumbs.includes(f));
                const poolAll = availAll.length > 0 ? availAll : allFiles;
                const pool = priorityFiles.length > 0 ? poolPrio : poolAll;
                if (pool.length > 0) finalThumb = pool[Math.floor(Math.random() * pool.length)];
              }
            } catch (e) {}

            if (schedule.mode === 'copy') {
              finalVideoReadyPath = this.pickRandomVideoReady(schedule.folder);
            }
          }

          await this.streamService.start(schedule.channel_id, this.db, {
            durationSecs: schedule.duration_secs,
            title: finalTitle,
            description: finalDesc,
            thumbnailPath: finalThumb,
            folder: schedule.folder || 'Semua',
            videoPath: schedule.auto ? null : schedule.video_path,
            songPath: schedule.auto ? null : schedule.song_path,
            videoReadyPath: finalVideoReadyPath,
            auto: schedule.auto
          });

          await this.db.query("UPDATE schedules SET status = 'done' WHERE id = $1", [schedule.id]);
          console.log(`[Scheduler] Schedule ${schedule.id} berhasil dijalankan.`);
          await this.handleRepeat(schedule);

        } catch (err) {
          console.error(`[Scheduler] Error schedule ${schedule.id}:`, err.message);
          await this.db.query("UPDATE schedules SET status = 'failed' WHERE id = $1", [schedule.id]);
          await this.handleRepeat(schedule);
        }
      }
    } catch (err) {
      console.error('[Scheduler] DB error:', err.message);
    } finally {
      this._processing = false;
    }
  }

  async handleRepeat(schedule) {
    if (!schedule.repeat_type || schedule.repeat_type === 'none') return;
    let nextDate = new Date(schedule.scheduled_at);
    if (schedule.repeat_type === 'daily') nextDate.setDate(nextDate.getDate() + 1);
    else if (schedule.repeat_type === 'weekly') nextDate.setDate(nextDate.getDate() + 7);
    else if (schedule.repeat_type === 'monthly') nextDate.setMonth(nextDate.getMonth() + 1);

    while (nextDate <= new Date()) {
      if (schedule.repeat_type === 'daily') nextDate.setDate(nextDate.getDate() + 1);
      else if (schedule.repeat_type === 'weekly') nextDate.setDate(nextDate.getDate() + 7);
      else if (schedule.repeat_type === 'monthly') nextDate.setMonth(nextDate.getMonth() + 1);
    }

    try {
      await this.db.query(
        `INSERT INTO schedules (channel_id, scheduled_at, duration_secs, title, folder, auto, status, repeat_type, video_path, song_path, video_ready_path, thumbnail_path, mode)
         VALUES ($1, $2, $3, $4, $5, $6, 'pending', $7, $8, $9, $10, $11, $12)`,
        [schedule.channel_id, nextDate, schedule.duration_secs, schedule.title, schedule.folder, schedule.auto, schedule.repeat_type, schedule.video_path, schedule.song_path, schedule.video_ready_path, schedule.thumbnail_path, schedule.mode]
      );
      console.log(`[Scheduler] Repeat schedule dibuat untuk ${schedule.channel_id} at ${nextDate}`);
    } catch (err) {
      console.error('[Scheduler] Gagal buat repeat:', err.message);
    }
  }
}

module.exports = SchedulerService;
