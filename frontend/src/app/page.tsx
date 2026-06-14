
'use client';

import { useEffect, useState, useRef, useCallback } from 'react';

interface StreamStatus {
  streamId: string;
  channelId: string;
  pid: number;
  startedAt: string;
  elapsedSeconds: number;
}

export default function DashboardPage() {
  const [streams, setStreams] = useState<StreamStatus[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [logs, setLogs] = useState<{ ts: string; channelId?: string; log: string }[]>([]);
  const logEndRef = useRef<HTMLDivElement>(null);

  const fetchData = useCallback(async () => {
    try {
      const r = await fetch('/api/streams/status');
      if (r.ok) { const d = await r.json(); setStreams(Array.isArray(d) ? d : []); }
    } catch {}
  }, []);

  useEffect(() => {
    fetchData();
    const t = setInterval(fetchData, 10000);
    return () => clearInterval(t);
  }, [fetchData]);

  useEffect(() => {
    const WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'wss://aksarastream.ddns.net/ws';
    let ws: WebSocket;
    let timer: ReturnType<typeof setTimeout>;
    function connect() {
      ws = new WebSocket(WS_URL);
      ws.onopen  = () => setIsConnected(true);
      ws.onclose = () => { setIsConnected(false); timer = setTimeout(connect, 5000); };
      ws.onerror = () => ws.close();
      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);
          if (msg.type === 'stream:log') setLogs(p => [...p.slice(-150), msg]);
        } catch {}
      };
    }
    connect();
    return () => { clearTimeout(timer); ws?.close(); };
  }, []);

  useEffect(() => { logEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [logs]);

  const stopStream = async (streamId: string) => {
    await fetch('/api/streams/stop', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ streamId }) });
    fetchData();
  };

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="page-subtitle">System overview & live monitoring</p>
        </div>
        <div className="ws-indicator">
          <div className={`ws-dot ${isConnected ? 'ws-dot--on' : 'ws-dot--off'}`} />
          {isConnected ? 'ws connected' : 'reconnecting...'}
        </div>
      </div>

      <div className="stat-grid">
        {[
          { label: 'Active Streams', value: streams.length, sub: 'live now' },
          { label: 'Uptime',         value: '—',            sub: 'vps status' },
          { label: 'Watch Hours',    value: '—',            sub: '30-day total' },
          { label: 'Log Events',     value: logs.length,    sub: 'this session' },
        ].map(s => (
          <div className="stat-card" key={s.label}>
            <div className="stat-label">{s.label}</div>
            <div className="stat-value">{s.value}</div>
            <div className="stat-sub">{s.sub}</div>
          </div>
        ))}
      </div>

      <div className="section-header">
        <span className="section-title">Active Streams</span>
        <a href="/streams" className="btn btn-secondary" style={{ fontSize: 11 }}>Manage →</a>
      </div>

      {streams.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '32px', color: 'var(--text-muted)', marginBottom: 24 }}>
          No active streams — <a href="/streams" style={{ color: 'var(--text-accent)' }}>start one →</a>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14, marginBottom: 24 }}>
          {streams.map(s => (
            <div className="card card--active" key={s.streamId}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <span style={{ fontWeight: 600 }}>{s.channelId}</span>
                <span className="badge badge-live">LIVE</span>
              </div>
              <div className="mono" style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 14 }}>
                PID {s.pid} · {Math.floor(s.elapsedSeconds / 3600)}h {Math.floor((s.elapsedSeconds % 3600) / 60)}m
              </div>
              <button className="btn btn-danger" style={{ width: '100%' }} onClick={() => stopStream(s.streamId)}>
                ■ Stop Stream
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="section-header">
        <span className="section-title">FFmpeg Log</span>
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{logs.length} events</span>
      </div>
      <div className="log-panel">
        {logs.length === 0 && <span style={{ color: 'var(--text-muted)' }}>Waiting for WebSocket events...</span>}
        {logs.map((l, i) => (
          <div className="log-line" key={i}>
            <span className="log-time">{new Date(l.ts).toLocaleTimeString('id-ID', { hour12: false })}</span>
            <span className="log-text">[{l.channelId}] {l.log?.slice(0, 200)}</span>
          </div>
        ))}
        <div ref={logEndRef} />
      </div>
    </>
  );
}
