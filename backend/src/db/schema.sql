-- Schema: lofi_dashboard
-- Run: psql -U postgres -d lofi_dashboard -f schema.sql

-- Channels
CREATE TABLE IF NOT EXISTS channels (
  id          SERIAL PRIMARY KEY,
  channel_id  VARCHAR(50) UNIQUE NOT NULL,  -- e.g. 'ch_monet'
  name        VARCHAR(100) NOT NULL,
  stream_key  TEXT,
  image_path  TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO channels (channel_id, name, image_path) VALUES
  ('ch_monet',  'Lofi Jazz Monet',  '/opt/images/ch_monet.jpg'),
  ('ch_ternak', 'Lofi Jazz Ternak', '/opt/images/ch_ternak.jpg')
ON CONFLICT DO NOTHING;

-- Stream sessions
CREATE TABLE IF NOT EXISTS stream_sessions (
  id          SERIAL PRIMARY KEY,
  channel_id  VARCHAR(50) UNIQUE NOT NULL,
  status      VARCHAR(20) DEFAULT 'live',  -- live | stopped
  started_at  TIMESTAMPTZ DEFAULT NOW(),
  ended_at    TIMESTAMPTZ,
  FOREIGN KEY (channel_id) REFERENCES channels(channel_id)
);

-- Songs pool
CREATE TABLE IF NOT EXISTS songs (
  id          SERIAL PRIMARY KEY,
  filename    VARCHAR(255) UNIQUE NOT NULL,
  path        TEXT NOT NULL,
  size_bytes  BIGINT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Daily metrics (diisi oleh Automation 3 — n8n)
CREATE TABLE IF NOT EXISTS daily_metrics (
  id                    SERIAL PRIMARY KEY,
  channel_id            VARCHAR(50),
  watch_hours           NUMERIC(10,2) DEFAULT 0,
  subscriber_gain       INTEGER DEFAULT 0,
  estimated_revenue_usd NUMERIC(10,4) DEFAULT 0,
  viewer_count          INTEGER DEFAULT 0,
  recorded_at           TIMESTAMPTZ DEFAULT NOW(),
  FOREIGN KEY (channel_id) REFERENCES channels(channel_id)
);

CREATE INDEX IF NOT EXISTS idx_metrics_channel_date
  ON daily_metrics (channel_id, recorded_at DESC);
