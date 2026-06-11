class SchedulerService {
  constructor(db, streamService, wsService) {
    this.db = db;
    this.streamService = streamService;
    this.wsService = wsService;
    this.timer = null;
  }

  start() {
    console.log('[Scheduler] Started — checking every 30 seconds');
    this.timer = setInterval(() => this._tick(), 30000);
    this._tick();
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
  }

  async _tick() {
    try {
      const { rows } = await this.db.query(`
        SELECT * FROM stream_schedules
        WHERE status = 'pending'
          AND scheduled_at <= NOW() + INTERVAL '30 seconds'
          AND scheduled_at > NOW() - INTERVAL '5 minutes'
        ORDER BY scheduled_at ASC
      `);

      for (const schedule of rows) {
        await this._runSchedule(schedule);
      }
    } catch (err) {
      console.error('[Scheduler] tick error:', err.message);
    }
  }

  async _runSchedule(schedule) {
    console.log(`[Scheduler] Running schedule #${schedule.id} for ${schedule.channel_id}`);

    // Mark sebagai running dulu supaya tidak double-trigger
    await this.db.query(
      `UPDATE stream_schedules SET status = 'running' WHERE id = $1 AND status = 'pending'`,
      [schedule.id]
    );

    try {
      await this.streamService.start(schedule.channel_id, this.db, {
        durationSecs: schedule.duration_secs,
        title: schedule.title,
      });

      await this.db.query(
        `UPDATE stream_schedules SET status = 'done' WHERE id = $1`,
        [schedule.id]
      );

      await this.db.query(
        `INSERT INTO stream_sessions (channel_id, started_at, status)
         VALUES ($1, NOW(), 'live')
         ON CONFLICT (channel_id) DO UPDATE SET started_at = NOW(), status = 'live'`,
        [schedule.channel_id]
      );

      this.wsService.broadcast('schedule:fired', {
        scheduleId: schedule.id,
        channelId: schedule.channel_id,
        ts: new Date().toISOString(),
      });

      console.log(`[Scheduler] Schedule #${schedule.id} fired successfully`);
    } catch (err) {
      console.error(`[Scheduler] Schedule #${schedule.id} failed:`, err.message);
      await this.db.query(
        `UPDATE stream_schedules SET status = 'failed' WHERE id = $1`,
        [schedule.id]
      );
      this.wsService.broadcast('schedule:failed', {
        scheduleId: schedule.id,
        channelId: schedule.channel_id,
        error: err.message,
        ts: new Date().toISOString(),
      });
    }
  }
}

module.exports = SchedulerService;
