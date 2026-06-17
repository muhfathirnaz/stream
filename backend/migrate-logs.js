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
    await pool.query(`
      CREATE TABLE IF NOT EXISTS system_logs (
        id SERIAL PRIMARY KEY,
        channel_id VARCHAR(50),
        message TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    console.log("Tabel system_logs berhasil dibuat! ✅");
  } catch(e) { console.error("Gagal:", e.message); } finally { pool.end(); }
}
run();
