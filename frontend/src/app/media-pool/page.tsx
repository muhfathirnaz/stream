'use client';

import { useState, useRef, useCallback, useEffect } from "react";

const API_BASE = "/media-pool-api";

interface ToastItem { id: number; msg: string; type: "info" | "success" | "error"; }
interface FileItem { id: string; name: string; size: number; type: "music" | "video"; category: string; status?: string; duration?: number; }
interface UploadQueueItem { id: string; name: string; file: File; status: "pending" | "uploading" | "done" | "error"; progress: number; }
interface ThumbnailFile { filename: string; path: string; sizeBytes: number; createdAt: string; }

const Icon = {
  Music: () => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18"><path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" /></svg>),
  Video: () => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18"><rect x="2" y="3" width="15" height="15" rx="2" /><path d="m17 8 5-3v14l-5-3" /></svg>),
  Image: () => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18"><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" /></svg>),
  Upload: () => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>),
  Folder: () => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" /></svg>),
  Plus: () => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="16" height="16"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>),
  Trash: () => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="15" height="15"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14H6L5 6" /><path d="M10 11v6M14 11v6" /><path d="M9 6V4h6v2" /></svg>),
  Cloud: () => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16"><path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z" /></svg>),
  Sync: () => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16"><path d="M23 4v6h-6" /><path d="M1 20v-6h6" /><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" /></svg>),
  Play: () => (<svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><polygon points="5 3 19 12 5 21 5 3" /></svg>),
  Pause: () => (<svg viewBox="0 0 24 24" fill="currentColor" width="13" height="13"><rect x="6" y="4" width="4" height="16" /><rect x="14" y="4" width="4" height="16" /></svg>),
  Check: () => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="14" height="14"><polyline points="20 6 9 17 4 12" /></svg>),
  X: () => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="14" height="14"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>),
  ChevronRight: () => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14"><polyline points="9 18 15 12 9 6" /></svg>),
  File: () => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" /><polyline points="13 2 13 9 20 9" /></svg>),
};

const fmtSize = (b: number) => !b ? "-" : b < 1048576 ? `${(b/1024).toFixed(1)} KB` : b < 1073741824 ? `${(b/1048576).toFixed(1)} MB` : `${(b/1073741824).toFixed(2)} GB`;
const fmtDur = (s: number) => !s ? "" : `${Math.floor(s/60)}:${Math.floor(s%60).toString().padStart(2,"0")}`;

function useToast() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const add = useCallback((msg: string, type: ToastItem["type"] = "info") => {
    const id = Date.now();
    setToasts(p => [...p, { id, msg, type }]);
    setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 4000);
  }, []);
  const remove = useCallback((id: number) => setToasts(p => p.filter(t => t.id !== id)), []);
  return { toasts, add, remove };
}

function Toast({ toasts, remove }: { toasts: ToastItem[]; remove: (id: number) => void }) {
  return (
    <div style={{ position:"fixed", bottom:24, right:24, display:"flex", flexDirection:"column", gap:8, zIndex:9999 }}>
      {toasts.map(t => (
        <div key={t.id} style={{ display:"flex", alignItems:"center", gap:10, padding:"10px 16px", background: t.type==="error"?"#2d1a1a":t.type==="success"?"#0f2a1f":"#1a1f2e", border:`1px solid ${t.type==="error"?"#7f2020":t.type==="success"?"#1a5c3a":"#2a3a5e"}`, borderRadius:8, color:"#e8e8ea", fontSize:13, minWidth:260, boxShadow:"0 4px 16px rgba(0,0,0,.5)" }}>
          <span style={{ color: t.type==="error"?"#f87171":t.type==="success"?"#4ade80":"#93c5fd", flexShrink:0 }}>
            {t.type==="success"?<Icon.Check />:<Icon.X />}
          </span>
          <span style={{ flex:1 }}>{t.msg}</span>
          <button onClick={() => remove(t.id)} style={{ background:"none", border:"none", color:"#666", cursor:"pointer", padding:0 }}><Icon.X /></button>
        </div>
      ))}
    </div>
  );
}

