'use client';

import { useEffect, useState, useCallback } from 'react';

interface Channel { id: number; channel_id: string; name: string; google_refresh_token?: string; stream_status?: string; activeStreams: { streamId: string; elapsedSeconds: number }[]; }
interface Schedule { id: number; channel_id: string; channel_name: string; scheduled_at: string; duration_secs: number; title: string; status: string; repeat_type?: string; }
interface Folder { name: string; count: number; }
interface Asset { id: number; type: string; value: string; label: string; in_use?: boolean; }
interface MediaFile { filename: string; path: string; category?: string; }

interface StreamConfig { folder: string; videoPath: string | null; songPath: string | null; thumbnailPath: string | null; titleId: number | null; descriptionId: number | null; auto: boolean; duration: number; }

function UTCClock() {
  const [time, setTime] = useState(''); const [date, setDate] = useState('');
  useEffect(() => {
    const update = () => { const now = new Date(); setTime(now.toUTCString().slice(17, 25)); setDate(now.toUTCString().slice(0, 16)); };
    update(); const t = setInterval(update, 1000); return () => clearInterval(t);
  }, []);
  return (
    <div className="flex items-center gap-2 bg-[#0a0c0f] border border-[#2a2e38] rounded px-3 py-1.5">
      <span className="text-[10px] text-[#6b7280] font-mono uppercase tracking-widest">UTC</span>
      <span className="text-sm font-mono text-[#c8f55a] tabular-nums">{time}</span>
      <span className="text-xs font-mono text-[#6b7280]">{date}</span>
    </div>
  );
}

function formatElapsed(secs: number) { const h = Math.floor(secs / 3600); const m = Math.floor((secs % 3600) / 60); const s = secs % 60; return `${h}j ${m}m ${s}d`; }
function formatScheduleTime(iso: string) { const d = new Date(iso); const pad = (n: number) => String(n).padStart(2, '0'); return `${d.getUTCFullYear()}-${pad(d.getUTCMonth()+1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC`; }
function getUTCDatetimeLocal() { const now = new Date(); now.setMinutes(now.getMinutes() + 5); const pad = (n: number) => String(n).padStart(2, '0'); return `${now.getUTCFullYear()}-${pad(now.getUTCMonth()+1)}-${pad(now.getUTCDate())}T${pad(now.getUTCHours())}:${pad(now.getUTCMinutes())}`; }
function getCountdown(iso: string) { const diff = new Date(iso).getTime() - Date.now(); if (diff <= 0) return 'sebentar lagi...'; const h = Math.floor(diff / 3600000); const m = Math.floor((diff % 3600000) / 60000); if (h > 0) return `${h}j ${m}m lagi`; return `${m}m lagi`; }

const repeatLabel: Record<string, string> = { daily: 'Harian', weekly: 'Mingguan', monthly: 'Bulanan' };
const defaultConfig = (): StreamConfig => ({ folder: 'default', videoPath: null, songPath: null, thumbnailPath: null, titleId: null, descriptionId: null, auto: true, duration: 4 });

function MediaDropdown({ label, options, value, onChange, placeholder, disabled }: { label: string; options: MediaFile[]; value: string | null; onChange: (path: string | null) => void; placeholder?: string; disabled?: boolean; }) {
  const [open, setOpen] = useState(false);
  const selected = options.find(o => o.path === value);
  return (
    <div className="relative">
      <div className="text-[10px] text-[#6b7280] font-mono mb-1">{label}</div>
      <button type="button" onClick={() => !disabled && setOpen(!open)} disabled={disabled}
        className={`w-full flex items-center justify-between px-3 py-2 rounded border text-xs font-mono transition-colors text-left
          ${disabled ? 'border-[#1a1d24] text-[#3a3e48] cursor-not-allowed bg-transparent' : open ? 'border-[#c8f55a] text-[#c8f55a] bg-[#0a1500]' : selected ? 'border-[#2a4a1a] text-[#e8e6e0] bg-[#0d0f12]' : 'border-[#2a2e38] text-[#6b7280] bg-transparent hover:border-[#3a3e48]'}`}>
        <span className="truncate">{selected ? selected.filename : (placeholder || '— pilih manual —')}</span>
        <span className="ml-2 flex-shrink-0 text-[#6b7280]">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="absolute z-50 w-full mt-1 bg-[#111318] border border-[#2a2e38] rounded shadow-lg max-h-48 overflow-y-auto">
          <button onClick={() => { onChange(null); setOpen(false); }} className="w-full text-left px-3 py-2 text-xs font-mono text-[#6b7280] hover:bg-[#1a1d24] border-b border-[#1a1d24]">— acak otomatis —</button>
          {options.length === 0 && <div className="px-3 py-2 text-xs font-mono text-[#3a3e48]">Tidak ada file</div>}
          {options.map(opt => (
            <button key={opt.path} className={`w-full flex items-center justify-between px-3 py-2 hover:bg-[#1a1d24] text-left text-xs font-mono truncate ${opt.path === value ? 'bg-[#0a1500] text-[#c8f55a]' : 'text-[#e8e6e0]'}`} onClick={() => { onChange(opt.path); setOpen(false); }}>
              <span className="truncate">{opt.filename}</span>
              {opt.category && opt.category !== 'Uncategorized' && <span className="ml-2 text-[9px] text-[#6b7280] bg-[#1a1d24] px-1.5 py-0.5 rounded">{opt.category}</span>}
            </button>
          ))}
        </div>
      )}
      {open && <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />}
    </div>
  );
}

