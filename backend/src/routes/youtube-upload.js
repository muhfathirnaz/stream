/**
 * POST /api/youtube-upload/jobs        — buat job upload
 * GET  /api/youtube-upload/jobs        — list jobs
 * DELETE /api/youtube-upload/jobs/:id  — hapus job
 * GET  /api/youtube-upload/video-files — list video di VPS
 */

const router = require('express').Router();
const fs = require('fs');
const path = require('path');

const VIDEO_READY_DIR = process.env.VIDEO_READY_DIR || '/opt/media/video-ready';

function listVideoFiles() {
  const results = [];
  if (!fs.existsSync(VIDEO_READY_DIR)) return results;
  const items = fs.readdirSync(VIDEO_READY_DIR);
  for (const item of items) {
    const itemPath = path.join(VIDEO_READY_DIR, item);
    if (fs.statSync(itemPath).isDirectory()) {
      const subFiles = fs.readdirSync(itemPath)
        .filter(f => /\.(mp4|mkv|mov|avi|webm)$/i.test(f))
        .map(f => {
          const fp = path.join(itemPath, f);
          const stat = fs.statSync(fp);
          return { filename: f, category: item, path: fp, size: stat.size };
        });
      results.push(...subFiles);
    } else if (/\.(mp4|mkv|mov|avi|webm)$/i.test(item)) {
      const stat = fs.statSync(itemPath);
      results.push({ filename: item, category: 'root', path: itemPath, size: stat.size });
    }
  }
  return results;
}

// GET /api/youtube-upload/video-files
router.get('/video-files', (req, res) => {
  try {
    res.json({ files: listVideoFiles() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/youtube-upload/jobs
router.get('/jobs', async (req, res) => {
  try {
    const { rows } = await req.db.query(
      'SELECT * FROM youtube_upload_jobs ORDER BY created_at DESC LIMIT 100'
    );
    res.json({ jobs: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/youtube-upload/jobs
router.post('/jobs', async (req, res) => {
  const {
    channelId,
    videoPath,
    title,
    description,
    tags,
    privacyStatus,
    scheduledAt,
    deleteAfterUpload,
  } = req.body;

  if (!channelId) return res.status(400).json({ error: 'channelId wajib diisi' });
  if (!videoPath) return res.status(400).json({ error: 'videoPath wajib diisi' });
  if (!title || !title.trim()) return res.status(400).json({ error: 'title wajib diisi' });

  try {
    const { rows } = await req.db.query(
      `INSERT INTO youtube_upload_jobs
         (channel_id, video_path, title, description, tags, privacy_status,
          scheduled_at, delete_after_upload, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'pending')
       RETURNING *`,
      [
        channelId,
        videoPath,
        title.trim(),
        description || '',
        tags || '',
        privacyStatus || 'public',
        scheduledAt ? new Date(scheduledAt) : new Date(),
        !!deleteAfterUpload,
      ]
    );
    res.json({ success: true, job: rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/youtube-upload/jobs/:id
router.delete('/jobs/:id', async (req, res) => {
  try {
    await req.db.query(
      "DELETE FROM youtube_upload_jobs WHERE id = $1 AND status = 'pending'",
      [req.params.id]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
