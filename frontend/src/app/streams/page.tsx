'use client';

import { useEffect, useState, useCallback } from 'react';

// --- INTERFACES ---
interface Channel { id: number; channel_id: string; name: string; google_refresh_token?: string; stream_status?: string; activeStreams: { streamId: string; elapsedSeconds: number }[]; }
interface Schedule { id: number; channel_id: string; channel_name: string; scheduled_at: string; duration_secs: number; title: string; status: string; repeat_type?: string; }
interface Folder { name: string; count: number; }
interface Asset { id: number; type: string; value: string; label: string; in_use?: boolean; }
interface MediaFile { filename: string; path: string; category?: string; }
interface SystemLog { id: number; channel_id: string; message: string; created_at: string; }
interface StreamConfig { folders: string[]; videoPath: string | null; songPath: string | null; thumbnailPath: string | null; titleId: number | null; descriptionId: number | null; auto: boolean; duration: number; }

// --- ICONS ---
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
const formatScheduleTime = (iso: string) => { const d = new Date(iso); const pad = (n: number) => String(n).padStart(2, '0'); return `${pad(d.getUTCDate())}/${pad(d.getUTCMonth()+1)} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC`; };
const getUTCDatetimeLocal = () => { const now = new Date(); now.setMinutes(now.getMinutes() + 5); const pad = (n: number) => String(n).padStart(2, '0'); return `${now.getUTCFullYear()}-${pad(now.getUTCMonth()+1)}-${pad(now.getUTCDate())}T${pad(now.getUTCHours())}:${pad(now.getUTCMinutes())}`; };
const getCountdown = (iso: string) => { const diff = new Date(iso).getTime() - Date.now(); if (diff <= 0) return 'Sesaat lagi'; const h = Math.floor(diff / 3600000); const m = Math.floor((diff % 3600000) / 60000); return h > 0 ? `${h}j ${m}m` : `${m}m`; };

const defaultConfig = (): StreamConfig => ({ folders: [], videoPath: null, songPath: null, thumbnailPath: null, titleId: null, descriptionId: null, auto: true, duration: 4 });

function UTCClock() {
  const [time, setTime] = useState(''); const [date, setDate] = useState('');
  useEffect(() => {
    const update = () => { const now = new Date(); setTime(now.toUTCString().slice(17, 25)); setDate(now.toUTCString().slice(0, 16)); };
    update(); const t = setInterval(update, 1000); return () => clearInterval(t);
  }, []);
  return (
    <div className="glass-card-strong rounded-full pl-2 pr-4 py-1.5 flex items-center gap-2">
      <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
      <span className="text-xs font-semibold tracking-wider text-white">{time}</span>
      <span className="text-[10px] text-white/50 hidden sm:inline-block">{date}</span>
    </div>
  );
}

