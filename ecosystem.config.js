// ecosystem.config.js — PM2 config untuk semua service di 1 VPS
// Usage: pm2 start ecosystem.config.js

module.exports = {
  apps: [
    {
      name: 'backend',
      script: './backend/server.js',
      cwd: '/home/ubuntu/lofi-dashboard',
      instances: 1,
      autorestart: true,
      watch: false,
      env: {
        NODE_ENV: 'production',
        PORT: 3001,
      },
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      error_file: '/var/log/pm2/backend-error.log',
      out_file: '/var/log/pm2/backend-out.log',
    },
    {
      name: 'frontend',
      script: 'node_modules/.bin/next',
      args: 'start',
      cwd: '/home/ubuntu/lofi-dashboard/frontend',
      instances: 1,
      autorestart: true,
      watch: false,
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      error_file: '/var/log/pm2/frontend-error.log',
      out_file: '/var/log/pm2/frontend-out.log',
    },
    {
      name: 'song-coordinator',
      script: './song-coordinator/index.js',
      cwd: '/home/ubuntu/lofi-dashboard',
      instances: 1,
      autorestart: true,
      watch: false,
      env: {
        PORT: 8090,
        SONGS_DIR: '/opt/songs',
      },
    },
    {
      name: 'n8n',
      script: 'n8n',
      interpreter: 'none',
      autorestart: true,
      env: {
        
  
  N8N_PORT: 5678,
  N8N_SECURE_COOKIE: 'false',
  N8N_PATH: '/n8n/',
  N8N_EDITOR_BASE_URL: 'https://aksarastream.ddns.net/n8n/',  // ← pakai https + domain, bukan IP
  WEBHOOK_URL: 'https://aksarastream.ddns.net/n8n/',           // ← sama
  // ... sisanya sama



        DB_TYPE: 'postgresdb',
        DB_POSTGRESDB_HOST: 'localhost',
        DB_POSTGRESDB_PORT: '5432',
        DB_POSTGRESDB_DATABASE: 'n8n',
        DB_POSTGRESDB_USER: 'postgres',
        DB_POSTGRESDB_PASSWORD: 'Ekqbkuhkn122',
      },
    },
  ],
};
