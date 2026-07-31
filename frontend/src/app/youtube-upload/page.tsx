'use client';

import { useEffect, useState, useCallback, useRef } from 'react';

interface VideoFile { filename: string; category: string; path: string; size: number; }
interface Channel { id: number; channel_id: string; name: string; google_refresh_token?: string; }
interface UploadJob {
  id: number; channel_id: string; video_path: string; title: string;
  description: string; tags: string; privacy_status: string;
  scheduled_at: string; delete_after_upload: boolean; vps_file_deleted: boolean;
  status: string; youtube_url?: string; error_message?: string;
  started_at?: string; finished_at?: string; created_at: string;
}
interface ThumbnailFile { filename: string; sizeBytes: number; createdAt: string; category?: string; }

const fmtSize = (b: number) => b < 1048576 ? `${(b/1024).toFixed(1)} KB` : b < 1073741824 ? `${(b/1048576).toFixed(1)} MB` : `${(b/1073741824).toFixed(2)} GB`;
const LA_TZ = 'America/Los_Angeles';
const getLADatetimeLocal = () => {
  const now = new Date(); now.setMinutes(now.getMinutes() + 5);
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: LA_TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(now);
  const g = (t: string) => parts.find(p => p.type === t)?.value || '';
  return `${g('year')}-${g('month')}-${g('day')}T${g('hour')}:${g('minute')}`;
};
const getLAOffsetMinutes = (date: Date) => { const utc = new Date(date.toLocaleString('en-US', { timeZone: 'UTC' })); const la = new Date(date.toLocaleString('en-US', { timeZone: LA_TZ })); return Math.round((la.getTime() - utc.getTime()) / 60000); };
const laLocalToUTCISO = (localStr: string) => { const naiveUTC = new Date(localStr + ':00Z'); const offsetMin = getLAOffsetMinutes(naiveUTC); return new Date(naiveUTC.getTime() - offsetMin * 60000).toISOString(); };
const formatScheduleTime = (iso: string) => {
  const d = new Date(iso);
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: LA_TZ, month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(d);
  const g = (t: string) => parts.find(p => p.type === t)?.value || '';
  return `${g('day')}/${g('month')} ${g('hour')}:${g('minute')} PT`;
};

const statusColor = (s: string) => ({
  pending: 'text-amber-400 bg-amber-400/10 border-amber-400/20',
  uploading: 'text-blue-400 bg-blue-400/10 border-blue-400/20',
  done: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20',
  failed: 'text-red-400 bg-red-400/10 border-red-400/20',
}[s] || 'text-white/40 bg-white/5');