function DropZone({ onFiles, accept, label }: { onFiles:(f:File[])=>void; accept:string[]; label:string }) {
  const [drag, setDrag] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div onClick={() => ref.current?.click()} onDragOver={e=>{e.preventDefault();setDrag(true)}} onDragLeave={()=>setDrag(false)}
      onDrop={e=>{e.preventDefault();setDrag(false);const f=Array.from(e.dataTransfer.files).filter(f=>accept.some(a=>a.includes(f.name.split(".").pop()?.toLowerCase()??"")));if(f.length)onFiles(f)}}
      style={{ border:`2px dashed ${drag?"#7c6fcd":"#2e2e3e"}`, borderRadius:12, padding:"28px 20px", textAlign:"center", cursor:"pointer", background:drag?"rgba(124,111,205,.08)":"transparent" }}>
      <div style={{ color:drag?"#7c6fcd":"#555", marginBottom:8 }}><Icon.Upload /></div>
      <div style={{ color:"#aaa", fontSize:13 }}><span style={{ color:"#7c6fcd", fontWeight:600 }}>Pilih file</span> atau drag and drop</div>
      <div style={{ color:"#555", fontSize:11, marginTop:4 }}>{label}</div>
      <input ref={ref} type="file" multiple accept={accept.join(",")} style={{ display:"none" }} onChange={e=>{if(e.target.files?.length)onFiles(Array.from(e.target.files));e.target.value="";}} />
    </div>
  );
}

function SidebarItem({ icon, label, active, onClick, onDelete }: { icon:React.ReactNode; label:string; active:boolean; onClick:()=>void; onDelete?:()=>void }) {
  const [hover, setHover] = useState(false);
  return (
    <div onClick={onClick} onMouseEnter={()=>setHover(true)} onMouseLeave={()=>setHover(false)}
      style={{ display:"flex", alignItems:"center", gap:8, padding:"7px 16px", cursor:"pointer", borderRadius:"0 8px 8px 0", marginRight:8, background:active?"rgba(124,111,205,.18)":hover?"rgba(255,255,255,.04)":"transparent", color:active?"#a78bfa":"#aaa", transition:"all .15s", fontSize:13, userSelect:"none" }}>
      <span style={{ flexShrink:0, opacity:active?1:.6 }}>{icon}</span>
      <span style={{ flex:1, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{label}</span>
      {onDelete && hover && !active && (
        <button onClick={e=>{e.stopPropagation();onDelete()}} style={{ background:"none", border:"none", color:"#f87171", cursor:"pointer", padding:0, display:"flex" }}><Icon.Trash /></button>
      )}
    </div>
  );
}

function CategorySidebar({ type, categories, selected, onSelect, onAdd, onDelete }: { type:"music"|"video"; categories:string[]; selected:string; onSelect:(c:string)=>void; onAdd:(n:string)=>void; onDelete:(n:string)=>void }) {
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const ref = useRef<HTMLInputElement>(null);
  const submit = () => { const n=newName.trim(); if(n&&!categories.includes(n))onAdd(n); setAdding(false); setNewName(""); };
  return (
    <div style={{ width:200, flexShrink:0 }}>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"0 16px 12px", marginBottom:4 }}>
        <span style={{ fontSize:11, color:"#555", fontWeight:700, letterSpacing:"0.08em", textTransform:"uppercase" }}>{type==="music"?"Kategori Musik":"Kategori Video"}</span>
        <button onClick={()=>{setAdding(true);setTimeout(()=>ref.current?.focus(),50)}} style={{ background:"none", border:"none", color:"#7c6fcd", cursor:"pointer", padding:2, display:"flex" }}><Icon.Plus /></button>
      </div>
      <SidebarItem icon={<Icon.Folder />} label="Semua" active={selected==="__all__"} onClick={()=>onSelect("__all__")} />
      {categories.map(cat => <SidebarItem key={cat} icon={<Icon.Folder />} label={cat} active={selected===cat} onClick={()=>onSelect(cat)} onDelete={()=>onDelete(cat)} />)}
      {adding && (
        <div style={{ padding:"6px 12px" }}>
          <input ref={ref} value={newName} onChange={e=>setNewName(e.target.value)}
            onKeyDown={e=>{if(e.key==="Enter")submit();if(e.key==="Escape"){setAdding(false);setNewName("");}}} onBlur={submit}
            placeholder="Nama kategori..." style={{ width:"100%", background:"#16161f", border:"1px solid #7c6fcd", borderRadius:6, padding:"6px 10px", color:"#e8e8ea", fontSize:13, outline:"none", boxSizing:"border-box" }} />
        </div>
      )}
    </div>
  );
}