function AssetDropdown({ label, options, value, onChange, onDelete, placeholder, disabled }: { label: string; options: Asset[]; value: number | null; onChange: (id: number | null) => void; onDelete: (id: number) => void; placeholder?: string; disabled?: boolean; }) {
  const [open, setOpen] = useState(false);
  const selected = options.find(o => o.id === value);
  return (
    <div className="relative">
      <div className="text-[10px] text-[#6b7280] font-mono mb-1">{label}</div>
      <button type="button" onClick={() => !disabled && setOpen(!open)} disabled={disabled}
        className={`w-full flex items-center justify-between px-3 py-2 rounded border text-xs font-mono transition-colors text-left
          ${disabled ? 'border-[#1a1d24] text-[#3a3e48] cursor-not-allowed bg-transparent' : open ? 'border-[#c8f55a] text-[#c8f55a] bg-[#0a1500]' : selected ? 'border-[#2a4a1a] text-[#e8e6e0] bg-[#0d0f12]' : 'border-[#2a2e38] text-[#6b7280] bg-transparent hover:border-[#3a3e48]'}`}>
        <span className="truncate">{selected ? selected.label : (placeholder || '— pilih manual —')}</span>
        <span className="ml-2 flex-shrink-0 text-[#6b7280]">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="absolute z-50 w-full mt-1 bg-[#111318] border border-[#2a2e38] rounded shadow-lg max-h-48 overflow-y-auto">
          <button onClick={() => { onChange(null); setOpen(false); }} className="w-full text-left px-3 py-2 text-xs font-mono text-[#6b7280] hover:bg-[#1a1d24] border-b border-[#1a1d24]">— tidak dipilih —</button>
          {options.length === 0 && <div className="px-3 py-2 text-xs font-mono text-[#3a3e48]">Belum ada data</div>}
          {options.map(opt => (
            <div key={opt.id} className={`flex items-center justify-between px-3 py-2 hover:bg-[#1a1d24] ${opt.id === value ? 'bg-[#0a1500]' : ''}`}>
              <button className={`flex-1 text-left text-xs font-mono truncate ${opt.id === value ? 'text-[#c8f55a]' : 'text-[#e8e6e0]'}`} onClick={() => { onChange(opt.id); setOpen(false); }}>
                {opt.in_use && <span className="text-[#5af5c8] mr-1">●</span>} {opt.label || opt.value}
              </button>
              <button onClick={(e) => { e.stopPropagation(); onDelete(opt.id); }} className="ml-2 text-[#3a3e48] hover:text-[#f5655a] text-[10px] flex-shrink-0">✕</button>
            </div>
          ))}
        </div>
      )}
      {open && <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />}
    </div>
  );
}

