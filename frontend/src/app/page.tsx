'use client';

import { useEffect, useState, useRef, useCallback } from 'react';

interface StreamStatus {
  channelId: string;
  pid: number;
  startedAt: string;
  elapsedSeconds: number;
}

interface SongPool {
  total: number;
  locked: string[];
  available: number;
}

interface LogLine {
  ts: string;
  channelId?: string;
  log: string;
  type: string;
}

function useWebSocket(url: string) {
  const [isConnected, setIsConnected] = useState(false);
  const [logs, setLogs] = useState<LogLine[]>([]);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    let reconnectTimer: ReturnType<typeof setTimeout>;

    function connect() {
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => setIsConnected(true);
      ws.onclose = () => {
        setIsConnected(false);
        reconnectTimer = setTimeout(connect, 5000);
      };
      ws.onerror = () => ws.close();

      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);
          if (msg.type === 'stream:log') {
            setLogs((prev) => [...prev.slice(-100), msg]);
          }
        } catch (err) {
          console.error('Failed to parse WS message:', err);
        }
      };
    }

    connect();
    return () => {
      clearTimeout(reconnectTimer);
      wsRef.current?.close();
    };
  }, [url]);

  return { isConnected, logs };
}

export default function DashboardPage() {
  const WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'wss://aksarastream.ddns.net/ws';
  const { isConnected, logs } = useWebSocket(WS_URL);

  const [streams, setStreams] = useState<StreamStatus[]>([]);
  const [songPool, setSongPool] = useState<SongPool>({ total: 0, locked: [], available: 0 });
  const logEndRef = useRef<HTMLDivElement>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/streams/status');
      if (res.ok) {
        const data = await res.json();
        setStreams(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.error('Error fetching streams:', err);
    }

    try {
      const res = await fetch('/coordinator/status');
      if (res.ok) {
        const data = await res.json();
        if (data.songs && typeof data.songs === 'object') {
          setSongPool({
            total: data.songs.total ?? 0,
            locked: data.songs.locked ?? [],
            available: data.songs.available ?? 0,
          });
        }
      }
    } catch (err) {
      console.error('Error fetching song pool:', err);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 10000);
    return () => clearInterval(interval);
  }, [fetchData]);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const startStream = async (channelId: string, streamKey: string) => {
    try {
      const res = await fetch('/api/streams/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelId, streamKey }),
      });
      if (!res.ok) console.error('Start stream failed:', await res.text());
      else fetchData();
    } catch (err) {
      console.error('Error starting stream:', err);
    }
  };

  const stopStream = async (channelId: string) => {
    try {
      const res = await fetch('/api/streams/stop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelId }),
      });
      if (!res.ok) console.error('Stop stream failed:', await res.text());
      else fetchData();
    } catch (err) {
      console.error('Error stopping stream:', err);
    }
  };

  return (
    <main className="min-h-screen bg-[#0a0c0f] text-[#e8e6e0] font-sans">
      <header className="h-14 bg-[#111318] border-b border-[#2a2e38] flex items-center px-6 gap-4">
        <h1 className="text-sm font-bold tracking-widest text-[#c8f55a] uppercase">
          Command <span className="text-[#6b7280] font-normal">Center</span>
        </h1>
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-[#c8f55a]' : 'bg-[#f5655a]'}`} />
          <span className="text-xs text-[#6b7280] font-mono">
            {isConnected ? 'ws connected' : 'reconnecting...'}
          </span>
        </div>
      </header>

      <div className="flex">
        <aside className="w-56 min-h-[calc(100vh-56px)] bg-[#111318] border-r border-[#2a2e38] p-4 flex flex-col gap-1">
          {[
            { label: 'Dashboard', icon: '⊞', active: true },
            { label: 'Live Streams', icon: '◉', href: '/streams' },
            { label: 'Song Pool', icon: '♪', badge: songPool.total },
            { label: 'n8n Workflows', icon: '⚡' },
            { label: 'Drive Sync', icon: '↑' },
            { label: 'Settings', icon: '⚙' },
          ].map((item) => (
            item.href ? (
              <a key={item.label} href={item.href} className="flex items-center gap-3 px-3 py-2 rounded text-sm cursor-pointer text-[#6b7280] hover:bg-[#191c23] hover:text-[#e8e6e0]">
                <span className="w-4 text-center">{item.icon}</span>
                {item.label}
              </a>
            ) : (
              <div
                key={item.label}
                className={`flex items-center gap-3 px-3 py-2 rounded text-sm cursor-pointer
                  ${item.active
                    ? 'bg-[#191c23] text-[#c8f55a] border-l-2 border-[#c8f55a]'
                    : 'text-[#6b7280] hover:bg-[#191c23] hover:text-[#e8e6e0]'
                  }`}
              >
                <span className="w-4 text-center">{item.icon}</span>
                {item.label}
                {item.badge !== undefined && (
                  <span className="ml-auto bg-[#c8f55a] text-[#0a0c0f] text-[10px] font-bold px-1.5 py-0.5 rounded">
                    {item.badge}
                  </span>
                )}
              </div>
            )
          ))}
        </aside>

        <div className="flex-1 p-5">
          <div className="grid grid-cols-4 gap-3 mb-5">
            {[
              {
                label: 'Active Streams',
                val: streams.length.toString(),
                sub: 'live now',
                color: 'border-t-[#c8f55a]',
              },
              {
                label: 'Songs in Pool',
                val: songPool.total.toString(),
                sub: `${songPool.locked.length} playing · ${songPool.available} idle`,
                color: 'border-t-[#5af5c8]',
              },
              {
                label: 'Watch Hours',
                val: '—',
                sub: 'from metrics API',
                color: 'border-t-[#f5c85a]',
              },
              {
                label: 'Subscribers',
                val: '—',
                sub: 'from metrics API',
                color: 'border-t-[#5a8af5]',
              },
            ].map((s) => (
              <div
                key={s.label}
                className={`bg-[#111318] border border-[#2a2e38] rounded-lg p-4 border-t-2 ${s.color}`}
              >
                <div className="text-[10px] text-[#6b7280] uppercase tracking-widest font-mono mb-2">
                  {s.label}
                </div>
                <div className="text-2xl font-bold">{s.val}</div>
                <div className="text-[11px] text-[#6b7280] mt-1 font-mono">{s.sub}</div>
              </div>
            ))}
          </div>

          <div className="mb-5">
            <div className="text-[10px] text-[#6b7280] uppercase tracking-widest font-mono mb-3">
              Active Streams
            </div>
            {streams.length === 0 ? (
              <div className="bg-[#111318] border border-[#2a2e38] rounded-lg p-6 text-center text-[#6b7280] text-sm">
                Tidak ada stream aktif
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {streams.map((s) => (
                  <div key={s.channelId} className="bg-[#111318] border border-[#2a2e38] rounded-lg p-4">
                    <div className="flex items-center justify-between mb-3">
                      <span className="font-semibold">{s.channelId}</span>
                      <div className="flex items-center gap-1.5 text-[#f5655a] text-xs font-mono">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#f5655a] animate-pulse" />
                        LIVE
                      </div>
                    </div>
                    <div className="text-xs text-[#6b7280] font-mono mb-3">
                      PID: {s.pid} · {Math.floor(s.elapsedSeconds / 3600)}h{' '}
                      {Math.floor((s.elapsedSeconds % 3600) / 60)}m elapsed
                    </div>
                    <button
                      onClick={() => stopStream(s.channelId)}
                      className="w-full text-xs py-1.5 rounded border border-[#3a1a1a] text-[#f5655a] hover:bg-[#1a0a0a] transition-colors font-mono"
                    >
                      ■ Stop Stream
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <div className="text-[10px] text-[#6b7280] uppercase tracking-widest font-mono mb-3">
              FFmpeg WebSocket Log
            </div>
            <div className="bg-[#0d0f12] border border-[#2a2e38] rounded-lg p-3 h-52 overflow-y-auto font-mono text-[11px] leading-relaxed">
              {logs.length === 0 && (
                <span className="text-[#6b7280]">Menunggu events dari WebSocket...</span>
              )}
              {logs.map((l, i) => (
                <div key={i} className="flex gap-3 border-b border-[#1a1d24] py-0.5">
                  <span className="text-[#6b7280] flex-shrink-0">
                    {new Date(l.ts).toLocaleTimeString('id-ID', { hour12: false })}
                  </span>
                  <span className="text-[#b4b0a8]">
                    [{l.channelId}] {l.log}
                  </span>
                </div>
              ))}
              <div ref={logEndRef} />
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}