export default function YoutubeUploadPage() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [videoFiles, setVideoFiles] = useState<VideoFile[]>([]);
  const [jobs, setJobs] = useState<UploadJob[]>([]);
  const [liveProgress, setLiveProgress] = useState<Record<number, number>>({});

  // Form
  const [channelId, setChannelId] = useState('');
  const [videoPath, setVideoPath] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState('');
  const [privacy, setPrivacy] = useState('public');
  const [scheduleMode, setScheduleMode] = useState<'now' | 'schedule'>('now');
  const [scheduledAt, setScheduledAt] = useState(getLADatetimeLocal());
  const [deleteAfter, setDeleteAfter] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [filterCat, setFilterCat] = useState('__all__');

  // Thumbnail
  const [thumbnails, setThumbnails] = useState<ThumbnailFile[]>([]);
  const [thumbMode, setThumbMode] = useState<'pool' | 'upload'>('pool');
  const [thumbFilterCat, setThumbFilterCat] = useState('__all__');
  const [selectedThumb, setSelectedThumb] = useState<{ filename: string; category: string } | null>(null);
  const [thumbUploading, setThumbUploading] = useState(false);
  const [thumbUploadError, setThumbUploadError] = useState('');

  const wsRef = useRef<WebSocket | null>(null);

  const fetchAll = useCallback(async () => {
    try {
      const [chRes, vfRes, jRes, thRes] = await Promise.all([
        fetch('/api/channels'),
        fetch('/api/youtube-upload/video-files'),
        fetch('/api/youtube-upload/jobs'),
        fetch('/api/thumbnails'),
      ]);
      if (chRes.ok) { const d = await chRes.json(); setChannels(d.filter((c: Channel) => !!c.google_refresh_token)); }
      if (vfRes.ok) { const d = await vfRes.json(); setVideoFiles(d.files || []); }
      if (jRes.ok) { const d = await jRes.json(); setJobs(d.jobs || []); }
      if (thRes.ok) { const d = await thRes.json(); setThumbnails(d.files || []); }
    } catch {}
  }, []);

  useEffect(() => {
    fetchAll();
    const t = setInterval(fetchAll, 15000);
    return () => clearInterval(t);
  }, [fetchAll]);

  useEffect(() => {
    const wsUrl = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:3001';
    let ws: WebSocket; let timer: ReturnType<typeof setTimeout>;
    function connect() {
      ws = new WebSocket(wsUrl);
      wsRef.current = ws;
      ws.onclose = () => { timer = setTimeout(connect, 5000); };
      ws.onerror = () => ws.close();
      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);
          if (msg.type === 'ytupload:progress' && msg.jobId) {
            setLiveProgress(prev => ({ ...prev, [msg.jobId]: msg.progress ?? prev[msg.jobId] ?? 0 }));
            if (msg.status === 'done' || msg.status === 'failed') fetchAll();
          }
        } catch {}
      };
    }
    connect();
    return () => { clearTimeout(timer); ws?.close(); };
  }, [fetchAll]);

  const categories = Array.from(new Set(videoFiles.map(f => f.category)));
  const visibleFiles = videoFiles.filter(f => filterCat === '__all__' || f.category === filterCat);

  const thumbCategories = Array.from(new Set(thumbnails.map(t => t.category || 'Uncategorized')));
  const visibleThumbs = thumbnails.filter(t => thumbFilterCat === '__all__' || (t.category || 'Uncategorized') === thumbFilterCat);

  const uploadCustomThumb = async (file: File) => {
    if (!file.type.startsWith('image/')) { setThumbUploadError('Hanya file gambar (JPG/PNG/WebP)'); return; }
    if (file.size > 5 * 1024 * 1024) { setThumbUploadError('Maksimum 5MB'); return; }
    setThumbUploading(true); setThumbUploadError('');
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/thumbnails/upload', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) { setThumbUploadError(data.error || 'Upload gagal'); return; }
      setSelectedThumb({ filename: data.filename, category: '' });
      await fetchAll();
    } catch {
      setThumbUploadError('Terjadi kesalahan saat upload');
    } finally { setThumbUploading(false); }
  };

  const submit = async () => {
    if (!channelId) return alert('Pilih channel dulu!');
    if (!videoPath) return alert('Pilih video dulu!');
    if (!title.trim()) return alert('Isi judul dulu!');
    setSubmitting(true);
    try {
      const body: any = { channelId, videoPath, title, description, tags, privacyStatus: privacy, deleteAfterUpload: deleteAfter };
      if (selectedThumb) {
        body.thumbnailFilename = selectedThumb.filename;
        body.thumbnailCategory = selectedThumb.category;
      }
      if (scheduleMode === 'schedule') {
        body.scheduledAt = laLocalToUTCISO(scheduledAt);
        if (new Date(body.scheduledAt) <= new Date()) return alert('Waktu schedule sudah lewat!');
      }
      const res = await fetch('/api/youtube-upload/jobs', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) return alert('Gagal: ' + data.error);
      setTitle(''); setDescription(''); setTags(''); setVideoPath(''); setSelectedThumb(null);
      await fetchAll();
    } finally { setSubmitting(false); }
  };

  const deleteJob = async (id: number) => {
    if (!confirm('Batalkan job ini?')) return;
    await fetch(`/api/youtube-upload/jobs/${id}`, { method: 'DELETE' });
    fetchAll();
  };

  return (
    <div className="min-h-screen text-white apple-ui relative z-0 pb-20 overflow-x-hidden">
      <style dangerouslySetInnerHTML={{__html: `
        .apple-ui{font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text","Segoe UI",Roboto,Helvetica,Arial,sans-serif;letter-spacing:-0.01em;}
        .glass-card{background:rgba(255,255,255,0.03);backdrop-filter:blur(40px);border:1px solid rgba(255,255,255,0.08);}
        .glass-card-strong{background:rgba(255,255,255,0.08);backdrop-filter:blur(40px);border:1px solid rgba(255,255,255,0.15);}
        .glass-input{background:rgba(0,0,0,0.2);border:1px solid rgba(255,255,255,0.06);}
        ::-webkit-scrollbar{width:6px;}::-webkit-scrollbar-track{background:transparent;}::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.15);border-radius:10px;}
      `}} />
      <div className="fixed inset-0 z-[-1] bg-[#050507]">
        <div className="absolute top-0 left-0 w-[50vw] h-[50vw] bg-red-600/15 rounded-full blur-[140px] mix-blend-screen pointer-events-none" />
        <div className="absolute bottom-0 right-0 w-[50vw] h-[50vw] bg-purple-600/10 rounded-full blur-[140px] mix-blend-screen pointer-events-none" />
      </div>

      <div className="max-w-6xl mx-auto px-4 lg:px-8 pt-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight text-white mb-1">📺 Upload ke YouTube</h1>
          <p className="text-white/50 text-[11px] font-semibold uppercase tracking-widest">Upload video reguler · Schedule · Auto hapus VPS</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 mb-10">
          {/* Form */}
          <div className="lg:col-span-2 flex flex-col gap-4">
            <div className="glass-card rounded-[24px] p-5">
              <div className="text-[10px] font-bold text-white/50 uppercase tracking-widest mb-4">1. Pilih Channel</div>
              {channels.length === 0 ? (
                <div className="text-xs text-red-400 bg-red-400/10 border border-red-400/20 rounded-xl p-3">
                  Belum ada channel dengan Google Token. Tambah dulu di halaman Streams → Keys.
                </div>
              ) : (
                <div className="space-y-2">
                  {channels.map(ch => (
                    <div key={ch.channel_id} onClick={() => setChannelId(ch.channel_id)}
                      className={`p-3 rounded-xl border cursor-pointer transition-all ${channelId === ch.channel_id ? 'bg-red-500/10 border-red-500/30 text-white' : 'glass-input text-white/60 hover:border-white/20'}`}>
                      <div className="text-xs font-bold">{ch.name}</div>
                      <div className="text-[10px] text-white/40 font-mono">{ch.channel_id}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="glass-card rounded-[24px] p-5">
              <div className="text-[10px] font-bold text-white/50 uppercase tracking-widest mb-4">2. Detail Video</div>
              <div className="space-y-3">
                <div>
                  <label className="text-[10px] text-white/40 mb-1 block">Judul *</label>
                  <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Judul video YouTube" className="w-full glass-input rounded-lg px-3 py-2 text-xs text-white outline-none focus:ring-1 focus:ring-red-400/40" />
                </div>
                <div>
                  <label className="text-[10px] text-white/40 mb-1 block">Deskripsi</label>
                  <textarea value={description} onChange={e => setDescription(e.target.value)} rows={4} placeholder="Deskripsi video..." className="w-full glass-input rounded-lg px-3 py-2 text-xs text-white outline-none resize-none focus:ring-1 focus:ring-red-400/40" />
                </div>
                <div>
                  <label className="text-[10px] text-white/40 mb-1 block">Tags (pisah koma)</label>
                  <input value={tags} onChange={e => setTags(e.target.value)} placeholder="lofi, jazz, music, chill" className="w-full glass-input rounded-lg px-3 py-2 text-xs text-white outline-none focus:ring-1 focus:ring-red-400/40" />
                </div>
                <div>
                  <label className="text-[10px] text-white/40 mb-1 block">Privasi</label>
                  <select value={privacy} onChange={e => setPrivacy(e.target.value)} className="w-full glass-input rounded-lg px-3 py-2 text-xs text-white outline-none bg-[#111318]">
                    <option value="public">Public</option>
                    <option value="unlisted">Unlisted</option>
                    <option value="private">Private</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="glass-card rounded-[24px] p-5">
              <div className="text-[10px] font-bold text-white/50 uppercase tracking-widest mb-4">3. Waktu Upload</div>
              <div className="bg-black/30 p-1 rounded-full flex gap-1 border border-white/5 mb-3">
                <button onClick={() => setScheduleMode('now')} className={`flex-1 py-2 rounded-full text-[10px] font-bold transition-all ${scheduleMode==='now'?'bg-white text-black':'text-white/50 hover:text-white'}`}>Sekarang</button>
                <button onClick={() => setScheduleMode('schedule')} className={`flex-1 py-2 rounded-full text-[10px] font-bold transition-all ${scheduleMode==='schedule'?'bg-white text-black':'text-white/50 hover:text-white'}`}>Jadwalkan</button>
              </div>
              {scheduleMode === 'schedule' && (
                <div>
                  <label className="text-[10px] text-white/40 mb-1 block">Waktu (LA / Pacific Time)</label>
                  <input type="datetime-local" value={scheduledAt} onChange={e => setScheduledAt(e.target.value)} className="w-full glass-input rounded-lg px-3 py-2 text-xs text-white outline-none focus:ring-1 focus:ring-amber-400/40" />
                </div>
              )}
            </div>

            <div className="glass-card rounded-[24px] p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="text-[10px] font-bold text-white/50 uppercase tracking-widest">4. Thumbnail (Opsional)</div>
                <div className="bg-black/30 p-1 rounded-full flex gap-1 border border-white/5">
                  <button onClick={() => setThumbMode('pool')} className={`px-3 py-1.5 rounded-full text-[10px] font-bold transition-all ${thumbMode==='pool'?'bg-white text-black':'text-white/50 hover:text-white'}`}>Media Pool</button>
                  <button onClick={() => setThumbMode('upload')} className={`px-3 py-1.5 rounded-full text-[10px] font-bold transition-all ${thumbMode==='upload'?'bg-white text-black':'text-white/50 hover:text-white'}`}>Upload Baru</button>
                </div>
              </div>

              {selectedThumb && (
                <div className="flex items-center gap-3 mb-3 p-2 bg-red-500/5 border border-red-500/20 rounded-xl">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`/api/thumbnails/preview/${encodeURIComponent(selectedThumb.filename)}`} alt="thumb" className="w-16 h-9 object-cover rounded-md" />
                  <div className="flex-1 text-[10px] text-white/60 truncate">{selectedThumb.filename}</div>
                  <button onClick={() => setSelectedThumb(null)} className="text-[10px] font-bold text-white/40 hover:text-red-400 px-2 py-1">Hapus</button>
                </div>
              )}

              {thumbMode === 'pool' ? (
                <>
                  <div className="flex flex-wrap gap-1.5 mb-3">
                    <button onClick={() => setThumbFilterCat('__all__')} className={`px-3 py-1 rounded-lg text-[10px] font-bold transition-all ${thumbFilterCat==='__all__'?'bg-white text-black':'glass-input text-white/50 hover:text-white'}`}>Semua</button>
                    {thumbCategories.map(c => <button key={c} onClick={() => setThumbFilterCat(c)} className={`px-3 py-1 rounded-lg text-[10px] font-bold transition-all ${thumbFilterCat===c?'bg-white text-black':'glass-input text-white/50 hover:text-white'}`}>{c}</button>)}
                  </div>
                  <div className="grid grid-cols-3 gap-2 max-h-48 overflow-y-auto pr-1">
                    {visibleThumbs.length === 0 && <div className="col-span-3 text-center text-white/30 text-[10px] py-6">Belum ada thumbnail di Media Pool.</div>}
                    {visibleThumbs.map(t => {
                      const isSel = selectedThumb?.filename === t.filename;
                      return (
                        <div key={t.filename} onClick={() => setSelectedThumb({ filename: t.filename, category: t.category || '' })}
                          className={`aspect-video rounded-lg overflow-hidden cursor-pointer border-2 transition-all ${isSel ? 'border-red-400' : 'border-transparent hover:border-white/20'}`}>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={`/api/thumbnails/preview/${encodeURIComponent(t.filename)}`} alt={t.filename} className="w-full h-full object-cover" />
                        </div>
                      );
                    })}
                  </div>
                </>
              ) : (
                <div>
                  <label className="block border-2 border-dashed border-white/10 hover:bg-white/[0.02] rounded-xl p-4 text-center cursor-pointer transition-all">
                    <input type="file" accept="image/jpeg,image/jpg,image/png,image/webp" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) uploadCustomThumb(f); e.target.value=''; }} />
                    <div className="text-[11px] text-white/60">{thumbUploading ? '⏳ Mengupload...' : 'Klik untuk pilih gambar (max 5MB)'}</div>
                  </label>
                  {thumbUploadError && <div className="text-[10px] text-red-400 mt-2">{thumbUploadError}</div>}
                </div>
              )}
            </div>

            <div className="glass-card rounded-[24px] p-5">
              <div className="flex items-center gap-3">
                <button onClick={() => setDeleteAfter(!deleteAfter)} className={`relative w-10 h-5 rounded-full transition-all duration-300 flex-shrink-0 ${deleteAfter ? 'bg-red-500' : 'bg-white/10'}`}>
                  <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all duration-300 ${deleteAfter ? 'left-[22px]' : 'left-0.5'}`} />
                </button>
                <div>
                  <div className={`text-xs font-bold ${deleteAfter ? 'text-red-400' : 'text-white/40'}`}>{deleteAfter ? '🗑 Hapus file VPS setelah upload selesai' : '💾 Simpan file VPS setelah upload'}</div>
                  <div className="text-[10px] text-white/30 mt-0.5">File di /opt/media/video-ready</div>
                </div>
              </div>
            </div>

            <button onClick={submit} disabled={submitting || !channelId || !videoPath || !title.trim()} className="w-full bg-red-500 hover:bg-red-400 text-white py-3.5 rounded-2xl text-sm font-bold transition-colors disabled:opacity-30 flex items-center justify-center gap-2">
              {submitting ? '⏳ Memproses...' : scheduleMode === 'now' ? '🚀 Upload Sekarang' : '📅 Jadwalkan Upload'}
            </button>
          </div>

          {/* File picker */}
          <div className="lg:col-span-3 glass-card rounded-[24px] p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="text-[10px] font-bold text-white/50 uppercase tracking-widest">Pilih Video dari VPS</div>
              <span className="text-[10px] text-white/30">{videoFiles.length} file</span>
            </div>
            <div className="flex flex-wrap gap-1.5 mb-4">
              <button onClick={() => setFilterCat('__all__')} className={`px-3 py-1 rounded-lg text-[10px] font-bold transition-all ${filterCat==='__all__'?'bg-white text-black':'glass-input text-white/50 hover:text-white'}`}>Semua</button>
              {categories.map(c => <button key={c} onClick={() => setFilterCat(c)} className={`px-3 py-1 rounded-lg text-[10px] font-bold transition-all ${filterCat===c?'bg-white text-black':'glass-input text-white/50 hover:text-white'}`}>{c}</button>)}
            </div>
            <div className="space-y-2 max-h-[520px] overflow-y-auto pr-1">
              {visibleFiles.length === 0 ? (
                <div className="text-center text-white/30 text-xs py-12">Tidak ada video di VPS.<br/>Upload dulu lewat Media Pool → Video Jadi.</div>
              ) : visibleFiles.map(f => (
                <div key={f.path} onClick={() => setVideoPath(videoPath === f.path ? '' : f.path)}
                  className={`p-3.5 rounded-xl border cursor-pointer transition-all ${videoPath === f.path ? 'bg-red-500/10 border-red-500/30' : 'glass-input hover:border-white/20 border-transparent'}`}>
                  <div className="flex items-center gap-3">
                    <div className={`w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center transition-all ${videoPath === f.path ? 'bg-red-400 border-red-400' : 'border-white/30'}`}>
                      {videoPath === f.path && <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" width="10" height="10"><polyline points="20 6 9 17 4 12"/></svg>}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-semibold text-white truncate">{f.filename}</div>
                      <div className="text-[10px] text-white/40 mt-0.5 flex gap-2">
                        <span>{f.category}</span>
                        <span>·</span>
                        <span>{fmtSize(f.size)}</span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            {videoPath && (
              <div className="mt-3 p-3 bg-red-500/5 border border-red-500/20 rounded-xl">
                <div className="text-[10px] text-red-400 font-bold uppercase tracking-widest mb-1">Video Dipilih</div>
                <div className="text-xs text-white/70 font-mono truncate">{videoPath.split('/').pop()}</div>
              </div>
            )}
          </div>
        </div>

        {/* Jobs list */}
        <div className="flex items-center justify-between mb-4 px-1">
          <span className="text-sm font-semibold text-white/60">Upload Jobs</span>
          <span className="text-[10px] text-white/30">{jobs.length} total</span>
        </div>
        <div className="space-y-3">
          {jobs.length === 0 && <div className="glass-card rounded-[20px] p-8 text-center text-white/30 text-xs">Belum ada job upload.</div>}
          {jobs.map(j => {
            const live = liveProgress[j.id];
            const pct = live ?? (j.status === 'done' ? 100 : 0);
            return (
              <div key={j.id} className="glass-card rounded-[20px] p-4">
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-bold text-white truncate">{j.title}</span>
                      <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full border ${statusColor(j.status)}`}>{j.status.toUpperCase()}</span>
                      {j.privacy_status && <span className="text-[9px] text-white/30 bg-white/5 px-2 py-0.5 rounded-full">{j.privacy_status}</span>}
                      {j.delete_after_upload && <span className="text-[9px] text-red-400/70 bg-red-400/5 px-2 py-0.5 rounded-full border border-red-400/20">🗑 auto delete</span>}
                      {j.vps_file_deleted && <span className="text-[9px] text-red-300/50 bg-red-400/5 px-2 py-0.5 rounded-full">VPS deleted</span>}
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-[10px] text-white/40">
                      <span>{j.channel_id}</span>
                      <span>·</span>
                      <span>{formatScheduleTime(j.scheduled_at)}</span>
                      <span>·</span>
                      <span className="font-mono truncate max-w-[200px]">{j.video_path.split('/').pop()}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {j.youtube_url && (
                      <a href={j.youtube_url} target="_blank" rel="noopener noreferrer" className="text-[10px] font-bold text-red-400 bg-red-400/10 border border-red-400/20 px-3 py-1.5 rounded-lg hover:bg-red-400/20 transition-colors">▶ Buka</a>
                    )}
                    {j.status === 'pending' && (
                      <button onClick={() => deleteJob(j.id)} className="text-[10px] font-bold text-white/40 hover:text-red-400 px-3 py-1.5 rounded-lg hover:bg-red-400/10 transition-colors border border-white/10">Batal</button>
                    )}
                  </div>
                </div>
                {(j.status === 'uploading' || j.status === 'done') && (
                  <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full transition-all duration-500 ${j.status === 'done' ? 'bg-emerald-400' : 'bg-red-400'}`} style={{ width: `${pct}%` }} />
                  </div>
                )}
                {j.status === 'failed' && j.error_message && (
                  <div className="text-[10px] text-red-400/70 mt-1.5 bg-red-400/5 border border-red-400/20 rounded-lg px-3 py-2">{j.error_message}</div>
                )}
                {j.tags && <div className="flex flex-wrap gap-1 mt-2">{j.tags.split(',').filter(Boolean).map((t,i) => <span key={i} className="text-[9px] text-white/30 bg-white/5 px-2 py-0.5 rounded-full">#{t.trim()}</span>)}</div>}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
