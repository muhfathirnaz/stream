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
    await pool.query(`ALTER TABLE render_jobs ADD COLUMN IF NOT EXISTS detail TEXT;`);
    console.log('✅ Kolom detail ditambahkan ke render_jobs');
  } catch (e) {
    console.error('❌ Gagal:', e.message);
    process.exit(1);
  } finally { pool.end(); }
}
run();
