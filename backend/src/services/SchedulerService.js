const fs = require('fs');
const path = require('path');
const assetBooking = require('./AssetBookingService');

class SchedulerService {
  constructor(db, streamService, wsService) {
    this.db = db;
    this.streamService = streamService;
    this.wsService = wsService;
    this._runningScheduleIds = new Set();
    this._timer = null;
    this.start();
  }

  start() {
    if (this._timer) return;
    this._timer = setInterval(() => this.checkSchedules(), 60000);
    setTimeout(() => this.checkSchedules(), 5000);
  }

  pickRandomVideoReady(folder, excludeVideos = []) {
    try {
      const VIDEO_READY_DIR = '/opt/media/video-ready';
      if (!fs.existsSync(VIDEO_READY_DIR)) return null;
      let allFiles = []; let priorityFiles = [];
      const selectedFolders = folder && folder !== 'Semua'
        ? folder.split(',').map(f => f.trim()).filter(Boolean)
        : [];
      const items = fs.readdirSync(VIDEO_READY_DIR);
      for (const item of items) {
        const itemPath = path.join(VIDEO_READY_DIR, item);
        if (fs.statSync(itemPath).isDirectory()) {
          const subFiles = fs.readdirSync(itemPath)
            .filter(f => /\.(mp4|mkv|mov|avi|webm)$/i.test(f))
            .map(f => path.join(itemPath, f));
          allFiles.push(...subFiles);
          if (selectedFolders.includes(item)) priorityFiles.push(...subFiles);
        } else if (/\.(mp4|mkv|mov|avi|webm)$/i.test(item)) {
          allFiles.push(itemPath);
        }
      }
      const pool = selectedFolders.length > 0
        ? (priorityFiles.length > 0 ? priorityFiles : allFiles)
        : allFiles;

      const available = pool.filter(f => !excludeVideos.includes(f));
      if (available.length > 0) return available[Math.floor(Math.random() * available.length)];

      console.log('[Scheduler] Semua video sudah terpakai, fallback ke pool penuh');
      return pool.length > 0 ? pool[Math.floor(Math.random() * pool.length)] : null;
    } catch (e) {
      console.error('[Scheduler] pickRandomVideoReady error:', e.message);
      return null;
    }
  }

  async checkSchedules() {
    try {
      const { rows } = await this.db.query(
        "SELECT * FROM schedules WHERE status = 'pending' AND scheduled_at <= NOW()"
      );
      if (rows.length > 0) {
        console.log(`[Scheduler] Ditemukan ${rows.length} jadwal pending`);
      }
      await Promise.all(rows.map(schedule => this._processSchedule(schedule)));
    } catch (err) {
      console.error('[Scheduler] DB error:', err.message);
    }
  }

