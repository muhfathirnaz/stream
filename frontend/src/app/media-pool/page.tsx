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
  Pencil: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="12" height="12"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>,
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
    <div className="fixed bottom-6 right-6 flex flex-col gap-2 z-[999999]">
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

function SidebarItem({ icon, label, active, count, onClick, onDelete, onRename, onDropFile }: { icon:React.ReactNode; label:string; active:boolean; count?:number; onClick:()=>void; onDelete?:()=>void; onRename?:(newName:string)=>void; onDropFile?:(data:string)=>void }) {
  const [hover, setHover] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editVal, setEditVal] = useState(label);
  const inputRef = useRef<HTMLInputElement>(null);

  const submitRename = () => {
    const v = editVal.trim();
    if (v && v !== label && onRename) onRename(v);
    setEditing(false);
  };

  useEffect(() => { if (editing) setTimeout(() => inputRef.current?.focus(), 50); }, [editing]);

  if (editing) {
    return (
      <div className="px-2">
        <input ref={inputRef} value={editVal} onChange={e=>setEditVal(e.target.value)}
          onKeyDown={e=>{if(e.key==="Enter")submitRename();if(e.key==="Escape"){setEditing(false);setEditVal(label);}}}
          onBlur={submitRename}
          className="w-full glass-input rounded-lg px-3 py-2 text-xs text-white outline-none focus:ring-1 focus:ring-white/20" />
      </div>
    );
  }

  return (
    <div onClick={onClick} onMouseEnter={()=>setHover(true)} onMouseLeave={()=>setHover(false)}
      onDragOver={e=>{ if (onDropFile && label !== '__all__') { e.preventDefault(); setDragOver(true); } }}
      onDragLeave={()=>setDragOver(false)}
      onDrop={e=>{e.preventDefault();setDragOver(false);if(onDropFile&&label!=='__all__'){const data=e.dataTransfer.getData('text/plain');if(data)onDropFile(data);}}}
      className={`group flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-medium cursor-pointer transition-all duration-300 ${dragOver?'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30':active?'bg-white text-black shadow-md':'text-white/60 hover:bg-white/10 hover:text-white border border-transparent'}`}>
      <div className="flex items-center gap-2.5 truncate">
        <span className={active?'text-black':dragOver?'text-emerald-400':'opacity-50'}>{icon}</span>
        <span className="truncate">{label==='__all__'?'Semua Kategori':label}</span>
      </div>
      <div className="flex items-center gap-1.5 flex-shrink-0">
        {count !== undefined && (
          <span className={`text-[10px] font-semibold ${active?'text-black/50':'text-white/30'}`}>{count}</span>
        )}
        {hover && !active && !dragOver && onRename && (
          <button onClick={e=>{e.stopPropagation();setEditing(true);setEditVal(label);}} className="text-white/30 hover:text-white transition-colors p-0.5"><Icon.Pencil /></button>
        )}
        {hover && !active && !dragOver && onDelete && (
          <button onClick={e=>{e.stopPropagation();onDelete();}} className="text-white/30 hover:text-red-500 transition-colors"><Icon.Trash /></button>
        )}
      </div>
    </div>
  );
}

