'use client';

import { useEffect, useState, useRef, useCallback } from 'react';

interface StreamStatus { streamId: string; channelId: string; pid: number; startedAt: string; elapsedSeconds: number; }
interface Schedule { id: number; channel_id: string; channel_name: string; scheduled_at: string; duration_secs: number; title: string; status: string; repeat_type?: string; }

const Icon = {
  Play: () => <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><path d="M5 3l14 9-14 9V3z"/></svg>,
  Stop: () => <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>,
  Activity: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>,
  Server: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16"><rect x="2" y="2" width="20" height="8" rx="2" ry="2"/><rect x="2" y="14" width="20" height="8" rx="2" ry="2"/><line x1="6" y1="6" x2="6.01" y2="6"/><line x1="6" y1="18" x2="6.01" y2="18"/></svg>,
  Clock: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>,
  Terminal: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16"><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg>,
  ArrowRight: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>,
  Calendar: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>,
  Trash: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
};

const formatScheduleTime = (iso: string) => {
  const d = new Date(iso);
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(d);
  const get = (t: string) => parts.find(p => p.type === t)?.value || '';
  return `${get('day')}/${get('month')} ${get('hour')}:${get('minute')} PT`;
};
const getCountdown = (iso: string) => { const diff = new Date(iso).getTime() - Date.now(); if (diff <= 0) return 'Sesaat lagi'; const h = Math.floor(diff / 3600000); const m = Math.floor((diff % 3600000) / 60000); return h > 0 ? `${h}j ${m}m` : `${m}m`; };

