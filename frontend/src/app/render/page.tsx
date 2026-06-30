'use client';

import { useEffect, useState, useCallback, useRef } from 'react';

interface MediaFile { filename: string; category: string; path: string; size: number; }
interface LyricStatus { id: number; song_path: string; song_filename: string; status: string; source: string; created_at: string; }
interface SongConfig { path: string; filename: string; loopToFill: boolean; useLyrics: boolean; }
interface RenderJob {
  id: number; output_name: string; output_category: string; video_path: string;
  status: string; progress: number; stage: string; output_path: string | null;
  error_message: string | null; created_at: string; detail?: string;
}

const fmtSize = (b: number) => !b ? '-' : b < 1048576 ? `${(b/1024).toFixed(1)} KB` : `${(b/1048576).toFixed(1)} MB`;

export default function RenderKaraokePage() {
  const [songs, setSongs] = useState<MediaFile[]>([]);
  const [videos, setVideos] = useState<MediaFile[]>([]);
  const [lyricsMap, setLyricsMap] = useState<Record<string, LyricStatus>>({});
  const [jobs, setJobs] = useState<RenderJob[]>([]);

  const [selectedSongs, setSelectedSongs] = useState<SongConfig[]>([]);
  const [selectedVideo, setSelectedVideo] = useState<string>('');
  const [outputName, setOutputName] = useState('');
  const [outputCategory, setOutputCategory] = useState('Uncategorized');
  const [songSearch, setSongSearch] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [liveProgress, setLiveProgress] = useState<Record<number, { progress: number; stage: string; detail?: string }>>({});

  // Mode total durasi
  const [useTotalDuration, setUseTotalDuration] = useState(false);
  const [totalDurationMinutes, setTotalDurationMinutes] = useState<number>(60);

  const wsRef = useRef<WebSocket | null>(null);

  const fetchSongs = useCallback(async () => {
    try { const r = await fetch('/api/render/songs'); if (r.ok) { const d = await r.json(); setSongs(d.songs || []); } } catch {}
  }, []);
  const fetchVideos = useCallback(async () => {
    try { const r = await fetch('/api/render/videos'); if (r.ok) { const d = await r.json(); setVideos(d.videos || []); } } catch {}
  }, []);
  const fetchLyrics = useCallback(async () => {
    try {
      const r = await fetch('/api/render/lyrics');
      if (r.ok) {
        const d = await r.json();
        const map: Record<string, LyricStatus> = {};
        (d.lyrics || []).forEach((l: LyricStatus) => { map[l.song_path] = l; });
        setLyricsMap(map);
      }
    } catch {}
  }, []);
  const fetchJobs = useCallback(async () => {
    try { const r = await fetch('/api/render/jobs'); if (r.ok) { const d = await r.json(); setJobs(d.jobs || []); } } catch {}
  }, []);

  useEffect(() => { fetchSongs(); fetchVideos(); fetchLyrics(); fetchJobs(); }, [fetchSongs, fetchVideos, fetchLyrics, fetchJobs]);
  useEffect(() => { const t = setInterval(() => { fetchJobs(); fetchLyrics(); }, 8000); return () => clearInterval(t); }, [fetchJobs, fetchLyrics]);

  useEffect(() => {
    const WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'wss://aksarastream.ddns.net/ws';
    let ws: WebSocket; let timer: ReturnType<typeof setTimeout>;
    function connect() {
      ws = new WebSocket(WS_URL);
      wsRef.current = ws;
      ws.onclose = () => { timer = setTimeout(connect, 5000); };
      ws.onerror = () => ws.close();
      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);
          if (msg.type === 'render:progress' && msg.jobId) {
            setLiveProgress(prev => ({ ...prev, [msg.jobId]: { progress: msg.progress ?? prev[msg.jobId]?.progress ?? 0, stage: msg.stage ?? prev[msg.jobId]?.stage ?? '', detail: msg.detail } }));
            if (msg.status === 'done' || msg.status === 'failed') fetchJobs();
          }
          if (msg.type === 'lyrics:progress') fetchLyrics();
        } catch {}
      };
    }
    connect();
    return () => { clearTimeout(timer); ws?.close(); };
  }, [fetchJobs, fetchLyrics]);

  const toggleSong = (s: MediaFile) => {
    setSelectedSongs(prev => {
      const exists = prev.find(p => p.path === s.path);
      if (exists) return prev.filter(p => p.path !== s.path);
      return [...prev, { path: s.path, filename: s.filename, loopToFill: false, useLyrics: false }];
    });
  };

  const updateSongConfig = (path: string, patch: Partial<SongConfig>) => {
    setSelectedSongs(prev => prev.map(s => s.path === path ? { ...s, ...patch } : s));
  };

  const transcribeNow = async (songPath: string) => {
    await fetch('/api/render/lyrics/transcribe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ songPath }) });
    setTimeout(fetchLyrics, 1500);
  };

  const submitJob = async () => {
    if (!outputName.trim()) return alert('Isi nama output dulu!');
    if (!selectedVideo) return alert('Pilih video sumber loop dulu!');
    if (selectedSongs.length === 0) return alert('Pilih minimal 1 lagu!');
    if (useTotalDuration && !selectedSongs.some(s => s.loopToFill)) {
      return alert('Mode "Total Durasi" aktif tapi belum ada lagu yang ditandai "Loop isi sisa durasi". Tandai minimal 1 lagu, atau matikan mode total durasi.');
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/render/jobs', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          outputName: outputName.trim(),
          outputCategory: outputCategory.trim() || 'Uncategorized',
          videoPath: selectedVideo,
          songs: selectedSongs,
          totalDurationSecs: useTotalDuration ? totalDurationMinutes * 60 : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) { alert('Gagal: ' + data.error); return; }
      setSelectedSongs([]); setOutputName(''); setSelectedVideo('');
      await fetchJobs();
    } finally { setSubmitting(false); }
  };

  const cancelJob = async (id: number) => { await fetch(`/api/render/jobs/${id}/cancel`, { method: 'POST' }); fetchJobs(); };

  const visibleSongs = songs.filter(s => s.filename.toLowerCase().includes(songSearch.toLowerCase()));

  return (
    <div className="min-h-screen text-white apple-ui relative z-0 pb-20 overflow-x-hidden">
      <style dangerouslySetInnerHTML={{__html: `
        .apple-ui{font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text","Segoe UI",Roboto,Helvetica,Arial,sans-serif;letter-spacing:-0.01em;}
        .glass-card{background:rgba(255,255,255,0.03);backdrop-filter:blur(40px);border:1px solid rgba(255,255,255,0.08);box-shadow:0 10px 40px -10px rgba(0,0,0,0.3);}
        .glass-card-strong{background:rgba(255,255,255,0.08);backdrop-filter:blur(40px);border:1px solid rgba(255,255,255,0.15);}
        .glass-input{background:rgba(0,0,0,0.2);border:1px solid rgba(255,255,255,0.06);}
        ::-webkit-scrollbar{width:6px;height:6px;}::-webkit-scrollbar-track{background:transparent;}::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.15);border-radius:10px;}
      `}} />
      <div className="fixed inset-0 z-[-1] bg-[#050507]">
        <div className="absolute top-[-10%] left-[-10%] w-[50vw] h-[50vw] bg-fuchsia-600/15 rounded-full blur-[140px] mix-blend-screen pointer-events-none" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[60vw] h-[60vw] bg-amber-600/10 rounded-full blur-[140px] mix-blend-screen pointer-events-none" />
      </div>

      <div className="max-w-6xl mx-auto px-4 lg:px-8 pt-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight text-white mb-1">🎤 Render Video + Karaoke</h1>
          <p className="text-white/50 text-[11px] font-semibold uppercase tracking-widest">Gabung lagu + video looping + lyric karaoke otomatis</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-10">
          {/* KIRI: Pilih lagu */}
          <div className="lg:col-span-2 glass-card rounded-[24px] p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold text-white/60 uppercase tracking-widest">1. Pilih Lagu ({selectedSongs.length} dipilih)</span>
              <input value={songSearch} onChange={e => setSongSearch(e.target.value)} placeholder="Cari lagu..." className="glass-input rounded-lg px-3 py-1.5 text-xs text-white outline-none w-40" />
            </div>
            <div className="max-h-[420px] overflow-y-auto space-y-1.5 pr-1">
              {visibleSongs.map(s => {
                const cfg = selectedSongs.find(c => c.path === s.path);
                const lyric = lyricsMap[s.path];
                return (
                  <div key={s.path} className={`rounded-xl border transition-all ${cfg ? 'bg-fuchsia-500/10 border-fuchsia-500/30' : 'bg-black/20 border-white/5 hover:border-white/15'}`}>
                    <div onClick={() => toggleSong(s)} className="flex items-center gap-3 p-2.5 cursor-pointer">
                      <div className={`w-4 h-4 rounded flex-shrink-0 border ${cfg ? 'bg-fuchsia-400 border-fuchsia-400' : 'border-white/30'}`} />
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-semibold text-white truncate">{s.filename}</div>
                        <div className="text-[10px] text-white/40">{s.category} · {fmtSize(s.size)}</div>
                      </div>
                      {lyric?.status === 'done' && <span className="text-[9px] font-bold text-emerald-400 bg-emerald-400/10 px-2 py-0.5 rounded-full">Lyric ✓</span>}
                      {lyric?.status === 'processing' && <span className="text-[9px] font-bold text-amber-400 bg-amber-400/10 px-2 py-0.5 rounded-full animate-pulse">Transkrip...</span>}
                      {lyric?.status === 'failed' && <span className="text-[9px] font-bold text-red-400 bg-red-400/10 px-2 py-0.5 rounded-full">Gagal</span>}
                      {cfg?.loopToFill && <span className="text-[9px] font-bold text-cyan-400 bg-cyan-400/10 px-2 py-0.5 rounded-full">🔁 Loop</span>}
                    </div>
                    {cfg && (
                      <div className="px-3 pb-3 pt-1 space-y-2 border-t border-white/5 mt-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <label className={`flex items-center gap-1.5 text-[10px] cursor-pointer ${useTotalDuration ? 'text-white/60' : 'text-white/25'}`}>
                            <input type="checkbox" disabled={!useTotalDuration} checked={cfg.loopToFill} onChange={e => updateSongConfig(s.path, { loopToFill: e.target.checked })} />
                            Loop isi sisa durasi {!useTotalDuration && '(aktifkan "Total Durasi" dulu)'}
                          </label>
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <label className="flex items-center gap-1.5 text-[10px] text-white/60 cursor-pointer">
                            <input type="checkbox" checked={cfg.useLyrics} onChange={e => updateSongConfig(s.path, { useLyrics: e.target.checked })} />
                            Tampilkan lyric karaoke
                          </label>
                          {cfg.useLyrics && lyric?.status !== 'done' && (
                            <button onClick={(e) => { e.stopPropagation(); transcribeNow(s.path); }} className="text-[9px] font-bold bg-white/10 hover:bg-white/20 px-2 py-1 rounded-md transition-colors">
                              Transkrip Sekarang
                            </button>
                          )}
                          {cfg.useLyrics && (
                            <label className="text-[9px] font-bold bg-white/10 hover:bg-white/20 px-2 py-1 rounded-md cursor-pointer transition-colors">
                              Upload Manual
                              <input type="file" accept=".srt,.vtt,.lrc,.ass" className="hidden" onChange={async (e) => {
                                const f = e.target.files?.[0]; if (!f) return;
                                const fd = new FormData(); fd.append('file', f); fd.append('songPath', s.path);
                                await fetch('/api/render/lyrics/upload', { method: 'POST', body: fd });
                                fetchLyrics();
                              }} />
                            </label>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
              {visibleSongs.length === 0 && <div className="text-center text-white/30 text-xs py-8">Tidak ada lagu ditemukan.</div>}
            </div>
          </div>

          {/* KANAN: Config output */}
          <div className="glass-card rounded-[24px] p-5 flex flex-col gap-4 h-fit">
            <span className="text-xs font-bold text-white/60 uppercase tracking-widest">2. Pengaturan Output</span>

            <div>
              <label className="text-[10px] text-white/40 mb-1 block">Video Sumber (akan di-loop)</label>
              <select value={selectedVideo} onChange={e => setSelectedVideo(e.target.value)} className="w-full glass-input rounded-lg px-3 py-2 text-xs text-white outline-none bg-[#111318]">
                <option value="">— Pilih video —</option>
                {videos.map(v => <option key={v.path} value={v.path}>{v.category} / {v.filename}</option>)}
              </select>
            </div>

            <div className="bg-cyan-500/5 border border-cyan-500/20 rounded-xl p-3">
              <label className="flex items-center gap-2 text-[11px] font-bold text-cyan-300 cursor-pointer mb-2">
                <input type="checkbox" checked={useTotalDuration} onChange={e => setUseTotalDuration(e.target.checked)} />
                Set Total Durasi Video
              </label>
              {useTotalDuration ? (
                <>
                  <input type="number" min={1} value={totalDurationMinutes} onChange={e => setTotalDurationMinutes(Number(e.target.value))} className="w-full glass-input rounded-lg px-3 py-2 text-xs text-white outline-none mb-1.5" placeholder="menit" />
                  <div className="text-[9px] text-cyan-200/60 leading-relaxed">
                    Lagu non-loop diputar apa adanya. Lagu yang ditandai 🔁 <b>"Loop isi sisa durasi"</b> akan di-loop buat ngisi sisa waktu sampai total {totalDurationMinutes} menit.
                  </div>
                </>
              ) : (
                <div className="text-[9px] text-white/30 leading-relaxed">Mati = video pakai durasi natural gabungan semua lagu (gak ada yang di-loop).</div>
              )}
            </div>

            <div>
              <label className="text-[10px] text-white/40 mb-1 block">Nama File Output</label>
              <input value={outputName} onChange={e => setOutputName(e.target.value)} placeholder="contoh: Lofi Mix Vol 1" className="w-full glass-input rounded-lg px-3 py-2 text-xs text-white outline-none" />
            </div>

            <div>
              <label className="text-[10px] text-white/40 mb-1 block">Kategori (folder Video Jadi)</label>
              <input value={outputCategory} onChange={e => setOutputCategory(e.target.value)} placeholder="Uncategorized" className="w-full glass-input rounded-lg px-3 py-2 text-xs text-white outline-none" />
            </div>

            {selectedSongs.length > 0 && (
              <div className="bg-black/20 rounded-xl p-3 text-[10px] text-white/50 leading-relaxed">
                {selectedSongs.length} lagu dipilih · {selectedSongs.filter(s => s.useLyrics).length} pakai lyric karaoke · {selectedSongs.filter(s => s.loopToFill).length} ditandai loop
              </div>
            )}

            <button onClick={submitJob} disabled={submitting} className="w-full bg-fuchsia-500 hover:bg-fuchsia-400 text-black py-3 rounded-xl text-xs font-bold transition-colors disabled:opacity-40">
              {submitting ? 'Mengirim...' : '🚀 Mulai Render'}
            </button>
            <div className="text-[9px] text-white/30 text-center">Proses bisa jam-jaman tergantung durasi & jumlah lagu yang butuh transkrip.</div>
          </div>
        </div>

        {/* JOB HISTORY */}
        <div className="mb-4 flex items-center justify-between">
          <span className="text-sm font-semibold text-white/60 tracking-tight">Render Jobs</span>
          <span className="text-[10px] text-white/30">{jobs.length} total</span>
        </div>
        <div className="space-y-3">
          {jobs.length === 0 && <div className="glass-card rounded-[20px] p-8 text-center text-white/30 text-xs">Belum ada job render.</div>}
          {jobs.map(j => {
            const live = liveProgress[j.id];
            const progress = live?.progress ?? j.progress;
            const stage = live?.stage ?? j.stage;
            const detail = live?.detail ?? j.detail;
            const isActive = j.status === 'running' || j.status === 'queued';
            return (
              <div key={j.id} className="glass-card rounded-[20px] p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-white">{j.output_name}</span>
                    <span className="text-[9px] text-white/30">({j.output_category})</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {j.status === 'done' && <span className="text-[9px] font-bold text-emerald-400 bg-emerald-400/10 px-2 py-0.5 rounded-full">SELESAI</span>}
                    {j.status === 'failed' && <span className="text-[9px] font-bold text-red-400 bg-red-400/10 px-2 py-0.5 rounded-full">GAGAL</span>}
                    {isActive && <span className="text-[9px] font-bold text-amber-400 bg-amber-400/10 px-2 py-0.5 rounded-full animate-pulse">{stage?.toUpperCase()}</span>}
                    {isActive && <button onClick={() => cancelJob(j.id)} className="text-[9px] font-bold text-red-400 hover:bg-red-500/10 px-2 py-0.5 rounded-full transition-colors">Batalkan</button>}
                  </div>
                </div>
                {isActive && (
                  <div className="h-2 bg-white/5 rounded-full overflow-hidden mb-1.5">
                    <div className="h-full bg-fuchsia-400 rounded-full transition-all duration-500" style={{ width: `${progress}%` }} />
                  </div>
                )}
                {detail && <div className="text-[10px] text-white/40 mb-1">{detail}</div>}
                {j.status === 'failed' && j.error_message && <div className="text-[10px] text-red-400/70 mt-1">{j.error_message}</div>}
                {j.status === 'done' && j.output_path && <div className="text-[10px] text-emerald-400/70 mt-1 font-mono truncate">{j.output_path}</div>}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
