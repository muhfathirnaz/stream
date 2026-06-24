import psycopg2
import sys

def run_step(cursor, step_name, query):
    print(f"Memproses: {step_name}...", end=" ")
    try:
        cursor.execute(query)
        print("✅ SUKSES")
    except Exception as e:
        print(f"❌ GAGAL")
        print(f"Error detail: {e}")
        sys.exit(1)

def main():
    print("Membuka koneksi ke PostgreSQL (lofi_dashboard)...")
    try:
        # Menggunakan koneksi default (peer authentication localhost)
        # Jika postgres kamu pakai password, ubah menjadi:
        # conn = psycopg2.connect(dbname="lofi_dashboard", user="postgres", password="passwordmu", host="localhost")
        conn = psycopg2.connect(dbname="lofi_dashboard", user="postgres")
        conn.autocommit = True
        cur = conn.cursor()
    except Exception as e:
        print(f"Koneksi Gagal: {e}")
        sys.exit(1)

    print("\n--- MULAI UPDATE SCHEMA BERTAHAP ---\n")

    # 1. Channels
    run_step(cur, "Tahap 1 - Tabel channels", """
    CREATE TABLE IF NOT EXISTS channels (
      id                   SERIAL PRIMARY KEY,
      channel_id           VARCHAR(50) UNIQUE NOT NULL,
      name                 VARCHAR(100) NOT NULL,
      stream_key           TEXT,
      image_path           TEXT,
      google_refresh_token TEXT,
      youtube_channel_id   VARCHAR(100),
      created_at           TIMESTAMPTZ DEFAULT NOW()
    );
    """)

    # 1.1 Insert default channels
    run_step(cur, "Tahap 1.1 - Insert Default Channels", """
    INSERT INTO channels (channel_id, name, image_path) VALUES
      ('ch_monet',  'Lofi Jazz Monet',  '/opt/images/ch_monet.jpg'),
      ('ch_ternak', 'Lofi Jazz Ternak', '/opt/images/ch_ternak.jpg')
    ON CONFLICT DO NOTHING;
    """)

    # 2. Stream Sessions
    run_step(cur, "Tahap 2 - Tabel stream_sessions", """
    CREATE TABLE IF NOT EXISTS stream_sessions (
      id          SERIAL PRIMARY KEY,
      channel_id  VARCHAR(50) UNIQUE NOT NULL,
      status      VARCHAR(20) DEFAULT 'live',
      started_at  TIMESTAMPTZ DEFAULT NOW(),
      ended_at    TIMESTAMPTZ,
      FOREIGN KEY (channel_id) REFERENCES channels(channel_id) ON DELETE CASCADE
    );
    """)

    # 3. Songs Pool
    run_step(cur, "Tahap 3 - Tabel songs", """
    CREATE TABLE IF NOT EXISTS songs (
      id          SERIAL PRIMARY KEY,
      filename    VARCHAR(255) UNIQUE NOT NULL,
      path        TEXT NOT NULL,
      size_bytes  BIGINT,
      created_at  TIMESTAMPTZ DEFAULT NOW()
    );
    """)

    # 4. Daily Metrics
    run_step(cur, "Tahap 4 - Tabel daily_metrics", """
    CREATE TABLE IF NOT EXISTS daily_metrics (
      id                    SERIAL PRIMARY KEY,
      channel_id            VARCHAR(50),
      watch_hours           NUMERIC(10,2) DEFAULT 0,
      subscriber_gain       INTEGER DEFAULT 0,
      estimated_revenue_usd NUMERIC(10,4) DEFAULT 0,
      viewer_count          INTEGER DEFAULT 0,
      recorded_at           TIMESTAMPTZ DEFAULT NOW(),
      FOREIGN KEY (channel_id) REFERENCES channels(channel_id) ON DELETE CASCADE
    );
    """)
    
    # 4.1 Index Daily Metrics
    run_step(cur, "Tahap 4.1 - Index daily_metrics", """
    CREATE INDEX IF NOT EXISTS idx_metrics_channel_date
      ON daily_metrics (channel_id, recorded_at DESC);
    """)

    # 5. Broadcast Assets
    run_step(cur, "Tahap 5 - Tabel broadcast_assets", """
    CREATE TABLE IF NOT EXISTS broadcast_assets (
      id          SERIAL PRIMARY KEY,
      type        VARCHAR(20) NOT NULL,
      value       TEXT NOT NULL,
      label       TEXT,
      category    VARCHAR(100) DEFAULT 'Uncategorized',
      created_at  TIMESTAMPTZ DEFAULT NOW()
    );
    """)

    # 6. Schedules
    run_step(cur, "Tahap 6 - Tabel schedules", """
    CREATE TABLE IF NOT EXISTS schedules (
      id            SERIAL PRIMARY KEY,
      channel_id    VARCHAR(50) NOT NULL,
      scheduled_at  TIMESTAMPTZ NOT NULL,
      duration_secs INTEGER NOT NULL DEFAULT 14400,
      title         TEXT,
      status        VARCHAR(20) DEFAULT 'pending',
      folder        VARCHAR(255) DEFAULT 'Semua',
      auto          BOOLEAN DEFAULT false,
      repeat_type   VARCHAR(20) DEFAULT 'none',
      video_path    TEXT,
      song_path     TEXT,
      options       JSONB DEFAULT '{}'::jsonb,
      created_at    TIMESTAMPTZ DEFAULT NOW(),
      CONSTRAINT fk_channel FOREIGN KEY (channel_id) REFERENCES channels(channel_id) ON DELETE CASCADE
    );
    """)

    # 7. System Logs
    run_step(cur, "Tahap 7 - Tabel system_logs", """
    CREATE TABLE IF NOT EXISTS system_logs (
      id          SERIAL PRIMARY KEY,
      channel_id  VARCHAR(50),
      message     TEXT NOT NULL,
      created_at  TIMESTAMPTZ DEFAULT NOW()
    );
    """)

    print("\n🎉 MANTAP! Semua schema database berhasil diperbarui.")
    cur.close()
    conn.close()

if __name__ == "__main__":
    main()
