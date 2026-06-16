require('dotenv').config();
const { Pool } = require('pg');

// Pastikan konek ke lofi_dashboard
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
    console.log("Membuat tabel schedules (jika belum ada)...");
    await pool.query(`
      CREATE TABLE IF NOT EXISTS schedules (
        id SERIAL PRIMARY KEY,
        channel_id VARCHAR(50) NOT NULL,
        scheduled_at TIMESTAMPTZ NOT NULL,
        duration_secs INTEGER NOT NULL DEFAULT 14400,
        title TEXT,
        status VARCHAR(20) DEFAULT 'pending',
        folder VARCHAR(255) DEFAULT 'Semua',
        auto BOOLEAN DEFAULT false,
        repeat_type VARCHAR(20) DEFAULT 'none',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        CONSTRAINT fk_channel FOREIGN KEY (channel_id) REFERENCES channels(channel_id) ON DELETE CASCADE
      );
    `);

    console.log("Menambahkan kolom (berjaga-jaga jika tabel versi lama sudah ada)...");
    await pool.query("ALTER TABLE schedules ADD COLUMN IF NOT EXISTS folder VARCHAR(255);");
    await pool.query("ALTER TABLE schedules ADD COLUMN IF NOT EXISTS auto BOOLEAN DEFAULT false;");
    await pool.query("ALTER TABLE schedules ADD COLUMN IF NOT EXISTS repeat_type VARCHAR(20) DEFAULT 'none';");
    
    console.log("Database Migration Berhasil! ✅");
  } catch(e) {
    console.error("Gagal:", e.message);
  } finally {
    pool.end();
  }
}
run();
