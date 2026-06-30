require('dotenv').config({ path: __dirname + '/.env' });
const { Pool } = require('pg');
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'lofi_dashboard',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASS,
});
async function run() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS youtube_upload_jobs (
        id                  SERIAL PRIMARY KEY,
        channel_id          VARCHAR(50) NOT NULL,
        video_path          TEXT NOT NULL,
        title               TEXT NOT NULL,
        description         TEXT DEFAULT '',
        tags                TEXT DEFAULT '',
        privacy_status      VARCHAR(20) DEFAULT 'public',
        scheduled_at        TIMESTAMPTZ DEFAULT NOW(),
        delete_after_upload BOOLEAN DEFAULT false,
        vps_file_deleted    BOOLEAN DEFAULT false,
        status              VARCHAR(20) DEFAULT 'pending',
        youtube_video_id    VARCHAR(50),
        youtube_url         TEXT,
        error_message       TEXT,
        started_at          TIMESTAMPTZ,
        finished_at         TIMESTAMPTZ,
        created_at          TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    console.log('✅ Tabel youtube_upload_jobs berhasil dibuat!');
  } catch (e) {
    console.error('❌ Gagal:', e.message);
    process.exit(1);
  } finally {
    pool.end();
  }
}
run();
