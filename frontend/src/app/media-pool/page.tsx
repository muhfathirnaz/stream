'use client';

import { useState, useRef, useCallback, useEffect } from "react";

const API_BASE = "/media-pool-api";

interface ToastItem { id: number; msg: string; type: "info" | "success" | "error"; }
interface FileItem { id: string; name: string; size: number; type: "music" | "video"; category: string; status?: string; duration?: number; }
interface UploadQueueItem { id: string; name: string; file: File; status: "pending" | "uploading" | "done" | "error"; progress: number; }
interface ThumbnailFile { filename: string; path: string; sizeBytes: number; createdAt: string; category?: string; }

const Icon = {
  Music: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16"><path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" /></svg>,
  Video: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16"><rect x="2" y="3" width="15" height="15" rx="2" /><path d="m17 8 5-3v14l-5-3" /></svg>,
  Image: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16"><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" /></svg>,
  Upload: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>,
  Folder: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" /></svg>,
  Plus: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="14" height="14"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>,
  Trash: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>,
  Cloud: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14"><path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z" /></svg>,
  Sync: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14"><path d="M23 4v6h-6" /><path d="M1 20v-6h6" /><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" /></svg>,
  Play: () => <svg viewBox="0 0 24 24" fill="currentColor" width="12" height="12"><polygon points="5 3 19 12 5 21 5 3" /></svg>,
  Pause: () => <svg viewBox="0 0 24 24" fill="currentColor" width="12" height="12"><rect x="6" y="4" width="4" height="16" /><rect x="14" y="4" width="4" height="16" /></svg>,
  Check: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="12" height="12"><polyline points="20 6 9 17 4 12" /></svg>,
  X: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="12" height="12"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>,
  ChevronRight: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="12" height="12"><polyline points="9 18 15 12 9 6" /></svg>,
  File: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" /><polyline points="13 2 13 9 20 9" /></svg>,
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
    <div className="fixed bottom-6 right-6 flex flex-col gap-2 z-[9999]">
      {toasts.map(t => (
        <div key={t.id} className={`flex items-center gap-3 px-4 py-3 rounded-2xl shadow-2xl backdrop-blur-xl border animate-in slide-in-from-right-8 duration-300 ${t.type==="error"?"bg-red-500/10 border-red-500/20 text-white":t.type==="success"?"bg-emerald-500/10 border-emerald-500/20 text-white":"bg-black/60 border-white/10 text-white"}`}>
          <span className={t.type==="error"?"text-red-400":t.type==="success"?"text-emerald-400":"text-blue-400"}>{t.type==="success"?<Icon.Check />:<Icon.X />}</span>
          <span className="text-xs font-medium pr-4">{t.msg}</span>
          <button onClick={() => remove(t.id)} className="text-white/40 hover:text-white transition-colors"><Icon.X /></button>
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
      className={`border-2 border-dashed rounded-3xl p-8 text-center cursor-pointer transition-all duration-300 ${drag ? 'border-white/40 bg-white/5' : 'border-white/10 hover:bg-white/[0.02]'}`}>
      <div className={`mb-3 flex justify-center ${drag ? 'text-white' : 'text-white/40'}`}><Icon.Upload /></div>
      <div className="text-xs text-white/60 mb-1"><span className="text-white font-semibold">Pilih file</span> atau drag and drop</div>
      <div className="text-[10px] text-white/30">{label}</div>
      <input ref={ref} type="file" multiple accept={accept.join(",")} className="hidden" onChange={e=>{if(e.target.files?.length)onFiles(Array.from(e.target.files));e.target.value="";}} />
    </div>
  );
}

function SidebarItem({ icon, label, active, onClick, onDelete, onDropFile }: { icon:React.ReactNode; label:string; active:boolean; onClick:()=>void; onDelete?:()=>void; onDropFile?:(data:string)=>void }) {
  const [hover, setHover] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  return (
    <div onClick={onClick} onMouseEnter={()=>setHover(true)} onMouseLeave={()=>setHover(false)}
      onDragOver={e=>{ if (onDropFile && label !== '__all__') { e.preventDefault(); setDragOver(true); } }}
      onDragLeave={()=>setDragOver(false)}
      onDrop={e=>{
        e.preventDefault(); setDragOver(false);
        if (onDropFile && label !== '__all__') {
          const data = e.dataTransfer.getData('text/plain');
          if (data) onDropFile(data);
        }
      }}
      className={`group flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-medium cursor-pointer transition-all duration-300 ${dragOver ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : active ? 'bg-white text-black shadow-md' : 'text-white/60 hover:bg-white/10 hover:text-white border border-transparent'}`}>
      <div className="flex items-center gap-2.5 truncate">
        <span className={active ? 'text-black' : dragOver ? 'text-emerald-400' : 'opacity-50'}>{icon}</span>
        <span className="truncate">{label === '__all__' ? 'Semua Kategori' : label}</span>
      </div>
      {onDelete && hover && !active && !dragOver && (
        <button onClick={e=>{e.stopPropagation();onDelete()}} className="text-white/30 hover:text-red-500 transition-colors"><Icon.Trash /></button>
      )}
    </div>
  );
}

function CategorySidebar({ type, categories, selected, onSelect, onAdd, onDelete, onMoveFile }: { type:"music"|"video"; categories:string[]; selected:string; onSelect:(c:string)=>void; onAdd:(n:string)=>void; onDelete:(n:string)=>void; onMoveFile:(fileData:string, newCat:string)=>void }) {
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const ref = useRef<HTMLInputElement>(null);
  const submit = () => { const n=newName.trim(); if(n&&!categories.includes(n))onAdd(n); setAdding(false); setNewName(""); };
  
  return (
    <div className="w-full md:w-56 flex-shrink-0 flex flex-col gap-1">
      <div className="flex items-center justify-between px-2 mb-2">
        <span className="text-[10px] font-semibold text-white/40 uppercase tracking-widest">{type==="music"?"Kategori Musik":"Kategori Video"}</span>
        <button onClick={()=>{setAdding(true);setTimeout(()=>ref.current?.focus(),50)}} className="text-white/40 hover:text-white transition-colors p-1"><Icon.Plus /></button>
      </div>
      <SidebarItem icon={<Icon.Folder />} label="__all__" active={selected==="__all__"} onClick={()=>onSelect("__all__")} />
      {categories.map(cat => (
        <SidebarItem key={cat} icon={<Icon.Folder />} label={cat} active={selected===cat} onClick={()=>onSelect(cat)} onDelete={()=>onDelete(cat)} onDropFile={(data) => onMoveFile(data, cat)} />
      ))}
      {adding && (
        <div className="px-2 mt-1 animate-in fade-in zoom-in-95">
          <input ref={ref} value={newName} onChange={e=>setNewName(e.target.value)}
            onKeyDown={e=>{if(e.key==="Enter")submit();if(e.key==="Escape"){setAdding(false);setNewName("");}}} onBlur={submit}
            placeholder="Nama..." className="w-full glass-input rounded-lg px-3 py-2 text-xs text-white outline-none focus:ring-1 focus:ring-white/20" />
        </div>
      )}
    </div>
  );
}

function FileRow({ file, onDelete, onPlay, isPlaying }: { file:FileItem; onDelete:(id:string)=>void; onPlay:(f:FileItem)=>void; isPlaying:boolean }) {
  return (
    <div draggable onDragStart={e => e.dataTransfer.setData('text/plain', JSON.stringify({ filename: file.name, oldCategory: file.category, type: file.type }))}
      className={`group flex items-center gap-3 p-2.5 rounded-2xl transition-all duration-300 cursor-grab border ${isPlaying ? 'bg-white/10 border-white/20' : 'bg-transparent hover:bg-white/5 border-transparent'}`}>
      <button onClick={()=>onPlay(file)} className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 transition-all shadow-sm ${isPlaying ? 'bg-white text-black scale-95' : 'bg-white/10 text-white group-hover:bg-white/20'}`}>
        {isPlaying ? <Icon.Pause /> : <Icon.Play />}
      </button>
      <div className="flex-1 overflow-hidden">
        <div className={`text-xs font-semibold truncate ${isPlaying ? 'text-white' : 'text-white/80'}`}>{file.name}</div>
        <div className="flex items-center gap-2 mt-1 text-[10px] text-white/40 font-medium">
          <span>{fmtSize(file.size)}</span>
          {file.duration!==undefined && <span>• {fmtDur(file.duration)}</span>}
          <span className="px-1.5 py-0.5 rounded-md bg-white/5 text-white/60">{file.category}</span>
        </div>
      </div>
      <button onClick={()=>onDelete(file.id)} className="w-8 h-8 flex items-center justify-center rounded-xl text-white/30 hover:bg-red-500/20 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all"><Icon.Trash /></button>
    </div>
  );
}

function FileList({ files, type, onDelete, onPlay, playing }: { files:FileItem[]; type:"music"|"video"; onDelete:(id:string)=>void; onPlay:(f:FileItem)=>void; playing:FileItem|null }) {
  if (!files.length) return (
    <div className="h-full flex flex-col items-center justify-center text-white/30 pb-10">
      <div className="mb-3 opacity-50 scale-150">{type==="music"?<Icon.Music />:<Icon.Video />}</div>
      <div className="text-xs font-medium">Belum ada file di kategori ini</div>
    </div>
  );
  return <div className="flex flex-col gap-1">{files.map(f => <FileRow key={f.id} file={f} onDelete={onDelete} onPlay={onPlay} isPlaying={playing?.id===f.id} />)}</div>;
}

function UploadModal({ type, categories, onClose, onUpload }: { type:"music"|"video"; categories:string[]; onClose:()=>void; onUpload:(files:File[],cat:string)=>void }) {
  const [cat, setCat] = useState(categories[0]||"");
  const [pending, setPending] = useState<File[]>([]);
  const accept = type==="music"?[".mp3",".wav",".flac",".ogg",".aac",".m4a"]:[".mp4",".webm",".mkv",".mov",".avi"];
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center z-[1000] p-4">
      <div className="bg-[#111116] border border-white/10 rounded-[32px] w-full max-w-md p-6 sm:p-8 animate-in zoom-in-95 duration-300 shadow-2xl">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-base font-bold text-white">Upload {type==="music"?"Musik":"Video"}</h3>
          <button onClick={onClose} className="text-white/40 hover:text-white transition-colors"><Icon.X /></button>
        </div>
        <div className="mb-5">
          <label className="text-[10px] font-semibold text-white/40 uppercase tracking-widest block mb-2">Pilih Kategori</label>
          <select value={cat} onChange={e=>setCat(e.target.value)} className="w-full glass-input rounded-xl px-4 py-3 text-sm text-white outline-none focus:ring-1 focus:ring-white/20 appearance-none">
            {categories.length===0&&<option value="">-- Buat kategori dulu --</option>}
            {categories.map(c=><option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <DropZone onFiles={setPending} accept={accept} label={type==="music"?"MP3, WAV, FLAC, AAC, OGG":"MP4, MKV, WebM, MOV"} />
        {pending.length>0 && (
          <div className="mt-4 max-h-32 overflow-y-auto space-y-1 pr-1">
            {pending.map((f,i)=>(
              <div key={i} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 text-xs text-white/60">
                <Icon.File /><span className="flex-1 truncate text-white/80">{f.name}</span><span className="text-[10px]">{fmtSize(f.size)}</span>
              </div>
            ))}
          </div>
        )}
        <div className="flex gap-2 mt-6 justify-end">
          <button onClick={onClose} className="px-5 py-2.5 rounded-full text-xs font-medium text-white/50 hover:text-white transition-colors">Batal</button>
          <button onClick={()=>{if(cat&&pending.length){onUpload(pending,cat);onClose()}}} disabled={!cat||!pending.length}
            className="bg-white text-black px-6 py-2.5 rounded-full text-xs font-bold disabled:opacity-30 hover:scale-95 transition-all flex items-center gap-2">
            <Icon.Upload /> Upload
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
      <div className="fixed bottom-24 right-6 w-80 glass-card-strong rounded-[24px] overflow-hidden shadow-2xl z-[501] animate-in slide-in-from-bottom-4">
        <video ref={mediaRef as React.RefObject<HTMLVideoElement>} src={url} autoPlay onTimeUpdate={onTime} onPlay={()=>setPaused(false)} onPause={()=>setPaused(true)} onClick={toggle} className="w-full block cursor-pointer" />
      </div>
    )}
    <div className="fixed bottom-0 left-0 right-0 bg-[#050508]/90 backdrop-blur-3xl border-t border-white/10 px-6 py-4 flex items-center gap-4 z-[500]">
      {type==="music" && <audio ref={mediaRef as React.RefObject<HTMLAudioElement>} src={url} autoPlay onTimeUpdate={onTime} onPlay={()=>setPaused(false)} onPause={()=>setPaused(true)} />}
      <button onClick={toggle} className="w-10 h-10 rounded-full bg-white text-black flex items-center justify-center hover:scale-95 transition-transform shadow-lg flex-shrink-0">
        {paused ? <Icon.Play /> : <Icon.Pause />}
      </button>
      <div className="flex-1 max-w-md">
        <div className="text-xs font-semibold text-white mb-1.5 truncate">{playing.name}</div>
        <div onClick={seek} className="h-1.5 bg-white/10 rounded-full cursor-pointer overflow-hidden group">
          <div className="h-full bg-white rounded-full transition-all duration-100 relative" style={{ width:`${progress}%` }}>
            <div className="absolute right-0 top-1/2 -translate-y-1/2 w-2 h-2 bg-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
        </div>
      </div>
      <span className="text-[10px] font-medium text-white/40 px-2.5 py-1 rounded-md bg-white/5">{playing.category}</span>
    </div>
    </>
  );
}

function ThumbnailCategoryItem({ cat, count, selectedCat, onSelect, onDelete, onDropFile }: { cat: string, count: number, selectedCat: string, onSelect: (c: string) => void, onDelete: (c: string) => void, onDropFile: (data:string, cat:string) => void }) {
  const [hover, setHover] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  return (
    <div onClick={()=>onSelect(cat)} onMouseEnter={()=>setHover(true)} onMouseLeave={()=>setHover(false)}
      onDragOver={e=>{ e.preventDefault(); setDragOver(true); }} onDragLeave={()=>setDragOver(false)}
      onDrop={e=>{ e.preventDefault(); setDragOver(false); const data = e.dataTransfer.getData('text/plain'); if(data) onDropFile(data, cat); }}
      className={`group flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-medium cursor-pointer transition-all duration-300 ${dragOver ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : selectedCat===cat ? 'bg-white text-black shadow-md' : 'text-white/60 hover:bg-white/10 hover:text-white border border-transparent'}`}>
      <div className="flex items-center gap-2.5 truncate">
        <span className={selectedCat===cat ? 'text-black' : dragOver ? 'text-emerald-400' : 'opacity-50'}><Icon.Folder /></span>
        <span className="truncate">{cat}</span>
      </div>
      <div className="flex items-center gap-2">
        <span className={`text-[10px] ${selectedCat===cat ? 'text-black/50' : 'text-white/30'}`}>{count}</span>
        {hover && selectedCat !== cat && !dragOver && (
          <button onClick={e=>{e.stopPropagation();onDelete(cat)}} className="text-white/30 hover:text-red-500 transition-colors"><Icon.Trash /></button>
        )}
      </div>
    </div>
  );
}

function ThumbnailTab({ toast }: { toast: (msg: string, type: ToastItem["type"]) => void }) {
  const [thumbnails, setThumbnails] = useState<ThumbnailFile[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [selectedCat, setSelectedCat] = useState('__all__');
  const [newCatName, setNewCatName] = useState('');
  const [addingCat, setAddingCat] = useState(false);
  const catInputRef = useRef<HTMLInputElement>(null);
  const [uploadState, setUploadState] = useState<'idle'|'uploading'|'done'|'error'>('idle');
  const [uploadMsg, setUploadMsg] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [syncLoading, setSyncLoading] = useState(false);
  const [previewFile, setPreviewFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [uploadCategory, setUploadCategory] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchThumbnails = useCallback(async () => { try { const res = await fetch('/api/thumbnails'); if (res.ok) { const d = await res.json(); setThumbnails(d.files || []); } } catch {} }, []);
  const fetchCategories = useCallback(async () => { try { const res = await fetch('/api/thumbnails/categories'); if (res.ok) { const d = await res.json(); setCategories(d.categories || []); } } catch {} }, []);
  useEffect(() => { fetchThumbnails(); fetchCategories(); }, [fetchThumbnails, fetchCategories]);
  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

  const handleFileSelect = (file: File) => {
    if (!file.type.startsWith('image/')) return toast('Hanya JPG, PNG, WebP', 'error');
    if (file.size > 5 * 1024 * 1024) return toast('File max 5MB', 'error');
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewFile(file); setPreviewUrl(URL.createObjectURL(file)); setUploadState('idle'); setUploadMsg('');
  };

  const handleDrop = (e: React.DragEvent) => { e.preventDefault(); setDragOver(false); const file = e.dataTransfer.files[0]; if (file) handleFileSelect(file); };

  const handleUpload = async () => {
    if (!previewFile) return;
    setUploadState('uploading'); setUploadMsg('Mengupload...');
    try {
      const formData = new FormData(); formData.append('file', previewFile); if (uploadCategory) formData.append('category', uploadCategory);
      const res = await fetch('/api/thumbnails/upload', { method: 'POST', body: formData });
      const data = await res.json();
      if (!res.ok) { setUploadState('error'); setUploadMsg(data.error || 'Upload gagal'); return; }
      await fetchThumbnails(); await fetchCategories();
      setUploadState('done'); setUploadMsg(`✓ ${data.filename}`); toast(`${data.filename} diupload`, 'success');
      setTimeout(() => { setPreviewFile(null); if (previewUrl) URL.revokeObjectURL(previewUrl); setPreviewUrl(null); setUploadState('idle'); setUploadMsg(''); }, 2000);
    } catch (err) { setUploadState('error'); setUploadMsg('Error'); }
  };

  const handleMoveFile = async (dataString: string, targetCat: string) => {
    try {
      const data = JSON.parse(dataString); if (data.type !== 'thumbnail' || data.oldCategory === targetCat) return;
      const res = await fetch('/api/thumbnails/move', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ filename: data.filename, oldCategory: data.oldCategory, newCategory: targetCat }) });
      const result = await res.json(); if (!res.ok) throw new Error(result.error);
      toast(`Dipindah ke ${targetCat}`, 'success'); await fetchThumbnails();
    } catch (err) { toast(`Gagal: ${err instanceof Error?err.message:'error'}`, 'error'); }
  };

  const handleSync = async () => { setSyncLoading(true); try { const res = await fetch('/api/thumbnails/sync', { method: 'POST' }); const data = await res.json(); toast(`Sync selesai — ${data.total} file`, 'success'); } catch { toast('Sync gagal', 'error'); } finally { setSyncLoading(false); } };
  const handleDelete = async (filename: string) => { if (!confirm(`Hapus ${filename}?`)) return; await fetch(`/api/thumbnails/${encodeURIComponent(filename)}`, { method: 'DELETE' }); await fetchThumbnails(); toast(`Dihapus`, 'info'); };
  const addCategory = async () => { const n = newCatName.trim(); if (!n) return; try { const res = await fetch('/api/thumbnails/categories', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: n }), }); if (!res.ok) { const e = await res.json(); return toast(e.error, 'error'); } await fetchCategories(); setNewCatName(''); setAddingCat(false); toast(`Ditambahkan`, 'success'); } catch { toast('Gagal', 'error'); } };
  const deleteCategory = async (name: string) => { try { const res = await fetch(`/api/thumbnails/categories/${encodeURIComponent(name)}`, { method: 'DELETE' }); if (!res.ok) { const e = await res.json(); return toast(e.error, 'error'); } await fetchCategories(); if (selectedCat === name) setSelectedCat('__all__'); toast(`Dihapus`, 'info'); } catch { toast('Gagal', 'error'); } };

  const visible = thumbnails.filter(t => selectedCat === '__all__' || (t.category || 'Uncategorized') === selectedCat);

  return (
    <div className="glass-card rounded-[32px] overflow-hidden flex flex-col md:flex-row min-h-[500px]">
      {lightbox && (
        <div onClick={()=>setLightbox(null)} className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-[2000] cursor-zoom-out p-4">
          <img src={lightbox} alt="preview" className="max-w-full max-h-full rounded-2xl shadow-2xl" />
        </div>
      )}
      <div className="w-full md:w-56 bg-white/[0.02] border-r border-white/5 p-4 flex flex-col gap-1">
        <div className="flex items-center justify-between px-2 mb-2">
          <span className="text-[10px] font-semibold text-white/40 uppercase tracking-widest">Kategori Thumbnail</span>
          <button onClick={()=>{setAddingCat(true);setTimeout(()=>catInputRef.current?.focus(),50)}} className="text-white/40 hover:text-white transition-colors p-1"><Icon.Plus /></button>
        </div>
        <div onClick={()=>setSelectedCat('__all__')} className={`flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-medium cursor-pointer transition-all duration-300 ${selectedCat==='__all__' ? 'bg-white text-black shadow-md' : 'text-white/60 hover:bg-white/10'}`}>
          <div className="flex items-center gap-2.5 truncate"><span className={selectedCat==='__all__' ? 'text-black' : 'opacity-50'}><Icon.Folder /></span><span>Semua</span></div>
          <span className={`text-[10px] ${selectedCat==='__all__' ? 'text-black/50' : 'text-white/30'}`}>{thumbnails.length}</span>
        </div>
        {thumbnails.some(t => !t.category || t.category === 'Uncategorized') && (
          <div onClick={()=>setSelectedCat('Uncategorized')} onDragOver={e=>{e.preventDefault()}} onDrop={e=>{ e.preventDefault(); const data = e.dataTransfer.getData('text/plain'); if(data) handleMoveFile(data, 'Uncategorized'); }} className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-medium cursor-pointer transition-all duration-300 ${selectedCat==='Uncategorized' ? 'bg-white text-black shadow-md' : 'text-white/60 hover:bg-white/10'}`}>
            <span className={selectedCat==='Uncategorized' ? 'text-black' : 'opacity-50'}><Icon.Folder /></span><span>Uncategorized</span>
          </div>
        )}
        {categories.map(cat => <ThumbnailCategoryItem key={cat} cat={cat} count={thumbnails.filter(t => t.category === cat).length} selectedCat={selectedCat} onSelect={setSelectedCat} onDelete={deleteCategory} onDropFile={handleMoveFile} />)}
        {addingCat && (
          <div className="px-2 mt-1 animate-in fade-in zoom-in-95">
            <input ref={catInputRef} value={newCatName} onChange={e=>setNewCatName(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')addCategory();if(e.key==='Escape'){setAddingCat(false);setNewCatName('');}}} onBlur={()=>{if(!newCatName.trim()){setAddingCat(false);}}} placeholder="Nama..." className="w-full glass-input rounded-lg px-3 py-2 text-xs text-white outline-none focus:ring-1 focus:ring-white/20" />
          </div>
        )}
      </div>
      <div className="flex-1 p-4 md:p-6 bg-transparent flex flex-col">
        <div className="flex flex-col sm:flex-row gap-4 mb-6">
          <div className="glass-card-strong rounded-[24px] p-5 flex-1 relative">
            <div className="flex justify-between items-center mb-4">
              <span className="text-[10px] font-semibold text-white/50 uppercase tracking-widest">Upload Baru</span>
              <button onClick={handleSync} disabled={syncLoading} className="text-[10px] font-bold px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 transition-all flex items-center gap-1.5"><span className={syncLoading?"animate-spin":""}><Icon.Sync /></span> {syncLoading?'Syncing':'GDrive Sync'}</button>
            </div>
            <select value={uploadCategory} onChange={e=>setUploadCategory(e.target.value)} className="w-full mb-3 glass-input rounded-xl px-3 py-2 text-xs text-white outline-none focus:ring-1 focus:ring-white/20 appearance-none">
              <option value="">— Uncategorized —</option>
              {categories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <div onDragOver={e=>{e.preventDefault();setDragOver(true)}} onDragLeave={()=>setDragOver(false)} onDrop={handleDrop} onClick={()=>fileInputRef.current?.click()} className={`border-2 border-dashed rounded-2xl p-4 text-center cursor-pointer transition-all ${dragOver?'border-white/40 bg-white/5':previewFile?'border-transparent bg-white/10':'border-white/10 hover:bg-white/[0.02]'}`}>
              <input ref={fileInputRef} type="file" accept="image/jpeg,image/jpg,image/png,image/webp" className="hidden" onChange={e=>{ const f=e.target.files?.[0]; if(f)handleFileSelect(f); e.target.value=''; }} />
              {previewUrl ? (
                <div className="flex flex-col items-center gap-2">
                  <img src={previewUrl} alt="preview" className="max-h-24 max-w-full rounded-lg object-contain" />
                  <div className="text-[10px] text-white/50">{previewFile?.name}</div>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-1">
                  <div className="text-white/30 mb-1"><Icon.Image /></div>
                  <div className="text-[11px] text-white/60">Drop file JPG/PNG/WebP</div>
                </div>
              )}
            </div>
            {previewFile && uploadState !== 'done' && (
              <button onClick={handleUpload} disabled={uploadState==='uploading'} className="w-full mt-3 bg-white text-black py-2 rounded-xl text-xs font-bold hover:scale-95 transition-transform disabled:opacity-50">Upload ke VPS</button>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between mb-4 px-1">
          <div className="flex items-center gap-2 text-xs font-semibold text-white/50">
             <span>Thumbnails</span>{selectedCat!=="__all__" && <><Icon.ChevronRight /><span className="text-white">{selectedCat}</span></>}
          </div>
          <span className="text-[10px] text-white/40">{visible.length} File (Bisa di-Drag)</span>
        </div>
        
        {visible.length === 0 ? (
          <div className="flex-1 flex items-center justify-center text-white/30 text-xs">Belum ada thumbnail.</div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 overflow-y-auto pr-1">
            {visible.map(t => (
              <div key={t.filename} draggable onDragStart={e => e.dataTransfer.setData('text/plain', JSON.stringify({ filename: t.filename, oldCategory: t.category || 'Uncategorized', type: 'thumbnail' }))} className="group glass-input rounded-2xl overflow-hidden cursor-grab hover:ring-1 hover:ring-white/20 transition-all">
                <div className="aspect-video bg-black/40 relative cursor-zoom-in" onClick={()=>setLightbox(`/api/thumbnails/preview/${encodeURIComponent(t.filename)}`)}>
                  <img src={`/api/thumbnails/preview/${encodeURIComponent(t.filename)}`} alt={t.filename} className="w-full h-full object-cover" onError={e=>{(e.target as HTMLImageElement).style.display='none';}} />
                  <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={(e)=>{e.stopPropagation(); handleDelete(t.filename);}} className="w-7 h-7 bg-red-500/80 backdrop-blur-md rounded-lg flex items-center justify-center text-white hover:bg-red-500 transition-colors"><Icon.Trash /></button>
                  </div>
                </div>
                <div className="p-3">
                  <div className="text-[10px] font-semibold text-white/80 truncate mb-1">{t.filename}</div>
                  <div className="flex justify-between items-center text-[9px] text-white/40">
                    <span>{fmtSize(t.sizeBytes)}</span>
                    {t.category && t.category !== 'Uncategorized' && <span className="bg-white/10 px-1.5 py-0.5 rounded text-white/60">{t.category}</span>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}


function VideoJadiTab({ toast, queue, onUpload, refresh }: { toast: (msg: string, type: ToastItem["type"]) => void; queue: UploadQueueItem[]; onUpload: (f: File[], c: string) => void; refresh: number }) {
  const [files, setFiles] = useState<{filename: string; category: string; path: string; size: number}[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [selectedCat, setSelectedCat] = useState('__all__');
  const uploading = queue.some(q => q.status === "uploading");
  const [uploadCat, setUploadCat] = useState('');
  const [newCatName, setNewCatName] = useState('');
  const [addingCat, setAddingCat] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const catInputRef = useRef<HTMLInputElement>(null);

  const fetchFiles = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/files?type=video-ready`);
      if (res.ok) { const d = await res.json(); setFiles(d.files || []); }
    } catch {}
  }, []);

  const fetchCats = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/categories?type=video-ready`);
      if (res.ok) { const d = await res.json(); setCategories(d['video-ready'] || []); }
    } catch {}
  }, []);

  useEffect(() => { fetchFiles(); fetchCats(); }, [fetchFiles, fetchCats, refresh]);

  const handleUpload = (file: File) => {
    if (!file) return;
    onUpload([file], uploadCat || 'Uncategorized');
  };

  const handleDelete = async (category: string, filename: string) => {
    if (!confirm(`Hapus ${filename}?`)) return;
    await fetch(`${API_BASE}/files/video-ready/${encodeURIComponent(category)}/${encodeURIComponent(filename)}`, { method: 'DELETE' });
    await fetchFiles();
    toast('File dihapus', 'info');
  };

  const addCat = async () => {
    const n = newCatName.trim();
    if (!n) return;
    try {
      const res = await fetch(`${API_BASE}/categories`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'video-ready', name: n }) });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Gagal');
      await fetchCats();
      setNewCatName(''); setAddingCat(false);
      toast('Kategori ditambah', 'success');
    } catch (err) { toast(err instanceof Error ? err.message : 'Gagal', 'error'); }
  };

  const delCat = async (name: string) => {
    if (files.some(f => f.category === name)) return toast('Masih ada file di kategori ini', 'error');
    await fetch(`${API_BASE}/categories/video-ready/${encodeURIComponent(name)}`, { method: 'DELETE' });
    await fetchCats();
    if (selectedCat === name) setSelectedCat('__all__');
  };

  const visible = files.filter(f => selectedCat === '__all__' || f.category === selectedCat);

  return (
    <div className="glass-card rounded-[32px] overflow-hidden flex flex-col md:flex-row min-h-[500px]">
      {/* Sidebar kategori */}
      <div className="w-full md:w-56 bg-white/[0.02] border-r border-white/5 p-4 flex flex-col gap-1">
        <div className="flex items-center justify-between px-2 mb-2">
          <span className="text-[10px] font-semibold text-white/40 uppercase tracking-widest">Kategori</span>
          <button onClick={() => { setAddingCat(true); setTimeout(() => catInputRef.current?.focus(), 50); }} className="text-white/40 hover:text-white transition-colors p-1"><Icon.Plus /></button>
        </div>
        <SidebarItem icon={<Icon.Folder />} label="__all__" active={selectedCat === '__all__'} onClick={() => setSelectedCat('__all__')} />
        {categories.map(cat => (
          <SidebarItem key={cat} icon={<Icon.Folder />} label={cat} active={selectedCat === cat} onClick={() => setSelectedCat(cat)} onDelete={() => delCat(cat)} />
        ))}
        {addingCat && (
          <div className="px-2 mt-1 animate-in fade-in zoom-in-95">
            <input ref={catInputRef} value={newCatName} onChange={e => setNewCatName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') addCat(); if (e.key === 'Escape') { setAddingCat(false); setNewCatName(''); } }}
              onBlur={() => { if (!newCatName.trim()) setAddingCat(false); }}
              placeholder="Nama kategori..." className="w-full glass-input rounded-lg px-3 py-2 text-xs text-white outline-none focus:ring-1 focus:ring-white/20" />
          </div>
        )}
      </div>

      {/* Main */}
      <div className="flex-1 p-4 md:p-6 flex flex-col gap-6">
        {/* Upload section */}
        <div className="glass-card-strong rounded-[24px] p-5">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-[10px] font-semibold text-white/50 uppercase tracking-widest">Upload Video Jadi</span>
            <span className="text-[9px] font-bold text-amber-400 bg-amber-400/10 border border-amber-400/20 px-2 py-0.5 rounded-full">⚡ Stream Copy</span>
          </div>
          <div className="bg-amber-500/8 border border-amber-500/20 rounded-xl p-3 mb-3 text-[10px] text-amber-300 leading-relaxed">
            Video di sini distream langsung tanpa re-encode. Pastikan format: <span className="font-bold">MP4 H264, 1080p/720p, 30fps</span>. Pre-encode dulu dengan ffmpeg sebelum upload.
          </div>
          <select value={uploadCat} onChange={e => setUploadCat(e.target.value)} className="w-full mb-3 glass-input rounded-xl px-3 py-2 text-xs text-white outline-none appearance-none">
            <option value="">— Uncategorized —</option>
            {categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <div onDragOver={e => { e.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)}
            onDrop={e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) handleUpload(f); }}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition-all ${dragOver ? 'border-amber-400/50 bg-amber-400/5' : 'border-white/10 hover:bg-white/[0.02]'}`}>
            <input ref={fileInputRef} type="file" accept=".mp4,.mkv,.mov,.avi,.webm" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleUpload(f); e.target.value = ''; }} />
            <div className="text-white/30 mb-1 flex justify-center"><Icon.Video /></div>
            <div className="text-[11px] text-white/60 font-medium">{uploading ? '⏳ Uploading...' : 'Drop file MP4 atau klik untuk pilih'}</div>
            <div className="text-[10px] text-white/30 mt-1">MP4 · MKV · MOV · WebM</div>
          </div>
        </div>

        {/* File grid */}
        <div>
          <div className="flex items-center justify-between mb-4 px-1">
            <span className="text-xs font-semibold text-white/50">Video Jadi — {selectedCat === '__all__' ? 'Semua' : selectedCat}</span>
            <span className="text-[10px] text-white/40">{visible.length} file</span>
          </div>
          {visible.length === 0 ? (
            <div className="flex items-center justify-center h-32 text-white/30 text-xs">Belum ada video jadi di sini.</div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {visible.map(f => (
                <div key={`${f.category}-${f.filename}`} className="group glass-input rounded-2xl overflow-hidden hover:ring-1 hover:ring-white/20 transition-all">
                  <video
                    src={`${API_BASE}/media/video-ready/${encodeURIComponent(f.category)}/${encodeURIComponent(f.filename)}`}
                    className="w-full aspect-video object-cover bg-black/60"
                    controls preload="metadata"
                  />
                  <div className="p-3 flex items-center justify-between gap-2">
                    <div className="truncate">
                      <div className="text-[10px] font-semibold text-white/80 truncate">{f.filename}</div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[9px] text-white/40">{fmtSize(f.size)}</span>
                        <span className="text-[9px] text-amber-400 font-bold">⚡ copy</span>
                        {f.category !== 'Uncategorized' && <span className="text-[9px] text-white/30">{f.category}</span>}
                      </div>
                    </div>
                    <button onClick={() => handleDelete(f.category, f.filename)}
                      className="w-7 h-7 flex-shrink-0 flex items-center justify-center rounded-lg text-white/30 hover:bg-red-500/20 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all">
                      <Icon.Trash />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function MediaPool() {
  const { toasts, add: addToast, remove: removeToast } = useToast();
  const [activeTab, setActiveTab] = useState<"music"|"video"|"thumbnails" | "video-jadi">("music");
  const [musicCats, setMusicCats] = useState<string[]>([]);
  const [videoCats, setVideoCats] = useState<string[]>([]);
  const [musicCat, setMusicCat] = useState("__all__");
  const [videoCat, setVideoCat] = useState("__all__");
  const [files, setFiles] = useState<FileItem[]>([]);
  const [queue, setQueue] = useState<UploadQueueItem[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [playing, setPlaying] = useState<FileItem|null>(null);
  const [refreshCount, setRefreshCount] = useState(0);
  const [syncing, setSyncing] = useState(false);

  const fetchFiles = useCallback(async () => { try { const r = await fetch(`${API_BASE}/files`); if (!r.ok) throw new Error(`HTTP ${r.status}`); const data = await r.json(); setFiles(Array.isArray(data.files) ? data.files : []); setRefreshCount(c => c + 1); } catch (err) {} }, []);
  const fetchCategories = useCallback(async () => { try { const r = await fetch(`${API_BASE}/categories`); if (!r.ok) throw new Error(`HTTP ${r.status}`); const data = await r.json(); if (Array.isArray(data.music)) setMusicCats(data.music); if (Array.isArray(data.video)) setVideoCats(data.video); } catch (err) {} }, []);
  
  useEffect(() => { fetchFiles(); fetchCategories(); }, [fetchFiles, fetchCategories]);

  const mediaType = activeTab === "thumbnails" ? "music" : activeTab === "video-jadi" ? "video-ready" : activeTab;
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
        const fd = new FormData(); fd.append("type", mediaType); fd.append("category", category); fd.append("file", item.file);
        await new Promise<void>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.upload.onprogress = e => { setQueue(q=>q.map(i=>i.id===item.id?{...i,progress:Math.round((e.loaded/e.total)*100)}:i)); };
          xhr.onload = () => xhr.status===200?resolve():reject(new Error(`HTTP`));
          xhr.open("POST", `${API_BASE}/upload`); xhr.send(fd);
        });
        await fetchFiles(); setQueue(q => q.map(i => i.id===item.id?{...i,status:"done",progress:100}:i)); addToast(`Berhasil`, "success");
      } catch(err) { setQueue(q => q.map(i => i.id===item.id?{...i,status:"error"}:i)); addToast(`Gagal`, "error"); }
    }
    setTimeout(() => setQueue(q => q.filter(i => i.status!=="done")), 5000);
  };

  const handleMoveFile = async (dataString: string, targetCat: string) => {
    try {
      const data = JSON.parse(dataString); if (data.type !== mediaType || data.oldCategory === targetCat) return;
      const res = await fetch(`${API_BASE}/files/move`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: data.type, oldCategory: data.oldCategory, newCategory: targetCat, filename: data.filename }) });
      if (!res.ok) throw new Error(); addToast(`Dipindah ke ${targetCat}`, 'success'); await fetchFiles();
    } catch (err) { addToast(`Gagal memindah`, 'error'); }
  };

  const triggerSync = async () => { if (syncing) return; setSyncing(true); try { await fetch(`${API_BASE}/sync`, { method:"POST" }); addToast("Sync GDrive berhasil", "success"); } catch(err) { addToast(`Sync gagal`, "error"); } finally { setSyncing(false); } };
  const addCat = async (type:"music"|"video", name:string) => { try { await fetch(`${API_BASE}/categories`, { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ type, name }) }); await fetchCategories(); addToast(`Kategori ditambah`,"success"); } catch(err) { addToast(`Gagal`, "error"); } };
  const delCat = async (type:"music"|"video", name:string) => { if (files.some(f=>f.type===type&&f.category===name)) return addToast(`Masih ada file`,"error"); try { await fetch(`${API_BASE}/categories/${type}/${encodeURIComponent(name)}`, { method:"DELETE" }); await fetchCategories(); if(selCat===name)setSelCat("__all__"); addToast(`Kategori dihapus`,"info"); } catch(err) { addToast(`Gagal`, "error"); } };
  const delFile = async (id:string) => { const f = files.find(x=>x.id===id); if (!f) return; try { await fetch(`${API_BASE}/files/${f.type}/${encodeURIComponent(f.category)}/${encodeURIComponent(f.name)}`, { method:"DELETE" }); if (playing?.id===id) setPlaying(null); await fetchFiles(); addToast("Dihapus","info"); } catch(err) { addToast(`Gagal hapus`, "error"); } };

  return (
    <div className="min-h-screen text-white apple-ui relative z-0 pb-20 overflow-x-hidden">
      <style dangerouslySetInnerHTML={{__html: `
        .apple-ui { font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, Helvetica, Arial, sans-serif; font-weight: 400; letter-spacing: -0.01em; }
        .glass-card { background: rgba(255, 255, 255, 0.03); backdrop-filter: blur(40px); border: 1px solid rgba(255, 255, 255, 0.08); box-shadow: 0 10px 40px -10px rgba(0,0,0,0.3); }
        .glass-card-strong { background: rgba(255, 255, 255, 0.08); backdrop-filter: blur(40px); border: 1px solid rgba(255, 255, 255, 0.15); box-shadow: 0 20px 40px -10px rgba(0,0,0,0.5); }
        .glass-input { background: rgba(0, 0, 0, 0.2); border: 1px solid rgba(255, 255, 255, 0.06); }
        ::-webkit-scrollbar { width: 6px; height: 6px; } ::-webkit-scrollbar-track { background: transparent; } ::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.15); border-radius: 10px; }
      `}} />

      <div className="fixed inset-0 z-[-1] bg-[#050507]">
        <div className="absolute top-[-10%] left-[-10%] w-[50vw] h-[50vw] bg-indigo-600/20 rounded-full blur-[140px] mix-blend-screen pointer-events-none" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[60vw] h-[60vw] bg-orange-600/10 rounded-full blur-[140px] mix-blend-screen pointer-events-none" />
        <div className="absolute top-[30%] right-[20%] w-[40vw] h-[40vw] bg-teal-600/10 rounded-full blur-[140px] mix-blend-screen pointer-events-none" />
      </div>

      <div className="max-w-6xl mx-auto px-4 lg:px-8 pt-8">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-8">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-white mb-1">Media Pool</h1>
            <p className="text-white/50 text-[11px] font-semibold uppercase tracking-widest">Asset Manager</p>
          </div>
          <div className="bg-black/30 p-1.5 rounded-full flex gap-1 border border-white/5 shadow-inner">
            <button onClick={()=>setActiveTab("music")} className={`px-5 py-2.5 rounded-full text-xs font-bold transition-all duration-300 flex items-center gap-2 ${activeTab==="music" ? 'bg-white text-black shadow-lg' : 'text-white/50 hover:text-white hover:bg-white/5'}`}><Icon.Music /> Musik</button>
            <button onClick={()=>setActiveTab("video")} className={`px-5 py-2.5 rounded-full text-xs font-bold transition-all duration-300 flex items-center gap-2 ${activeTab==="video" ? 'bg-white text-black shadow-lg' : 'text-white/50 hover:text-white hover:bg-white/5'}`}><Icon.Video /> Video</button>
            <button onClick={()=>setActiveTab("thumbnails")} className={`px-5 py-2.5 rounded-full text-xs font-bold transition-all duration-300 flex items-center gap-2 ${activeTab==="thumbnails" ? 'bg-white text-black shadow-lg' : 'text-white/50 hover:text-white hover:bg-white/5'}`}><Icon.Image /> Thumbnails</button>
            <button onClick={()=>setActiveTab("video-jadi")} className={`px-5 py-2.5 rounded-full text-xs font-bold transition-all duration-300 flex items-center gap-2 ${activeTab==="video-jadi" ? 'bg-amber-400 text-black shadow-lg' : 'text-amber-400/60 hover:text-amber-400 hover:bg-amber-400/5'}`}><svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16" className={activeTab==="video-jadi" ? "text-white drop-shadow-md" : ""}><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" /></svg> Video Jadi</button>
          </div>
        </div>

        {queue.length>0 && (
                <div className="mb-6 space-y-2">
                  {queue.map(item => (
                    <div key={item.id} className="glass-card-strong rounded-xl p-3 flex flex-col gap-2">
                      <div className="flex justify-between items-center text-xs"><span className="text-white/80 font-medium truncate pr-4">{item.name}</span><span className={item.status==="done"?"text-emerald-400":item.status==="error"?"text-red-400":"text-white"}>{item.status==="uploading"?`${item.progress}%`:"Selesai"}</span></div>
                      <div className="h-1 bg-white/10 rounded-full overflow-hidden"><div className={`h-full rounded-full transition-all ${item.status==="done"?"bg-emerald-400":item.status==="error"?"bg-red-400":"bg-white"}`} style={{width:`${item.progress}%`}} /></div>
                    </div>
                  ))}
                </div>
              )}
        {activeTab === "video-jadi" ? <VideoJadiTab toast={addToast} queue={queue} onUpload={handleUpload} refresh={refreshCount} /> : activeTab === "thumbnails" ? <ThumbnailTab toast={addToast} /> : (
          <div className="glass-card rounded-[32px] overflow-hidden flex flex-col md:flex-row min-h-[600px] mb-8">
            <div className="bg-white/[0.02] border-r border-white/5 p-4 md:p-6 flex flex-col gap-2">
              <CategorySidebar type={activeTab} categories={cats} selected={selCat} onSelect={setSelCat} onAdd={n=>addCat(activeTab,n)} onDelete={n=>delCat(activeTab,n)} onMoveFile={handleMoveFile} />
            </div>
            <div className="flex-1 p-4 md:p-6 bg-transparent flex flex-col">
              <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
                <div className="flex items-center gap-3 text-xs font-semibold text-white/50">
                  <span>{activeTab==="music"?"Musik":"Video"}</span>{selCat!=="__all__" && <><Icon.ChevronRight /><span className="text-white">{selCat}</span></>}
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={triggerSync} disabled={syncing} className="bg-white/10 hover:bg-white/20 text-white px-4 py-2 rounded-full text-[10px] font-bold uppercase tracking-wider transition-all flex items-center gap-1.5"><span className={syncing?"animate-spin":""}><Icon.Sync /></span> Sync GDrive</button>
                  <button onClick={()=>setShowModal(true)} className="bg-white text-black px-5 py-2 rounded-full text-xs font-bold shadow-lg hover:scale-95 transition-all flex items-center gap-1.5"><Icon.Upload /> Upload</button>
                </div>
              </div>
              
              

              <div className="flex-1 overflow-y-auto pr-2 -mr-2"><FileList files={visible} type={activeTab} onDelete={delFile} onPlay={setPlaying} playing={playing} /></div>
            </div>
          </div>
        )}
      </div>

      {showModal && <UploadModal type={activeTab as "music"|"video"} categories={cats} onClose={()=>setShowModal(false)} onUpload={handleUpload} />}
      {activeTab !== "thumbnails" && <MiniPlayer playing={playing} type={activeTab as "music"|"video"} apiBase={API_BASE} />}
      <Toast toasts={toasts} remove={removeToast} />
    </div>
  );
}
