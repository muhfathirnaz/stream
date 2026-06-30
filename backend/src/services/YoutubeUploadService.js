/**
 * YoutubeUploadService
 * Upload video reguler ke YouTube (bukan live), dengan support schedule.
 */

const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');

class YoutubeUploadService {
  constructor(db, wsService) {
    this.db = db;
    this.wsService = wsService;
    this._timer = null;
    this._runningIds = new Set();
    this.start();
  }

  start() {
    if (this._timer) return;
    // Cek tiap menit
    this._timer = setInterval(() => this.checkJobs(), 60000);
    setTimeout(() => this.checkJobs(), 8000);
  }

  async checkJobs() {
    try {
      const { rows } = await this.db.query(
        `SELECT * FROM youtube_upload_jobs
         WHERE status = 'pending' AND scheduled_at <= NOW()
         ORDER BY scheduled_at ASC`
      );
      for (const job of rows) {
        if (!this._runningIds.has(job.id)) {
          this._runJob(job).catch(err =>
            console.error(`[YTUpload] Job ${job.id} error:`, err.message)
          );
        }
      }
    } catch (err) {
      console.error('[YTUpload] checkJobs error:', err.message);
    }
  }

  async _runJob(job) {
    this._runningIds.add(job.id);
    try {
      // Mark running
      await this.db.query(
        "UPDATE youtube_upload_jobs SET status = 'uploading', started_at = NOW() WHERE id = $1",
        [job.id]
      );
      this.wsService?.broadcast('ytupload:progress', {
        jobId: job.id, status: 'uploading', progress: 0
      });

      // Ambil refresh_token dari channel
      const { rows: chRows } = await this.db.query(
        'SELECT google_refresh_token FROM channels WHERE channel_id = $1',
        [job.channel_id]
      );
      const refreshToken = chRows[0]?.google_refresh_token;
      if (!refreshToken) throw new Error('Channel tidak punya Google Refresh Token');

      if (!fs.existsSync(job.video_path)) {
        throw new Error(`File tidak ditemukan: ${job.video_path}`);
      }

      // Setup OAuth
      const credPath = path.resolve(__dirname, '../../credentials.json');
      let clientId = process.env.GOOGLE_CLIENT_ID;
      let clientSecret = process.env.GOOGLE_CLIENT_SECRET;
      let redirectUri = 'https://aksarastream.ddns.net/auth/google/callback';

      if (fs.existsSync(credPath)) {
        try {
          const creds = JSON.parse(fs.readFileSync(credPath));
          const key = creds.installed ? 'installed' : 'web';
          clientId = creds[key].client_id;
          clientSecret = creds[key].client_secret;
          if (creds[key].redirect_uris?.[0]) redirectUri = creds[key].redirect_uris[0];
        } catch (e) {}
      }

      const oauth2 = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
      oauth2.setCredentials({ refresh_token: refreshToken });
      const youtube = google.youtube({ version: 'v3', auth: oauth2 });

      const stat = fs.statSync(job.video_path);
      const totalBytes = stat.size;
      let uploadedBytes = 0;

      // Parse tags
      const tagsArr = job.tags
        ? job.tags.split(',').map((t) => t.trim()).filter(Boolean)
        : [];

      console.log(`[YTUpload] Mulai upload: ${job.title} (${(totalBytes / 1024 / 1024).toFixed(1)} MB)`);

      const response = await youtube.videos.insert(
        {
          part: 'snippet,status',
          requestBody: {
            snippet: {
              title: job.title,
              description: job.description || '',
              tags: tagsArr,
              categoryId: '10', // Music
            },
            status: {
              privacyStatus: job.privacy_status || 'public',
              selfDeclaredMadeForKids: false,
            },
          },
          media: {
            body: fs.createReadStream(job.video_path).on('data', (chunk) => {
              uploadedBytes += chunk.length;
              const pct = Math.round((uploadedBytes / totalBytes) * 100);
              this.wsService?.broadcast('ytupload:progress', {
                jobId: job.id, status: 'uploading', progress: pct
              });
            }),
          },
        },
        {
          onUploadProgress: (evt) => {
            const pct = Math.round((evt.bytesRead / totalBytes) * 100);
            this.wsService?.broadcast('ytupload:progress', {
              jobId: job.id, status: 'uploading', progress: pct
            });
          },
        }
      );

      const videoId = response.data.id;
      const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
      console.log(`[YTUpload] ✅ Upload selesai: ${videoUrl}`);

      // Mark done
      await this.db.query(
        `UPDATE youtube_upload_jobs
         SET status = 'done', finished_at = NOW(),
             youtube_video_id = $1, youtube_url = $2
         WHERE id = $3`,
        [videoId, videoUrl, job.id]
      );

      this.wsService?.broadcast('ytupload:progress', {
        jobId: job.id, status: 'done', progress: 100, videoUrl
      });

      // Hapus file VPS jika diminta
      if (job.delete_after_upload && fs.existsSync(job.video_path)) {
        fs.unlinkSync(job.video_path);
        console.log(`[YTUpload] 🗑 File dihapus: ${job.video_path}`);
        await this.db.query(
          "UPDATE youtube_upload_jobs SET vps_file_deleted = true WHERE id = $1",
          [job.id]
        );
      }

    } catch (err) {
      console.error(`[YTUpload] Job ${job.id} gagal:`, err.message);
      await this.db.query(
        "UPDATE youtube_upload_jobs SET status = 'failed', error_message = $1 WHERE id = $2",
        [err.message, job.id]
      );
      this.wsService?.broadcast('ytupload:progress', {
        jobId: job.id, status: 'failed', error: err.message
      });
    } finally {
      this._runningIds.delete(job.id);
    }
  }
}

module.exports = YoutubeUploadService;