export default function DashboardPage() {
  const [streams, setStreams] = useState<StreamStatus[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [logs, setLogs] = useState<{ ts: string; channelId?: string; log: string }[]>([]);
  const [countdown, setCountdown] = useState<{ [key: number]: string }>({});
  const logEndRef = useRef<HTMLDivElement>(null);

  const fetchData = useCallback(async () => {
    try {
      const [resStatus, resSched] = await Promise.all([
        fetch('/api/streams/status'),
        fetch('/api/schedules')
      ]);
      if (resStatus.ok) { const d = await resStatus.json(); setStreams(Array.isArray(d) ? d : []); }
      if (resSched.ok) { const d = await resSched.json(); setSchedules(Array.isArray(d) ? d : []); }
    } catch {}
  }, []);

  useEffect(() => { fetchData(); const t = setInterval(fetchData, 10000); return () => clearInterval(t); }, [fetchData]);

  useEffect(() => { const update = () => { const counts: { [key: number]: string } = {}; schedules.filter(s => s.status === 'pending').forEach(s => { counts[s.id] = getCountdown(s.scheduled_at); }); setCountdown(counts); }; update(); const t = setInterval(update, 30000); return () => clearInterval(t); }, [schedules]);

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
        try { const msg = JSON.parse(e.data); if (msg.type === 'stream:log') setLogs(p => [...p.slice(-150), msg]); } catch {}
      };
    }
    connect(); return () => { clearTimeout(timer); ws?.close(); };
  }, []);

  useEffect(() => { logEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [logs]);

  const stopStream = async (streamId: string) => { await fetch('/api/streams/stop', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ streamId }) }); fetchData(); };
  const cancelSchedule = async (scheduleId: number) => { if (!confirm('Batalkan jadwal ini?')) return; await fetch(`/api/schedules/${scheduleId}`, { method: 'DELETE' }); fetchData(); };

  const pendingSchedules = schedules.filter(s => s.status === 'pending');

  return (
    <div className="min-h-screen text-white apple-ui relative z-0 pb-16 overflow-x-hidden">
      <style dangerouslySetInnerHTML={{__html: `
        .apple-ui { font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, Helvetica, Arial, sans-serif; font-weight: 400; letter-spacing: -0.01em; }
        .glass-card { background: rgba(255, 255, 255, 0.03); backdrop-filter: blur(40px); border: 1px solid rgba(255, 255, 255, 0.08); box-shadow: 0 10px 40px -10px rgba(0,0,0,0.3); }
        .glass-card-strong { background: rgba(255, 255, 255, 0.08); backdrop-filter: blur(40px); border: 1px solid rgba(255, 255, 255, 0.15); box-shadow: 0 20px 40px -10px rgba(0,0,0,0.5); }
        ::-webkit-scrollbar { width: 6px; height: 6px; } ::-webkit-scrollbar-track { background: transparent; } ::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.15); border-radius: 10px; }
      `}} />

      <div className="fixed inset-0 z-[-1] bg-[#050507]">
        <div className="absolute top-[-10%] left-[-10%] w-[50vw] h-[50vw] bg-indigo-600/20 rounded-full blur-[140px] mix-blend-screen pointer-events-none" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[60vw] h-[60vw] bg-orange-600/10 rounded-full blur-[140px] mix-blend-screen pointer-events-none" />
      </div>

      <div className="max-w-5xl mx-auto px-4 lg:px-6 pt-8">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-white mb-0.5">Control Center</h1>
            <p className="text-white/50 text-[11px] font-semibold uppercase tracking-widest">System Overview & Monitoring</p>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 backdrop-blur-md text-[10px] font-semibold uppercase tracking-widest">
             <div className={`w-1.5 h-1.5 rounded-full ${isConnected ? 'bg-emerald-400 animate-pulse shadow-[0_0_8px_#34d399]' : 'bg-red-500'}`} />
             <span className={isConnected ? 'text-emerald-400' : 'text-red-400'}>{isConnected ? 'WS Connected' : 'Reconnecting...'}</span>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {[
            { label: 'Active Streams', value: streams.length, sub: 'live now', icon: <Icon.Activity /> },
            { label: 'Schedules', value: pendingSchedules.length, sub: 'pending', icon: <Icon.Calendar /> },
            { label: 'Uptime', value: '—', sub: 'vps status', icon: <Icon.Server /> },
            { label: 'Log Events', value: logs.length, sub: 'this session', icon: <Icon.Terminal /> },
          ].map(s => (
            <div key={s.label} className="glass-card rounded-[24px] p-5 flex flex-col justify-between hover:bg-white/[0.05] transition-colors duration-300">
              <div className="flex items-center gap-2 text-white/40 mb-3"><span className="opacity-70">{s.icon}</span><span className="text-[10px] font-bold uppercase tracking-widest">{s.label}</span></div>
              <div className="text-3xl font-semibold text-white tracking-tight mb-1">{s.value}</div>
              <div className="text-[10px] text-white/30 font-medium uppercase tracking-wider">{s.sub}</div>
            </div>
          ))}
        </div>

        {/* ACTIVE STREAMS SECTION */}
        <div className="flex items-center justify-between mb-4 px-2">
          <span className="text-sm font-semibold text-white/60 tracking-tight">Active Streams</span>
          <a href="/streams" className="text-[11px] font-bold text-white/40 hover:text-white transition-colors flex items-center gap-1">Manage <Icon.ArrowRight /></a>
        </div>

        {streams.length === 0 ? (
          <div className="glass-card rounded-[24px] p-8 text-center mb-8">
            <div className="text-white/30 text-sm mb-2 font-medium">Belum ada siaran yang berjalan.</div>
            <a href="/streams" className="text-emerald-400 hover:text-emerald-300 text-[11px] font-bold uppercase tracking-widest inline-flex items-center gap-1">Start Engine <Icon.ArrowRight /></a>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
            {streams.map(s => (
              <div key={s.streamId} className="glass-card-strong rounded-[24px] p-5 relative overflow-hidden group">
                <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/10 blur-[40px] rounded-full pointer-events-none" />
                <div className="flex items-center justify-between mb-3 relative z-10">
                  <span className="font-bold text-sm text-white truncate pr-2">{s.channelId}</span>
                  <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2.5 py-0.5 rounded-full text-[9px] font-bold tracking-widest uppercase animate-pulse">LIVE</span>
                </div>
                <div className="text-[10px] font-mono text-emerald-400/50 mb-1 relative z-10">PID: {s.pid}</div>
                <div className="text-xs font-semibold text-white/80 mb-4 relative z-10">{Math.floor(s.elapsedSeconds / 3600)}h {Math.floor((s.elapsedSeconds % 3600) / 60)}m</div>
                <button onClick={() => stopStream(s.streamId)} className="w-full bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-400 py-2 rounded-xl text-[10px] font-bold tracking-widest uppercase transition-colors flex items-center justify-center gap-1.5 relative z-10"><Icon.Stop /> Stop Engine</button>
              </div>
            ))}
          </div>
        )}

        {/* PENDING SCHEDULES SECTION */}
        <div className="flex items-center justify-between mb-4 px-2">
          <span className="text-sm font-semibold text-white/60 tracking-tight">Upcoming Schedules</span>
          <a href="/streams" className="text-[11px] font-bold text-white/40 hover:text-white transition-colors flex items-center gap-1">Manage <Icon.ArrowRight /></a>
        </div>

        {pendingSchedules.length === 0 ? (
          <div className="glass-card rounded-[24px] p-8 text-center mb-8">
            <div className="text-white/30 text-sm mb-2 font-medium">Belum ada jadwal tayang.</div>
            <a href="/streams" className="text-amber-400 hover:text-amber-300 text-[11px] font-bold uppercase tracking-widest inline-flex items-center gap-1">Buat Jadwal <Icon.ArrowRight /></a>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
            {pendingSchedules.map(s => (
              <div key={s.id} className="glass-card rounded-[24px] p-5 relative overflow-hidden group">
                <div className="flex justify-between items-start mb-4">
                  <div className="truncate pr-2">
                    <div className="text-sm font-bold text-white flex items-center gap-2 truncate"><div className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" /> {s.channel_name}</div>
                    <div className="text-[11px] text-white/50 mt-1">{formatScheduleTime(s.scheduled_at)}</div>
                  </div>
                  <button onClick={() => cancelSchedule(s.id)} className="w-8 h-8 rounded-full bg-red-500/10 text-red-400 flex items-center justify-center hover:bg-red-500/20 transition-colors shrink-0"><Icon.Trash /></button>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-medium px-2.5 py-1 rounded-full bg-white/5 text-white/60">{Math.round(s.duration_secs / 3600)} Jam</span>
                  <span className="text-[11px] font-semibold text-amber-400 bg-amber-400/10 border border-amber-400/20 px-3 py-1 rounded-full">{countdown[s.id] || getCountdown(s.scheduled_at)}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-center justify-between mb-4 px-2">
          <span className="text-sm font-semibold text-white/60 tracking-tight">System Logs Monitor</span>
          <span className="text-[10px] font-bold text-white/30 uppercase tracking-widest">{logs.length} Lines</span>
        </div>
        <div className="glass-card rounded-[24px] p-4 h-64 overflow-y-auto font-mono text-[10px] leading-relaxed flex flex-col gap-1.5">
          {logs.length === 0 && <div className="h-full flex items-center justify-center text-white/30">Waiting for engine events...</div>}
          {logs.map((l, i) => (
            <div key={i} className="flex gap-3 pb-1.5 border-b border-white/5 last:border-0 last:pb-0">
              <span className="text-white/30 flex-shrink-0">{new Date(l.ts).toLocaleTimeString('id-ID', { hour12: false })}</span>
              <span className={`break-words ${l.log?.toLowerCase().includes('error')||l.log?.toLowerCase().includes('failed') ? 'text-red-400' : 'text-white/60'}`}><span className="text-amber-400/50">[{l.channelId}]</span> {l.log}</span>
            </div>
          ))}
          <div ref={logEndRef} />
        </div>
      </div>
    </div>
  );
}
