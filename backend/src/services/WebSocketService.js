const WebSocket = require('ws');

class WebSocketService {
  constructor(wss) {
    this.wss = wss;

    wss.on('connection', (ws, req) => {
      console.log(`[ws] client connected: ${req.socket.remoteAddress}`);
      ws.send(JSON.stringify({ type: 'connected', ts: new Date().toISOString() }));

      ws.on('message', (raw) => {
        try {
          const msg = JSON.parse(raw);
          this._handleClientMessage(ws, msg);
        } catch (_) {}
      });
    });
  }

  // METHOD BARU: Ini yang lo butuhin buat FFmpeg log
  broadcastLog(channelId, logMessage) {
    const payload = {
      type: 'stream:log',
      channelId: channelId,
      log: logMessage,
      ts: new Date().toISOString()
    };
    this.broadcast('stream:log', payload);
  }

  // Broadcast ke semua client yang OPEN
  broadcast(type, payload) {
    const msg = JSON.stringify({ type, ...payload });
    this.wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(msg);
      }
    });
  }

  sendTo(ws, type, payload) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type, ...payload }));
    }
  }

  _handleClientMessage(ws, msg) {
    if (msg.type === 'ping') {
      this.sendTo(ws, 'pong', { ts: new Date().toISOString() });
    }
  }
}

module.exports = WebSocketService;