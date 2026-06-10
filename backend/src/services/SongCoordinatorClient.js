/**
 * SongCoordinatorClient
 * HTTP client untuk localhost:8090 (Song Coordinator)
 * Anti-duplicate antar channel — tidak expose ke publik, hanya localhost
 */

const http = require('http');

class SongCoordinatorClient {
  constructor(baseUrl = 'http://localhost:8090') {
    this.base = baseUrl;
  }

  _request(method, path, body = null) {
    return new Promise((resolve, reject) => {
      const url = new URL(this.base + path);
      const opts = {
        hostname: url.hostname,
        port: url.port || 8090,
        path: url.pathname,
        method,
        headers: { 'Content-Type': 'application/json' },
      };
      const req = http.request(opts, (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          try { resolve(JSON.parse(data)); } catch { resolve(data); }
        });
      });
      req.on('error', reject);
      if (body) req.write(JSON.stringify(body));
      req.end();
    });
  }

  /** Minta lagu berikutnya untuk channel (anti-duplicate dijamin coordinator) */
  getNextSong(channelId) {
    return this._request('POST', '/next-song', { channelId });
  }

  /** Bebaskan lagu setelah selesai diputar */
  releaseSong(channelId, songId) {
    return this._request('POST', '/release-song', { channelId, songId });
  }

  /** Status semua lagu yang sedang di-lock */
  getStatus() {
    return this._request('GET', '/status');
  }
}
const server = http.createServer((req, res) => {
  res.setHeader('Content-Type', 'application/json');
  
  // --- TAMBAHAN CORS ---
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
      res.writeHead(204);
      return res.end();
  }
  // ---------------------

module.exports = SongCoordinatorClient;
