class SchedulerService {
  constructor(db, streamService) { this.db = db; this.streamService = streamService; this.start(); }

  start() {
    setInterval(() => this.checkSchedules(), 60000);
    setTimeout(() => this.checkSchedules(), 5000);
  }

  async checkSchedules() {
    try {
      const { rows } = await this.db.query("SELECT * FROM schedules WHERE status = 'pending' AND scheduled_at <= NOW()");
      
      for (const schedule of rows) {
        try {
          if (this.streamService.isRunning(schedule.channel_id)) {
            await this.db.query("UPDATE schedules SET status = 'failed' WHERE id = $1", [schedule.id]);
            await this.handleRepeat(schedule);
            continue;
          }

          let finalTitle = schedule.title; let finalDesc = ''; let finalThumb = null;

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

            const fs = require('fs'); const path = require('path'); const THUMB_DIR = '/opt/thumbnails';
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
            } catch(e) {}
          }

          await this.streamService.start(schedule.channel_id, this.db, {
            durationSecs: schedule.duration_secs, title: finalTitle, description: finalDesc,
            thumbnailPath: finalThumb, folder: schedule.folder || 'Semua',
            videoPath: schedule.auto ? null : schedule.video_path,
            songPath: schedule.auto ? null : schedule.song_path,
            auto: schedule.auto
          });

          await this.db.query("UPDATE schedules SET status = 'done' WHERE id = $1", [schedule.id]);
          await this.handleRepeat(schedule);
          
        } catch (err) {
          await this.db.query("UPDATE schedules SET status = 'failed' WHERE id = $1", [schedule.id]);
          await this.handleRepeat(schedule);
        }
      }
    } catch (err) {}
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
        `INSERT INTO schedules (channel_id, scheduled_at, duration_secs, title, folder, auto, status, repeat_type, video_path, song_path) 
         VALUES ($1, $2, $3, $4, $5, $6, 'pending', $7, $8, $9)`,
        [schedule.channel_id, nextDate, schedule.duration_secs, schedule.title, schedule.folder, schedule.auto, schedule.repeat_type, schedule.video_path, schedule.song_path]
      );
    } catch (err) { }
  }
}

module.exports = SchedulerService;