function CategorySidebar({ type, categories, fileCounts, selected, onSelect, onAdd, onDelete, onRename, onMoveFile }: { type:"music"|"video"; categories:string[]; fileCounts:Record<string,number>; selected:string; onSelect:(c:string)=>void; onAdd:(n:string)=>void; onDelete:(n:string)=>void; onRename:(old:string,n:string)=>void; onMoveFile:(fileData:string,newCat:string)=>void }) {
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const ref = useRef<HTMLInputElement>(null);
  const submit = () => { const n=newName.trim(); if(n&&!categories.includes(n))onAdd(n); setAdding(false); setNewName(""); };
  const totalCount = Object.values(fileCounts).reduce((a,b)=>a+b,0);

  return (
    <div className="w-full md:w-56 flex-shrink-0 flex flex-col gap-1">
      <div className="flex items-center justify-between px-2 mb-2">
        <span className="text-[10px] font-semibold text-white/40 uppercase tracking-widest">{type==="music"?"Kategori Musik":"Kategori Video"}</span>
        <button onClick={()=>{setAdding(true);setTimeout(()=>ref.current?.focus(),50)}} className="text-white/40 hover:text-white transition-colors p-1"><Icon.Plus /></button>
      </div>
      <SidebarItem icon={<Icon.Folder />} label="__all__" active={selected==="__all__"} count={totalCount} onClick={()=>onSelect("__all__")} />
      {categories.map(cat => (
        <SidebarItem key={cat} icon={<Icon.Folder />} label={cat} active={selected===cat} count={fileCounts[cat]||0} onClick={()=>onSelect(cat)}
          onDelete={()=>onDelete(cat)}
          onRename={(newName)=>onRename(cat,newName)}
          onDropFile={(data)=>onMoveFile(data,cat)} />
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

function FileRow({ file, onDelete, onRename, onPlay, isPlaying, isPaused, onTogglePause }: { file:FileItem; onDelete:(id:string)=>void; onRename:(id:string,newName:string)=>void; onPlay:(f:FileItem)=>void; isPlaying:boolean; isPaused:boolean; onTogglePause:()=>void }) {
  const [editing, setEditing] = useState(false);
  const [editVal, setEditVal] = useState(file.name);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(()=>{ if(editing) setTimeout(()=>inputRef.current?.focus(),50); },[editing]);

  const submitRename = () => {
    const v = editVal.trim();
    if (v && v !== file.name) onRename(file.id, v);
    setEditing(false);
  };

  return (
    <div draggable onDragStart={e=>e.dataTransfer.setData('text/plain',JSON.stringify({filename:file.name,oldCategory:file.category,type:file.type}))}
      className={`group flex items-center gap-3 p-2.5 rounded-2xl transition-all duration-300 cursor-grab border ${isPlaying?'bg-white/10 border-white/20':'bg-transparent hover:bg-white/5 border-transparent'}`}>
      <button onClick={e=>{e.stopPropagation();if(isPlaying){onTogglePause();}else{onPlay(file);}}} className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 transition-all shadow-sm ${isPlaying?'bg-white text-black scale-95':'bg-white/10 text-white group-hover:bg-white/20'}`}>
        {isPlaying && !isPaused ? <Icon.Pause /> : <Icon.Play />}
      </button>
      <div className="flex-1 overflow-hidden">
        {editing ? (
          <input ref={inputRef} value={editVal} onChange={e=>setEditVal(e.target.value)}
            onKeyDown={e=>{if(e.key==="Enter")submitRename();if(e.key==="Escape"){setEditing(false);setEditVal(file.name);}}}
            onBlur={submitRename}
            onClick={e=>e.stopPropagation()}
            className="w-full glass-input rounded-lg px-2 py-1 text-xs text-white outline-none focus:ring-1 focus:ring-white/20" />
        ) : (
          <div className={`text-xs font-semibold truncate ${isPlaying?'text-white':'text-white/80'}`}>{file.name}</div>
        )}
        <div className="flex items-center gap-2 mt-1 text-[10px] text-white/40 font-medium">
          <span>{fmtSize(file.size)}</span>
          {file.duration!==undefined && <span>• {fmtDur(file.duration)}</span>}
          <span className="px-1.5 py-0.5 rounded-md bg-white/5 text-white/60">{file.category}</span>
        </div>
      </div>
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
        <button onClick={e=>{e.stopPropagation();setEditing(true);setEditVal(file.name);}} className="w-7 h-7 flex items-center justify-center rounded-xl text-white/30 hover:bg-white/10 hover:text-white transition-all"><Icon.Pencil /></button>
        <button onClick={()=>onDelete(file.id)} className="w-7 h-7 flex items-center justify-center rounded-xl text-white/30 hover:bg-red-500/20 hover:text-red-400 transition-all"><Icon.Trash /></button>
      </div>
    </div>
  );
}

function FileList({ files, type, onDelete, onRename, onPlay, playing, isPaused, onTogglePause }: { files:FileItem[]; type:"music"|"video"; onDelete:(id:string)=>void; onRename:(id:string,newName:string)=>void; onPlay:(f:FileItem)=>void; playing:FileItem|null; isPaused:boolean; onTogglePause:()=>void }) {
  if (!files.length) return (
    <div className="h-full flex flex-col items-center justify-center text-white/30 pb-10">
      <div className="mb-3 opacity-50 scale-150">{type==="music"?<Icon.Music />:<Icon.Video />}</div>
      <div className="text-xs font-medium">Belum ada file di kategori ini</div>
    </div>
  );
  return <div className="flex flex-col gap-1">{files.map(f=><FileRow key={f.id} file={f} onDelete={onDelete} onRename={onRename} onPlay={onPlay} isPlaying={playing?.id===f.id} isPaused={isPaused} onTogglePause={onTogglePause} />)}</div>;
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
        {pending.length>0&&(
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

function MiniPlayer({ playing, type, apiBase, isPaused, setIsPaused }: { playing:FileItem|null; type:"music"|"video"; apiBase:string; isPaused:boolean; setIsPaused:(b:boolean)=>void }) {
  const mediaRef = useRef<HTMLMediaElement>(null);
  const [progress, setProgress] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  useEffect(()=>{setIsPaused(false);setProgress(0);setCurrentTime(0);setDuration(0);},[playing?.id]);
  useEffect(()=>{const el=mediaRef.current;if(!el)return;if(isPaused&&!el.paused)el.pause();else if(!isPaused&&el.paused)el.play();},[isPaused]);
  if (!playing) return null;
  const url=`${apiBase}/media/${type}/${encodeURIComponent(playing.category)}/${encodeURIComponent(playing.name)}`;
  const onTime=()=>{const el=mediaRef.current;if(el?.duration){setProgress((el.currentTime/el.duration)*100);setCurrentTime(el.currentTime);setDuration(el.duration);}};
  const toggle=(e?:React.MouseEvent)=>{if(e)e.stopPropagation();setIsPaused(!isPaused);};
  const seek=(e:React.MouseEvent<HTMLDivElement>)=>{e.stopPropagation();const el=mediaRef.current;if(!el?.duration)return;const r=e.currentTarget.getBoundingClientRect();el.currentTime=((e.clientX-r.left)/r.width)*el.duration;};
  const formatT=(s:number)=>!s?"0:00":`${Math.floor(s/60)}:${Math.floor(s%60).toString().padStart(2,"0")}`;
  return (
    <>
    {type==="video"&&(<div className="fixed bottom-24 right-6 w-80 glass-card-strong rounded-[24px] overflow-hidden shadow-2xl z-[500] animate-in slide-in-from-bottom-4"><video ref={mediaRef as React.RefObject<HTMLVideoElement>} src={url} autoPlay onTimeUpdate={onTime} onPlay={()=>setIsPaused(false)} onPause={()=>setIsPaused(true)} onClick={toggle} className="w-full block cursor-pointer" /></div>)}
    <div onClick={toggle} className="fixed bottom-0 left-[220px] right-0 bg-[#050508]/90 backdrop-blur-3xl border-t border-white/10 px-6 py-4 flex items-center gap-4 z-[90] cursor-pointer hover:bg-white/5 transition-colors">
      {type==="music"&&<audio ref={mediaRef as React.RefObject<HTMLAudioElement>} src={url} autoPlay onTimeUpdate={onTime} onPlay={()=>setIsPaused(false)} onPause={()=>setIsPaused(true)} />}
      <button onClick={toggle} className="w-10 h-10 rounded-full bg-white text-black flex items-center justify-center hover:scale-95 transition-transform shadow-lg flex-shrink-0 z-10">{isPaused?<Icon.Play />:<Icon.Pause />}</button>
      <div className="flex-1 max-w-md flex flex-col gap-1 z-10">
        <div className="flex justify-between items-center">
          <div className="text-xs font-semibold text-white mb-1.5 truncate pr-4">{playing.name}</div>
          <div className="text-[10px] text-white/50 font-medium tabular-nums tracking-wider">{formatT(currentTime)} / {formatT(duration)}</div>
        </div>
        <div onClick={seek} className="h-1.5 bg-white/10 rounded-full cursor-pointer overflow-hidden group py-1">
          <div className="h-full bg-white rounded-full transition-all duration-100 relative" style={{width:`${progress}%`}}>
            <div className="absolute right-0 top-1/2 -translate-y-1/2 w-2 h-2 bg-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
        </div>
      </div>
      <span className="text-[10px] font-medium text-white/40 px-2.5 py-1 rounded-md bg-white/5 z-10">{playing.category}</span>
    </div>
    </>
  );
}

function ThumbnailCategoryItem({ cat, count, selectedCat, onSelect, onDelete, onRename, onDropFile }: { cat:string; count:number; selectedCat:string; onSelect:(c:string)=>void; onDelete:(c:string)=>void; onRename:(old:string,n:string)=>void; onDropFile:(data:string,cat:string)=>void }) {
  const [hover, setHover] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editVal, setEditVal] = useState(cat);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(()=>{if(editing)setTimeout(()=>inputRef.current?.focus(),50);},[editing]);
  const submitRename=()=>{const v=editVal.trim();if(v&&v!==cat)onRename(cat,v);setEditing(false);};

  if (editing) return (
    <div className="px-2"><input ref={inputRef} value={editVal} onChange={e=>setEditVal(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")submitRename();if(e.key==="Escape"){setEditing(false);setEditVal(cat);}}} onBlur={submitRename} className="w-full glass-input rounded-lg px-3 py-2 text-xs text-white outline-none focus:ring-1 focus:ring-white/20" /></div>
  );

  return (
    <div onClick={()=>onSelect(cat)} onMouseEnter={()=>setHover(true)} onMouseLeave={()=>setHover(false)}
      onDragOver={e=>{e.preventDefault();setDragOver(true);}} onDragLeave={()=>setDragOver(false)}
      onDrop={e=>{e.preventDefault();setDragOver(false);const data=e.dataTransfer.getData('text/plain');if(data)onDropFile(data,cat);}}
      className={`group flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-medium cursor-pointer transition-all duration-300 ${dragOver?'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30':selectedCat===cat?'bg-white text-black shadow-md':'text-white/60 hover:bg-white/10 hover:text-white border border-transparent'}`}>
      <div className="flex items-center gap-2.5 truncate">
        <span className={selectedCat===cat?'text-black':dragOver?'text-emerald-400':'opacity-50'}><Icon.Folder /></span>
        <span className="truncate">{cat}</span>
      </div>
      <div className="flex items-center gap-1.5">
        <span className={`text-[10px] ${selectedCat===cat?'text-black/50':'text-white/30'}`}>{count}</span>
        {hover && selectedCat!==cat && !dragOver && (<>
          <button onClick={e=>{e.stopPropagation();setEditing(true);setEditVal(cat);}} className="text-white/30 hover:text-white transition-colors p-0.5"><Icon.Pencil /></button>
          <button onClick={e=>{e.stopPropagation();onDelete(cat);}} className="text-white/30 hover:text-red-500 transition-colors"><Icon.Trash /></button>
        </>)}
      </div>
    </div>
  );
}

function ThumbnailTab({ toast }: { toast:(msg:string,type:ToastItem["type"])=>void }) {
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
  const [previewFiles, setPreviewFiles] = useState<{file:File;url:string}[]>([]);
  const [lightbox, setLightbox] = useState<string|null>(null);
  const [uploadCategory, setUploadCategory] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchThumbnails=useCallback(async()=>{try{const res=await fetch('/api/thumbnails');if(res.ok){const d=await res.json();setThumbnails(d.files||[]);}}catch{}},[]);
  const fetchCategories=useCallback(async()=>{try{const res=await fetch('/api/thumbnails/categories');if(res.ok){const d=await res.json();setCategories(d.categories||[]);}}catch{}},[]);
  useEffect(()=>{fetchThumbnails();fetchCategories();},[fetchThumbnails,fetchCategories]);
  useEffect(()=>()=>{previewFiles.forEach(p=>URL.revokeObjectURL(p.url));},[previewFiles]);

  const handleFileSelect=(files:File[])=>{
    const validFiles=files.filter(file=>{if(!file.type.startsWith('image/')){toast(`Hanya JPG, PNG, WebP (${file.name})`,'error');return false;}if(file.size>5*1024*1024){toast(`File max 5MB (${file.name})`,'error');return false;}return true;});
    if(!validFiles.length)return;
    setPreviewFiles(prev=>[...prev,...validFiles.map(file=>({file,url:URL.createObjectURL(file)}))]);
    setUploadState('idle');setUploadMsg('');
  };

  const handleDrop=(e:React.DragEvent)=>{e.preventDefault();setDragOver(false);if(e.dataTransfer.files?.length)handleFileSelect(Array.from(e.dataTransfer.files));};
  const removePreview=(e:React.MouseEvent,index:number)=>{e.stopPropagation();setPreviewFiles(prev=>{const a=[...prev];URL.revokeObjectURL(a[index].url);a.splice(index,1);return a;});};

  const handleUpload=async()=>{
    if(!previewFiles.length)return;
    setUploadState('uploading');setUploadMsg('Mengupload...');
    let success=0,fail=0;
    for(const p of previewFiles){
      try{const formData=new FormData();formData.append('file',p.file);if(uploadCategory)formData.append('category',uploadCategory);const res=await fetch('/api/thumbnails/upload',{method:'POST',body:formData});if(!res.ok)throw new Error();success++;}catch{fail++;}
    }
    await fetchThumbnails();await fetchCategories();
    if(success>0)toast(`${success} file berhasil diupload`,'success');
    if(fail>0)toast(`${fail} file gagal diupload`,'error');
    setUploadState('done');setUploadMsg('✓ Selesai');
    setTimeout(()=>{previewFiles.forEach(p=>URL.revokeObjectURL(p.url));setPreviewFiles([]);setUploadState('idle');setUploadMsg('');},2000);
  };

  const handleRenameCategory=async(oldName:string,newName:string)=>{
    try{const res=await fetch(`/api/thumbnails/categories/${encodeURIComponent(oldName)}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({newName})});const d=await res.json();if(!res.ok)throw new Error(d.error);await fetchCategories();if(selectedCat===oldName)setSelectedCat(newName);toast(`Folder direname ke "${newName}"`,'success');}catch(e){toast(e instanceof Error?e.message:'Gagal rename','error');}
  };

  const handleMoveFile=async(dataString:string,targetCat:string)=>{
    try{const data=JSON.parse(dataString);if(data.type!=='thumbnail'||data.oldCategory===targetCat)return;const res=await fetch('/api/thumbnails/move',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({filename:data.filename,oldCategory:data.oldCategory,newCategory:targetCat})});const result=await res.json();if(!res.ok)throw new Error(result.error);toast(`Dipindah ke ${targetCat}`,'success');await fetchThumbnails();}catch(err){toast(`Gagal: ${err instanceof Error?err.message:'error'}`,'error');}
  };

  const handleSync=async()=>{setSyncLoading(true);try{const res=await fetch('/api/thumbnails/sync',{method:'POST'});const data=await res.json();toast(`Sync selesai — ${data.total} file`,'success');}catch{toast('Sync gagal','error');}finally{setSyncLoading(false);}};
  const handleDelete=async(filename:string)=>{if(!confirm(`Hapus ${filename}?`))return;await fetch(`/api/thumbnails/${encodeURIComponent(filename)}`,{method:'DELETE'});await fetchThumbnails();toast('Dihapus','info');};
  const addCategory=async()=>{const n=newCatName.trim();if(!n)return;try{const res=await fetch('/api/thumbnails/categories',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:n})});if(!res.ok){const e=await res.json();return toast(e.error,'error');}await fetchCategories();setNewCatName('');setAddingCat(false);toast('Ditambahkan','success');}catch{toast('Gagal','error');}};
  const deleteCategory=async(name:string)=>{try{const res=await fetch(`/api/thumbnails/categories/${encodeURIComponent(name)}`,{method:'DELETE'});if(!res.ok){const e=await res.json();return toast(e.error,'error');}await fetchCategories();if(selectedCat===name)setSelectedCat('__all__');toast('Dihapus','info');}catch{toast('Gagal','error');}};

  const catCounts:Record<string,number>={};
  thumbnails.forEach(t=>{const c=t.category||'Uncategorized';catCounts[c]=(catCounts[c]||0)+1;});
  const visible=thumbnails.filter(t=>selectedCat==='__all__'||(t.category||'Uncategorized')===selectedCat);

  return (
    <div className="glass-card rounded-[32px] overflow-hidden flex flex-col md:flex-row min-h-[500px]">
      {lightbox&&(<div onClick={()=>setLightbox(null)} className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-[2000] cursor-zoom-out p-4"><img src={lightbox} alt="preview" className="max-w-full max-h-full rounded-2xl shadow-2xl" /></div>)}
      <div className="w-full md:w-56 bg-white/[0.02] border-r border-white/5 p-4 flex flex-col gap-1">
        <div className="flex items-center justify-between px-2 mb-2">
          <span className="text-[10px] font-semibold text-white/40 uppercase tracking-widest">Kategori Thumbnail</span>
          <button onClick={()=>{setAddingCat(true);setTimeout(()=>catInputRef.current?.focus(),50)}} className="text-white/40 hover:text-white transition-colors p-1"><Icon.Plus /></button>
        </div>
        <div onClick={()=>setSelectedCat('__all__')} className={`flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-medium cursor-pointer transition-all duration-300 ${selectedCat==='__all__'?'bg-white text-black shadow-md':'text-white/60 hover:bg-white/10'}`}>
          <div className="flex items-center gap-2.5 truncate"><span className={selectedCat==='__all__'?'text-black':'opacity-50'}><Icon.Folder /></span><span>Semua</span></div>
          <span className={`text-[10px] ${selectedCat==='__all__'?'text-black/50':'text-white/30'}`}>{thumbnails.length}</span>
        </div>
        {thumbnails.some(t=>!t.category||t.category==='Uncategorized')&&(
          <div onClick={()=>setSelectedCat('Uncategorized')} onDragOver={e=>{e.preventDefault()}} onDrop={e=>{e.preventDefault();const data=e.dataTransfer.getData('text/plain');if(data)handleMoveFile(data,'Uncategorized');}} className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-medium cursor-pointer transition-all duration-300 ${selectedCat==='Uncategorized'?'bg-white text-black shadow-md':'text-white/60 hover:bg-white/10'}`}>
            <span className={selectedCat==='Uncategorized'?'text-black':'opacity-50'}><Icon.Folder /></span><span>Uncategorized</span>
            <span className={`ml-auto text-[10px] ${selectedCat==='Uncategorized'?'text-black/50':'text-white/30'}`}>{catCounts['Uncategorized']||0}</span>
          </div>
        )}
        {categories.map(cat=><ThumbnailCategoryItem key={cat} cat={cat} count={catCounts[cat]||0} selectedCat={selectedCat} onSelect={setSelectedCat} onDelete={deleteCategory} onRename={handleRenameCategory} onDropFile={handleMoveFile} />)}
        {addingCat&&(<div className="px-2 mt-1 animate-in fade-in zoom-in-95"><input ref={catInputRef} value={newCatName} onChange={e=>setNewCatName(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')addCategory();if(e.key==='Escape'){setAddingCat(false);setNewCatName('');}}} onBlur={()=>{if(!newCatName.trim())setAddingCat(false);}} placeholder="Nama..." className="w-full glass-input rounded-lg px-3 py-2 text-xs text-white outline-none focus:ring-1 focus:ring-white/20" /></div>)}
      </div>
      <div className="flex-1 p-4 md:p-6 bg-transparent flex flex-col">
        <div className="flex flex-col sm:flex-row gap-4 mb-6">
          <div className="glass-card-strong rounded-[24px] p-5 flex-1 relative">
            <div className="flex justify-between items-center mb-4">
              <span className="text-[10px] font-semibold text-white/50 uppercase tracking-widest">Upload Baru</span>
              <button onClick={handleSync} disabled={syncLoading} className="text-[10px] font-bold px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 transition-all flex items-center gap-1.5"><span className={syncLoading?"animate-spin":""}><Icon.Sync /></span>{syncLoading?'Syncing':'GDrive Sync'}</button>
            </div>
            <select value={uploadCategory} onChange={e=>setUploadCategory(e.target.value)} className="w-full mb-3 glass-input rounded-xl px-3 py-2 text-xs text-white outline-none focus:ring-1 focus:ring-white/20 appearance-none">
              <option value="">— Uncategorized —</option>
              {categories.map(c=><option key={c} value={c}>{c}</option>)}
            </select>
            <div onDragOver={e=>{e.preventDefault();setDragOver(true)}} onDragLeave={()=>setDragOver(false)} onDrop={handleDrop} onClick={()=>fileInputRef.current?.click()} className={`border-2 border-dashed rounded-2xl p-4 text-center cursor-pointer transition-all overflow-hidden ${dragOver?'border-white/40 bg-white/5':previewFiles.length?'border-transparent bg-white/10':'border-white/10 hover:bg-white/[0.02]'}`}>
              <input ref={fileInputRef} type="file" multiple accept="image/jpeg,image/jpg,image/png,image/webp" className="hidden" onChange={e=>{if(e.target.files?.length)handleFileSelect(Array.from(e.target.files));e.target.value='';}} />
              {previewFiles.length>0?(
                <div className="w-full overflow-x-auto pb-2 flex gap-3 snap-x">
                  {previewFiles.map((p,idx)=>(
                    <div key={idx} className="relative group snap-center flex-shrink-0">
                      <img src={p.url} alt="preview" className="h-20 w-32 object-cover rounded-lg shadow-md" />
                      <button onClick={e=>removePreview(e,idx)} className="absolute -top-2 -right-2 bg-red-500 rounded-full w-5 h-5 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-lg z-10"><Icon.X /></button>
                    </div>
                  ))}
                </div>
              ):(
                <div className="flex flex-col items-center gap-1 py-4">
                  <div className="text-white/30 mb-1"><Icon.Image /></div>
                  <div className="text-[11px] text-white/60">Drop file JPG/PNG/WebP</div>
                </div>
              )}
            </div>
            {previewFiles.length>0&&uploadState!=='done'&&(<button onClick={handleUpload} disabled={uploadState==='uploading'} className="w-full mt-3 bg-white text-black py-2.5 rounded-xl text-xs font-bold hover:scale-95 transition-transform disabled:opacity-50 flex items-center justify-center gap-2">{uploadState==='uploading'?'⏳ Mengupload...':<><Icon.Upload />Upload {previewFiles.length} File</>}</button>)}
          </div>
        </div>
        <div className="flex items-center justify-between mb-4 px-1">
          <div className="flex items-center gap-2 text-xs font-semibold text-white/50"><span>Thumbnails</span>{selectedCat!=='__all__'&&<><Icon.ChevronRight /><span className="text-white">{selectedCat}</span></>}</div>
          <span className="text-[10px] text-white/40">{visible.length} File</span>
        </div>
        {visible.length===0?(<div className="flex-1 flex items-center justify-center text-white/30 text-xs">Belum ada thumbnail.</div>):(
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 overflow-y-auto pr-1">
            {visible.map(t=>(
              <div key={t.filename} draggable onDragStart={e=>e.dataTransfer.setData('text/plain',JSON.stringify({filename:t.filename,oldCategory:t.category||'Uncategorized',type:'thumbnail'}))} className="group glass-input rounded-2xl overflow-hidden cursor-grab hover:ring-1 hover:ring-white/20 transition-all">
                <div className="aspect-video bg-black/40 relative cursor-zoom-in" onClick={()=>setLightbox(`/api/thumbnails/preview/${encodeURIComponent(t.filename)}`)}>
                  <img src={`/api/thumbnails/preview/${encodeURIComponent(t.filename)}`} alt={t.filename} className="w-full h-full object-cover" onError={e=>{(e.target as HTMLImageElement).style.display='none';}} />
                  <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={e=>{e.stopPropagation();handleDelete(t.filename);}} className="w-7 h-7 bg-red-500/80 backdrop-blur-md rounded-lg flex items-center justify-center text-white hover:bg-red-500 transition-colors"><Icon.Trash /></button>
                  </div>
                </div>
                <div className="p-3">
                  <div className="text-[10px] font-semibold text-white/80 truncate mb-1">{t.filename}</div>
                  <div className="flex justify-between items-center text-[9px] text-white/40">
                    <span>{fmtSize(t.sizeBytes)}</span>
                    {t.category&&t.category!=='Uncategorized'&&<span className="bg-white/10 px-1.5 py-0.5 rounded text-white/60">{t.category}</span>}
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

function VideoJadiTab({ toast, queue, onUpload, refresh }: { toast:(msg:string,type:ToastItem["type"])=>void; queue:UploadQueueItem[]; onUpload:(f:File[],c:string)=>void; refresh:number }) {
  const [files, setFiles] = useState<any[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [selectedCat, setSelectedCat] = useState('__all__');
  const uploading=queue.some(q=>q.status==="uploading");
  const [uploadCat, setUploadCat] = useState('');
  const [newCatName, setNewCatName] = useState('');
  const [addingCat, setAddingCat] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef=useRef<HTMLInputElement>(null);
  const catInputRef=useRef<HTMLInputElement>(null);

  const fetchFiles=useCallback(async()=>{try{const res=await fetch(`${API_BASE}/files?type=video-ready`);if(res.ok){const d=await res.json();setFiles(d.files||[]);}}catch{}},[]);
  const fetchCats=useCallback(async()=>{try{const res=await fetch(`${API_BASE}/categories?type=video-ready`);if(res.ok){const d=await res.json();setCategories(d['video-ready']||[]);}}catch{}},[]);
  useEffect(()=>{fetchFiles();fetchCats();},[fetchFiles,fetchCats,refresh]);

  const catCounts:Record<string,number>={};
  files.forEach(f=>{const c=f.category||'Uncategorized';catCounts[c]=(catCounts[c]||0)+1;});

  const handleUpload=(files:File[])=>{if(!files||!files.length)return;onUpload(files,uploadCat||'Uncategorized');};
  const handleDelete=async(category:string,filename:string)=>{if(!confirm(`Hapus ${filename}?`))return;await fetch(`${API_BASE}/files/video-ready/${encodeURIComponent(category||'Uncategorized')}/${encodeURIComponent(filename)}`,{method:'DELETE'});await fetchFiles();toast('File dihapus','info');};

  const handleRenameFile=async(category:string,oldName:string,newName:string)=>{
    try{const res=await fetch(`${API_BASE}/files/video-ready/${encodeURIComponent(category)}/${encodeURIComponent(oldName)}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({newName})});const d=await res.json();if(!res.ok)throw new Error(d.error);await fetchFiles();toast(`Direname ke "${d.newName}"`,'success');}catch(e){toast(e instanceof Error?e.message:'Gagal rename','error');}
  };

  const handleRenameCategory=async(oldName:string,newName:string)=>{
    try{const res=await fetch(`${API_BASE}/categories/video-ready/${encodeURIComponent(oldName)}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({newName})});const d=await res.json();if(!res.ok)throw new Error(d.error);await fetchCats();if(selectedCat===oldName)setSelectedCat(newName);toast(`Folder direname ke "${newName}"`,'success');}catch(e){toast(e instanceof Error?e.message:'Gagal rename','error');}
  };

  const addCat=async()=>{const n=newCatName.trim();if(!n)return;try{const res=await fetch(`${API_BASE}/categories`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:'video-ready',name:n})});const d=await res.json();if(!res.ok)throw new Error(d.error||'Gagal');await fetchCats();setNewCatName('');setAddingCat(false);toast('Kategori ditambah','success');}catch(err){toast(err instanceof Error?err.message:'Gagal','error');}};
  const delCat=async(name:string)=>{if(files.some(f=>f.category===name))return toast('Masih ada file di kategori ini','error');await fetch(`${API_BASE}/categories/video-ready/${encodeURIComponent(name)}`,{method:'DELETE'});await fetchCats();if(selectedCat===name)setSelectedCat('__all__');};

  const visible=files.filter(f=>selectedCat==='__all__'||(f.category||'Uncategorized')===selectedCat);

  return (
    <div className="glass-card rounded-[32px] overflow-hidden flex flex-col md:flex-row min-h-[500px]">
      <div className="w-full md:w-56 bg-white/[0.02] border-r border-white/5 p-4 flex flex-col gap-1">
        <div className="flex items-center justify-between px-2 mb-2">
          <span className="text-[10px] font-semibold text-white/40 uppercase tracking-widest">Kategori</span>
          <button onClick={()=>{setAddingCat(true);setTimeout(()=>catInputRef.current?.focus(),50);}} className="text-white/40 hover:text-white transition-colors p-1"><Icon.Plus /></button>
        </div>
        <SidebarItem icon={<Icon.Folder />} label="__all__" active={selectedCat==='__all__'} count={files.length} onClick={()=>setSelectedCat('__all__')} />
        {categories.map(cat=>(
          <SidebarItem key={cat} icon={<Icon.Folder />} label={cat} active={selectedCat===cat} count={catCounts[cat]||0} onClick={()=>setSelectedCat(cat)} onDelete={()=>delCat(cat)} onRename={(n)=>handleRenameCategory(cat,n)} />
        ))}
        {addingCat&&(<div className="px-2 mt-1 animate-in fade-in zoom-in-95"><input ref={catInputRef} value={newCatName} onChange={e=>setNewCatName(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')addCat();if(e.key==='Escape'){setAddingCat(false);setNewCatName('');} }} onBlur={()=>{if(!newCatName.trim())setAddingCat(false);}} placeholder="Nama kategori..." className="w-full glass-input rounded-lg px-3 py-2 text-xs text-white outline-none focus:ring-1 focus:ring-white/20" /></div>)}
      </div>
      <div className="flex-1 p-4 md:p-6 flex flex-col gap-6">
        <div className="glass-card-strong rounded-[24px] p-5">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-[10px] font-semibold text-white/50 uppercase tracking-widest">Upload Video Jadi</span>
            <span className="text-[9px] font-bold text-amber-400 bg-amber-400/10 border border-amber-400/20 px-2 py-0.5 rounded-full">⚡ Stream Copy</span>
          </div>
          <div className="bg-amber-500/8 border border-amber-500/20 rounded-xl p-3 mb-3 text-[10px] text-amber-300 leading-relaxed">Video di sini distream langsung tanpa re-encode. Pastikan format: <span className="font-bold">MP4 H264, 1080p/720p, 30fps</span>.</div>
          <select value={uploadCat} onChange={e=>setUploadCat(e.target.value)} className="w-full mb-3 glass-input rounded-xl px-3 py-2 text-xs text-white outline-none appearance-none">
            <option value="">— Uncategorized —</option>
            {categories.map(c=><option key={c} value={c}>{c}</option>)}
          </select>
          <div onDragOver={e=>{e.preventDefault();setDragOver(true);}} onDragLeave={()=>setDragOver(false)} onDrop={e=>{e.preventDefault();setDragOver(false);const f=e.dataTransfer.files;if(f?.length)handleUpload(Array.from(f));}} onClick={()=>fileInputRef.current?.click()} className={`border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition-all ${dragOver?'border-amber-400/50 bg-amber-400/5':'border-white/10 hover:bg-white/[0.02]'}`}>
            <input ref={fileInputRef} type="file" multiple accept=".mp4,.mkv,.mov,.avi,.webm" className="hidden" onChange={e=>{const f=e.target.files;if(f?.length)handleUpload(Array.from(f));e.target.value='';}} />
            <div className="text-white/30 mb-1 flex justify-center"><Icon.Video /></div>
            <div className="text-[11px] text-white/60 font-medium">{uploading?'⏳ Uploading...':'Drop file video atau klik untuk pilih'}</div>
          </div>
        </div>
        <div>
          <div className="flex items-center justify-between mb-4 px-1">
            <span className="text-xs font-semibold text-white/50">Video Jadi — {selectedCat==='__all__'?'Semua':selectedCat}</span>
            <span className="text-[10px] text-white/40">{visible.length} file</span>
          </div>
          {visible.length===0?(<div className="flex items-center justify-center h-32 text-white/30 text-xs">Belum ada video jadi di sini.</div>):(
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {visible.map(f=>{
                const name=f.filename||f.name;const size=f.size||f.sizeBytes||0;const cat=f.category||'Uncategorized';
                return (
                  <VideoJadiCard key={`${cat}-${name}`} name={name} size={size} cat={cat} apiBase={API_BASE}
                    onDelete={()=>handleDelete(cat,name)}
                    onRename={(newName:string)=>handleRenameFile(cat,name,newName)} categories={categories} onMove={async(newCat)=>{try{const res=await fetch(API_BASE+'/files/move',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:'video-ready',oldCategory:cat,newCategory:newCat,filename:name})});if(!res.ok)throw new Error();await fetchFiles();toast('Dipindah ke '+newCat,'success');}catch{toast('Gagal pindah','error');}}} />
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function VideoJadiCard({ name, size, cat, apiBase, categories, onDelete, onRename, onMove }: { name:string; size:number; cat:string; apiBase:string; categories:string[]; onDelete:()=>void; onRename:(n:string)=>void; onMove:(newCat:string)=>void }) {
  const [editing, setEditing] = useState(false);
  const [editVal, setEditVal] = useState(name);
  const [showMove, setShowMove] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(()=>{if(editing)setTimeout(()=>inputRef.current?.focus(),50);},[editing]);
  const submit=()=>{const v=editVal.trim();if(v&&v!==name)onRename(v);setEditing(false);};
  return (
    <div className="group glass-input rounded-2xl overflow-hidden hover:ring-1 hover:ring-white/20 transition-all">
      <video src={apiBase+'/media/video-ready/'+encodeURIComponent(cat)+'/'+encodeURIComponent(name)} className="w-full aspect-video object-cover bg-black/60" controls preload="metadata" playsInline />
      <div className="p-3 flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <div className="truncate flex-1">
            {editing?(
              <input ref={inputRef} value={editVal} onChange={e=>setEditVal(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')submit();if(e.key==='Escape'){setEditing(false);setEditVal(name);}}} onBlur={submit} onClick={e=>e.stopPropagation()} className="w-full glass-input rounded px-2 py-1 text-[10px] text-white outline-none" />
            ):(
              <div className="text-[10px] font-semibold text-white/80 truncate">{name}</div>
            )}
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-[9px] text-white/40">{fmtSize(size)}</span>
              <span className="text-[9px] text-amber-400 font-bold">⚡ copy</span>
              <span className="text-[9px] text-white/30">{cat}</span>
            </div>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            <button onClick={()=>setShowMove(!showMove)} title="Pindah folder" className="w-7 h-7 flex items-center justify-center rounded-lg text-white/30 hover:bg-white/10 hover:text-white opacity-0 group-hover:opacity-100 transition-all"><Icon.Folder /></button>
            <button onClick={()=>setEditing(true)} className="w-7 h-7 flex items-center justify-center rounded-lg text-white/30 hover:bg-white/10 hover:text-white opacity-0 group-hover:opacity-100 transition-all"><Icon.Pencil /></button>
            <button onClick={onDelete} className="w-7 h-7 flex items-center justify-center rounded-lg text-white/30 hover:bg-red-500/20 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all"><Icon.Trash /></button>
          </div>
        </div>
        {showMove&&(
          <div className="flex gap-2 items-center">
            <select onChange={e=>{if(e.target.value){onMove(e.target.value);setShowMove(false);}}} defaultValue="" className="flex-1 glass-input rounded-lg px-2 py-1.5 text-[10px] text-white outline-none appearance-none">
              <option value="" disabled>Pindah ke folder...</option>
              {categories.filter(c=>c!==cat).map(c=><option key={c} value={c}>{c}</option>)}
              {cat!=='Uncategorized'&&<option value="Uncategorized">Uncategorized</option>}
            </select>
            <button onClick={()=>setShowMove(false)} className="text-white/30 hover:text-white text-[10px]">✕</button>
          </div>
        )}
      </div>
    </div>
  );
}

function TextAssetsTab({ toast }: { toast:any }) {
  const [titles,setTitles]=useState<any[]>([]);const [descs,setDescs]=useState<any[]>([]);
  const [cats,setCats]=useState<string[]>([]);const [selCat,setSelCat]=useState('__all__');
  const [adding,setAdding]=useState(false);const [newCat,setNewCat]=useState('');
  const [addMode,setAddMode]=useState<'title'|'description'|null>(null);
  const [formVal,setFormVal]=useState('');const [formLabel,setFormLabel]=useState('');
  const load=async()=>{try{const[tRes,dRes,cRes]=await Promise.all([fetch('/api/assets/titles'),fetch('/api/assets/descriptions'),fetch('/api/assets/text-categories')]);if(tRes.ok)setTitles(await tRes.json());if(dRes.ok)setDescs(await dRes.json());if(cRes.ok){const d=await cRes.json();setCats(Array.from(new Set(d.categories||[])));}}catch{}};
  useEffect(()=>{load();},[]);
  const saveAsset=async()=>{if(!formVal||!formLabel)return toast('Isi label & nilai!','error');await fetch('/api/assets',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:addMode,value:formVal,label:formLabel,category:selCat==='__all__'?'Uncategorized':selCat})});setAddMode(null);setFormVal('');setFormLabel('');load();toast('Teks tersimpan','success');};
  const delAsset=async(id:number)=>{if(!confirm('Hapus teks ini?'))return;await fetch(`/api/assets/${id}`,{method:'DELETE'});load();toast('Dihapus','info');};
  const addCategory=async()=>{const n=newCat.trim();if(!n)return;try{await fetch('/api/assets/text-categories',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:n})});setAdding(false);setNewCat('');load();toast('Kategori ditambah','success');}catch{}};
  const deleteCategory=async(catName:string)=>{if(!confirm(`Hapus folder "${catName}"?`))return;try{await fetch(`/api/assets/text-categories/${encodeURIComponent(catName)}`,{method:'DELETE'});setCats(prev=>prev.filter(c=>c!==catName));if(selCat===catName)setSelCat('__all__');load();toast('Folder dihapus','info');}catch{}};
  const moveAsset=async(dataStr:string,targetCat:string)=>{const data=JSON.parse(dataStr);if(data.oldCategory===targetCat)return;await fetch('/api/assets/move',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:data.id,category:targetCat})});load();toast(`Dipindah ke ${targetCat}`,'success');};
  const AssetList=({type,data}:{type:string;data:any[]})=>(
    <div className="flex-1 glass-card-strong p-4 rounded-[24px]">
      <div className="flex justify-between items-center mb-4">
        <span className="text-[10px] font-bold text-white/50 uppercase tracking-widest">{type==='title'?'Judul Stream':'Deskripsi Stream'}</span>
        <button onClick={()=>setAddMode(type as any)} className="bg-white/10 hover:bg-white text-white hover:text-black px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all">Tambah Baru</button>
      </div>
      <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
        {data.filter(d=>selCat==='__all__'||(d.category||'Uncategorized')===selCat).map(d=>(
          <div key={d.id} draggable onDragStart={e=>e.dataTransfer.setData('text/plain',JSON.stringify({id:d.id,oldCategory:d.category||'Uncategorized'}))} className="group glass-input p-3 rounded-xl relative cursor-grab hover:ring-1 hover:ring-white/20 transition-all">
            <div className="text-xs font-bold text-white mb-1 pr-6">{d.label}</div>
            <div className="text-[10px] text-white/60 line-clamp-2">{d.value}</div>
            <div className="flex justify-between mt-2"><span className="text-[9px] bg-white/10 px-2 py-0.5 rounded text-white/40">{d.category||'Uncategorized'}</span></div>
            <button onClick={()=>delAsset(d.id)} className="absolute top-2 right-2 text-white/20 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all">X</button>
          </div>
        ))}
      </div>
    </div>
  );
  return (
    <div className="glass-card rounded-[32px] overflow-hidden flex flex-col md:flex-row min-h-[500px] relative">
      {addMode&&(<div className="absolute inset-0 bg-black/80 backdrop-blur-sm flex justify-center items-center z-50 p-4"><div className="bg-[#111318] p-6 rounded-2xl w-full max-w-md border border-white/10"><h3 className="text-sm font-bold text-white mb-4">Tambah {addMode==='title'?'Judul':'Deskripsi'}</h3><input value={formLabel} onChange={e=>setFormLabel(e.target.value)} placeholder="Nama / Label Penanda" className="w-full glass-input p-3 rounded-xl text-xs text-white mb-3 outline-none" /><textarea value={formVal} onChange={e=>setFormVal(e.target.value)} placeholder="Isi teks..." rows={addMode==='title'?2:5} className="w-full glass-input p-3 rounded-xl text-xs text-white mb-4 outline-none resize-none" /><div className="flex gap-2 justify-end"><button onClick={()=>setAddMode(null)} className="px-4 py-2 text-xs text-white/50 hover:text-white">Batal</button><button onClick={saveAsset} className="px-4 py-2 bg-white text-black text-xs font-bold rounded-xl hover:scale-95 transition-all">Simpan</button></div></div></div>)}
      <div className="w-full md:w-56 bg-white/[0.02] border-r border-white/5 p-4 flex flex-col gap-1">
        <div className="flex items-center justify-between px-2 mb-2"><span className="text-[10px] font-semibold text-white/40 uppercase tracking-widest">Kategori Teks</span><button onClick={()=>setAdding(true)} className="text-white/40 hover:text-white transition-colors p-1">+</button></div>
        <SidebarItem icon={<span>📁</span>} label="__all__" active={selCat==='__all__'} onClick={()=>setSelCat('__all__')} />
        <SidebarItem icon={<span>📁</span>} label="Uncategorized" active={selCat==='Uncategorized'} onClick={()=>setSelCat('Uncategorized')} onDropFile={(d:any)=>moveAsset(d,'Uncategorized')} />
        {cats.filter(c=>c!=='Uncategorized').map(c=><SidebarItem key={c} icon={<span>📁</span>} label={c} active={selCat===c} onClick={()=>setSelCat(c)} onDropFile={(d:any)=>moveAsset(d,c)} onDelete={()=>deleteCategory(c)} />)}
        {adding&&<input value={newCat} onChange={e=>setNewCat(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')addCategory();}} placeholder="Ketik & Enter..." className="glass-input p-2 text-xs rounded-lg mt-2 text-white outline-none" />}
      </div>
      <div className="flex-1 p-6 flex flex-col md:flex-row gap-4"><AssetList type="title" data={titles}/><AssetList type="description" data={descs}/></div>
    </div>
  );
}

export default function MediaPool() {
  const {toasts,add:addToast,remove:removeToast}=useToast();
  const [activeTab,setActiveTab]=useState<"music"|"video"|"thumbnails"|"video-jadi"|"teks">("music");
  const [musicCats,setMusicCats]=useState<string[]>([]);
  const [videoCats,setVideoCats]=useState<string[]>([]);
  const [musicCat,setMusicCat]=useState("__all__");
  const [videoCat,setVideoCat]=useState("__all__");
  const [files,setFiles]=useState<FileItem[]>([]);
  const [queue,setQueue]=useState<UploadQueueItem[]>([]);
  const [showModal,setShowModal]=useState(false);
  const [playing,setPlaying]=useState<FileItem|null>(null);
  const [isPaused,setIsPaused]=useState(false);
  const [refreshCount,setRefreshCount]=useState(0);
  const [syncing,setSyncing]=useState(false);

  const fetchFiles=useCallback(async()=>{try{const r=await fetch(`${API_BASE}/files`);if(!r.ok)throw new Error();const data=await r.json();setFiles(Array.isArray(data.files)?data.files:[]);setRefreshCount(c=>c+1);}catch{}},[]);
  const fetchCategories=useCallback(async()=>{try{const r=await fetch(`${API_BASE}/categories`);if(!r.ok)throw new Error();const data=await r.json();if(Array.isArray(data.music))setMusicCats(data.music);if(Array.isArray(data.video))setVideoCats(data.video);}catch{}},[]);
  useEffect(()=>{fetchFiles();fetchCategories();},[fetchFiles,fetchCategories]);

  const mediaType=activeTab==="thumbnails"?"music":activeTab==="video-jadi"?"video-ready":activeTab;
  const cats=mediaType==="music"?musicCats:videoCats;
  const selCat=mediaType==="music"?musicCat:videoCat;
  const setSelCat=mediaType==="music"?setMusicCat:setVideoCat;
  const visible=files.filter(f=>f.type===mediaType&&(selCat==="__all__"||(f.category||'Uncategorized')===selCat));

  // Hitung jumlah file per kategori
  const fileCounts:Record<string,number>={};
  files.filter(f=>f.type===mediaType).forEach(f=>{const c=f.category||'Uncategorized';fileCounts[c]=(fileCounts[c]||0)+1;});

  const handleUpload=async(rawFiles:File[],category:string)=>{
    const items:UploadQueueItem[]=rawFiles.map(f=>({id:`${Date.now()}-${Math.random()}`,name:f.name,file:f,status:"pending",progress:0}));
    setQueue(q=>[...q,...items]);
    for(const item of items){
      try{
        setQueue(q=>q.map(i=>i.id===item.id?{...i,status:"uploading"}:i));
        const fd=new FormData();fd.append("type",mediaType);fd.append("category",category);fd.append("file",item.file);
        await new Promise<void>((resolve,reject)=>{
          const xhr=new XMLHttpRequest();
          xhr.upload.onprogress=e=>{setQueue(q=>q.map(i=>i.id===item.id?{...i,progress:Math.round((e.loaded/e.total)*100)}:i));};
          xhr.onload=()=>xhr.status===200?resolve():reject();
          xhr.open("POST",`${API_BASE}/upload`);xhr.send(fd);
        });
        await fetchFiles();setQueue(q=>q.map(i=>i.id===item.id?{...i,status:"done",progress:100}:i));addToast(`Berhasil upload ${item.name}`,"success");
      }catch{setQueue(q=>q.map(i=>i.id===item.id?{...i,status:"error"}:i));addToast(`Gagal upload ${item.name}`,"error");}
    }
    setTimeout(()=>setQueue(q=>q.filter(i=>i.status!=="done")),5000);
  };

  const handleMoveFile=async(dataString:string,targetCat:string)=>{
    try{const data=JSON.parse(dataString);if(data.type!==mediaType||data.oldCategory===targetCat)return;const res=await fetch(`${API_BASE}/files/move`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:data.type,oldCategory:data.oldCategory,newCategory:targetCat,filename:data.filename})});if(!res.ok)throw new Error();addToast(`Dipindah ke ${targetCat}`,'success');await fetchFiles();}catch{addToast('Gagal memindah','error');}
  };

  const handleRenameFile=async(fileId:string,newName:string)=>{
    const file=files.find(f=>f.id===fileId);if(!file)return;
    try{const res=await fetch(`${API_BASE}/files/${file.type}/${encodeURIComponent(file.category)}/${encodeURIComponent(file.name)}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({newName})});const d=await res.json();if(!res.ok)throw new Error(d.error);await fetchFiles();addToast(`Direname ke "${d.newName}"`,'success');}catch(e){addToast(e instanceof Error?e.message:'Gagal rename','error');}
  };

  const handleRenameCategory=async(oldName:string,newName:string)=>{
    try{const res=await fetch(`${API_BASE}/categories/${mediaType}/${encodeURIComponent(oldName)}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({newName})});const d=await res.json();if(!res.ok)throw new Error(d.error);await fetchCategories();if(selCat===oldName)setSelCat(newName);addToast(`Folder direname ke "${newName}"`,'success');}catch(e){addToast(e instanceof Error?e.message:'Gagal rename','error');}
  };

  const triggerSync=async()=>{if(syncing)return;setSyncing(true);try{await fetch(`${API_BASE}/sync`,{method:"POST"});addToast("Sync GDrive berhasil","success");}catch{addToast("Sync gagal","error");}finally{setSyncing(false);}};
  const addCat=async(type:"music"|"video",name:string)=>{try{await fetch(`${API_BASE}/categories`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({type,name})});await fetchCategories();addToast("Kategori ditambah","success");}catch{addToast("Gagal","error");}};
  const delCat=async(type:"music"|"video",name:string)=>{if(files.some(f=>f.type===type&&f.category===name))return addToast("Masih ada file","error");try{await fetch(`${API_BASE}/categories/${type}/${encodeURIComponent(name)}`,{method:"DELETE"});await fetchCategories();if(selCat===name)setSelCat("__all__");addToast("Kategori dihapus","info");}catch{addToast("Gagal","error");}};
  const delFile=async(id:string)=>{const f=files.find(x=>x.id===id);if(!f)return;try{await fetch(`${API_BASE}/files/${f.type}/${encodeURIComponent(f.category)}/${encodeURIComponent(f.name)}`,{method:"DELETE"});if(playing?.id===id)setPlaying(null);await fetchFiles();addToast("Dihapus","info");}catch{addToast("Gagal hapus","error");}};

  return (
    <div className="min-h-screen text-white apple-ui relative z-0 pb-20 overflow-x-hidden">
      <style dangerouslySetInnerHTML={{__html:`
        .apple-ui{font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text","Segoe UI",Roboto,Helvetica,Arial,sans-serif;font-weight:400;letter-spacing:-0.01em;}
        .glass-card{background:rgba(255,255,255,0.03);backdrop-filter:blur(40px);border:1px solid rgba(255,255,255,0.08);box-shadow:0 10px 40px -10px rgba(0,0,0,0.3);}
        .glass-card-strong{background:rgba(255,255,255,0.08);backdrop-filter:blur(40px);border:1px solid rgba(255,255,255,0.15);box-shadow:0 20px 40px -10px rgba(0,0,0,0.5);}
        .glass-input{background:rgba(0,0,0,0.2);border:1px solid rgba(255,255,255,0.06);}
        ::-webkit-scrollbar{width:6px;height:6px;}::-webkit-scrollbar-track{background:transparent;}::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.15);border-radius:10px;}
      `}} />
      <div className="fixed inset-0 z-[-1] bg-[#050507]">
        <div className="absolute top-[-10%] left-[-10%] w-[50vw] h-[50vw] bg-indigo-600/20 rounded-full blur-[140px] mix-blend-screen pointer-events-none" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[60vw] h-[60vw] bg-orange-600/10 rounded-full blur-[140px] mix-blend-screen pointer-events-none" />
      </div>
      <div className="max-w-6xl mx-auto px-4 lg:px-8 pt-8">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-8">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-white mb-1">Media Pool</h1>
            <p className="text-white/50 text-[11px] font-semibold uppercase tracking-widest">Asset Manager</p>
          </div>
          <div className="bg-black/30 p-1.5 rounded-full flex gap-1 border border-white/5 shadow-inner">
            <button onClick={()=>setActiveTab("music")} className={`px-5 py-2.5 rounded-full text-xs font-bold transition-all duration-300 flex items-center gap-2 ${activeTab==="music"?'bg-white text-black shadow-lg':'text-white/50 hover:text-white hover:bg-white/5'}`}><Icon.Music/>Musik</button>
            <button onClick={()=>setActiveTab("video")} className={`px-5 py-2.5 rounded-full text-xs font-bold transition-all duration-300 flex items-center gap-2 ${activeTab==="video"?'bg-white text-black shadow-lg':'text-white/50 hover:text-white hover:bg-white/5'}`}><Icon.Video/>Video</button>
            <button onClick={()=>setActiveTab("thumbnails")} className={`px-5 py-2.5 rounded-full text-xs font-bold transition-all duration-300 flex items-center gap-2 ${activeTab==="thumbnails"?'bg-white text-black shadow-lg':'text-white/50 hover:text-white hover:bg-white/5'}`}><Icon.Image/>Thumbnails</button>
            <button onClick={()=>setActiveTab("video-jadi")} className={`px-5 py-2.5 rounded-full text-xs font-bold transition-all duration-300 flex items-center gap-2 ${activeTab==="video-jadi"?'bg-amber-400 text-black shadow-lg':'text-amber-400/60 hover:text-amber-400 hover:bg-amber-400/5'}`}><svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>Video Jadi</button>
            <button onClick={()=>setActiveTab("teks")} className={`px-5 py-2.5 rounded-full text-xs font-bold transition-all duration-300 flex items-center gap-2 ${activeTab==="teks"?'bg-white text-black shadow-lg':'text-white/50 hover:text-white hover:bg-white/5'}`}>📝 Teks</button>
          </div>
        </div>

        {queue.length>0&&(
          <div className="mb-6 space-y-2">
            {queue.map(item=>(
              <div key={item.id} className="glass-card-strong rounded-xl p-3 flex flex-col gap-2">
                <div className="flex justify-between items-center text-xs"><span className="text-white/80 font-medium truncate pr-4">{item.name}</span><span className={item.status==="done"?"text-emerald-400":item.status==="error"?"text-red-400":"text-white"}>{item.status==="uploading"?`${item.progress}%`:"Selesai"}</span></div>
                <div className="h-1 bg-white/10 rounded-full overflow-hidden"><div className={`h-full rounded-full transition-all ${item.status==="done"?"bg-emerald-400":item.status==="error"?"bg-red-400":"bg-white"}`} style={{width:`${item.progress}%`}}/></div>
              </div>
            ))}
          </div>
        )}

        {activeTab==="teks"?<TextAssetsTab toast={addToast}/>:activeTab==="video-jadi"?<VideoJadiTab toast={addToast} queue={queue} onUpload={handleUpload} refresh={refreshCount}/>:activeTab==="thumbnails"?<ThumbnailTab toast={addToast}/>:(
          <div className="glass-card rounded-[32px] overflow-hidden flex flex-col md:flex-row min-h-[600px] mb-8">
            <div className="bg-white/[0.02] border-r border-white/5 p-4 md:p-6 flex flex-col gap-2">
              <CategorySidebar type={activeTab} categories={cats} fileCounts={fileCounts} selected={selCat} onSelect={setSelCat}
                onAdd={n=>addCat(activeTab,n)} onDelete={n=>delCat(activeTab,n)}
                onRename={(old,n)=>handleRenameCategory(old,n)}
                onMoveFile={handleMoveFile} />
            </div>
            <div className="flex-1 p-4 md:p-6 bg-transparent flex flex-col">
              <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
                <div className="flex items-center gap-3 text-xs font-semibold text-white/50">
                  <span>{activeTab==="music"?"Musik":"Video"}</span>{selCat!=="__all__"&&<><Icon.ChevronRight/><span className="text-white">{selCat}</span></>}
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={triggerSync} disabled={syncing} className="bg-white/10 hover:bg-white/20 text-white px-4 py-2 rounded-full text-[10px] font-bold uppercase tracking-wider transition-all flex items-center gap-1.5"><span className={syncing?"animate-spin":""}><Icon.Sync/></span>Sync GDrive</button>
                  <button onClick={()=>setShowModal(true)} className="bg-white text-black px-5 py-2 rounded-full text-xs font-bold shadow-lg hover:scale-95 transition-all flex items-center gap-1.5"><Icon.Upload/>Upload</button>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto pr-2 -mr-2">
                <FileList files={visible} type={activeTab} onDelete={delFile} onRename={handleRenameFile} onPlay={setPlaying} playing={playing} isPaused={isPaused} onTogglePause={()=>setIsPaused(!isPaused)}/>
              </div>
            </div>
          </div>
        )}
      </div>
      {showModal&&<UploadModal type={activeTab as "music"|"video"} categories={cats} onClose={()=>setShowModal(false)} onUpload={handleUpload}/>}
      {activeTab!=="thumbnails"&&<MiniPlayer playing={playing} type={activeTab as "music"|"video"} apiBase={API_BASE} isPaused={isPaused} setIsPaused={setIsPaused}/>}
      <Toast toasts={toasts} remove={removeToast}/>
    </div>
  );
}
