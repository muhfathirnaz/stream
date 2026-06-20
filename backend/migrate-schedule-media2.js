require('dotenv').config();
const { Pool } = require('pg');

const pool = process.env.DATABASE_URL
  ? new Pool({ connectionString: process.env.DATABASE_URL })
  : new Pool({
      user: process.env.DB_USER || process.env.PGUSER || 'postgres',
      password: process.env.DB_PASSWORD || process.env.PGPASSWORD || 'Ekqbkuhkn122',
      host: process.env.DB_HOST || process.env.PGHOST || 'localhost',
      port: process.env.DB_PORT || process.env.PGPORT || 5432,
      database: process.env.DB_NAME || process.env.PGDATABASE || process.env.DB_DATABASE || 'lofi_dashboard'
    });

async function run() {
  try {
    console.log("Menambahkan kolom video_ready_path, thumbnail_path, mode...");
    await pool.query("ALTER TABLE schedules ADD COLUMN IF NOT EXISTS video_ready_path TEXT;");
    await pool.query("ALTER TABLE schedules ADD COLUMN IF NOT EXISTS thumbnail_path TEXT;");
    await pool.query("ALTER TABLE schedules ADD COLUMN IF NOT EXISTS mode VARCHAR(20) DEFAULT 'encode';");
    console.log("Migration berhasil! ✅");
  } catch (e) {
    console.error("Gagal:", e.message);
  } finally {
    pool.end();
  }
}
run();