function MediaDropdown({ label, options, value, onChange, placeholder, disabled }: { label: string; options: MediaFile[]; value: string | null; onChange: (path: string | null) => void; placeholder?: string; disabled?: boolean; }) {
  const [open, setOpen] = useState(false);
  const selected = options.find(o => o.path === value);
  return (
    <div className="relative flex flex-col gap-1.5">
      <div className="text-[10px] font-semibold text-white/40 uppercase tracking-widest pl-1">{label}</div>
      <button type="button" onClick={() => !disabled && setOpen(!open)} disabled={disabled}
        className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl transition-all duration-300 text-xs text-left backdrop-blur-md outline-none
          ${disabled ? "glass-input opacity-40 cursor-not-allowed" : open ? "glass-card-strong text-white shadow-xl ring-1 ring-white/20" : selected ? "glass-card-strong text-white" : "glass-input text-white/70 hover:bg-white/[0.08]"}`}>
        <span className="truncate pr-4">{selected ? selected.filename : (placeholder || '—')}</span>
        <span className={`transition-transform duration-300 text-white/40 flex-shrink-0 ${open ? 'rotate-180' : ''}`}><Icon.ChevronDown /></span>
      </button>
      {open && (
        <div className="absolute top-[calc(100%+6px)] left-0 w-full min-w-[220px] z-[99999] bg-[#111318] border border-white/10 shadow-[0_20px_60px_rgba(0,0,0,0.8)] rounded-xl p-1.5 max-h-64 overflow-y-auto flex flex-col gap-0.5 origin-top animate-in fade-in zoom-in-95">
          <button onClick={() => { onChange(null); setOpen(false); }} className="w-full text-left px-3 py-2 rounded-lg text-[11px] font-medium text-white/50 hover:bg-white/10 hover:text-white transition-colors">— Acak Otomatis —</button>
          {options.length === 0 && <div className="px-3 py-2 text-[11px] text-white/30">Kosong</div>}
          {options.map(opt => (
            <button key={opt.path} onClick={() => { onChange(opt.path); setOpen(false); }} className={`group w-full flex items-center justify-between px-3 py-2 rounded-lg transition-colors text-left text-[11px] font-medium ${opt.path === value ? 'bg-white text-black' : 'text-white/80 hover:bg-white/10'}`}>
              <span className="truncate pr-3">{opt.filename}</span>
              {opt.category && opt.category !== 'Uncategorized' && <span className={`flex-shrink-0 ml-2 text-[9px] px-1.5 py-0.5 rounded-md ${opt.path === value ? 'bg-black/10 text-black/60' : 'bg-white/10 text-white/50'}`}>{opt.category}</span>}
            </button>
          ))}
        </div>
      )}
      {open && <div className="fixed inset-0 z-[99998]" onClick={() => setOpen(false)} />}
    </div>
  );
}

function AssetDropdown({ label, options, value, onChange, onDelete, placeholder, disabled }: { label: string; options: Asset[]; value: number | null; onChange: (id: number | null) => void; onDelete: (id: number) => void; placeholder?: string; disabled?: boolean; }) {
  const [open, setOpen] = useState(false);
  const selected = options.find(o => o.id === value);
  return (
    <div className="relative flex flex-col gap-1.5">
      <div className="text-[10px] font-semibold text-white/40 uppercase tracking-widest pl-1">{label}</div>
      <button type="button" onClick={() => !disabled && setOpen(!open)} disabled={disabled}
        className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl transition-all duration-300 text-xs text-left backdrop-blur-md outline-none
          ${disabled ? "glass-input opacity-40 cursor-not-allowed" : open ? "glass-card-strong text-white shadow-xl ring-1 ring-white/20" : selected ? "glass-card-strong text-white" : "glass-input text-white/70 hover:bg-white/[0.08]"}`}>
        <span className="truncate pr-4">{selected ? selected.label : (placeholder || '—')}</span>
        <span className={`transition-transform duration-300 text-white/40 flex-shrink-0 ${open ? 'rotate-180' : ''}`}><Icon.ChevronDown /></span>
      </button>
      {open && (
        <div className="absolute top-[calc(100%+6px)] left-0 w-full min-w-[240px] z-[99999] bg-[#111318] border border-white/10 shadow-[0_20px_60px_rgba(0,0,0,0.8)] rounded-xl p-1.5 max-h-64 overflow-y-auto flex flex-col gap-0.5 origin-top animate-in fade-in zoom-in-95">
          <button onClick={() => { onChange(null); setOpen(false); }} className="w-full text-left px-3 py-2 rounded-lg text-[11px] font-medium text-white/50 hover:bg-white/10 hover:text-white transition-colors">— Acak Otomatis —</button>
          {options.length === 0 && <div className="px-3 py-2 text-[11px] text-white/30">Kosong</div>}
          {options.map(opt => (
            <div key={opt.id} className={`group flex items-center justify-between px-2 py-1.5 rounded-lg transition-colors ${opt.id === value ? 'bg-white text-black' : 'hover:bg-white/10 text-white/80'}`}>
              <button className="flex-1 text-left text-[11px] font-medium truncate pr-3" onClick={() => { onChange(opt.id); setOpen(false); }}>
                {opt.in_use && <span className="text-emerald-500 mr-1.5">●</span>} {opt.label || opt.value}
              </button>
              <button onClick={(e) => { e.stopPropagation(); onDelete(opt.id); }} className={`w-7 h-7 flex-shrink-0 flex items-center justify-center rounded-md transition-all ${opt.id === value ? 'text-black/40 hover:bg-black/10 hover:text-red-600' : 'text-white/30 opacity-0 group-hover:opacity-100 hover:bg-white/10 hover:text-red-400'}`}>
                <Icon.Trash />
              </button>
            </div>
          ))}
        </div>
      )}
      {open && <div className="fixed inset-0 z-[99998]" onClick={() => setOpen(false)} />}
    </div>
  );
}

