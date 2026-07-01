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
    await pool.query(`ALTER TABLE youtube_upload_jobs ADD COLUMN IF NOT EXISTS thumbnail_path TEXT;`);
    console.log('✅ Kolom thumbnail_path ditambahkan ke youtube_upload_jobs');
  } catch (e) {
    console.error('❌ Gagal:', e.message);
    process.exit(1);
  } finally { pool.end(); }
}
run();
