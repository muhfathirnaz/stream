-- Schema: lofi_dashboard
-- Run: psql -U postgres -d lofi_dashboard -f schema.sql

-- 1. Channels
CREATE TABLE IF NOT EXISTS channels (
  id                   SERIAL PRIMARY KEY,
  channel_id           VARCHAR(50) UNIQUE NOT NULL,  -- e.g. 'ch_monet'
  name                 VARCHAR(100) NOT NULL,
  stream_key           TEXT,
  image_path           TEXT,
  google_refresh_token TEXT,
  youtube_channel_id   VARCHAR(100),
  created_at           TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO channels (channel_id, name, image_path) VALUES
  ('ch_monet',  'Lofi Jazz Monet',  '/opt/images/ch_monet.jpg'),
  ('ch_ternak', 'Lofi Jazz Ternak', '/opt/images/ch_ternak.jpg')
ON CONFLICT DO NOTHING;

-- 2. Stream Sessions
CREATE TABLE IF NOT EXISTS stream_sessions (
  id          SERIAL PRIMARY KEY,
  channel_id  VARCHAR(50) UNIQUE NOT NULL,
  status      VARCHAR(20) DEFAULT 'live',  -- live | stopped
  started_at  TIMESTAMPTZ DEFAULT NOW(),
  ended_at    TIMESTAMPTZ,
  FOREIGN KEY (channel_id) REFERENCES channels(channel_id) ON DELETE CASCADE
);

-- 3. Songs Pool
CREATE TABLE IF NOT EXISTS songs (
  id          SERIAL PRIMARY KEY,
  filename    VARCHAR(255) UNIQUE NOT NULL,
  path        TEXT NOT NULL,
  size_bytes  BIGINT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Daily Metrics
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

CREATE INDEX IF NOT EXISTS idx_metrics_channel_date
  ON daily_metrics (channel_id, recorded_at DESC);

-- 5. Broadcast Assets
CREATE TABLE IF NOT EXISTS broadcast_assets (
  id          SERIAL PRIMARY KEY,
  type        VARCHAR(20) NOT NULL,
  value       TEXT NOT NULL,
  label       TEXT,
  category    VARCHAR(100) DEFAULT 'Uncategorized',
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- 6. Schedules
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

-- 7. System Logs
CREATE TABLE IF NOT EXISTS system_logs (
  id          SERIAL PRIMARY KEY,
  channel_id  VARCHAR(50),
  message     TEXT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
