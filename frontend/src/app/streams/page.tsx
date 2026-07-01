'use client';

import { useEffect, useState, useCallback } from 'react';

interface StreamStatusRaw { streamId: string; channelId: string; pid: number; elapsedSeconds: number; mode?: string; videoFilename?: string; songInfo?: string; thumbnailPath?: string; title?: string; }
interface Channel { id: number; channel_id: string; name: string; google_refresh_token?: string; stream_key?: string; stream_status?: string; activeStreams: { streamId: string; elapsedSeconds: number; mode?: string; videoFilename?: string; songInfo?: string; thumbnailPath?: string; title?: string }[]; }
interface Schedule { id: number; channel_id: string; channel_name: string; scheduled_at: string; duration_secs: number; title: string; status: string; repeat_type?: string; }
interface Folder { name: string; count: number; }
interface Asset { id: number; type: string; value: string; label: string; in_use?: boolean; }
interface MediaFile { filename: string; path: string; category?: string; }
interface SystemLog { id: number; channel_id: string; message: string; created_at: string; }
interface StreamConfig { folders: string[]; videoPath: string | null; videoReadyPath: string | null; songPath: string | null; thumbnailPath: string | null; titleId: number | null; descriptionId: number | null; auto: boolean; duration: number; mode?: string; vrFolder?: string; vrPath?: string | null; vidFolder?: string; vidPath?: string | null; songFolder?: string; thumbFolder?: string; thumbPath?: string | null; titleFolder?: string; descFolder?: string; descId?: number | null; deleteAfterStream?: boolean; deleteVpsAfterStream?: boolean; [key: string]: any; }

const Icon = {
  TV: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="20" height="20"><rect x="2" y="7" width="20" height="15" rx="4" ry="4"/><polyline points="17 2 12 7 7 2"/></svg>,
  Play: () => <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><path d="M5 3l14 9-14 9V3z"/></svg>,
  Stop: () => <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>,
  Settings: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>,
  Clock: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>,
  Trash: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>,
  ChevronDown: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14"><polyline points="6 9 12 15 18 9"/></svg>,
  Plus: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>,
};

const formatElapsed = (secs: number) => { const h = Math.floor(secs / 3600); const m = Math.floor((secs % 3600) / 60); const s = secs % 60; return `${h}h ${m}m ${s}s`; };
const LA_TZ = 'America/Los_Angeles';

