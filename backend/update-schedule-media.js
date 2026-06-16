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
    await pool.query("ALTER TABLE schedules ADD COLUMN IF NOT EXISTS video_path TEXT;");
    await pool.query("ALTER TABLE schedules ADD COLUMN IF NOT EXISTS song_path TEXT;");
    console.log("Kolom video_path dan song_path berhasil ditambah ke tabel schedules! ✅");
  } catch(e) { console.error("Gagal:", e.message); } finally { pool.end(); }
}
run();
