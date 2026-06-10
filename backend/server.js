/**
 * Command Center — Backend
 * Stack: Node.js + Express + WebSocket (ws) + PostgreSQL (pg) + Redis (ioredis)
 * Port: 3001
 * Dikelola oleh: PM2
 */

require('dotenv').config({ path: __dirname + '/.env' });
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');
const helmet = require('helmet');
const { Pool } = require('pg');
const Redis = require('ioredis');

// ─── SERVICES ────────────────────────────────────────────────────────────────
const LocalStreamService = require('./src/services/LocalStreamService');
const WebSocketService = require('./src/services/WebSocketService');
const SongCoordinatorClient = require('./src/services/SongCoordinatorClient');

// ─── ROUTES ──────────────────────────────────────────────────────────────────
const streamsRouter = require('./src/routes/streams');
const songsRouter = require('./src/routes/songs');
const channelsRouter = require('./src/routes/channels');
const metricsRouter = require('./src/routes/metrics');
const systemRouter = require('./src/routes/system');

// ─── SETUP ───────────────────────────────────────────────────────────────────
const app = express();
const server = http.createServer(app);

// PostgreSQL
const db = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'lofi_dashboard',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASS,
});

// 🔥 TAMENG 1: Jangan biarkan server mati kalau DB putus sesaat
db.on('error', (err) => {
  console.error('🔥 [PostgreSQL] Unexpected error on idle client:', err.message);
});

// Redis
const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: process.env.REDIS_PORT || 6379,
});

// 🔥 TAMENG 2: Jangan biarkan server mati kalau Redis putus
redis.on('error', (err) => {
  console.error('🔥 [Redis] Connection error:', err.message);
});

// WebSocket Server
const wss = new WebSocket.Server({ server, path: '/ws' });
const wsService = new WebSocketService(wss);

// Services
const songCoord = new SongCoordinatorClient('http://localhost:8090');
const streamService = new LocalStreamService(wsService, songCoord);

// ─── MIDDLEWARE ───────────────────────────────────────────────────────────────
app.use(helmet());
app.use(cors({ origin: process.env.FRONTEND_URL || 'http://localhost:3000' }));
app.use(express.json());

// Internal API key middleware (untuk request dari n8n)
const internalAuth = (req, res, next) => {
  const key = req.headers['x-internal-key'];
  if (key !== process.env.INTERNAL_API_KEY) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  next();
};

// Inject services ke semua routes
app.use((req, _res, next) => {
  req.db = db;
  req.redis = redis;
  req.wsService = wsService;
  req.streamService = streamService;
  req.songCoord = songCoord;
  next();
});

// ─── ROUTES ──────────────────────────────────────────────────────────────────
app.use('/api/streams', streamsRouter);
app.use('/api/songs', songsRouter);
app.use('/api/channels', channelsRouter);
app.use('/api/metrics', metricsRouter);
app.use('/api/system', systemRouter);

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', ts: new Date().toISOString() });
});

// 🔥 TAMENG 3: GLOBAL ERROR HANDLER (Biar Node.js nggak crash)
process.on('uncaughtException', (err) => {
  console.error('💥 [CRASH PREVENTION] Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('💥 [CRASH PREVENTION] Unhandled Rejection at:', promise, 'reason:', reason);
});

// ─── START ───────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3001;
server.listen(PORT, '0.0.0.0', () => console.log('[song-coordinator] running on :' + PORT));

module.exports = { app, db, redis };