function FileRow({ file, onDelete, onPlay, isPlaying }: { file:FileItem; onDelete:(id:string)=>void; onPlay:(f:FileItem)=>void; isPlaying:boolean }) {
  const [hover, setHover] = useState(false);
  return (
    <div onMouseEnter={()=>setHover(true)} onMouseLeave={()=>setHover(false)}
      style={{ display:"flex", alignItems:"center", gap:10, padding:"9px 12px", borderRadius:8, background:isPlaying?"rgba(124,111,205,.15)":hover?"rgba(255,255,255,.04)":"transparent", transition:"background .15s" }}>
      <button onClick={()=>onPlay(file)} style={{ width:28, height:28, borderRadius:"50%", border:"none", background:isPlaying?"#7c6fcd":"rgba(255,255,255,.08)", color:"#e8e8ea", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}><Icon.Play /></button>
      <div style={{ flex:1, overflow:"hidden" }}>
        <div style={{ fontSize:13, color:isPlaying?"#a78bfa":"#ddd", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{file.name}</div>
        <div style={{ fontSize:11, color:"#555", display:"flex", gap:8, marginTop:2 }}>
          <span>{fmtSize(file.size)}</span>
          {file.duration!==undefined && <span>{fmtDur(file.duration)}</span>}
          <span style={{ color:"#3a3a5e", background:"#1a1a2e", borderRadius:4, padding:"0 5px" }}>{file.category}</span>
        </div>
      </div>
      {hover && <button onClick={()=>onDelete(file.id)} style={{ background:"none", border:"none", color:"#f87171", cursor:"pointer", padding:4, display:"flex" }}><Icon.Trash /></button>}
    </div>
  );
}

function FileList({ files, type, onDelete, onPlay, playing }: { files:FileItem[]; type:"music"|"video"; onDelete:(id:string)=>void; onPlay:(f:FileItem)=>void; playing:FileItem|null }) {
  if (!files.length) return (
    <div style={{ textAlign:"center", padding:"48px 24px", color:"#444" }}>
      <div style={{ marginBottom:8, opacity:.5 }}>{type==="music"?<Icon.Music />:<Icon.Video />}</div>
      <div style={{ fontSize:13 }}>Belum ada file di kategori ini</div>
    </div>
  );
  return <div style={{ display:"flex", flexDirection:"column", gap:4 }}>{files.map(f => <FileRow key={f.id} file={f} onDelete={onDelete} onPlay={onPlay} isPlaying={playing?.id===f.id} />)}</div>;
}

function UploadModal({ type, categories, onClose, onUpload }: { type:"music"|"video"; categories:string[]; onClose:()=>void; onUpload:(files:File[],cat:string)=>void }) {
  const [cat, setCat] = useState(categories[0]||"");
  const [pending, setPending] = useState<File[]>([]);
  const accept = type==="music"?[".mp3",".wav",".flac",".ogg",".aac",".m4a"]:[".mp4",".webm",".mkv",".mov",".avi"];
  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.7)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:1000, backdropFilter:"blur(4px)" }}>
      <div style={{ background:"#0e0e16", border:"1px solid #1e1e2e", borderRadius:14, width:520, maxWidth:"90vw", padding:28 }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20 }}>
          <h3 style={{ margin:0, color:"#e8e8ea", fontSize:16, fontWeight:600 }}>Upload {type==="music"?"Musik":"Video"}</h3>
          <button onClick={onClose} style={{ background:"none", border:"none", color:"#666", cursor:"pointer", display:"flex" }}><Icon.X /></button>
        </div>
        <div style={{ marginBottom:16 }}>
          <label style={{ fontSize:12, color:"#666", display:"block", marginBottom:6, fontWeight:600, textTransform:"uppercase" }}>Kategori</label>
          <select value={cat} onChange={e=>setCat(e.target.value)} style={{ width:"100%", background:"#16161f", border:"1px solid #2a2a3e", borderRadius:8, padding:"9px 12px", color:"#e8e8ea", fontSize:13, outline:"none" }}>
            {categories.length===0&&<option value="">-- Buat kategori dulu --</option>}
            {categories.map(c=><option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <DropZone onFiles={setPending} accept={accept} label={type==="music"?"MP3, WAV, FLAC, AAC, OGG":"MP4, MKV, WebM, MOV"} />
        {pending.length>0 && (
          <div style={{ marginTop:12, maxHeight:140, overflowY:"auto" }}>
            {pending.map((f,i)=>(
              <div key={i} style={{ display:"flex", alignItems:"center", gap:8, padding:"5px 8px", fontSize:12, color:"#aaa" }}>
                <Icon.File /><span style={{ flex:1, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{f.name}</span>
                <span style={{ color:"#555" }}>{fmtSize(f.size)}</span>
              </div>
            ))}
          </div>
        )}
        <div style={{ display:"flex", gap:10, marginTop:20, justifyContent:"flex-end" }}>
          <button onClick={onClose} style={{ padding:"9px 18px", borderRadius:8, border:"1px solid #2a2a3e", background:"transparent", color:"#aaa", cursor:"pointer", fontSize:13 }}>Batal</button>
          <button onClick={()=>{if(cat&&pending.length){onUpload(pending,cat);onClose()}}} disabled={!cat||!pending.length}
            style={{ padding:"9px 20px", borderRadius:8, border:"none", background:cat&&pending.length?"#7c6fcd":"#2a2a3e", color:cat&&pending.length?"#fff":"#555", cursor:cat&&pending.length?"pointer":"not-allowed", fontSize:13, fontWeight:600, display:"flex", alignItems:"center", gap:6 }}>
            <Icon.Upload /> Upload {pending.length>0?`(${pending.length})`:""}
          </button>
        </div>
      </div>
    </div>
  );
}

function MiniPlayer({ playing, type, apiBase }: { playing:FileItem|null; type:"music"|"video"; apiBase:string }) {
  const mediaRef = useRef<HTMLMediaElement>(null);
  const [paused, setPaused] = useState(false);
  const [progress, setProgress] = useState(0);
  useEffect(() => { setPaused(false); setProgress(0); }, [playing?.id]);
  if (!playing) return null;
  const url = `${apiBase}/media/${type}/${encodeURIComponent(playing.category)}/${encodeURIComponent(playing.name)}`;
  const onTime = () => { const el=mediaRef.current; if(el?.duration) setProgress((el.currentTime/el.duration)*100); };
  const toggle = () => { const el=mediaRef.current; if(!el)return; if(el.paused) el.play(); else el.pause(); };
  const seek = (e: React.MouseEvent<HTMLDivElement>) => { const el=mediaRef.current; if(!el?.duration)return; const r=e.currentTarget.getBoundingClientRect(); el.currentTime=((e.clientX-r.left)/r.width)*el.duration; };
  return (
    <>
    {type==="video" && (
      <div style={{ position:"fixed", bottom:74, right:24, width:340, background:"#000", border:"1px solid #1e1e2e", borderRadius:8, overflow:"hidden", boxShadow:"0 8px 24px rgba(0,0,0,.6)", zIndex:501 }}>
        <video ref={mediaRef as React.RefObject<HTMLVideoElement>} src={url} autoPlay onTimeUpdate={onTime} onPlay={()=>setPaused(false)} onPause={()=>setPaused(true)} onClick={toggle} style={{ width:"100%", display:"block", cursor:"pointer" }} />
      </div>
    )}
    <div style={{ position:"fixed", bottom:0, left:0, right:0, background:"rgba(10,10,18,.96)", borderTop:"1px solid #1e1e2e", backdropFilter:"blur(12px)", padding:"10px 24px", display:"flex", alignItems:"center", gap:16, zIndex:500 }}>
      {type==="music" &&
        <audio ref={mediaRef as React.RefObject<HTMLAudioElement>} src={url} autoPlay onTimeUpdate={onTime} onPlay={()=>setPaused(false)} onPause={()=>setPaused(true)} />}
      <button onClick={toggle} style={{ width:36, height:36, borderRadius:"50%", background:"#7c6fcd", border:"none", color:"#fff", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
        {paused?<Icon.Play />:<Icon.Pause />}
      </button>
      <div style={{ flex:1 }}>
        <div style={{ fontSize:13, color:"#ddd", marginBottom:4, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{playing.name}</div>
        <div onClick={seek} style={{ height:3, background:"#1e1e2e", borderRadius:99, cursor:"pointer" }}>
          <div style={{ height:"100%", background:"#7c6fcd", borderRadius:99, width:`${progress}%`, transition:"width .1s linear" }} />
        </div>
      </div>
      <span style={{ fontSize:11, color:"#555", flexShrink:0 }}>{playing.category}</span>
    </div>
    </>
  );
}

// ─── THUMBNAIL TAB ────────────────────────────────────────────────────────────
type ThumbUploadState = 'idle' | 'uploading' | 'done' | 'error';

function ThumbnailTab({ toast }: { toast: (msg: string, type: ToastItem["type"]) => void }) {
  const [thumbnails, setThumbnails] = useState<ThumbnailFile[]>([]);
  const [uploadState, setUploadState] = useState<ThumbUploadState>('idle');
  const [uploadMsg, setUploadMsg] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [syncLoading, setSyncLoading] = useState(false);
  const [previewFile, setPreviewFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchThumbnails = useCallback(async () => {
    try {
      const res = await fetch('/api/thumbnails');
      if (res.ok) { const d = await res.json(); setThumbnails(d.files || []); }
    } catch {}
  }, []);

  useEffect(() => { fetchThumbnails(); }, [fetchThumbnails]);
  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

  const handleFileSelect = (file: File) => {
    if (!file.type.startsWith('image/')) { toast('Hanya JPG, PNG, WebP', 'error'); return; }
    if (file.size > 5 * 1024 * 1024) { toast('File max 5MB', 'error'); return; }
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewFile(file);
    setPreviewUrl(URL.createObjectURL(file));
    setUploadState('idle');
    setUploadMsg('');
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelect(file);
  };

  const handleUpload = async () => {
    if (!previewFile) return;
    setUploadState('uploading'); setUploadMsg('Mengupload ke VPS...');
    try {
      const formData = new FormData();
      formData.append('file', previewFile);
      const res = await fetch('/api/thumbnails/upload', { method: 'POST', body: formData });
      const data = await res.json();
      if (!res.ok) { setUploadState('error'); setUploadMsg(data.error || 'Upload gagal'); return; }
      await fetchThumbnails();
      setUploadState('done'); setUploadMsg(`✓ ${data.filename} tersimpan`);
      toast(`${data.filename} berhasil diupload`, 'success');
      setTimeout(() => {
        setPreviewFile(null);
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        setPreviewUrl(null); setUploadState('idle'); setUploadMsg('');
      }, 2000);
    } catch (err) { setUploadState('error'); setUploadMsg(err instanceof Error ? err.message : 'Error'); }
  };

  const handleSync = async () => {
    setSyncLoading(true);
    try {
      const res = await fetch('/api/thumbnails/sync', { method: 'POST' });
      const data = await res.json();
      toast(`Sync selesai — ${data.total} file`, 'success');
    } catch { toast('Sync gagal', 'error'); }
    finally { setSyncLoading(false); }
  };

  const handleDelete = async (filename: string) => {
    if (!confirm(`Hapus ${filename}?`)) return;
    await fetch(`/api/thumbnails/${encodeURIComponent(filename)}`, { method: 'DELETE' });
    await fetchThumbnails();
    toast(`${filename} dihapus`, 'info');
  };

  const stateColor = { idle:'', uploading:'#f5c85a', done:'#4ade80', error:'#f87171' }[uploadState];

  return (
    <div>
      {/* Lightbox */}
      {lightbox && (
        <div onClick={()=>setLightbox(null)} style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.85)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:2000, cursor:"zoom-out" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={lightbox} alt="preview" style={{ maxWidth:"90vw", maxHeight:"90vh", borderRadius:8, boxShadow:"0 8px 40px rgba(0,0,0,.8)" }} />
        </div>
      )}

      {/* Upload zone */}
      <div style={{ background:"#111318", border:"1px solid #2a2e38", borderRadius:12, padding:20, marginBottom:16 }}>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:14 }}>
          <span style={{ fontSize:11, color:"#555", fontWeight:700, letterSpacing:"0.08em", textTransform:"uppercase" }}>Upload Thumbnail</span>
          <button onClick={handleSync} disabled={syncLoading}
            style={{ display:"flex", alignItems:"center", gap:5, padding:"5px 12px", borderRadius:6, border:"1px solid #2a2a3e", background:"transparent", color:syncLoading?"#7c6fcd":"#aaa", cursor:syncLoading?"not-allowed":"pointer", fontSize:12, fontWeight:600 }}>
            <span style={{ display:"inline-flex", animation:syncLoading?"spin 1s linear infinite":"none" }}><Icon.Sync /></span>
            {syncLoading?"Syncing...":"Sync ke Drive"}
          </button>
        </div>

        <div
          onDragOver={e=>{e.preventDefault();setDragOver(true)}} onDragLeave={()=>setDragOver(false)} onDrop={handleDrop}
          onClick={()=>fileInputRef.current?.click()}
          style={{ border:`2px dashed ${dragOver?"#7c6fcd":previewFile?"#2a4a1a":"#2a2a3e"}`, borderRadius:10, padding:"20px", textAlign:"center", cursor:"pointer", background:dragOver?"rgba(124,111,205,.06)":previewFile?"#0a1200":"transparent", transition:"all .15s" }}>
          <input ref={fileInputRef} type="file" accept="image/jpeg,image/jpg,image/png,image/webp" style={{ display:"none" }}
            onChange={e=>{ const f=e.target.files?.[0]; if(f)handleFileSelect(f); }} />
          {previewUrl ? (
            <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:10 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={previewUrl} alt="preview" style={{ maxHeight:120, maxWidth:280, objectFit:"contain", borderRadius:6, border:"1px solid #2a2a3e" }} />
              <div style={{ fontSize:12, color:"#ccc" }}>{previewFile?.name} · {previewFile?fmtSize(previewFile.size):""}</div>
              <div style={{ fontSize:11, color:"#555" }}>klik untuk ganti</div>
            </div>
          ) : (
            <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:8 }}>
              <span style={{ fontSize:28, opacity:.25 }}>🖼</span>
              <div style={{ fontSize:13, color:"#666" }}>Drop gambar atau <span style={{ color:"#7c6fcd" }}>klik pilih</span></div>
              <div style={{ fontSize:11, color:"#444" }}>JPG · PNG · WebP · max 5MB</div>
            </div>
          )}
        </div>

        {uploadMsg && <div style={{ marginTop:10, fontSize:12, color:stateColor }}>{uploadMsg}</div>}

        {previewFile && uploadState !== 'done' && (
          <button onClick={handleUpload} disabled={uploadState==='uploading'}
            style={{ width:"100%", marginTop:12, padding:"10px", borderRadius:8, border:"none", background:uploadState==='uploading'?"#3a3a5e":"#7c6fcd", color:"#fff", cursor:uploadState==='uploading'?"not-allowed":"pointer", fontWeight:600, fontSize:13 }}>
            {uploadState==='uploading'?"⟳ Uploading...":"↑ Upload ke VPS"}
          </button>
        )}
      </div>

      {/* Grid */}
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:12 }}>
        <span style={{ fontSize:11, color:"#555", fontWeight:700, letterSpacing:"0.08em", textTransform:"uppercase" }}>
          /opt/thumbnails — {thumbnails.length} file
        </span>
      </div>

      {thumbnails.length === 0 ? (
        <div style={{ background:"#111318", border:"1px solid #1e1e2e", borderRadius:10, padding:"32px", textAlign:"center", color:"#444", fontSize:13 }}>Belum ada thumbnail.</div>
      ) : (
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(140px, 1fr))", gap:10 }}>
          {thumbnails.map(t => (
            <div key={t.filename} style={{ background:"#111318", border:"1px solid #2a2e38", borderRadius:8, overflow:"hidden", position:"relative" }}
              onMouseEnter={e=>(e.currentTarget.querySelector('.thumb-actions') as HTMLElement|null)?.style && ((e.currentTarget.querySelector('.thumb-actions') as HTMLElement).style.opacity='1')}
              onMouseLeave={e=>(e.currentTarget.querySelector('.thumb-actions') as HTMLElement|null)?.style && ((e.currentTarget.querySelector('.thumb-actions') as HTMLElement).style.opacity='0')}>
              <div style={{ aspectRatio:"16/9", background:"#0d0f12", display:"flex", alignItems:"center", justifyContent:"center", cursor:"zoom-in", position:"relative" }}
                onClick={()=>setLightbox(`/api/thumbnails/preview/${encodeURIComponent(t.filename)}`)}>
                <span style={{ fontSize:24, opacity:.2 }}>🖼</span>
              </div>
              <div className="thumb-actions" style={{ position:"absolute", top:4, right:4, display:"flex", gap:4, opacity:0, transition:"opacity .15s" }}>
                <button onClick={()=>handleDelete(t.filename)}
                  style={{ width:22, height:22, borderRadius:4, background:"rgba(26,10,10,.9)", border:"1px solid #3a1a1a", color:"#f87171", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", fontSize:10 }}>
                  ✕
                </button>
              </div>
              <div style={{ padding:"6px 8px" }}>
                <div style={{ fontSize:10, color:"#ccc", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }} title={t.filename}>{t.filename}</div>
                <div style={{ fontSize:9, color:"#444", marginTop:2 }}>{fmtSize(t.sizeBytes)}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── MAIN PAGE ────────────────────────────────────────────────────────────────
type ActiveTab = "music" | "video" | "thumbnails";

export default function MediaPool() {
  const { toasts, add: addToast, remove: removeToast } = useToast();
  const [activeTab, setActiveTab] = useState<ActiveTab>("music");
  const [musicCats, setMusicCats] = useState<string[]>(["Rainy","Jazz","Night","Chill","Hype"]);
  const [videoCats, setVideoCats] = useState<string[]>(["Overlay","BRB","Starting","Ending"]);
  const [musicCat, setMusicCat] = useState("__all__");
  const [videoCat, setVideoCat] = useState("__all__");
  const [files, setFiles] = useState<FileItem[]>([]);

  const fetchFiles = useCallback(async () => {
    try {
      const r = await fetch(`${API_BASE}/files`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = await r.json();
      setFiles(Array.isArray(data.files) ? data.files : []);
    } catch (err) { console.error("Gagal load files:", err); }
  }, []);

  useEffect(() => { fetchFiles(); }, [fetchFiles]);

  const fetchCategories = useCallback(async () => {
    try {
      const r = await fetch(`${API_BASE}/categories`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = await r.json();
      if (Array.isArray(data.music)) setMusicCats(data.music);
      if (Array.isArray(data.video)) setVideoCats(data.video);
    } catch (err) { console.error("Gagal load categories:", err); }
  }, []);

  useEffect(() => { fetchCategories(); }, [fetchCategories]);

  const [queue, setQueue] = useState<UploadQueueItem[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [playing, setPlaying] = useState<FileItem|null>(null);
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<string|null>(null);

  const mediaType = activeTab === "thumbnails" ? "music" : activeTab;
  const cats = mediaType==="music"?musicCats:videoCats;
  const selCat = mediaType==="music"?musicCat:videoCat;
  const setSelCat = mediaType==="music"?setMusicCat:setVideoCat;
  const visible = files.filter(f => f.type===mediaType && (selCat==="__all__"||f.category===selCat));

  const handleUpload = async (rawFiles: File[], category: string) => {
    const items: UploadQueueItem[] = rawFiles.map(f => ({ id:`${Date.now()}-${Math.random()}`, name:f.name, file:f, status:"pending", progress:0 }));
    setQueue(q => [...q, ...items]);
    for (const item of items) {
      try {
        setQueue(q => q.map(i => i.id===item.id?{...i,status:"uploading"}:i));
        const fd = new FormData();
        fd.append("type", mediaType);
        fd.append("category", category);
        fd.append("file", item.file);
        await new Promise<void>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.upload.onprogress = e => { const p=Math.round((e.loaded/e.total)*100); setQueue(q=>q.map(i=>i.id===item.id?{...i,progress:p}:i)); };
          xhr.onload = () => xhr.status===200?resolve():reject(new Error(`HTTP ${xhr.status}`));
          xhr.onerror = () => reject(new Error("Network error"));
          xhr.open("POST", `${API_BASE}/upload`);
          xhr.send(fd);
        });
        await fetchFiles();
        setQueue(q => q.map(i => i.id===item.id?{...i,status:"done",progress:100}:i));
        addToast(`${item.name} berhasil diupload`, "success");
      } catch(err) {
        setQueue(q => q.map(i => i.id===item.id?{...i,status:"error"}:i));
        addToast(`Gagal: ${err instanceof Error?err.message:"error"}`, "error");
      }
    }
    setTimeout(() => setQueue(q => q.filter(i => i.status!=="done")), 5000);
  };

  const triggerSync = async (silent=false) => {
    if (syncing) return;
    setSyncing(true);
    try {
      const r = await fetch(`${API_BASE}/sync`, { method:"POST" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setLastSync(new Date().toLocaleTimeString("id-ID",{hour:"2-digit",minute:"2-digit"}));
      if (!silent) addToast("Sync ke GDrive berhasil", "success");
    } catch(err) {
      addToast(`Sync gagal: ${err instanceof Error?err.message:"error"}`, "error");
    } finally { setSyncing(false); }
  };

  const addCat = async (type:"music"|"video", name:string) => {
    try {
      const res = await fetch(`${API_BASE}/categories`, { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ type, name }) });
      if (!res.ok) { const err = await res.json(); throw new Error(err.error || `HTTP ${res.status}`); }
      await fetchCategories();
      addToast(`Kategori "${name}" ditambahkan`,"success");
    } catch(err) { addToast(`Gagal: ${err instanceof Error?err.message:"error"}`, "error"); }
  };

  const delCat = async (type:"music"|"video", name:string) => {
    if (files.some(f=>f.type===type&&f.category===name)) { addToast(`"${name}" masih ada filenya`,"error"); return; }
    try {
      const res = await fetch(`${API_BASE}/categories/${type}/${encodeURIComponent(name)}`, { method:"DELETE" });
      if (!res.ok) { const err = await res.json(); throw new Error(err.error || `HTTP ${res.status}`); }
      await fetchCategories();
      if(selCat===name)setSelCat("__all__");
      addToast(`Kategori "${name}" dihapus`,"info");
    } catch(err) { addToast(`Gagal: ${err instanceof Error?err.message:"error"}`, "error"); }
  };

  const delFile = async (id:string) => {
    const f = files.find(x=>x.id===id);
    if (!f) return;
    try {
      const res = await fetch(`${API_BASE}/files/${f.type}/${encodeURIComponent(f.category)}/${encodeURIComponent(f.name)}`, { method:"DELETE" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      if (playing?.id===id) setPlaying(null);
      await fetchFiles();
      addToast("File dihapus","info");
    } catch(err) { addToast(`Gagal hapus: ${err instanceof Error?err.message:"error"}`, "error"); }
  };

  const tabStyle = (tab: ActiveTab) => ({
    display:"flex" as const, alignItems:"center" as const, gap:6,
    padding:"8px 16px", borderRadius:6, fontSize:12, fontWeight:600,
    cursor:"pointer" as const, border:"1px solid transparent",
    background: activeTab===tab ? "var(--accent)" : "transparent",
    color: activeTab===tab ? "#fff" : "var(--text-secondary)",
    borderColor: activeTab===tab ? "var(--accent)" : "var(--border)",
    transition:"all .15s",
  });

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Media Pool</h1>
          <p className="page-subtitle">Manage music, video & thumbnails</p>
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
          <button style={tabStyle("music")} onClick={()=>setActiveTab("music")}>
            <Icon.Music /> Musik
            <span style={{ background:"rgba(255,255,255,0.15)", borderRadius:99, padding:"1px 7px", fontSize:11 }}>{files.filter(f=>f.type==="music").length}</span>
          </button>
          <button style={tabStyle("video")} onClick={()=>setActiveTab("video")}>
            <Icon.Video /> Video
            <span style={{ background:"rgba(255,255,255,0.15)", borderRadius:99, padding:"1px 7px", fontSize:11 }}>{files.filter(f=>f.type==="video").length}</span>
          </button>
          <button style={tabStyle("thumbnails")} onClick={()=>setActiveTab("thumbnails")}>
            <Icon.Image /> Thumbnails
          </button>
          {activeTab !== "thumbnails" && (
            <button onClick={()=>setShowModal(true)} className="btn btn-primary">
              <Icon.Upload /> Upload {activeTab==="music"?"Musik":"Video"}
            </button>
          )}
        </div>
      </div>

      {/* Thumbnails tab */}
      {activeTab === "thumbnails" && (
        <ThumbnailTab toast={addToast} />
      )}

      {/* Music/Video tabs */}
      {activeTab !== "thumbnails" && (
        <>
          <div style={{ marginBottom:16, display:"flex", alignItems:"center", gap:10, padding:"8px 14px", background:"#0a0a12", border:"1px solid #1a1a28", borderRadius:8, fontSize:12, color:"#555" }}>
            <Icon.Cloud />
            <span style={{ flex:1 }}>GDrive Sync {lastSync?`- Terakhir: ${lastSync}`:"- Belum pernah sync"}</span>
            <button onClick={()=>triggerSync(false)} disabled={syncing} style={{ display:"flex", alignItems:"center", gap:5, padding:"5px 12px", borderRadius:6, border:"1px solid #2a2a3e", background:syncing?"#1a1a2e":"transparent", color:syncing?"#7c6fcd":"#aaa", cursor:syncing?"not-allowed":"pointer", fontSize:12, fontWeight:600 }}>
              <span style={{ display:"inline-flex", animation:syncing?"spin 1s linear infinite":"none" }}><Icon.Sync /></span>
              {syncing?"Syncing...":"Sync ke Drive"}
            </button>
          </div>

          {queue.length>0 && (
            <div style={{ margin:"12px 0", display:"flex", flexDirection:"column", gap:6 }}>
              {queue.map(item => (
                <div key={item.id} style={{ background:"#111118", border:"1px solid #1e1e2e", borderRadius:8, padding:"8px 12px" }}>
                  <div style={{ display:"flex", justifyContent:"space-between", marginBottom:4 }}>
                    <span style={{ fontSize:12, color:"#ccc", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", maxWidth:"70%" }}>{item.name}</span>
                    <span style={{ fontSize:11, color:item.status==="done"?"#4ade80":item.status==="error"?"#f87171":"#7c6fcd" }}>
                      {item.status==="uploading"?`${item.progress}%`:item.status==="done"?"selesai":item.status==="error"?"gagal":"menunggu..."}
                    </span>
                  </div>
                  <div style={{ height:3, background:"#1e1e2e", borderRadius:99, overflow:"hidden" }}>
                    <div style={{ height:"100%", borderRadius:99, width:`${item.progress}%`, background:item.status==="done"?"#4ade80":item.status==="error"?"#f87171":"#7c6fcd" }} />
                  </div>
                </div>
              ))}
            </div>
          )}

          <div style={{ display:"flex", background:"#0e0e16", border:"1px solid #1e1e2e", borderRadius:12, overflow:"hidden", minHeight:420 }}>
            <div style={{ paddingTop:16, paddingBottom:16, borderRight:"1px solid #1e1e2e" }}>
              <CategorySidebar type={activeTab} categories={cats} selected={selCat} onSelect={setSelCat} onAdd={n=>addCat(activeTab,n)} onDelete={n=>delCat(activeTab,n)} />
            </div>
            <div style={{ flex:1, padding:16, overflowY:"auto", maxHeight:560 }}>
              <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:12, fontSize:12, color:"#555" }}>
                <span>{activeTab==="music"?"Musik":"Video"}</span>
                {selCat!=="__all__"&&<><Icon.ChevronRight /><span style={{ color:"#a78bfa" }}>{selCat}</span></>}
                <span style={{ marginLeft:"auto", color:"#444" }}>{visible.length} file</span>
              </div>
              <FileList files={visible} type={activeTab} onDelete={delFile} onPlay={setPlaying} playing={playing} />
            </div>
          </div>

          <div style={{ marginTop:12, padding:"10px 14px", background:"#0a0a12", border:"1px solid #1a1a28", borderRadius:8, fontSize:12, color:"#444", display:"flex", gap:8 }}>
            <span>Info:</span>
            <span>File disimpan di VPS: <code style={{ color:"#666" }}>/opt/media/{activeTab}/[kategori]/</code></span>
          </div>
        </>
      )}

      {showModal && <UploadModal type={activeTab as "music"|"video"} categories={cats} onClose={()=>setShowModal(false)} onUpload={handleUpload} />}
      {activeTab !== "thumbnails" && <MiniPlayer playing={playing} type={activeTab as "music"|"video"} apiBase={API_BASE} />}
      <Toast toasts={toasts} remove={removeToast} />
    </>
  );
}