export default function StreamsPage() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [systemLogs, setSystemLogs] = useState<SystemLog[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [thumbnails, setThumbnails] = useState<MediaFile[]>([]);
  const [videos, setVideos] = useState<MediaFile[]>([]);
  const [songs, setSongs] = useState<MediaFile[]>([]);
  const [titles, setTitles] = useState<Asset[]>([]);
  const [descriptions, setDescriptions] = useState<Asset[]>([]);
  const [newChannelName, setNewChannelName] = useState('');
  const [newRefreshToken, setNewRefreshToken] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [loading, setLoading] = useState(false);
  
  // FIX: Form jadwal sekarang tidak punya duration state sendiri. Dia akan merujuk ke Engine Config.
  const [scheduleForm, setScheduleForm] = useState<{ [key: string]: { datetime: string; repeat: string } }>({});
  const [showScheduleFor, setShowScheduleFor] = useState<string | null>(null);
  const [showConfigFor, setShowConfigFor] = useState<string | null>(null);
  const [streamConfigs, setStreamConfigs] = useState<{ [channelId: string]: StreamConfig }>({});
  const [editingTokenFor, setEditingTokenFor] = useState<string | null>(null);
  const [editTokenValue, setEditTokenValue] = useState('');
  const [countdown, setCountdown] = useState<{ [key: number]: string }>({});
  const [newAsset, setNewAsset] = useState<{ type: string; value: string; label: string }>({ type: 'title', value: '', label: '' });
  const [showAddAsset, setShowAddAsset] = useState(false);

  const fetchChannels = useCallback(async () => {
    try {
      const [chRes, stRes] = await Promise.all([ fetch('/api/channels'), fetch('/api/streams/status') ]);
      if (chRes.ok) {
        const chData = await chRes.json();
        const activeStreams: { streamId: string; channelId: string; elapsedSeconds: number }[] = stRes.ok ? await stRes.json() : [];
        const merged = chData.map((ch: Channel) => ({
          ...ch,
          stream_status: activeStreams.some(s => s.channelId === ch.channel_id) ? 'live' : 'stopped',
          activeStreams: activeStreams.filter(s => s.channelId === ch.channel_id).map(s => ({ streamId: s.streamId, elapsedSeconds: s.elapsedSeconds })),
        }));
        setChannels(merged);
      }
    } catch (err) {}
  }, []);

  const fetchSchedulesAndLogs = useCallback(async () => { 
    try { 
      const [resS, resL] = await Promise.all([fetch('/api/schedules'), fetch('/api/streams/logs')]);
      if (resS.ok) setSchedules(await resS.json()); 
      if (resL.ok) setSystemLogs(await resL.json());
    } catch (err) {} 
  }, []);

  const fetchAssets = useCallback(async () => {
    try {
      const [fRes, thRes, tiRes, dRes, mfRes] = await Promise.all([
        fetch('/api/assets/folders'), fetch('/api/thumbnails'), fetch('/api/assets/titles'), fetch('/api/assets/descriptions'), fetch('/api/assets/mediaFiles')
      ]);
      if (fRes.ok) { const d = await fRes.json(); setFolders(d.folders || []); }
      if (thRes.ok) { const d = await thRes.json(); setThumbnails((d.files || []).map((f: any) => ({ ...f, path: f.path || f.filename }))); }
      if (tiRes.ok) setTitles(await tiRes.json());
      if (dRes.ok) setDescriptions(await dRes.json());
      if (mfRes.ok) { const d = await mfRes.json(); setVideos(d.videos || []); setSongs(d.songs || []); }
    } catch (err) {}
  }, []);

  useEffect(() => { fetchChannels(); fetchSchedulesAndLogs(); fetchAssets(); const interval = setInterval(() => { fetchChannels(); fetchSchedulesAndLogs(); }, 10000); return () => clearInterval(interval); }, [fetchChannels, fetchSchedulesAndLogs, fetchAssets]);
  useEffect(() => { const update = () => { const counts: { [key: number]: string } = {}; schedules.filter(s => s.status === 'pending').forEach(s => { counts[s.id] = getCountdown(s.scheduled_at); }); setCountdown(counts); }; update(); const t = setInterval(update, 30000); return () => clearInterval(t); }, [schedules]);

  const getConfig = (channelId: string): StreamConfig => streamConfigs[channelId] || defaultConfig();
  const updateConfig = (channelId: string, patch: Partial<StreamConfig>) => { setStreamConfigs(prev => ({ ...prev, [channelId]: { ...getConfig(channelId), ...patch } })); };

  const startStream = async (channelId: string) => {
    const config = getConfig(channelId);
    setLoading(true);
    try {
      const payloadFolder = config.folders.length > 0 ? config.folders.join(',') : 'Semua';
      const body: Record<string, unknown> = { channelId, durationSecs: config.duration * 3600, folder: payloadFolder, auto: config.auto };
      if (!config.auto) {
        if (config.titleId) { const t = titles.find(x => x.id === config.titleId); if (t) body.title = t.value; }
        if (config.descriptionId) { const d = descriptions.find(x => x.id === config.descriptionId); if (d) body.description = d.value; }
        if (config.thumbnailPath) body.thumbnailPath = config.thumbnailPath;
        if (config.videoPath) body.videoPath = config.videoPath;
        if (config.songPath) body.songPath = config.songPath;
      }
      const res = await fetch('/api/streams/start', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (!res.ok) { const err = await res.json(); alert('Gagal start: ' + err.error); }
      await fetchChannels(); await fetchSchedulesAndLogs();
    } finally { setLoading(false); }
  };

  const stopStream = async (streamId: string) => { setLoading(true); try { await fetch('/api/streams/stop', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ streamId }) }); await fetchChannels(); } finally { setLoading(false); } };
  const addChannel = async () => { if (!newChannelName.trim() || !newRefreshToken.trim()) return; setLoading(true); try { const res = await fetch('/api/channels', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: newChannelName.trim(), refresh_token: newRefreshToken.trim() }) }); if (!res.ok) { const err = await res.json(); alert('Gagal: ' + err.error); } else { setNewChannelName(''); setNewRefreshToken(''); setShowAddForm(false); await fetchChannels(); } } finally { setLoading(false); } };
  const updateRefreshToken = async (channelId: string) => { if (!editTokenValue.trim()) return; try { const res = await fetch(`/api/channels/${channelId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refresh_token: editTokenValue.trim() }) }); if (!res.ok) { const err = await res.json(); alert('Gagal: ' + err.error); } else { setEditingTokenFor(null); setEditTokenValue(''); await fetchChannels(); } } catch (err) {} };
  const deleteChannel = async (channelId: string) => { if (!confirm(`Hapus channel ${channelId}?`)) return; await fetch(`/api/channels/${channelId}`, { method: 'DELETE' }); await fetchChannels(); };
  
  const scheduleStream = async (channelId: string) => {
    const form = scheduleForm[channelId];
    if (!form?.datetime) return alert('Pilih tanggal & jam dulu!');
    const scheduledAt = new Date(form.datetime + ':00Z').toISOString();
    if (new Date(scheduledAt) <= new Date()) return alert('Waktu sudah lewat!');
    const config = getConfig(channelId);
    setLoading(true);
    try {
      const payloadFolder = config.folders.length > 0 ? config.folders.join(',') : 'Semua';
      // FIX: Durasi sekarang 100% mengambil dari config.duration yang ada di "Engine Config"
      const body: Record<string, unknown> = { channelId, scheduledAt, durationSecs: config.duration * 3600, folder: payloadFolder, auto: config.auto, title: 'Lofi Jazz Radio', repeatType: form.repeat || 'none', videoPath: config.videoPath, songPath: config.songPath };
      if (!config.auto && config.titleId) { const t = titles.find(x => x.id === config.titleId); if (t) body.title = t.value; }
      const res = await fetch('/api/schedules', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (!res.ok) { const err = await res.json(); alert('Gagal schedule: ' + err.error); } else { setShowScheduleFor(null); await fetchSchedulesAndLogs(); }
    } finally { setLoading(false); }
  };
  
  const cancelSchedule = async (scheduleId: number) => { if (!confirm('Batalkan jadwal ini?')) return; await fetch(`/api/schedules/${scheduleId}`, { method: 'DELETE' }); await fetchSchedulesAndLogs(); };
  const addAsset = async () => { if (!newAsset.value.trim()) return; const res = await fetch('/api/assets', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: newAsset.type, value: newAsset.value.trim(), label: newAsset.label.trim() || newAsset.value.trim() }) }); if (res.ok) { setNewAsset({ type: 'title', value: '', label: '' }); setShowAddAsset(false); await fetchAssets(); } };
  const deleteAsset = async (id: number) => { await fetch(`/api/assets/${id}`, { method: 'DELETE' }); await fetchAssets(); };
  
  const initScheduleForm = (channelId: string) => { 
    if (!scheduleForm[channelId]) { setScheduleForm(prev => ({ ...prev, [channelId]: { datetime: getUTCDatetimeLocal(), repeat: 'none' } })); } 
    setShowScheduleFor(channelId); 
  };
  
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
            <UTCClock />
            <button onClick={() => setShowAddForm(!showAddForm)} className="bg-white text-black px-4 py-2 rounded-full text-xs font-semibold shadow-lg hover:scale-95 transition-transform duration-300 flex items-center gap-1.5">
              <Icon.Plus /> Channel
            </button>
          </div>
        </div>

        {showAddForm && (
          <div className="glass-card-strong rounded-2xl p-5 mb-6 animate-in fade-in slide-in-from-top-4 duration-500 relative z-[90]">
            <h3 className="text-sm font-semibold mb-3 text-white">Tambah Channel</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <input type="text" placeholder="Nama Channel" value={newChannelName} onChange={e => setNewChannelName(e.target.value)} className="glass-input rounded-xl px-3 py-2.5 text-xs text-white placeholder-white/30 focus:outline-none focus:ring-1 focus:ring-white/20 transition-all" />
              <input type="password" placeholder="Google Refresh Token" value={newRefreshToken} onChange={e => setNewRefreshToken(e.target.value)} className="glass-input rounded-xl px-3 py-2.5 text-xs text-white placeholder-white/30 focus:outline-none focus:ring-1 focus:ring-white/20 transition-all" />
            </div>
            <div className="flex gap-2 mt-4 justify-end">
              <button onClick={() => setShowAddForm(false)} className="px-4 py-2 rounded-full text-[11px] font-medium text-white/60 hover:text-white transition-colors">Batal</button>
              <button onClick={addChannel} disabled={loading || !newChannelName.trim() || !newRefreshToken.trim()} className="bg-white text-black px-5 py-2 rounded-full text-[11px] font-semibold disabled:opacity-50 hover:scale-95 transition-transform duration-300">Simpan</button>
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

        <div className="glass-card rounded-[20px] p-4 mb-6 relative z-[100]">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[11px] font-semibold text-white/50 uppercase tracking-widest">Global Assets</span>
            <button onClick={() => setShowAddAsset(!showAddAsset)} className="text-[10px] font-medium bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-full transition-colors">Tambah Text</button>
          </div>
          
          {showAddAsset && (
            <div className="glass-card-strong rounded-xl p-4 mb-3 flex flex-col sm:flex-row gap-3 animate-in slide-in-from-top-2">
              <div className="flex gap-1 bg-black/20 p-1 rounded-lg">
                {['title','description'].map(t => (
                  <button key={t} onClick={() => setNewAsset(p => ({...p, type: t}))} className={`px-3 py-1.5 rounded-md text-[11px] font-medium transition-all ${newAsset.type === t ? 'bg-white text-black' : 'text-white/50 hover:text-white'}`}>{t === 'title' ? 'Judul' : 'Desc'}</button>
                ))}
              </div>
              <input type="text" placeholder="Value..." value={newAsset.value} onChange={e => setNewAsset(p => ({...p, value: e.target.value}))} className="flex-1 glass-input rounded-lg px-3 py-1.5 text-[11px] outline-none focus:ring-1 focus:ring-white/20" />
              <input type="text" placeholder="Label" value={newAsset.label} onChange={e => setNewAsset(p => ({...p, label: e.target.value}))} className="w-24 glass-input rounded-lg px-3 py-1.5 text-[11px] outline-none focus:ring-1 focus:ring-white/20" />
              <button onClick={addAsset} className="bg-white text-black px-4 py-1.5 rounded-lg text-[11px] font-semibold hover:scale-95 transition-transform">Save</button>
            </div>
          )}

          {!showAddAsset && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="glass-input rounded-xl p-3 flex flex-col justify-center"><div className="text-[9px] text-white/40 uppercase mb-0.5 font-semibold">Video Loop</div><div className="text-sm font-medium text-white">{videos.length}</div></div>
              <div className="glass-input rounded-xl p-3 flex flex-col justify-center"><div className="text-[9px] text-white/40 uppercase mb-0.5 font-semibold">Audio/Musik</div><div className="text-sm font-medium text-white">{songs.length}</div></div>
              <AssetDropdown label="Judul" options={titles} value={null} onChange={()=>{}} onDelete={deleteAsset} placeholder="Kelola..." />
              <AssetDropdown label="Deskripsi" options={descriptions} value={null} onChange={()=>{}} onDelete={deleteAsset} placeholder="Kelola..." />
            </div>
          )}
        </div>

        <div className="space-y-4 relative z-[10]">
          {channels.map(ch => {
            const config = getConfig(ch.channel_id);
            const schedForm = scheduleForm[ch.channel_id] || { datetime: getUTCDatetimeLocal(), repeat: 'none' };
            const isShowingConfig = showConfigFor === ch.channel_id;
            const isShowingSchedule = showScheduleFor === ch.channel_id;
            const hasToken = !!ch.google_refresh_token;
            const isLive = ch.stream_status === 'live';

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
                        {hasToken ? <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_5px_#34d399]"/> : <span className="w-1.5 h-1.5 rounded-full bg-red-500 shadow-[0_0_5px_#ef4444]"/>}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 relative z-[30]">
                    {isLive && <div className="px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] font-bold tracking-widest uppercase animate-pulse flex items-center gap-1.5"><div className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> LIVE</div>}
                    
                    <div className="flex items-center gap-1.5 bg-black/20 p-1 rounded-full border border-white/5">
                       {!isLive && (
                         <button onClick={() => startStream(ch.channel_id)} disabled={loading || !hasToken} className="bg-white text-black px-4 py-1.5 rounded-full text-[11px] font-bold hover:scale-95 transition-all disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-1">
                           <Icon.Play /> Start
                         </button>
                       )}
                       <button onClick={() => setShowConfigFor(isShowingConfig ? null : ch.channel_id)} className={`px-3 py-1.5 rounded-full text-[11px] font-semibold transition-all flex items-center gap-1 ${isShowingConfig ? 'bg-white/20 text-white' : 'text-white/60 hover:bg-white/10 hover:text-white'}`}>
                         <Icon.Settings /> Conf
                       </button>
                       {!isLive && (
                         <button onClick={() => isShowingSchedule ? setShowScheduleFor(null) : initScheduleForm(ch.channel_id)} disabled={!hasToken} className={`px-3 py-1.5 rounded-full text-[11px] font-semibold transition-all flex items-center gap-1 ${isShowingSchedule ? 'bg-amber-400/20 text-amber-400' : 'text-amber-400/70 hover:bg-amber-400/10 hover:text-amber-400 disabled:opacity-30'}`}>
                           <Icon.Clock /> Sched
                         </button>
                       )}
                    </div>

                    <button onClick={() => deleteChannel(ch.channel_id)} className="w-8 h-8 rounded-full glass-input flex items-center justify-center text-white/30 hover:text-red-400 hover:bg-white/10 transition-colors"><Icon.Trash /></button>
                  </div>
                </div>

                {!hasToken && (
                  <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 mb-4 flex items-center justify-between text-xs relative z-[20]">
                    <span className="font-medium text-amber-400">Butuh Otorisasi YouTube.</span>
                    <button onClick={() => { setEditingTokenFor(ch.channel_id); setEditTokenValue(''); }} className="bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 px-3 py-1.5 rounded-full font-bold transition-colors">Setup</button>
                  </div>
                )}
                {editingTokenFor === ch.channel_id && (
                  <div className="glass-card-strong rounded-xl p-3 mb-4 flex items-center gap-2 animate-in fade-in zoom-in-95 relative z-[20]">
                    <input type="password" value={editTokenValue} onChange={e => setEditTokenValue(e.target.value)} placeholder="Paste token..." className="flex-1 glass-input rounded-lg px-3 py-1.5 text-xs outline-none focus:ring-1 focus:ring-white/30" />
                    <button onClick={() => updateRefreshToken(ch.channel_id)} disabled={!editTokenValue.trim()} className="bg-white text-black px-4 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-50">Save</button>
                    <button onClick={() => setEditingTokenFor(null)} className="text-white/50 px-2 text-xs hover:text-white">Batal</button>
                  </div>
                )}

                {ch.activeStreams?.length > 0 && (
                  <div className="mb-4 space-y-2 relative z-[20]">
                    {ch.activeStreams.map(s => (
                      <div key={s.streamId} className="glass-card-strong rounded-xl p-3 flex items-center justify-between bg-emerald-500/5 border border-emerald-500/10">
                        <div className="flex items-center gap-3">
                          <span className="text-emerald-400 text-xs font-semibold tabular-nums bg-emerald-400/10 px-2 py-1 rounded-md">{formatElapsed(s.elapsedSeconds)}</span>
                          <span className="text-[10px] text-emerald-400/50 font-mono hidden sm:inline-block">({s.streamId.slice(0, 8)})</span>
                        </div>
                        <button onClick={() => stopStream(s.streamId)} disabled={loading} className="bg-red-500/10 hover:bg-red-500/20 text-red-400 px-4 py-1.5 rounded-lg text-[10px] font-bold tracking-widest uppercase transition-colors flex items-center gap-1.5">
                          <Icon.Stop /> Stop
                        </button>
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
                    
                    <div className="mb-4">
                      <div className="text-[10px] text-white/40 mb-1.5">Kategori Playlist (Multi):</div>
                      <div className="flex flex-wrap gap-1.5">
                        <button onClick={() => updateConfig(ch.channel_id, { folders: [] })} className={`px-3 py-1 rounded-lg text-[10px] font-semibold transition-all ${config.folders.length === 0 ? 'bg-white text-black' : 'glass-input text-white/60 hover:bg-white/10'}`}>Semua</button>
                        {folders.map(f => {
                          const isSelected = config.folders.includes(f.name);
                          return (
                            <button key={f.name} onClick={() => {
                              const newFolders = isSelected ? config.folders.filter(x => x !== f.name) : [...config.folders, f.name];
                              updateConfig(ch.channel_id, { folders: newFolders });
                            }} className={`px-3 py-1 rounded-lg text-[10px] font-semibold transition-all ${isSelected ? 'bg-white text-black' : 'glass-input text-white/60 hover:bg-white/10'}`}>{f.name}</button>
                          );
                        })}
                      </div>
                    </div>
                    
                    {!config.auto && (
                      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 bg-black/20 p-3 rounded-xl border border-white/5">
                        <MediaDropdown label="Video" options={videos} value={config.videoPath} onChange={path => updateConfig(ch.channel_id, { videoPath: path })} />
                        <MediaDropdown label="Lagu" options={config.folders.length > 0 ? songs.filter(s => s.category && config.folders.includes(s.category)) : songs} value={config.songPath} onChange={path => updateConfig(ch.channel_id, { songPath: path })} />
                        <AssetDropdown label="Judul" options={titles} value={config.titleId} onChange={id => updateConfig(ch.channel_id, { titleId: id })} onDelete={deleteAsset} />
                        <AssetDropdown label="Desc" options={descriptions} value={config.descriptionId} onChange={id => updateConfig(ch.channel_id, { descriptionId: id })} onDelete={deleteAsset} />
                      </div>
                    )}

                    <div className="mt-4 flex items-center gap-2">
                       <span className="text-[10px] text-white/40">Durasi (Jam):</span>
                       <div className="flex flex-wrap gap-1">
                        {[1,2,3,4].map(h => (
                          <button key={h} onClick={() => updateConfig(ch.channel_id, { duration: h })} className={`w-8 h-6 rounded-md text-[10px] font-bold transition-all ${config.duration === h ? 'bg-white text-black' : 'glass-input text-white/60 hover:bg-white/10'}`}>{h}</button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* SCHEDULE PANEL: HANYA ADA WAKTU & SIKLUS (DURASI IKUT CONFIG) */}
                {isShowingSchedule && !isLive && (
                  <div className="glass-card-strong rounded-[20px] p-4 mb-2 border border-amber-500/20 mt-4 relative z-[40] animate-in slide-in-from-top-2">
                    <div className="flex flex-col sm:flex-row gap-4">
                      <div className="flex-1">
                         <label className="text-[10px] text-white/40 mb-1 block">Waktu (UTC)</label>
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
                           Konfirmasi ({config.duration} Jam)
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