  async _processSchedule(schedule) {
    if (this._runningScheduleIds.has(schedule.id)) {
      console.log(`[Scheduler] Schedule ${schedule.id} sedang diproses, skip.`);
      return;
    }
    this._runningScheduleIds.add(schedule.id);

    try {
      const { rows: fresh } = await this.db.query(
        "SELECT status FROM schedules WHERE id = $1 FOR UPDATE SKIP LOCKED",
        [schedule.id]
      );
      if (!fresh.length || fresh[0].status !== 'pending') {
        console.log(`[Scheduler] Schedule ${schedule.id} bukan pending lagi, skip.`);
        return;
      }

      await this.db.query(
        "UPDATE schedules SET status = 'running' WHERE id = $1",
        [schedule.id]
      );

      if (this.streamService.isRunning(schedule.channel_id)) {
        console.log(`[Scheduler] Channel ${schedule.channel_id} sudah live, skip jadwal ${schedule.id}`);
        await this.db.query("UPDATE schedules SET status = 'failed' WHERE id = $1", [schedule.id]);
        await this.handleRepeat(schedule);
        return;
      }

      // ─── BACA DARI JSONB OPTIONS ───
      const options = schedule.options || {};
      let finalTitle          = schedule.title;
      let finalDesc           = '';
      let finalThumb          = schedule.auto ? null : (options.thumbnailPath || null);
      let finalVideoReadyPath = schedule.auto ? null : (options.videoReadyPath || null);
      let finalMode           = options.mode || 'encode';

      if (schedule.auto) {
        const usedByStreams = this.streamService.getUsedAssets();
        const booked        = assetBooking.getBookedAssets();

        const usedTitles = [...usedByStreams.titles, ...booked.titles];
        const usedDescs  = [...usedByStreams.descs,  ...booked.descs];
        const usedThumbs = [...usedByStreams.thumbs, ...booked.thumbs];
        const usedVideos = [...(usedByStreams.videos || []), ...booked.videos];

        const tRes = await this.db.query("SELECT value FROM broadcast_assets WHERE type = 'title'");
        const availTitles = tRes.rows.filter(r => !usedTitles.includes(r.value));
        const poolTitles  = availTitles.length > 0 ? availTitles : tRes.rows;
        if (poolTitles.length > 0) finalTitle = poolTitles[Math.floor(Math.random() * poolTitles.length)].value;

        const dRes = await this.db.query("SELECT value FROM broadcast_assets WHERE type = 'description'");
        const availDescs = dRes.rows.filter(r => !usedDescs.includes(r.value));
        const poolDescs  = availDescs.length > 0 ? availDescs : dRes.rows;
        if (poolDescs.length > 0) finalDesc = poolDescs[Math.floor(Math.random() * poolDescs.length)].value;

        const THUMB_DIR = '/opt/thumbnails';
        try {
          if (fs.existsSync(THUMB_DIR)) {
            let allFiles = []; let priorityFiles = [];
            const items = fs.readdirSync(THUMB_DIR);
            for (const item of items) {
              const itemPath = path.join(THUMB_DIR, item);
              if (fs.statSync(itemPath).isDirectory()) {
                const subFiles = fs.readdirSync(itemPath).filter(f => /\.(jpg|jpeg|png|webp)$/i.test(f)).map(f => path.join(itemPath, f));
                allFiles.push(...subFiles);
                if (schedule.folder && item === schedule.folder) priorityFiles.push(...subFiles);
              } else if (/\.(jpg|jpeg|png|webp)$/i.test(item)) {
                allFiles.push(itemPath);
              }
            }
            const availPrio = priorityFiles.filter(f => !usedThumbs.includes(f));
            const poolPrio  = availPrio.length > 0 ? availPrio : priorityFiles;
            const availAll  = allFiles.filter(f => !usedThumbs.includes(f));
            const poolAll   = availAll.length > 0 ? availAll : allFiles;
            const pool      = priorityFiles.length > 0 ? poolPrio : poolAll;
            if (pool.length > 0) finalThumb = pool[Math.floor(Math.random() * pool.length)];
          }
        } catch (e) {
          console.error('[Scheduler] Thumbnail pick error:', e.message);
        }

        if (finalMode === 'copy') {
          finalVideoReadyPath = this.pickRandomVideoReady(schedule.folder, usedVideos);
          if (!finalVideoReadyPath) {
            console.error(`[Scheduler] Tidak ada video jadi untuk schedule ${schedule.id}`);
            await this.db.query("UPDATE schedules SET status = 'failed' WHERE id = $1", [schedule.id]);
            await this.handleRepeat(schedule);
            return;
          }
        }
      }

      assetBooking.book(schedule.id, {
        title: finalTitle,
        desc:  finalDesc,
        thumb: finalThumb,
        video: finalVideoReadyPath,
      });

      try {
        await this.streamService.start(schedule.channel_id, this.db, {
          durationSecs:    schedule.duration_secs,
          title:           finalTitle,
          description:     finalDesc,
          thumbnailPath:   finalThumb,
          folder:          schedule.folder || 'Semua',
          videoPath:       schedule.auto ? null : schedule.video_path,
          songPath:        schedule.auto ? null : schedule.song_path,
          videoReadyPath:  finalVideoReadyPath,
          auto:            schedule.auto,
          mode:            finalMode,
        });

        await this.db.query("UPDATE schedules SET status = 'done' WHERE id = $1", [schedule.id]);
        console.log(`[Scheduler] ✓ Schedule ${schedule.id} channel ${schedule.channel_id} berhasil.`);
        await this.handleRepeat(schedule);

      } finally {
        assetBooking.release(schedule.id);
      }

    } catch (err) {
      console.error(`[Scheduler] Error schedule ${schedule.id}:`, err.message);
      assetBooking.release(schedule.id);
      await this.db.query("UPDATE schedules SET status = 'failed' WHERE id = $1", [schedule.id]).catch(() => {});
      await this.handleRepeat(schedule);
    } finally {
      this._runningScheduleIds.delete(schedule.id);
    }
  }

  async handleRepeat(schedule) {
    if (!schedule.repeat_type || schedule.repeat_type === 'none') return;
    let nextDate = new Date(schedule.scheduled_at);
    if (schedule.repeat_type === 'daily')   nextDate.setDate(nextDate.getDate() + 1);
    else if (schedule.repeat_type === 'weekly')  nextDate.setDate(nextDate.getDate() + 7);
    else if (schedule.repeat_type === 'monthly') nextDate.setMonth(nextDate.getMonth() + 1);

    while (nextDate <= new Date()) {
      if (schedule.repeat_type === 'daily')   nextDate.setDate(nextDate.getDate() + 1);
      else if (schedule.repeat_type === 'weekly')  nextDate.setDate(nextDate.getDate() + 7);
      else if (schedule.repeat_type === 'monthly') nextDate.setMonth(nextDate.getMonth() + 1);
    }

    try {
      // ─── INSERT MENGGUNAKAN KOLOM OPTIONS BUKAN KOLOM LAMA ───
      await this.db.query(
        `INSERT INTO schedules
           (channel_id, scheduled_at, duration_secs, title, folder, auto, status,
            repeat_type, video_path, song_path, options)
         VALUES ($1,$2,$3,$4,$5,$6,'pending',$7,$8,$9,$10)`,
        [
          schedule.channel_id, nextDate, schedule.duration_secs, schedule.title,
          schedule.folder, schedule.auto, schedule.repeat_type,
          schedule.video_path, schedule.song_path, schedule.options || '{}'
        ]
      );
      console.log(`[Scheduler] Repeat dibuat untuk ${schedule.channel_id} at ${nextDate}`);
    } catch (err) {
      console.error('[Scheduler] Gagal buat repeat:', err.message);
    }
  }
}

module.exports = SchedulerService;