export default function StreamsPage() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [thumbnails, setThumbnails] = useState<MediaFile[]>([]);
  const [videos, setVideos] = useState<MediaFile[]>([]);
  const [songs, setSongs] = useState<MediaFile[]>([]);
  const [titles, setTitles] = useState<Asset[]>([]);
  const [descriptions, setDescriptions] = useState<Asset[]>([]);
  const [newChannelName, setNewChannelName] = useState('');
  const [newRefreshToken, setNewRefreshToken] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const [loading, setLoading] = useState(false);
  
  const [scheduleForm, setScheduleForm] = useState<{ [key: string]: { datetime: string; duration: number; repeat: string } }>({});
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

  const fetchSchedules = useCallback(async () => { try { const res = await fetch('/api/schedules'); if (res.ok) setSchedules(await res.json()); } catch (err) {} }, []);

  const fetchAssets = useCallback(async () => {
    try {
      const [fRes, thRes, tiRes, dRes, mfRes] = await Promise.all([
        fetch('/api/assets/folders'), fetch('/api/thumbnails'), fetch('/api/assets/titles'), fetch('/api/assets/descriptions'), fetch('/api/assets/mediaFiles')
      ]);
      if (fRes.ok) { const d = await fRes.json(); setFolders(d.folders || []); }
      if (thRes.ok) { const d = await thRes.json(); setThumbnails(d.files || []); }
      if (tiRes.ok) setTitles(await tiRes.json());
      if (dRes.ok) setDescriptions(await dRes.json());
      if (mfRes.ok) { const d = await mfRes.json(); setVideos(d.videos || []); setSongs(d.songs || []); }
    } catch (err) {}
  }, []);

  useEffect(() => { fetchChannels(); fetchSchedules(); fetchAssets(); const interval = setInterval(() => { fetchChannels(); fetchSchedules(); }, 10000); return () => clearInterval(interval); }, [fetchChannels, fetchSchedules, fetchAssets]);
  useEffect(() => { const update = () => { const counts: { [key: number]: string } = {}; schedules.filter(s => s.status === 'pending').forEach(s => { counts[s.id] = getCountdown(s.scheduled_at); }); setCountdown(counts); }; update(); const t = setInterval(update, 30000); return () => clearInterval(t); }, [schedules]);

  const getConfig = (channelId: string): StreamConfig => streamConfigs[channelId] || defaultConfig();
  const updateConfig = (channelId: string, patch: Partial<StreamConfig>) => { setStreamConfigs(prev => ({ ...prev, [channelId]: { ...getConfig(channelId), ...patch } })); };

  const startStream = async (channelId: string) => {
    const config = getConfig(channelId);
    setLoading(true);
    try {
      const body: Record<string, unknown> = { channelId, durationSecs: config.duration * 3600, folder: config.folder, auto: config.auto };
      if (!config.auto) {
        if (config.titleId) { const t = titles.find(x => x.id === config.titleId); if (t) body.title = t.value; }
        if (config.descriptionId) { const d = descriptions.find(x => x.id === config.descriptionId); if (d) body.description = d.value; }
        if (config.thumbnailPath) body.thumbnailPath = config.thumbnailPath;
        if (config.videoPath) body.videoPath = config.videoPath;
        if (config.songPath) body.songPath = config.songPath;
      }
      const res = await fetch('/api/streams/start', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (!res.ok) { const err = await res.json(); alert('Gagal start: ' + err.error); }
      await fetchChannels();
    } finally { setLoading(false); }
  };

  const stopStream = async (streamId: string) => { setLoading(true); try { await fetch('/api/streams/stop', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ streamId }) }); await fetchChannels(); } finally { setLoading(false); } };

  const addChannel = async () => {
    if (!newChannelName.trim() || !newRefreshToken.trim()) return;
    setLoading(true);
    try {
      const res = await fetch('/api/channels', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: newChannelName.trim(), refresh_token: newRefreshToken.trim() }) });
      if (!res.ok) { const err = await res.json(); alert('Gagal: ' + err.error); } else { setNewChannelName(''); setNewRefreshToken(''); setShowAddForm(false); await fetchChannels(); }
    } finally { setLoading(false); }
  };

  const updateRefreshToken = async (channelId: string) => {
    if (!editTokenValue.trim()) return;
    try {
      const res = await fetch(`/api/channels/${channelId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refresh_token: editTokenValue.trim() }) });
      if (!res.ok) { const err = await res.json(); alert('Gagal: ' + err.error); } else { setEditingTokenFor(null); setEditTokenValue(''); await fetchChannels(); }
    } catch (err) {}
  };

  const deleteChannel = async (channelId: string) => { if (!confirm(`Hapus channel ${channelId}?`)) return; await fetch(`/api/channels/${channelId}`, { method: 'DELETE' }); await fetchChannels(); };

  const scheduleStream = async (channelId: string) => {
    const form = scheduleForm[channelId];
    if (!form?.datetime) return alert('Pilih tanggal & jam dulu!');
    const scheduledAt = new Date(form.datetime + ':00Z').toISOString();
    if (new Date(scheduledAt) <= new Date()) return alert('Waktu sudah lewat!');
    const config = getConfig(channelId);
    setLoading(true);
    try {
      const body: Record<string, unknown> = {
        channelId, scheduledAt, durationSecs: (form.duration || 4) * 3600, 
        folder: config.folder, auto: config.auto, title: 'Lofi Jazz Radio - Live Stream', repeatType: form.repeat || 'none',
        videoPath: config.videoPath, songPath: config.songPath
      };
      if (!config.auto && config.titleId) { const t = titles.find(x => x.id === config.titleId); if (t) body.title = t.value; }
      const res = await fetch('/api/schedules', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (!res.ok) { const err = await res.json(); alert('Gagal schedule: ' + err.error); } else { setShowScheduleFor(null); await fetchSchedules(); }
    } finally { setLoading(false); }
  };

  const cancelSchedule = async (scheduleId: number) => {
    if (!confirm('Yakin ingin membatalkan/menghapus schedule ini?')) return;
    await fetch(`/api/schedules/${scheduleId}`, { method: 'DELETE' });
    await fetchSchedules();
  };

  const addAsset = async () => {
    if (!newAsset.value.trim()) return;
    const res = await fetch('/api/assets', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: newAsset.type, value: newAsset.value.trim(), label: newAsset.label.trim() || newAsset.value.trim() }) });
    if (res.ok) { setNewAsset({ type: 'title', value: '', label: '' }); setShowAddAsset(false); await fetchAssets(); }
  };

  const deleteAsset = async (id: number) => { await fetch(`/api/assets/${id}`, { method: 'DELETE' }); await fetchAssets(); };

  const initScheduleForm = (channelId: string) => { if (!scheduleForm[channelId]) { setScheduleForm(prev => ({ ...prev, [channelId]: { datetime: getUTCDatetimeLocal(), duration: 4, repeat: 'none' } })); } setShowScheduleFor(channelId); };

  const pendingSchedules = schedules.filter(s => s.status === 'pending');
  const recentSchedules = schedules.filter(s => s.status !== 'pending');

  return (
    <>
      <div className="p-6 max-w-4xl mx-auto">
        {pendingSchedules.length > 0 && (
          <div className="bg-[#111318] border border-[#f5c85a33] rounded-lg p-4 mb-5">
            <div className="text-[10px] text-[#f5c85a] uppercase tracking-widest font-mono mb-3">⏰ Scheduled Streams ({pendingSchedules.length})</div>
            <div className="flex flex-col gap-2">
              {pendingSchedules.map(s => (
                <div key={s.id} className="flex items-center justify-between bg-[#0d0f12] rounded px-3 py-2.5">
                  <div className="flex items-center gap-3">
                    <div className="w-1.5 h-1.5 rounded-full bg-[#f5c85a] animate-pulse" />
                    <div>
                      <div className="text-xs font-mono text-[#e8e6e0]">{s.channel_name}</div>
                      <div className="text-[10px] font-mono text-[#6b7280]">
                        {formatScheduleTime(s.scheduled_at)} · {Math.round(s.duration_secs / 3600)}j
                        {s.repeat_type && s.repeat_type !== 'none' && ` · 🔁 ${repeatLabel[s.repeat_type]}`}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-[10px] font-mono text-[#f5c85a]">{countdown[s.id] || getCountdown(s.scheduled_at)}</span>
                    <button onClick={() => cancelSchedule(s.id)} className="text-[10px] text-[#f5655a] border border-[#f5655a33] px-2 py-1 rounded hover:bg-[#1a0a0a] font-mono transition-colors">✕ Cancel Jadwal</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {recentSchedules.length > 0 && (
          <div className="bg-[#111318] border border-[#2a2e38] rounded-lg p-4 mb-5">
            <div className="text-[10px] text-[#6b7280] uppercase tracking-widest font-mono mb-3">Riwayat Schedule (24 jam terakhir)</div>
            <div className="flex flex-col gap-1">
              {recentSchedules.map(s => (
                <div key={s.id} className="flex items-center justify-between px-3 py-2 rounded hover:bg-[#0d0f12]">
                  <div className="flex items-center gap-3">
                    <span className={`text-[10px] font-mono px-2 py-0.5 rounded ${s.status === 'done' ? 'bg-[#0a1a0a] text-[#5af5c8] border border-[#1a3a1a]' : s.status === 'failed' ? 'bg-[#1a0a0a] text-[#f5655a] border border-[#3a1a1a]' : 'bg-[#1a1500] text-[#f5c85a] border border-[#3a2a00]'}`}>{s.status}</span>
                    <span className="text-xs font-mono text-[#6b7280]">{s.channel_name}</span>
                  </div>
                  <span className="text-[10px] font-mono text-[#3a3e48]">{formatScheduleTime(s.scheduled_at)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="bg-[#111318] border border-[#2a2e38] rounded-lg p-4 mb-5">
          <div className="flex items-center justify-between mb-3">
            <div className="text-[10px] text-[#6b7280] uppercase tracking-widest font-mono">Asset Manager <span className="ml-2 text-[#3a3e48]">({titles.length} title · {descriptions.length} desc)</span></div>
            <button onClick={() => setShowAddAsset(!showAddAsset)} className="text-[10px] font-mono text-[#c8f55a] border border-[#c8f55a33] px-2 py-1 rounded hover:bg-[#0a1a00]">+ Tambah</button>
          </div>

          {showAddAsset && (
            <div className="bg-[#0d0f12] border border-[#2a2e38] rounded p-3 flex flex-col gap-2">
              <div className="flex gap-2">
                {['title','description'].map(t => (
                  <button key={t} onClick={() => setNewAsset(p => ({...p, type: t}))} className={`text-[10px] font-mono px-2 py-1 rounded transition-colors ${newAsset.type === t ? 'bg-[#c8f55a] text-[#0a0c0f]' : 'border border-[#2a2e38] text-[#6b7280] hover:text-[#e8e6e0]'}`}>{t}</button>
                ))}
              </div>
              <input type="text" placeholder={newAsset.type === 'title' ? 'Lofi Jazz Radio ☕' : 'Deskripsi stream...'} value={newAsset.value} onChange={e => setNewAsset(p => ({...p, value: e.target.value}))} className="w-full bg-[#0a0c0f] border border-[#2a2e38] rounded px-3 py-2 text-xs font-mono focus:border-[#c8f55a] outline-none" />
              <input type="text" placeholder="Label (opsional)" value={newAsset.label} onChange={e => setNewAsset(p => ({...p, label: e.target.value}))} className="w-full bg-[#0a0c0f] border border-[#2a2e38] rounded px-3 py-2 text-xs font-mono focus:border-[#c8f55a] outline-none" />
              <div className="flex gap-2">
                <button onClick={addAsset} className="flex-1 py-1.5 bg-[#c8f55a] text-[#0a0c0f] rounded text-xs font-bold font-mono">Simpan</button>
                <button onClick={() => setShowAddAsset(false)} className="px-3 border border-[#2a2e38] rounded text-xs font-mono text-[#6b7280]">Batal</button>
              </div>
            </div>
          )}

          {!showAddAsset && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="relative"><div className="text-[10px] text-[#6b7280] font-mono mb-1">Thumbnails</div><div className="text-xs font-mono text-[#6b7280] px-3 py-2 border border-[#2a2e38] rounded bg-[#0a0c0f] truncate">{thumbnails.length} files tersedia</div></div>
              <div className="relative"><div className="text-[10px] text-[#6b7280] font-mono mb-1">Video / Musik</div><div className="text-xs font-mono text-[#6b7280] px-3 py-2 border border-[#2a2e38] rounded bg-[#0a0c0f] truncate">{videos.length} Vid / {songs.length} Lag</div></div>
              <AssetDropdown label={`Titles (${titles.length})`} options={titles} value={null} onChange={() => {}} onDelete={deleteAsset} placeholder="— kelola —" />
              <AssetDropdown label={`Descriptions (${descriptions.length})`} options={descriptions} value={null} onChange={() => {}} onDelete={deleteAsset} placeholder="— kelola —" />
            </div>
          )}
        </div>

        <div className="flex items-center justify-between mb-5">
          <div className="text-[10px] text-[#6b7280] uppercase tracking-widest font-mono">{channels.length} channel · {channels.filter(c => c.stream_status === 'live').length} live sekarang</div>
          <button onClick={() => setShowAddForm(!showAddForm)} className="text-xs px-4 py-2 rounded border border-[#c8f55a] text-[#c8f55a] hover:bg-[#c8f55a] hover:text-[#0a0c0f] transition-colors font-mono">+ Tambah Channel</button>
        </div>

        {showAddForm && (
          <div className="bg-[#111318] border border-[#2a2e38] rounded-lg p-5 mb-5">
            <div className="text-[10px] text-[#6b7280] uppercase tracking-widest font-mono mb-4">Channel Baru</div>
            <div className="flex flex-col gap-3">
              <div>
                <label className="text-[10px] text-[#6b7280] font-mono block mb-1">Nama Channel</label>
                <input type="text" placeholder="contoh: Lofi Jazz Monet" value={newChannelName} onChange={e => setNewChannelName(e.target.value)} className="w-full bg-[#0a0c0f] border border-[#2a2e38] rounded px-3 py-2 text-sm font-mono focus:border-[#c8f55a] outline-none" />
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[10px] text-[#6b7280] font-mono">Google Refresh Token <span className="text-[#f5655a]">*</span></label>
                  <a href="/oauth-helper" target="_blank" className="text-[10px] text-[#c8f55a] font-mono hover:underline">Belum punya? Generate di sini →</a>
                </div>
                <div className="relative">
                  <input type={showToken ? 'text' : 'password'} placeholder="1//0g..." value={newRefreshToken} onChange={e => setNewRefreshToken(e.target.value)} className="w-full bg-[#0a0c0f] border border-[#2a2e38] rounded px-3 py-2 text-sm font-mono focus:border-[#c8f55a] outline-none pr-20" />
                  <button onClick={() => setShowToken(!showToken)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-[#6b7280] hover:text-[#e8e6e0] font-mono">{showToken ? 'sembunyikan' : 'tampilkan'}</button>
                </div>
              </div>
            </div>
            <div className="flex gap-3 mt-4">
              <button onClick={addChannel} disabled={loading || !newChannelName.trim() || !newRefreshToken.trim()} className="flex-1 py-2 bg-[#c8f55a] text-[#0a0c0f] rounded text-xs font-bold font-mono disabled:opacity-40 hover:bg-[#b8e54a] transition-colors">Simpan Channel</button>
              <button onClick={() => { setShowAddForm(false); setNewChannelName(''); setNewRefreshToken(''); }} className="px-4 py-2 border border-[#2a2e38] rounded text-xs font-mono text-[#6b7280]">Batal</button>
            </div>
          </div>
        )}

        <div className="flex flex-col gap-4">
          {channels.length === 0 && <div className="bg-[#111318] border border-[#2a2e38] rounded-lg p-8 text-center text-[#6b7280] text-sm font-mono">Belum ada channel.</div>}
          {channels.map(ch => {
            const config = getConfig(ch.channel_id);
            const schedForm = scheduleForm[ch.channel_id] || { datetime: getUTCDatetimeLocal(), duration: 4, repeat: 'none' };
            const isShowingSchedule = showScheduleFor === ch.channel_id;
            const isShowingConfig = showConfigFor === ch.channel_id;
            const hasToken = !!ch.google_refresh_token;
            const isLive = ch.stream_status === 'live';
            const chSchedule = pendingSchedules.find(s => s.channel_id === ch.channel_id);

            return (
              <div key={ch.channel_id} className={`bg-[#111318] border rounded-lg p-5 transition-colors ${isLive ? 'border-[#c8f55a]' : 'border-[#2a2e38]'}`}>
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <div className="font-semibold">{ch.name}</div>
                    <div className="text-xs text-[#6b7280] font-mono mt-0.5">{ch.channel_id}</div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className={`text-[10px] font-mono px-2 py-0.5 rounded ${hasToken ? 'bg-[#0a1a0a] text-[#5af5c8] border border-[#1a3a1a]' : 'bg-[#1a0a0a] text-[#f5655a] border border-[#3a1a1a]'}`}>{hasToken ? '✓ token' : '✗ no token'}</div>
                    {isLive && <div className="flex items-center gap-1.5 text-[#f5655a] text-xs font-mono"><span className="w-2 h-2 rounded-full bg-[#f5655a] animate-pulse" />LIVE</div>}
                    {chSchedule && !isLive && <div className="flex items-center gap-1.5 text-[#f5c85a] text-xs font-mono"><span className="w-2 h-2 rounded-full bg-[#f5c85a] animate-pulse" />SCHEDULED</div>}
                    <button onClick={() => deleteChannel(ch.channel_id)} className="text-[#6b7280] hover:text-[#f5655a] text-xs font-mono">Hapus</button>
                  </div>
                </div>

                {!hasToken && (
                  <div className="bg-[#1a0e00] border border-[#3a2a00] rounded p-3 mb-3 flex items-center justify-between">
                    <span className="text-[11px] text-[#f5c85a] font-mono">Belum ada refresh token.</span>
                    <button onClick={() => { setEditingTokenFor(ch.channel_id); setEditTokenValue(''); }} className="text-[10px] text-[#f5c85a] border border-[#f5c85a33] rounded px-2 py-1 font-mono hover:bg-[#2a1a00] ml-3 whitespace-nowrap">+ Tambah Token</button>
                  </div>
                )}

                {editingTokenFor === ch.channel_id && (
                  <div className="bg-[#0d0f12] border border-[#2a2e38] rounded p-3 mb-3">
                    <div className="text-[10px] text-[#6b7280] font-mono mb-2">Update Refresh Token <a href="/oauth-helper" target="_blank" className="text-[#c8f55a] ml-2 hover:underline">(generate baru →)</a></div>
                    <div className="flex gap-2">
                      <input type="password" value={editTokenValue} onChange={e => setEditTokenValue(e.target.value)} placeholder="1//0g..." className="flex-1 bg-[#0a0c0f] border border-[#2a2e38] rounded px-3 py-1.5 text-xs font-mono focus:border-[#c8f55a] outline-none" />
                      <button onClick={() => updateRefreshToken(ch.channel_id)} disabled={!editTokenValue.trim()} className="px-3 py-1.5 bg-[#c8f55a] text-[#0a0c0f] rounded text-xs font-bold font-mono disabled:opacity-40">Simpan</button>
                      <button onClick={() => setEditingTokenFor(null)} className="px-3 py-1.5 border border-[#2a2e38] rounded text-xs font-mono text-[#6b7280]">Batal</button>
                    </div>
                  </div>
                )}

                {ch.activeStreams?.length > 0 && (
                  <div className="mb-3 flex flex-col gap-2">
                    {ch.activeStreams.map(s => (
                      <div key={s.streamId} className="flex items-center justify-between bg-[#0d0f12] border border-[#1a2a1a] rounded px-3 py-2">
                        <div>
                          <span className="text-xs font-mono text-[#6b7280]">ID: {s.streamId.slice(0, 8)}...</span>
                          <span className="text-xs font-mono text-[#c8f55a] ml-3">⏱ {formatElapsed(s.elapsedSeconds)}</span>
                        </div>
                        <button onClick={() => stopStream(s.streamId)} disabled={loading} className="text-xs px-3 py-1 rounded border border-[#3a1a1a] text-[#f5655a] hover:bg-[#1a0a0a] font-mono disabled:opacity-50">■ Stop</button>
                      </div>
                    ))}
                  </div>
                )}

                {isShowingConfig && (
                  <div className="bg-[#0d0f12] border border-[#2a2e38] rounded-lg p-4 mb-3">
                    <div className="flex items-center justify-between mb-4 pb-2 border-b border-[#2a2e38]">
                      <div>
                        <div className="text-xs font-mono text-[#e8e6e0]">Mode Auto</div>
                        <div className="text-[10px] font-mono text-[#6b7280]">Pilih otomatis dari Folder, atau pilih aset 1-per-1 (Manual)</div>
                      </div>
                      <button onClick={() => updateConfig(ch.channel_id, { auto: !config.auto })} className={`px-3 py-1 rounded text-xs font-mono font-bold transition-colors ${config.auto ? 'bg-[#c8f55a] text-[#0a0c0f]' : 'border border-[#2a2e38] text-[#6b7280]'}`}>{config.auto ? 'AUTO ON' : 'MANUAL'}</button>
                    </div>
                    
                    <div className="mb-4">
                      <div className="text-[10px] text-[#6b7280] font-mono mb-1">Folder Filter (Diutamakan untuk lagu/musik)</div>
                      <div className="flex flex-wrap gap-1">
                        {folders.map(f => (
                          <button key={f.name} onClick={() => updateConfig(ch.channel_id, { folder: f.name })} className={`text-[10px] font-mono px-2 py-1 rounded transition-colors ${config.folder === f.name ? 'bg-[#c8f55a] text-[#0a0c0f] font-bold' : 'border border-[#2a2e38] text-[#6b7280] hover:border-[#c8f55a] hover:text-[#c8f55a]'}`}>{f.name} ({f.count})</button>
                        ))}
                      </div>
                    </div>
                    
                    {!config.auto && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 p-3 bg-[#111318] rounded-md border border-[#2a2e38]">
                        <MediaDropdown 
                          label="🎥 Video Loop" 
                          options={videos} 
                          value={config.videoPath} 
                          onChange={path => updateConfig(ch.channel_id, { videoPath: path })} 
                          placeholder="— acak otomatis —" 
                        />
                        <MediaDropdown 
                          label="🎵 Audio / Musik" 
                          options={config.folder && config.folder !== 'Semua' && config.folder !== 'default' ? songs.filter(s => s.category === config.folder) : songs} 
                          value={config.songPath} 
                          onChange={path => updateConfig(ch.channel_id, { songPath: path })} 
                          placeholder="— acak otomatis —" 
                        />
                        <MediaDropdown 
                          label="🖼 Thumbnail" 
                          options={thumbnails} 
                          value={config.thumbnailPath} 
                          onChange={path => updateConfig(ch.channel_id, { thumbnailPath: path })} 
                          placeholder="— acak otomatis —" 
                        />
                        <div className="flex flex-col gap-3">
                          <AssetDropdown label="📝 Judul Live" options={titles} value={config.titleId} onChange={id => updateConfig(ch.channel_id, { titleId: id })} onDelete={deleteAsset} placeholder="— acak otomatis —" />
                          <AssetDropdown label="📄 Deskripsi" options={descriptions} value={config.descriptionId} onChange={id => updateConfig(ch.channel_id, { descriptionId: id })} onDelete={deleteAsset} placeholder="— acak otomatis —" />
                        </div>
                      </div>
                    )}
                    
                    <div className="mt-4">
                      <div className="text-[10px] text-[#6b7280] font-mono mb-1">Durasi Stream</div>
                      <div className="flex flex-wrap gap-1">
                        {[1,2,3,4,6,8,10,12].map(h => (
                          <button key={h} onClick={() => updateConfig(ch.channel_id, { duration: h })} className={`text-[10px] font-mono px-2 py-1 rounded transition-colors ${config.duration === h ? 'bg-[#c8f55a] text-[#0a0c0f] font-bold' : 'border border-[#2a2e38] text-[#6b7280] hover:border-[#c8f55a] hover:text-[#c8f55a]'}`}>{h}j</button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                <div className="flex gap-2">
                  {!isLive && (
                    <button onClick={() => startStream(ch.channel_id)} disabled={loading || !hasToken} className="flex-1 py-2 rounded bg-[#c8f55a] text-[#0a0c0f] text-xs font-bold font-mono hover:bg-[#b8e54a] transition-colors disabled:opacity-40 disabled:cursor-not-allowed">▶ Start ({config.duration}j · {config.folder} · {config.auto ? 'Auto' : 'Manual'})</button>
                  )}
                  <button onClick={() => setShowConfigFor(isShowingConfig ? null : ch.channel_id)} className={`px-3 py-2 border rounded text-[10px] font-mono transition-colors ${isShowingConfig ? 'border-[#c8f55a] text-[#c8f55a]' : 'border-[#2a2e38] text-[#6b7280] hover:border-[#c8f55a] hover:text-[#c8f55a]'}`}>⚙ Config</button>
                  {!chSchedule && !isLive && (
                    <button onClick={() => initScheduleForm(ch.channel_id)} disabled={!hasToken} className="flex-1 py-2 rounded border border-[#f5c85a] text-[#f5c85a] text-xs font-mono hover:bg-[#1a1500] transition-colors disabled:opacity-40 disabled:cursor-not-allowed">⏰ Schedule</button>
                  )}
                </div>

                {isShowingSchedule && !chSchedule && (
                  <div className="mt-3 bg-[#0d0f12] border border-[#f5c85a33] rounded-lg p-4">
                    <div className="text-[10px] text-[#f5c85a] uppercase tracking-widest font-mono mb-3">Jadwalkan Stream — Waktu dalam UTC</div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
                      <div>
                        <label className="text-[10px] text-[#6b7280] font-mono block mb-1">Tanggal & Jam (UTC)</label>
                        <input type="datetime-local" value={schedForm.datetime} onChange={e => setScheduleForm(prev => ({ ...prev, [ch.channel_id]: { ...schedForm, datetime: e.target.value } }))} className="w-full bg-[#111318] border border-[#2a2e38] rounded px-3 py-2 text-xs font-mono focus:border-[#f5c85a] outline-none text-[#e8e6e0]" />
                        <div className="text-[10px] text-[#6b7280] font-mono mt-1">UTC sekarang: {new Date().toUTCString().slice(17, 22)}</div>
                      </div>
                      <div>
                        <label className="text-[10px] text-[#6b7280] font-mono block mb-1">Durasi</label>
                        <div className="grid grid-cols-4 gap-1">
                          {[1,2,3,4,6,8,10,12].map(h => (
                            <button key={h} onClick={() => setScheduleForm(prev => ({ ...prev, [ch.channel_id]: { ...schedForm, duration: h } }))} className={`py-2 rounded text-xs font-mono transition-colors ${schedForm.duration === h ? 'bg-[#f5c85a] text-[#0a0c0f] font-bold' : 'border border-[#2a2e38] text-[#6b7280] hover:border-[#f5c85a] hover:text-[#f5c85a]'}`}>{h}j</button>
                          ))}
                        </div>
                      </div>
                      <div>
                        <label className="text-[10px] text-[#6b7280] font-mono block mb-1">Ulangi Jadwal</label>
                        <select value={schedForm.repeat || 'none'} onChange={e => setScheduleForm(prev => ({ ...prev, [ch.channel_id]: { ...schedForm, repeat: e.target.value } }))} className="w-full bg-[#111318] border border-[#2a2e38] rounded px-3 py-2 text-xs font-mono focus:border-[#f5c85a] outline-none text-[#e8e6e0]">
                          <option value="none">Tidak (Sekali saja)</option>
                          <option value="daily">Setiap Hari</option>
                          <option value="weekly">Setiap Minggu</option>
                          <option value="monthly">Setiap Bulan</option>
                        </select>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => scheduleStream(ch.channel_id)} disabled={loading} className="flex-1 py-2 rounded bg-[#f5c85a] text-[#0a0c0f] text-xs font-bold font-mono hover:bg-[#e5b84a] transition-colors disabled:opacity-50">✓ Konfirmasi Schedule</button>
                      <button onClick={() => setShowScheduleFor(null)} className="px-4 py-2 rounded border border-[#2a2e38] text-xs font-mono text-[#6b7280]">Batal</button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
