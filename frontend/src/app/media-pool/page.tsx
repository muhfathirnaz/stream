'use client';

import { useState, useRef, useCallback } from "react";

const API_BASE = "/media-pool-api";

interface ToastItem { id: number; msg: string; type: "info" | "success" | "error"; }
interface FileItem { id: string; name: string; size: number; type: "music" | "video"; category: string; status?: string; duration?: number; }
interface UploadQueueItem { id: string; name: string; file: File; status: "pending" | "uploading" | "done" | "error"; progress: number; }

const Icon = {
  Music: () => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18"><path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" /></svg>),
  Video: () => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18"><rect x="2" y="3" width="15" height="15" rx="2" /><path d="m17 8 5-3v14l-5-3" /></svg>),
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

const fmtSize = (b: number) => !b ? "—" : b < 1048576 ? `${(b/1024).toFixed(1)} KB` : b < 1073741824 ? `${(b/1048576).toFixed(1)} MB` : `${(b/1073741824).toFixed(2)} GB`;
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
      <div style={{ color:"#aaa", fontSize:13 }}><span style={{ color:"#7c6fcd", fontWeight:600 }}>Pilih file</span> atau drag &amp; drop</div>
      <div style={{ color:"#555", fontSize:11, marginTop:4 }}>{label}</div>
      <input ref={ref} type="file" multiple accept={accept.join(",")} style={{ display:"none" }} onChange={e=>{if(e.target.files?.length)onFiles([...e.target.files]);e.target.value="";}} />
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
  if (!playing) return null;
  const url = `${apiBase}/media/${type}/${encodeURIComponent(playing.category)}/${encodeURIComponent(playing.name)}`;
  const onTime = () => { const el=mediaRef.current; if(el?.duration) setProgress((el.currentTime/el.duration)*100); };
  const toggle = () => { const el=mediaRef.current; if(!el)return; paused?el.play():el.pause(); setPaused(!paused); };
  const seek = (e: React.MouseEvent<HTMLDivElement>) => { const el=mediaRef.current; if(!el?.duration)return; const r=e.currentTarget.getBoundingClientRect(); el.currentTime=((e.clientX-r.left)/r.width)*el.duration; };
  return (
    <div style={{ position:"fixed", bottom:0, left:0, right:0, background:"rgba(10,10,18,.96)", borderTop:"1px solid #1e1e2e", backdropFilter:"blur(12px)", padding:"10px 24px", display:"flex", alignItems:"center", gap:16, zIndex:500 }}>
      {type==="music"
        ? <audio ref={mediaRef as React.RefObject<HTMLAudioElement>} src={url} autoPlay onTimeUpdate={onTime} />
        : <video ref={mediaRef as React.RefObject<HTMLVideoElement>} src={url} autoPlay style={{ display:"none" }} onTimeUpdate={onTime} />}
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
  );
}