const getLAOffsetMinutes = (date: Date) => { const utc = new Date(date.toLocaleString('en-US', { timeZone: 'UTC' })); const la = new Date(date.toLocaleString('en-US', { timeZone: LA_TZ })); return Math.round((la.getTime() - utc.getTime()) / 60000); };
const formatScheduleTime = (iso: string) => { const d = new Date(iso); const parts = new Intl.DateTimeFormat('en-US', { timeZone: LA_TZ, month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(d); const get = (t: string) => parts.find(p => p.type === t)?.value || ''; return `${get('day')}/${get('month')} ${get('hour')}:${get('minute')} PT`; };
const getLADatetimeLocal = () => { const now = new Date(); now.setMinutes(now.getMinutes() + 5); const parts = new Intl.DateTimeFormat('en-US', { timeZone: LA_TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(now); const get = (t: string) => parts.find(p => p.type === t)?.value || ''; return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`; };
const laLocalToUTCISO = (localStr: string) => { const naiveUTC = new Date(localStr + ':00Z'); const offsetMin = getLAOffsetMinutes(naiveUTC); return new Date(naiveUTC.getTime() - offsetMin * 60000).toISOString(); };
const getCountdown = (iso: string) => { const diff = new Date(iso).getTime() - Date.now(); if (diff <= 0) return 'Sesaat lagi'; const h = Math.floor(diff / 3600000); const m = Math.floor((diff % 3600000) / 60000); return h > 0 ? `${h}j ${m}m` : `${m}m`; };

const defaultConfig = (): StreamConfig => ({ folders: [], videoPath: null, videoReadyPath: null, songPath: null, thumbnailPath: null, titleId: null, descriptionId: null, auto: true, duration: 4, deleteAfterStream: false, deleteVpsAfterStream: true });

function LAClock() {
  const [time, setTime] = useState(''); const [date, setDate] = useState('');
  useEffect(() => { const update = () => { const now = new Date(); setTime(now.toLocaleTimeString('en-US', { timeZone: 'America/Los_Angeles', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })); setDate(now.toLocaleDateString('en-US', { timeZone: 'America/Los_Angeles', weekday: 'short', month: 'short', day: 'numeric' }) + ' PT'); }; update(); const t = setInterval(update, 1000); return () => clearInterval(t); }, []);
  return ( <div className="glass-card-strong rounded-full pl-2 pr-4 py-1.5 flex items-center gap-2"> <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_8px_rgba(52,211,153,0.8)]" /> <span className="text-xs font-semibold tracking-wider text-white">{time}</span> <span className="text-[10px] text-white/50 hidden sm:inline-block">{date}</span> </div> );
}

function CategoryFileSelect({ label, type, folders, items, folderVal, fileVal, onChange, isText = false }: any) {
  const visibleItems = items.filter((i:any) => folderVal === '__all__' || (i.category || 'Uncategorized') === folderVal);
  return (
    <div className="bg-black/40 p-3 rounded-xl border border-white/5 flex flex-col gap-2">
      <div className="text-[10px] font-semibold text-white/50 uppercase tracking-widest">{label}</div>
      <div className="flex gap-2">
        <select value={folderVal} onChange={e => onChange({ folder: e.target.value, file: 'RANDOM' })} className="w-1/3 glass-input rounded-lg px-2 py-2 text-[11px] font-medium text-white outline-none bg-[#111318] border border-white/10">
          <option value="__all__">📁 Semua Folder</option>
          {folders.map((f:string) => <option key={f} value={f}>📁 {f}</option>)}
        </select>
        <select value={fileVal === null ? 'RANDOM' : fileVal} onChange={e => onChange({ folder: folderVal, file: e.target.value === 'RANDOM' ? null : isText ? Number(e.target.value) : e.target.value })} className="w-2/3 glass-input rounded-lg px-2 py-2 text-[11px] font-medium text-white outline-none bg-[#111318] border border-white/10">
          <option value="RANDOM">🔀 Acak Otomatis (Sesuai Folder)</option>
          {visibleItems.map((i:any) => <option key={i.id || i.path || i.filename} value={i.id || i.path || i.filename}>{i.label || i.filename || i.value}</option>)}
        </select>
      </div>
    </div>
  );
}

export default function StreamsPage() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [liveStats, setLiveStats] = useState<{ [channelId: string]: { concurrentViewers: number | null; totalViews: number | null } }>({});
  const [channelMetrics, setChannelMetrics] = useState<{ [channelId: string]: { latest: any; revenue30d: number } }>({});
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [systemLogs, setSystemLogs] = useState<SystemLog[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [thumbnails, setThumbnails] = useState<MediaFile[]>([]);
  const [videos, setVideos] = useState<MediaFile[]>([]);
  const [videoReadyFiles, setVideoReadyFiles] = useState<MediaFile[]>([]);
  const [songs, setSongs] = useState<MediaFile[]>([]);
  const [titles, setTitles] = useState<Asset[]>([]);
  const [descriptions, setDescriptions] = useState<Asset[]>([]);
  
  const [newChannelName, setNewChannelName] = useState('');
  const [newRefreshToken, setNewRefreshToken] = useState('');
  const [newStreamKey, setNewStreamKey] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [loading, setLoading] = useState(false);
  
  const [scheduleForm, setScheduleForm] = useState<{ [key: string]: { datetime: string; repeat: string } }>({});
  const [showScheduleFor, setShowScheduleFor] = useState<string | null>(null);
  const [showConfigFor, setShowConfigFor] = useState<string | null>(null);
  const [streamConfigs, setStreamConfigs] = useState<{ [channelId: string]: StreamConfig }>({});
  
  const [editingTokenFor, setEditingTokenFor] = useState<string | null>(null);
  const [editTokenValue, setEditTokenValue] = useState('');
  const [editStreamKeyValue, setEditStreamKeyValue] = useState('');
  const [countdown, setCountdown] = useState<{ [key: number]: string }>({});

  const fetchChannels = useCallback(async () => {
    try {
      const [chRes, stRes] = await Promise.all([ fetch('/api/channels'), fetch('/api/streams/status') ]);
      if (chRes.ok) {
        const chData = await chRes.json();
        const activeStreams: StreamStatusRaw[] = stRes.ok ? await stRes.json() : [];
        const merged = chData.map((ch: Channel) => {
          const chStreams = activeStreams.filter(s => s.channelId === ch.channel_id);
          let status: 'live' | 'stopped' | 'orphaned' | 'reconnecting' = 'stopped';
          if (chStreams.length > 0) {
            if (chStreams.some(s => s.streamId.startsWith('orphaned-'))) status = 'orphaned';
            else if (chStreams.some(s => s.streamId.startsWith('reconnecting-'))) status = 'reconnecting';
            else status = 'live';
          }
          return { ...ch, stream_status: status, activeStreams: chStreams.map(s => ({ streamId: s.streamId, elapsedSeconds: s.elapsedSeconds, mode: s.mode, videoFilename: s.videoFilename, songInfo: s.songInfo, thumbnailPath: s.thumbnailPath, title: s.title })) };
        });
        setChannels(merged);
      }
    } catch (err) {}
  }, []);

  const fetchSchedulesAndLogs = useCallback(async () => { try { const [resS, resL] = await Promise.all([fetch('/api/schedules'), fetch('/api/streams/logs')]); if (resS.ok) setSchedules(await resS.json()); if (resL.ok) setSystemLogs(await resL.json()); } catch (err) {} }, []);
  const fetchAssets = useCallback(async () => { try { const [fRes, thRes, tiRes, dRes, mfRes, vrRes] = await Promise.all([ fetch('/api/assets/folders'), fetch('/api/thumbnails'), fetch('/api/assets/titles'), fetch('/api/assets/descriptions'), fetch('/api/assets/mediaFiles'), fetch('/api/assets/videoReadyFiles') ]); if (fRes.ok) { const d = await fRes.json(); setFolders(d.folders || []); } if (thRes.ok) { const d = await thRes.json(); setThumbnails((d.files || []).map((f: any) => ({ ...f, path: f.path || f.filename }))); } if (tiRes.ok) setTitles(await tiRes.json()); if (dRes.ok) setDescriptions(await dRes.json()); if (mfRes.ok) { const d = await mfRes.json(); setVideos(d.videos || []); setSongs(d.songs || []); } if (vrRes.ok) { const d = await vrRes.json(); setVideoReadyFiles(d.files || []); } } catch (err) {} }, []);

  useEffect(() => { fetchChannels(); fetchSchedulesAndLogs(); fetchAssets(); const interval = setInterval(() => { fetchChannels(); fetchSchedulesAndLogs(); }, 10000); return () => clearInterval(interval); }, [fetchChannels, fetchSchedulesAndLogs, fetchAssets]);
  useEffect(() => { const update = () => { const counts: { [key: number]: string } = {}; schedules.filter(s => s.status === 'pending').forEach(s => { counts[s.id] = getCountdown(s.scheduled_at); }); setCountdown(counts); }; update(); const t = setInterval(update, 30000); return () => clearInterval(t); }, [schedules]);

  const fetchLiveStats = useCallback(async () => { const liveChannels = channels.filter(c => c.stream_status === 'live'); if (!liveChannels.length) return; const results = await Promise.all(liveChannels.map(async ch => { try { const res = await fetch(`/api/streams/live-stats/${ch.channel_id}`); if (res.ok) return [ch.channel_id, await res.json()] as const; } catch {} return [ch.channel_id, null] as const; })); setLiveStats(prev => { const next = { ...prev }; results.forEach(([id, data]) => { if (data) next[id] = data; }); return next; }); }, [channels]);
  useEffect(() => { fetchLiveStats(); const t = setInterval(fetchLiveStats, 20000); return () => clearInterval(t); }, [fetchLiveStats]);

  const fetchChannelMetrics = useCallback(async () => { if (!channels.length) return; const results = await Promise.all(channels.map(async ch => { try { const res = await fetch(`/api/metrics/channel/${ch.channel_id}`); if (res.ok) return [ch.channel_id, await res.json()] as const; } catch {} return [ch.channel_id, null] as const; })); setChannelMetrics(prev => { const next = { ...prev }; results.forEach(([id, data]) => { if (data) next[id] = data; }); return next; }); }, [channels]);
  useEffect(() => { fetchChannelMetrics(); const t = setInterval(fetchChannelMetrics, 300000); return () => clearInterval(t); }, [fetchChannelMetrics]);
  
  const getConfig = (channelId: string): StreamConfig => streamConfigs[channelId] || defaultConfig();
  const updateConfig = (channelId: string, patch: Partial<StreamConfig>) => { setStreamConfigs(prev => ({ ...prev, [channelId]: { ...getConfig(channelId), ...patch } })); };

  const initScheduleForm = (channelId: string) => { setScheduleForm(prev => ({ ...prev, [channelId]: { datetime: getLADatetimeLocal(), repeat: 'none' } })); setShowScheduleFor(channelId); };

  const startStream = async (channelId: string) => {
    const config = getConfig(channelId);
    setLoading(true);
    try {
      const payloadFolder = config.folders.length > 0 ? config.folders.join(',') : 'Semua';
      const durationSecs = config.duration === 0 ? 999 * 3600 : config.duration * 3600;
      const body: Record<string, unknown> = { channelId, durationSecs, folder: payloadFolder, auto: config.auto, mode: config.mode || 'encode', deleteAfterStream: !!config.deleteAfterStream, deleteVpsAfterStream: !!config.deleteVpsAfterStream };
      if (!config.auto) { body.videoReadyPath = config.vrPath; body.videoPath = config.vidPath; body.songPath = config.songPath; body.thumbnailPath = config.thumbPath; body.titleId = config.titleId; body.descriptionId = config.descId; }
      const res = await fetch('/api/streams/start', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (!res.ok) { const err = await res.json(); alert('Gagal start: ' + err.error); }
      await fetchChannels(); await fetchSchedulesAndLogs();
    } finally { setLoading(false); }
  };

  const startAllChannels = async () => {
    const inactiveChannels = channels.filter(ch => !ch.activeStreams?.length && (!!ch.google_refresh_token || !!ch.stream_key));
    if (inactiveChannels.length === 0) return alert('Semua channel sudah live atau belum ada kredensial.');
    setLoading(true);
    try {
      await Promise.all(inactiveChannels.map(ch => {
        const config = getConfig(ch.channel_id); const payloadFolder = config.folders.length > 0 ? config.folders.join(',') : 'Semua';
        const durSecs = config.duration === 0 ? 999 * 3600 : config.duration * 3600;
        return fetch('/api/streams/start', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ channelId: ch.channel_id, durationSecs: durSecs, folder: payloadFolder, auto: config.auto, mode: config.mode || 'encode', deleteAfterStream: !!config.deleteAfterStream, deleteVpsAfterStream: !!config.deleteVpsAfterStream }) });
      }));
      await fetchChannels(); await fetchSchedulesAndLogs();
    } finally { setLoading(false); }
  };

  const stopStream = async (streamId: string) => { setLoading(true); try { await fetch('/api/streams/stop', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ streamId }) }); await fetchChannels(); } finally { setLoading(false); } };
  
  const addChannel = async () => { 
    if (!newChannelName.trim()) return; 
    setLoading(true); 
    try { 
      const res = await fetch('/api/channels', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: newChannelName.trim(), refresh_token: newRefreshToken.trim() || undefined, stream_key: newStreamKey.trim() || undefined }) }); 
      if (!res.ok) { const err = await res.json(); alert('Gagal: ' + err.error); } else { setNewChannelName(''); setNewRefreshToken(''); setNewStreamKey(''); setShowAddForm(false); await fetchChannels(); } 
    } finally { setLoading(false); } 
  };
  
  // FUNGSI UPDATE YANG SUDAH DIPERBAIKI: Langsung kirim berapapun isinya, meski kosong
  const updateCredentials = async (channelId: string) => { 
    setLoading(true);
    try { 
      await fetch(`/api/channels/${channelId}`, { 
        method: 'PATCH', 
        headers: { 'Content-Type': 'application/json' }, 
        body: JSON.stringify({ refresh_token: editTokenValue, stream_key: editStreamKeyValue }) 
      });
      setEditingTokenFor(null); 
      await fetchChannels(); 
    } catch (err) {} finally { setLoading(false); }
  };
  
  const deleteChannel = async (channelId: string) => { if (!confirm(`Hapus channel ${channelId}?`)) return; await fetch(`/api/channels/${channelId}`, { method: 'DELETE' }); await fetchChannels(); };
  
  const scheduleStream = async (channelId: string) => {
    const form = scheduleForm[channelId];
    if (!form?.datetime) return alert('Pilih tanggal & jam dulu!');
    const scheduledAt = laLocalToUTCISO(form.datetime);
    if (new Date(scheduledAt) <= new Date()) return alert('Waktu sudah lewat!');
    const config = getConfig(channelId); setLoading(true);
    try {
      const payloadFolder = config.folders.length > 0 ? config.folders.join(',') : 'Semua';
      const schedDurSecs = config.duration === 0 ? 999 * 3600 : config.duration * 3600;
      const body: Record<string, unknown> = { channelId, scheduledAt, durationSecs: schedDurSecs, folder: payloadFolder, auto: config.auto, mode: config.mode || 'encode', repeatType: form.repeat || 'none', title: 'Lofi Broadcast', deleteAfterStream: !!config.deleteAfterStream, deleteVpsAfterStream: !!config.deleteVpsAfterStream };
      if (!config.auto) { body.videoReadyPath = config.vrPath; body.videoPath = config.vidPath; body.songPath = config.songPath; body.thumbnailPath = config.thumbPath; body.titleId = config.titleId; body.descriptionId = config.descId; }
      const res = await fetch('/api/schedules', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (!res.ok) { const err = await res.json(); alert('Gagal schedule: ' + err.error); } else { setShowScheduleFor(null); await fetchSchedulesAndLogs(); }
    } finally { setLoading(false); }
  };
  
  const cancelSchedule = async (scheduleId: number) => { if (!confirm('Batalkan jadwal ini?')) return; await fetch(`/api/schedules/${scheduleId}`, { method: 'DELETE' }); await fetchSchedulesAndLogs(); };
  const clearLogs = async () => { if(!confirm('Hapus log?')) return; await fetch('/api/streams/logs', { method: 'DELETE' }); await fetchSchedulesAndLogs(); };

  const pendingSchedules = schedules.filter(s => s.status === 'pending');

  return (
    <div className="min-h-screen text-white apple-ui relative z-0 pb-16 overflow-x-hidden">
      <style dangerouslySetInnerHTML={{__html: `
        .apple-ui { font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, Helvetica, Arial, sans-serif; font-weight: 400; letter-spacing: -0.01em; }
        .glass-card { background: rgba(255, 255, 255, 0.03); backdrop-filter: blur(40px); -webkit-backdrop-filter: blur(40px); border: 1px solid rgba(255, 255, 255, 0.08); box-shadow: 0 10px 40px -10px rgba(0,0,0,0.3); }
        .glass-card-strong { background: rgba(255, 255, 255, 0.08); backdrop-filter: blur(40px); -webkit-backdrop-filter: blur(40px); border: 1px solid rgba(255, 255, 255, 0.15); box-shadow: 0 20px 40px -10px rgba(0,0,0,0.5); }
        .glass-input { background: rgba(0, 0, 0, 0.2); border: 1px solid rgba(255, 255, 255, 0.06); }
        ::-webkit-scrollbar { width: 6px; height: 6px; } ::-webkit-scrollbar-track { background: transparent; } ::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.15); border-radius: 10px; }
      `}} />

      <div className="fixed inset-0 z-[-1] bg-[#050507]">
        <div className="absolute top-[-10%] left-[-10%] w-[50vw] h-[50vw] bg-indigo-600/20 rounded-full blur-[140px] mix-blend-screen pointer-events-none" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[60vw] h-[60vw] bg-orange-600/10 rounded-full blur-[140px] mix-blend-screen pointer-events-none" />
        <div className="absolute top-[30%] right-[20%] w-[40vw] h-[40vw] bg-teal-600/10 rounded-full blur-[140px] mix-blend-screen pointer-events-none" />
      </div>

      <div className="max-w-5xl mx-auto px-4 lg:px-6">
        <div className="pt-8 pb-6 flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-white mb-0.5">Streams</h1>
            <p className="text-white/50 text-[11px] font-medium uppercase tracking-widest">Broadcast Engine</p>
          </div>
          <div className="flex items-center gap-3">
            <LAClock />
            <button onClick={startAllChannels} disabled={loading} className="bg-emerald-500 text-black px-4 py-2 rounded-full text-xs font-semibold shadow-lg hover:scale-95 transition-transform duration-300 flex items-center gap-1.5 disabled:opacity-50">
              ▶ Start Semua
            </button>
            <button onClick={() => setShowAddForm(!showAddForm)} className="bg-white text-black px-4 py-2 rounded-full text-xs font-semibold shadow-lg hover:scale-95 transition-transform duration-300 flex items-center gap-1.5">
              <Icon.Plus /> Channel
            </button>
          </div>
        </div>

        {showAddForm && (
          <div className="glass-card-strong rounded-2xl p-5 mb-6 animate-in fade-in slide-in-from-top-4 duration-500 relative z-[90]">
            <h3 className="text-sm font-semibold mb-3 text-white">Tambah Channel</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <input type="text" placeholder="Nama Channel *" value={newChannelName} onChange={e => setNewChannelName(e.target.value)} className="glass-input rounded-xl px-3 py-2.5 text-xs text-white placeholder-white/30 focus:outline-none focus:ring-1 focus:ring-white/20 transition-all" />
              <input type="text" placeholder="Google Refresh Token" value={newRefreshToken} onChange={e => setNewRefreshToken(e.target.value)} className="glass-input rounded-xl px-3 py-2.5 text-xs text-white placeholder-white/30 focus:outline-none focus:ring-1 focus:ring-white/20 transition-all" />
              <input type="text" placeholder="Stream Key (Bila manual)" value={newStreamKey} onChange={e => setNewStreamKey(e.target.value)} className="glass-input rounded-xl px-3 py-2.5 text-xs text-white placeholder-white/30 focus:outline-none focus:ring-1 focus:ring-white/20 transition-all" />
            </div>
            <div className="flex gap-2 mt-4 justify-end">
              <button onClick={() => setShowAddForm(false)} className="px-4 py-2 rounded-full text-[11px] font-medium text-white/60 hover:text-white transition-colors">Batal</button>
              <button onClick={addChannel} disabled={loading || !newChannelName.trim()} className="bg-white text-black px-5 py-2 rounded-full text-[11px] font-semibold disabled:opacity-50 hover:scale-95 transition-transform duration-300">Simpan</button>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6 relative z-[90]">
          <div className="glass-card rounded-[20px] p-4 flex flex-col max-h-[160px]">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-1.5 text-white/60 font-medium text-xs"><Icon.Clock /> Jadwal Mendatang</div>
              <div className="bg-white/10 px-2 py-0.5 rounded-full text-[9px] font-bold text-white/80">{pendingSchedules.length}</div>
            </div>
            <div className="flex-1 overflow-y-auto pr-1 space-y-2">
              {pendingSchedules.map(s => (
                <div key={s.id} className="bg-white/[0.04] hover:bg-white/[0.08] transition-colors rounded-xl p-2.5 flex items-center justify-between gap-2">
                  <div className="truncate">
                    <div className="text-xs font-semibold text-white truncate"><span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-400 mr-1.5" />{s.channel_name}</div>
                    <div className="text-[10px] text-white/50 mt-0.5 truncate">{formatScheduleTime(s.scheduled_at)}</div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-[10px] font-semibold text-amber-400 bg-amber-400/10 px-2 py-0.5 rounded-md">{countdown[s.id] || getCountdown(s.scheduled_at)}</span>
                    <button onClick={() => cancelSchedule(s.id)} className="w-6 h-6 rounded-md bg-red-500/10 text-red-400 flex items-center justify-center hover:bg-red-500/20"><Icon.Trash /></button>
                  </div>
                </div>
              ))}
              {pendingSchedules.length === 0 && <div className="h-full flex items-center justify-center text-white/30 text-xs">Kosong</div>}
            </div>
          </div>

          <div className="glass-card rounded-[20px] p-4 flex flex-col max-h-[160px]">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-1.5 text-white/60 font-medium text-xs"><span className="text-red-400"><Icon.Settings /></span> Terminal Log</div>
              <button onClick={clearLogs} className="text-[10px] font-medium text-white/40 hover:text-white transition-colors">Clear</button>
            </div>
            <div className="flex-1 bg-black/30 rounded-xl p-3 overflow-y-auto border border-white/5 space-y-1.5">
              {systemLogs.map(l => (
                <div key={l.id} className="text-[10px] font-mono leading-tight flex gap-2">
                  <span className="text-white/30 flex-shrink-0">{new Date(l.created_at).toLocaleTimeString('id-ID', {hour:'2-digit', minute:'2-digit'})}</span>
                  <span className={`truncate ${l.message.includes('CRASH') || l.message.includes('Error') ? 'text-red-400' : l.message.includes('RESUME') ? 'text-amber-400' : 'text-white/60'}`}>{l.message}</span>
                </div>
              ))}
              {systemLogs.length === 0 && <div className="h-full flex items-center justify-center text-white/20 text-[10px] font-mono">System Healthy</div>}
            </div>
          </div>
        </div>

        <div className="space-y-4 relative z-[10]">
          {channels.map(ch => {
            const config = getConfig(ch.channel_id);
            const schedForm = scheduleForm[ch.channel_id] || { datetime: getLADatetimeLocal(), repeat: 'none' };
            const isShowingConfig = showConfigFor === ch.channel_id;
            const isShowingSchedule = showScheduleFor === ch.channel_id;
            const hasToken = !!ch.google_refresh_token;
            const hasStreamKey = !!ch.stream_key;
            const isLive = ch.stream_status === 'live';
            const isOrphaned = ch.stream_status === 'orphaned';
            const isReconnecting = ch.stream_status === 'reconnecting';
            const isActiveOrStuck = isLive || isOrphaned || isReconnecting;

            return (
              <div key={ch.channel_id} className={`glass-card rounded-[24px] p-5 relative transition-all duration-700 ${isLive ? 'border-emerald-500/30 shadow-[0_0_20px_rgba(52,211,153,0.08)]' : ''}`}>
                {isLive && <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/10 blur-[80px] rounded-full pointer-events-none" />}
                
                <div className="flex flex-wrap items-center justify-between gap-4 mb-4 relative z-[30]">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center shadow-inner transition-colors duration-500 flex-shrink-0 ${isLive ? 'bg-emerald-500 text-black' : 'glass-card-strong text-white/50'}`}>
                      <Icon.TV />
                    </div>
                    <div>
                      <h2 className="text-sm font-bold text-white tracking-tight">{ch.name}</h2>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="text-[10px] font-mono text-white/40">{ch.channel_id.slice(0, 15)}...</span>
                        {hasToken ? <span className="px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 text-[8px] font-bold uppercase border border-emerald-500/20">Token OK</span> : <span className="px-1.5 py-0.5 rounded bg-red-500/10 text-red-400 text-[8px] font-bold uppercase border border-red-500/20">No Token</span>}
                        {hasStreamKey ? <span className="px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 text-[8px] font-bold uppercase border border-blue-500/20">Key OK</span> : <span className="px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 text-[8px] font-bold uppercase border border-amber-500/20">No Key</span>}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 relative z-[30]">
                    {isLive && <div className="px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] font-bold tracking-widest uppercase animate-pulse flex items-center gap-1.5"><div className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> LIVE</div>}
                    {isOrphaned && <div className="px-3 py-1 rounded-full bg-red-500/10 border border-red-500/20 text-red-400 text-[10px] font-bold tracking-widest uppercase flex items-center gap-1.5"><div className="w-1.5 h-1.5 rounded-full bg-red-400" /> ORPHANED — Stop Dulu</div>}
                    {isReconnecting && <div className="px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 text-[10px] font-bold tracking-widest uppercase animate-pulse flex items-center gap-1.5"><div className="w-1.5 h-1.5 rounded-full bg-amber-400" /> RECONNECTING</div>}
                    {channelMetrics[ch.channel_id]?.latest && (
                    <div className="px-3 py-1 rounded-full bg-white/5 border border-white/10 text-[10px] font-mono text-white/50">
                        ~${Number(channelMetrics[ch.channel_id].latest.estimated_revenue_usd || 0).toFixed(2)}/hari
                        <span className="text-white/30 ml-1">(30d: ${channelMetrics[ch.channel_id].revenue30d.toFixed(2)})</span>
                      </div>
                    )}
                    
                    <div className="flex items-center gap-1.5 bg-black/20 p-1 rounded-full border border-white/5">
                       <button onClick={() => { if (loading) return; startStream(ch.channel_id); }} disabled={loading || (!hasToken && !hasStreamKey)} className="bg-white text-black px-4 py-1.5 rounded-full text-[11px] font-bold hover:scale-95 transition-all disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-1">
                         <Icon.Play /> Start
                       </button>
                       <button onClick={() => setShowConfigFor(isShowingConfig ? null : ch.channel_id)} className={`px-3 py-1.5 rounded-full text-[11px] font-semibold transition-all flex items-center gap-1 ${isShowingConfig ? 'bg-white/20 text-white' : 'text-white/60 hover:bg-white/10 hover:text-white'}`}>
                         <Icon.Settings /> Conf
                       </button>
                       <button onClick={() => { 
                         setEditingTokenFor(editingTokenFor === ch.channel_id ? null : ch.channel_id); 
                         setEditTokenValue(ch.google_refresh_token || ''); 
                         setEditStreamKeyValue(ch.stream_key || ''); 
                       }} className={`px-3 py-1.5 rounded-full text-[11px] font-semibold transition-all flex items-center gap-1 ${editingTokenFor === ch.channel_id ? 'bg-amber-400/20 text-amber-400' : 'text-white/60 hover:bg-white/10 hover:text-white'}`}>
                         🔑 Keys
                       </button>
                       {!isActiveOrStuck && (
                         <button onClick={() => isShowingSchedule ? setShowScheduleFor(null) : initScheduleForm(ch.channel_id)} disabled={!hasToken && !hasStreamKey} className={`px-3 py-1.5 rounded-full text-[11px] font-semibold transition-all flex items-center gap-1 ${isShowingSchedule ? 'bg-amber-400/20 text-amber-400' : 'text-amber-400/70 hover:bg-amber-400/10 hover:text-amber-400 disabled:opacity-30'}`}>
                           <Icon.Clock /> Sched
                         </button>
                       )}
                    </div>

                    <button onClick={() => deleteChannel(ch.channel_id)} className="w-8 h-8 rounded-full glass-input flex items-center justify-center text-white/30 hover:text-red-400 hover:bg-white/10 transition-colors"><Icon.Trash /></button>
                  </div>
                </div>

                {editingTokenFor === ch.channel_id && (
                  <div className="glass-card-strong rounded-xl p-3 mb-4 flex flex-col gap-2 animate-in fade-in zoom-in-95 relative z-[20]">
                    <div className="text-[10px] text-white/50 font-bold uppercase tracking-widest mb-1">Copy / Update Kredensial Channel</div>
                    <div className="flex flex-col sm:flex-row gap-2">
                      <input type="text" value={editTokenValue} onChange={e => setEditTokenValue(e.target.value)} placeholder="Refresh Token..." className="w-full flex-1 glass-input rounded-lg px-3 py-2 text-xs outline-none focus:ring-1 focus:ring-white/30" />
                      <input type="text" value={editStreamKeyValue} onChange={e => setEditStreamKeyValue(e.target.value)} placeholder="Stream Key..." className="w-full flex-1 glass-input rounded-lg px-3 py-2 text-xs outline-none focus:ring-1 focus:ring-white/30" />
                      <div className="flex gap-2 w-full sm:w-auto">
                        <button onClick={() => updateCredentials(ch.channel_id)} disabled={loading} className="flex-1 sm:flex-none bg-white text-black px-4 py-2 rounded-lg text-xs font-semibold disabled:opacity-50 hover:scale-95 transition-transform">Save</button>
                        <button onClick={() => setEditingTokenFor(null)} className="flex-1 sm:flex-none text-white/50 px-2 text-xs hover:text-white">Tutup</button>
                      </div>
                    </div>
                  </div>
                )}

                {ch.activeStreams?.length > 0 && (
                  <div className="mb-4 space-y-2 relative z-[20]">
                    {ch.activeStreams.map(s => (
                      <div key={s.streamId} className="glass-card-strong rounded-xl p-3 flex flex-col gap-2 bg-emerald-500/5 border border-emerald-500/10">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <span className="text-emerald-400 text-xs font-semibold tabular-nums bg-emerald-400/10 px-2 py-1 rounded-md">{formatElapsed(s.elapsedSeconds)}</span>
                          </div>
                          <button onClick={() => stopStream(s.streamId)} disabled={loading} className="bg-red-500/10 hover:bg-red-500/20 text-red-400 px-3 py-1 rounded-lg text-[9px] font-bold tracking-widest uppercase transition-colors flex items-center gap-1">
                            <Icon.Stop /> Stop
                          </button>
                        </div>
                        {(s.title || s.videoFilename || s.songInfo || s.thumbnailPath) && (
                          <div className="grid grid-cols-1 gap-1.5 pt-2 border-t border-emerald-500/10">
                            {s.mode && <div className="flex items-center gap-2"><span className={`text-[9px] font-bold px-2 py-0.5 rounded-full border ${s.mode === 'copy' ? 'bg-amber-400/10 text-amber-400 border-amber-400/20' : 'bg-blue-400/10 text-blue-400 border-blue-400/20'}`}>{s.mode === 'copy' ? '⚡ COPY' : '🔧 ENCODE'}</span></div>}
                            {liveStats[ch.channel_id]?.concurrentViewers != null && (
                              <div className="flex items-center gap-2">
                                <span className="text-[9px] font-bold text-white/30 uppercase tracking-wider w-14 flex-shrink-0">Viewers</span>
                                <span className="text-[10px] text-emerald-400 font-mono font-bold">👁 {liveStats[ch.channel_id].concurrentViewers} nonton</span>
                              </div>
                            )}
                            {s.title && <div className="flex items-start gap-2"><span className="text-[9px] font-bold text-white/30 uppercase tracking-wider w-14 flex-shrink-0 pt-0.5">Title</span><span className="text-[10px] text-white/70 leading-tight line-clamp-1">{s.title}</span></div>}
                            {s.videoFilename && <div className="flex items-center gap-2"><span className="text-[9px] font-bold text-white/30 uppercase tracking-wider w-14 flex-shrink-0">Video</span><span className="text-[10px] text-white/60 font-mono truncate">{s.videoFilename}</span></div>}
                            {s.songInfo && <div className="flex items-center gap-2"><span className="text-[9px] font-bold text-white/30 uppercase tracking-wider w-14 flex-shrink-0">Audio</span><span className="text-[10px] text-white/60 font-mono truncate">{s.songInfo}</span></div>}
                            {s.thumbnailPath && <div className="flex items-center gap-2"><span className="text-[9px] font-bold text-white/30 uppercase tracking-wider w-14 flex-shrink-0">Thumb</span><span className="text-[10px] text-white/60 font-mono truncate">{s.thumbnailPath.split('/').pop()}</span></div>}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {isShowingConfig && (
                  <div className="glass-card-strong rounded-[20px] p-4 mb-2 relative z-[50] animate-in slide-in-from-top-2 duration-300 border-t border-white/10 mt-4">
                    <div className="flex items-center justify-between mb-4">
                      <div className="text-[11px] font-semibold text-white/50 uppercase tracking-widest">Engine Config</div>
                      <div className="bg-black/30 p-1 rounded-lg flex gap-1 border border-white/5">
                        <button onClick={() => updateConfig(ch.channel_id, { auto: true })} className={`px-3 py-1 rounded-md text-[10px] font-bold transition-all ${config.auto ? 'bg-white text-black' : 'text-white/50 hover:text-white'}`}>AUTO</button>
                        <button onClick={() => updateConfig(ch.channel_id, { auto: false })} className={`px-3 py-1 rounded-md text-[10px] font-bold transition-all ${!config.auto ? 'bg-white text-black' : 'text-white/50 hover:text-white'}`}>MANUAL</button>
                      </div>
                    </div>
                    
                    <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-3 mb-4">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold text-amber-400 uppercase tracking-widest">⚡ Tipe Stream</span>
                        <select value={config.mode || 'encode'} onChange={e => updateConfig(ch.channel_id, { mode: e.target.value })} className="glass-input rounded-md px-2 py-1 text-[10px] font-bold text-white outline-none bg-[#111318]">
                          <option value="copy">PAKAI VIDEO JADI (HEMAT CPU)</option>
                          <option value="encode">RE-ENCODE (VIDEO BIASA + AUDIO)</option>
                        </select>
                      </div>
                    </div>

                    {config.auto && (
                      <div className="mb-4">
                        <div className="text-[10px] text-white/40 mb-1.5">{config.mode === 'copy' ? 'Kategori Video Jadi (Multi) untuk Auto:' : 'Kategori Lagu & Video (Multi) untuk Auto:'}</div>
                        <div className="flex flex-wrap gap-1.5">
                          <button onClick={() => updateConfig(ch.channel_id, { folders: [] })} className={`px-3 py-1 rounded-lg text-[10px] font-semibold transition-all ${config.folders.length === 0 ? 'bg-white text-black' : 'glass-input text-white/60 hover:bg-white/10'}`}>Semua Kategori</button>
                          {(config.mode === 'copy' ? videoReadyFiles.map((f:any)=>f.category).filter((v:any,i:any,a:any)=>v&&a.indexOf(v)===i) : folders.map((f:any)=>f.name)).map((catName:string) => {
                            const isSelected = config.folders.includes(catName);
                            return (
                              <button key={catName} onClick={() => {
                                const newFolders = isSelected ? config.folders.filter(x => x !== catName) : [...config.folders, catName];
                                updateConfig(ch.channel_id, { folders: newFolders });
                              }} className={`px-3 py-1 rounded-lg text-[10px] font-semibold transition-all ${isSelected ? 'bg-white text-black' : 'glass-input text-white/60 hover:bg-white/10'}`}>{catName}</button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                    
                    {!config.auto && (
                      <div className="space-y-3 mb-4 animate-in fade-in">
                        {config.mode === 'copy' ? (
                          <CategoryFileSelect label="Pilih Video Jadi" type="video-ready" folders={videoReadyFiles.map((f:any)=>f.category).filter((v:any,i:any,a:any)=>v&&a.indexOf(v)===i)} items={videoReadyFiles} folderVal={config.vrFolder||'__all__'} fileVal={config.vrPath||null} onChange={(v:any) => updateConfig(ch.channel_id, { vrFolder: v.folder, vrPath: v.file })} />
                        ) : (
                          <div className="bg-black/20 p-3 rounded-xl border border-white/5 space-y-3">
                            <CategoryFileSelect label="Video Visual" type="video" folders={videos.map((f:any)=>f.category).filter((v:any,i:any,a:any)=>v&&a.indexOf(v)===i)} items={videos} folderVal={config.vidFolder||'__all__'} fileVal={config.vidPath||null} onChange={(v:any) => updateConfig(ch.channel_id, { vidFolder: v.folder, vidPath: v.file })} />
                            <CategoryFileSelect label="Lagu / Audio" type="music" folders={folders.map((f:any)=>f.name)} items={songs} folderVal={config.songFolder||'__all__'} fileVal={config.songPath||null} onChange={(v:any) => updateConfig(ch.channel_id, { songFolder: v.folder, songPath: v.file })} />
                          </div>
                        )}
                        <div className="bg-black/20 p-3 rounded-xl border border-white/5 space-y-3">
                          <CategoryFileSelect label="Thumbnail" type="thumbnail" folders={thumbnails.map((f:any)=>f.category).filter((v:any,i:any,a:any)=>v&&a.indexOf(v)===i)} items={thumbnails} folderVal={config.thumbFolder||'__all__'} fileVal={config.thumbPath||null} onChange={(v:any) => updateConfig(ch.channel_id, { thumbFolder: v.folder, thumbPath: v.file })} />
                          <CategoryFileSelect label="Judul Stream" type="title" folders={titles.map((t:any)=>t.category||'Uncategorized').filter((v:any,i:any,a:any)=>v&&a.indexOf(v)===i)} items={titles} folderVal={config.titleFolder||'__all__'} fileVal={config.titleId||null} onChange={(v:any) => updateConfig(ch.channel_id, { titleFolder: v.folder, titleId: v.file })} isText />
                          <CategoryFileSelect label="Deskripsi Stream" type="desc" folders={descriptions.map((d:any)=>d.category||'Uncategorized').filter((v:any,i:any,a:any)=>v&&a.indexOf(v)===i)} items={descriptions} folderVal={config.descFolder||'__all__'} fileVal={config.descId||null} onChange={(v:any) => updateConfig(ch.channel_id, { descFolder: v.folder, descId: v.file })} isText />
                        </div>
                      </div>
                    )}
                    
                    <div className="mt-4 flex items-center gap-2 flex-wrap">
                       <span className="text-[10px] text-white/40">Durasi (Jam):</span>
                       <div className="flex flex-wrap gap-1">
                        {[1,2,3,4,6,8,10,12].map(h => (
                          <button key={h} onClick={() => updateConfig(ch.channel_id, { duration: h })} className={`w-9 h-6 rounded-md text-[10px] font-bold transition-all ${config.duration === h ? 'bg-white text-black' : 'glass-input text-white/60 hover:bg-white/10'}`}>{h}</button>
                        ))}
                        <button onClick={() => updateConfig(ch.channel_id, { duration: 0 })} className={`px-3 h-6 rounded-md text-[10px] font-bold transition-all ${config.duration === 0 ? 'bg-amber-400 text-black' : 'glass-input text-amber-400/60 hover:bg-amber-400/10 hover:text-amber-400'}`}>∞ Manual</button>
                      </div>
                      {config.duration === 0 && <span className="text-[9px] text-amber-400/70 bg-amber-400/5 border border-amber-400/20 px-2 py-0.5 rounded-full">Stream sampai distop manual · maks ~41 hari</span>}
                    </div>
                    <div className="mt-3 flex items-center gap-2 px-1">
                      <button onClick={() => updateConfig(ch.channel_id, { deleteAfterStream: !config.deleteAfterStream })} className={`relative w-9 h-5 rounded-full transition-all duration-300 flex-shrink-0 ${config.deleteAfterStream ? 'bg-red-500' : 'bg-white/10'}`}>
                        <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all duration-300 ${config.deleteAfterStream ? 'left-[18px]' : 'left-0.5'}`} />
                      </button>
                      <span className={`text-[10px] font-semibold ${config.deleteAfterStream ? 'text-red-400' : 'text-white/40'}`}>
                        {config.deleteAfterStream ? '🗑 Hapus video setelah streaming selesai' : 'Simpan video setelah streaming'}
                      </span>
                    </div>
                    <div className="mt-2 flex items-center gap-2 px-1">
                      <button onClick={() => updateConfig(ch.channel_id, { deleteVpsAfterStream: !config.deleteVpsAfterStream })} className={`relative w-9 h-5 rounded-full transition-all duration-300 flex-shrink-0 ${config.deleteVpsAfterStream ? 'bg-red-500' : 'bg-white/10'}`}>
                        <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all duration-300 ${config.deleteVpsAfterStream ? 'left-[18px]' : 'left-0.5'}`} />
                      </button>
                      <span className={`text-[10px] font-semibold ${config.deleteVpsAfterStream ? 'text-red-400' : 'text-white/40'}`}>
                        {config.deleteVpsAfterStream ? '🗑 Hapus semua aset (video, audio manual, thumbnail, judul & deskripsi)' : '💾 Semua aset tetap disimpan untuk dipakai ulang'}
                      </span>
                    </div>
                  </div>
                )}

                {isShowingSchedule && !isActiveOrStuck && (
                  <div className="glass-card-strong rounded-[20px] p-4 mb-2 border border-amber-500/20 mt-4 relative z-[40] animate-in slide-in-from-top-2">
                    <div className="flex flex-col sm:flex-row gap-4">
                      <div className="flex-1">
                         <label className="text-[10px] text-white/40 mb-1 block">Waktu (LA / Pacific Time)</label>
                         <input type="datetime-local" value={schedForm.datetime} onChange={e => setScheduleForm(prev => ({ ...prev, [ch.channel_id]: { ...schedForm, datetime: e.target.value } }))} className="w-full glass-input rounded-lg px-3 py-2 text-xs text-white outline-none focus:ring-1 focus:ring-amber-400/50" />
                      </div>
                      <div className="w-full sm:w-40">
                         <label className="text-[10px] text-white/40 mb-1 block">Siklus</label>
                         <select value={schedForm.repeat || 'none'} onChange={e => setScheduleForm(prev => ({ ...prev, [ch.channel_id]: { ...schedForm, repeat: e.target.value } }))} className="w-full glass-input rounded-lg px-3 py-2 text-xs text-white outline-none focus:ring-1 focus:ring-amber-400/50">
                           <option value="none">Satu Kali</option><option value="daily">Harian</option><option value="weekly">Mingguan</option>
                         </select>
                      </div>
                      <div className="flex items-end gap-2">
                         <button onClick={() => setShowScheduleFor(null)} className="px-4 py-2 rounded-lg text-xs font-semibold text-white/50 hover:bg-white/10 hover:text-white transition-colors">Batal</button>
                         <button onClick={() => scheduleStream(ch.channel_id)} disabled={loading} className="w-full sm:w-auto bg-amber-400 text-black px-4 py-2 rounded-lg text-xs font-bold hover:scale-95 transition-transform whitespace-nowrap">
                           Konfirmasi ({config.duration === 0 ? '∞ Manual' : `${config.duration} Jam`})
                         </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}