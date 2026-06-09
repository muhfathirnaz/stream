/**
 * WebSocketService
 * Wrapper di atas ws library. Broadcast event ke semua client yang connect.
 * Frontend (Next.js) connect ke wss://domainlo.com/ws
 */

const WebSocket = require('ws');

class WebSocketService {
  constructor(wss) {
    this.wss = wss;

    wss.on('connection', (ws, req) => {
      console.log(`[ws] client connected: ${req.socket.remoteAddress}`);

      // Kirim initial state saat client konek
      ws.send(JSON.stringify({ type: 'connected', ts: new Date().toISOString() }));

      ws.on('message', (raw) => {
        try {
          const msg = JSON.parse(raw);
          this._handleClientMessage(ws, msg);
        } catch (_) {}
      });

      ws.on('close', () => {
        console.log('[ws] client disconnected');
      });
    });
  }

  /**
   * Broadcast ke semua client yang OPEN
   * @param {string} type  - event type, e.g. 'stream:log'
   * @param {object} payload
   */
  broadcast(type, payload) {
    const msg = JSON.stringify({ type, ...payload });
    this.wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(msg);
      }
    });
  }

  /**
   * Send ke satu client saja
   */
  sendTo(ws, type, payload) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type, ...payload }));
    }
  }

  _handleClientMessage(ws, msg) {
    // Client bisa request state terbaru
    if (msg.type === 'ping') {
      this.sendTo(ws, 'pong', { ts: new Date().toISOString() });
    }
  }
}

module.exports = WebSocketService;
