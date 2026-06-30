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
    console.log('Membuat tabel lyrics...');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS lyrics (
        id            SERIAL PRIMARY KEY,
        song_path     TEXT UNIQUE NOT NULL,
        song_filename TEXT NOT NULL,
        ass_path      TEXT,
        words_json    JSONB,
        source        VARCHAR(20) DEFAULT 'auto',
        status        VARCHAR(20) DEFAULT 'pending',
        error_message TEXT,
        created_at    TIMESTAMPTZ DEFAULT NOW(),
        updated_at    TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    console.log('Membuat tabel render_jobs...');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS render_jobs (
        id              SERIAL PRIMARY KEY,
        output_name     TEXT NOT NULL,
        output_category VARCHAR(100) DEFAULT 'Uncategorized',
        video_path      TEXT NOT NULL,
        status          VARCHAR(20) DEFAULT 'queued',
        progress        INTEGER DEFAULT 0,
        stage           VARCHAR(50) DEFAULT 'queued',
        config          JSONB NOT NULL,
        output_path     TEXT,
        error_message   TEXT,
        created_at      TIMESTAMPTZ DEFAULT NOW(),
        started_at      TIMESTAMPTZ,
        finished_at     TIMESTAMPTZ
      );
    `);

    console.log('✅ Migration sukses!');
  } catch (e) {
    console.error('❌ Gagal:', e.message);
    process.exit(1);
  } finally {
    pool.end();
  }
}
run();