export default function MediaPool() {
  const { toasts, add: addToast, remove: removeToast } = useToast();
  const [activeTab, setActiveTab] = useState<"music"|"video">("music");
  const [musicCats, setMusicCats] = useState<string[]>(["Rainy","Jazz","Night","Chill","Hype"]);
  const [videoCats, setVideoCats] = useState<string[]>(["Overlay","BRB","Starting","Ending"]);
  const [musicCat, setMusicCat] = useState("__all__");
  const [videoCat, setVideoCat] = useState("__all__");
  const [files, setFiles] = useState<FileItem[]>([]);
  const [queue, setQueue] = useState<UploadQueueItem[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [playing, setPlaying] = useState<FileItem|null>(null);
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<string|null>(null);

  const cats = activeTab==="music"?musicCats:videoCats;
  const selCat = activeTab==="music"?musicCat:videoCat;
  const setSelCat = activeTab==="music"?setMusicCat:setVideoCat;
  const visible = files.filter(f => f.type===activeTab && (selCat==="__all__"||f.category===selCat));

  const handleUpload = async (rawFiles: File[], category: string) => {
    const items: UploadQueueItem[] = rawFiles.map(f => ({ id:`${Date.now()}-${Math.random()}`, name:f.name, file:f, status:"pending", progress:0 }));
    setQueue(q => [...q, ...items]);
    for (const item of items) {
      try {
        setQueue(q => q.map(i => i.id===item.id?{...i,status:"uploading"}:i));
        const fd = new FormData();
        fd.append("file", item.file);
        fd.append("category", category);
        fd.append("type", activeTab);
        await new Promise<void>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.upload.onprogress = e => { const p=Math.round((e.loaded/e.total)*100); setQueue(q=>q.map(i=>i.id===item.id?{...i,progress:p}:i)); };
          xhr.onload = () => xhr.status===200?resolve():reject(new Error(`HTTP ${xhr.status}`));
          xhr.onerror = () => reject(new Error("Network error"));
          xhr.open("POST", `${API_BASE}/upload`);
          xhr.send(fd);
        });
        setFiles(prev => [...prev, { id:item.id, name:item.name, size:item.file.size, type:activeTab, category }]);
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
      if (!silent) addToast("Sync ke GDrive berhasil ✓", "success");
    } catch(err) {
      addToast(`Sync gagal: ${err instanceof Error?err.message:"error"}`, "error");
    } finally { setSyncing(false); }
  };

  const addCat = (type:"music"|"video", name:string) => { type==="music"?setMusicCats(c=>[...c,name]):setVideoCats(c=>[...c,name]); addToast(`Kategori "${name}" ditambahkan`,"success"); };
  const delCat = (type:"music"|"video", name:string) => {
    if (files.some(f=>f.type===type&&f.category===name)) { addToast(`"${name}" masih ada filenya`,"error"); return; }
    type==="music"?setMusicCats(c=>c.filter(x=>x!==name)):setVideoCats(c=>c.filter(x=>x!==name));
    if(selCat===name)setSelCat("__all__");
    addToast(`Kategori "${name}" dihapus`,"info");
  };
  const delFile = (id:string) => { setFiles(f=>f.filter(x=>x.id!==id)); if(playing?.id===id)setPlaying(null); addToast("File dihapus","info"); };

  return (
    <>
      <style>{`*{box-sizing:border-box}body{margin:0;font-family:Inter,sans-serif;background:#090910}::-webkit-scrollbar{width:5px}::-webkit-scrollbar-thumb{background:#2a2a3e;border-radius:99px}@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      <div style={{ minHeight:"100vh", background:"#090910", color:"#e8e8ea", paddingBottom:playing?80:0 }}>
        <div style={{ borderBottom:"1px solid #1e1e2e", padding:"0 24px" }}>
          <div style={{ maxWidth:1100, margin:"0 auto", display:"flex", alignItems:"center", gap:24, height:56 }}>
            <div style={{ display:"flex", alignItems:"center", gap:8 }}>
              <div style={{ width:28, height:28, borderRadius:7, background:"linear-gradient(135deg,#7c6fcd,#a855f7)", display:"flex", alignItems:"center", justifyContent:"center" }}>
                <svg viewBox="0 0 24 24" fill="white" width="14" height="14"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
              </div>
              <span style={{ fontWeight:700, fontSize:15 }}>Media Pool</span>
            </div>
            {(["music","video"] as const).map(t => (
              <button key={t} onClick={()=>setActiveTab(t)} style={{ display:"flex", alignItems:"center", gap:6, padding:"0 4px", height:56, background:"none", border:"none", borderBottom:`2px solid ${activeTab===t?"#7c6fcd":"transparent"}`, color:activeTab===t?"#a78bfa":"#666", cursor:"pointer", fontSize:13, fontWeight:600 }}>
                {t==="music"?<Icon.Music />:<Icon.Video />}{t==="music"?"Musik":"Video"}
                <span style={{ background:"#1a1a2e", borderRadius:99, padding:"1px 7px", fontSize:11, color:activeTab===t?"#a78bfa":"#444" }}>{files.filter(f=>f.type===t).length}</span>
              </button>
            ))}
            <div style={{ flex:1 }} />
            <button onClick={()=>setShowModal(true)} style={{ display:"flex", alignItems:"center", gap:6, padding:"8px 16px", borderRadius:8, border:"none", background:"#7c6fcd", color:"#fff", cursor:"pointer", fontSize:13, fontWeight:600 }}>
              <Icon.Upload /> Upload {activeTab==="music"?"Musik":"Video"}
            </button>
          </div>
        </div>

        <div style={{ maxWidth:1100, margin:"0 auto", padding:"20px 24px" }}>
          <div style={{ marginBottom:16, display:"flex", alignItems:"center", gap:10, padding:"8px 14px", background:"#0a0a12", border:"1px solid #1a1a28", borderRadius:8, fontSize:12, color:"#555" }}>
            <Icon.Cloud />
            <span style={{ flex:1 }}>GDrive Sync {lastSync?`· Terakhir: ${lastSync}`:"· Belum pernah sync"}</span>
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
                      {item.status==="uploading"?`${item.progress}%`:item.status==="done"?"✓ selesai":item.status==="error"?"✗ gagal":"menunggu..."}
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
            <span>ℹ️</span>
            <span>File disimpan di VPS: <code style={{ color:"#666" }}>/opt/media/{activeTab}/[kategori]/</code> — di-sync ke GDrive via rclone.</span>
          </div>
        </div>
      </div>

      {showModal && <UploadModal type={activeTab} categories={cats} onClose={()=>setShowModal(false)} onUpload={handleUpload} />}
      <MiniPlayer playing={playing} type={activeTab} apiBase={API_BASE} />
      <Toast toasts={toasts} remove={removeToast} />
    </>
  );
}
