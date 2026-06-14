require('dotenv').config({ path: __dirname + '/.env' });
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');
const helmet = require('helmet');
const { Pool } = require('pg');
const Redis = require('ioredis');

const LocalStreamService = require('./src/services/LocalStreamService');
const WebSocketService = require('./src/services/WebSocketService');
const SongCoordinatorClient = require('./src/services/SongCoordinatorClient');
const SchedulerService = require('./src/services/SchedulerService');

const streamsRouter = require('./src/routes/streams');
const songsRouter = require('./src/routes/songs');
const channelsRouter = require('./src/routes/channels');
const metricsRouter = require('./src/routes/metrics');
const systemRouter = require('./src/routes/system');
const schedulesRouter = require('./src/routes/schedules');
const thumbnailsRouter = require('./src/routes/thumbnails');

const app = express();
const server = http.createServer(app);

const db = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'lofi_dashboard',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASS,
});

db.on('error', (err) => {
  console.error('🔥 [PostgreSQL] Unexpected error:', err.message);
});

const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: process.env.REDIS_PORT || 6379,
});

redis.on('error', (err) => {
  console.error('🔥 [Redis] Connection error:', err.message);
});

const wss = new WebSocket.Server({ server, path: '/ws' });
const wsService = new WebSocketService(wss);

const songCoord = new SongCoordinatorClient('http://localhost:8090');
const streamService = new LocalStreamService(wsService, songCoord);

const scheduler = new SchedulerService(db, streamService, wsService);
scheduler.start();

app.use(helmet());
app.use(cors({ origin: process.env.FRONTEND_URL || 'http://localhost:3000' }));
app.use(express.json());

app.use((req, _res, next) => {
  req.db = db;
  req.redis = redis;
  req.wsService = wsService;
  req.streamService = streamService;
  req.songCoord = songCoord;
  next();
});

app.use('/api/streams', streamsRouter);
app.use('/api/songs', songsRouter);
app.use('/api/channels', channelsRouter);
app.use('/api/metrics', metricsRouter);
app.use('/api/system', systemRouter);
app.use('/api/schedules', schedulesRouter);
app.use('/api/thumbnails', thumbnailsRouter);

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', ts: new Date().toISOString() });
});

process.on('uncaughtException', (err) => {
  console.error('💥 [CRASH PREVENTION] Uncaught Exception:', err);
});
process.on('unhandledRejection', (reason, promise) => {
  console.error('💥 [CRASH PREVENTION] Unhandled Rejection:', reason);
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, '0.0.0.0', () => console.log('[backend] running on :' + PORT));

module.exports = { app, db, redis };