import { useState, useRef, useCallback } from "react";

// ─── CONFIG ────────────────────────────────────────────────────────────────────
const API_BASE = "http://localhost:3002"; // ganti sama IP VPS lo

// ─── ICONS ─────────────────────────────────────────────────────────────────────
const Icon = {
  Music: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18">
      <path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" />
    </svg>
  ),
  Video: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18">
      <rect x="2" y="3" width="15" height="15" rx="2" /><path d="m17 8 5-3v14l-5-3" />
    </svg>
  ),
  Upload: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  ),
  Folder: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </svg>
  ),
  Plus: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="16" height="16">
      <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  ),
  Trash: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="15" height="15">
      <polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14H6L5 6" /><path d="M10 11v6M14 11v6" /><path d="M9 6V4h6v2" />
    </svg>
  ),
  Cloud: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
      <path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z" />
    </svg>
  ),
  Sync: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
      <path d="M23 4v6h-6" /><path d="M1 20v-6h6" />
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
    </svg>
  ),
  Play: () => (
    <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14">
      <polygon points="5 3 19 12 5 21 5 3" />
    </svg>
  ),
  Check: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="14" height="14">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  ),
  X: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="14" height="14">
      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  ),
  ChevronRight: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  ),
  File: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
      <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" /><polyline points="13 2 13 9 20 9" />
    </svg>
  ),
};

// ─── HELPERS ───────────────────────────────────────────────────────────────────
const fmtSize = (bytes) => {
  if (!bytes) return "—";
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
};

const fmtDuration = (s) => {
  if (!s) return "";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
};

// ─── TOAST ─────────────────────────────────────────────────────────────────────
function Toast({ toasts, remove }) {
  return (
    <div style={{ position: "fixed", bottom: 24, right: 24, display: "flex", flexDirection: "column", gap: 8, zIndex: 9999 }}>
      {toasts.map((t) => (
        <div key={t.id} style={{
          display: "flex", alignItems: "center", gap: 10, padding: "10px 16px",
          background: t.type === "error" ? "#2d1a1a" : t.type === "success" ? "#0f2a1f" : "#1a1f2e",
          border: `1px solid ${t.type === "error" ? "#7f2020" : t.type === "success" ? "#1a5c3a" : "#2a3a5e"}`,
          borderRadius: 8, color: "#e8e8ea", fontSize: 13, minWidth: 260, boxShadow: "0 4px 16px rgba(0,0,0,.5)",
          animation: "slideIn .2s ease"
        }}>
          <span style={{ color: t.type === "error" ? "#f87171" : t.type === "success" ? "#4ade80" : "#93c5fd", flexShrink: 0 }}>
            {t.type === "success" ? <Icon.Check /> : t.type === "error" ? <Icon.X /> : <Icon.Cloud />}
          </span>
          <span style={{ flex: 1 }}>{t.msg}</span>
          <button onClick={() => remove(t.id)} style={{ background: "none", border: "none", color: "#666", cursor: "pointer", padding: 0, flexShrink: 0 }}>
            <Icon.X />
          </button>
        </div>
      ))}
    </div>
  );
}

function useToast() {
  const [toasts, setToasts] = useState([]);
  const add = useCallback((msg, type = "info") => {
    const id = Date.now();
    setToasts((p) => [...p, { id, msg, type }]);
    setTimeout(() => setToasts((p) => p.filter((t) => t.id !== id)), 4000);
  }, []);
  const remove = useCallback((id) => setToasts((p) => p.filter((t) => t.id !== id)), []);
  return { toasts, add, remove };
}

// ─── UPLOAD ZONE ───────────────────────────────────────────────────────────────
function DropZone({ onFiles, accept, label }) {
  const [drag, setDrag] = useState(false);
  const inputRef = useRef();

  const handleDrop = (e) => {
    e.preventDefault();
    setDrag(false);
    const files = [...e.dataTransfer.files].filter((f) => {
      const ext = f.name.split(".").pop().toLowerCase();
      return accept.some((a) => a.includes(ext));
    });
    if (files.length) onFiles(files);
  };

  return (
    <div
      onClick={() => inputRef.current.click()}
      onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
      onDragLeave={() => setDrag(false)}
      onDrop={handleDrop}
      style={{
        border: `2px dashed ${drag ? "#7c6fcd" : "#2e2e3e"}`,
        borderRadius: 12, padding: "28px 20px", textAlign: "center",
        cursor: "pointer", transition: "all .2s",
        background: drag ? "rgba(124,111,205,.08)" : "transparent",
      }}
    >
      <div style={{ color: drag ? "#7c6fcd" : "#555", marginBottom: 8 }}>
        <Icon.Upload />
      </div>
      <div style={{ color: "#aaa", fontSize: 13 }}>
        <span style={{ color: drag ? "#a78bfa" : "#7c6fcd", fontWeight: 600 }}>Pilih file</span> atau drag &amp; drop
      </div>
      <div style={{ color: "#555", fontSize: 11, marginTop: 4 }}>{label}</div>
      <input
        ref={inputRef} type="file" multiple accept={accept.join(",")}
        style={{ display: "none" }}
        onChange={(e) => { if (e.target.files.length) onFiles([...e.target.files]); e.target.value = ""; }}
      />
    </div>
  );
}

// ─── CATEGORY SIDEBAR ──────────────────────────────────────────────────────────
function CategorySidebar({ type, categories, selected, onSelect, onAdd, onDelete }) {
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const inputRef = useRef();

  const submit = () => {
    const name = newName.trim();
    if (name && !categories.includes(name)) {
      onAdd(name);
    }
    setAdding(false);
    setNewName("");
  };

  return (
    <div style={{ width: 200, flexShrink: 0, borderRight: "1px solid #1e1e2e", paddingRight: 0 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 16px 12px", marginBottom: 4 }}>
        <span style={{ fontSize: 11, color: "#555", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase" }}>
          {type === "music" ? "Kategori Musik" : "Kategori Video"}
        </span>
        <button
          onClick={() => { setAdding(true); setTimeout(() => inputRef.current?.focus(), 50); }}
          style={{ background: "none", border: "none", color: "#7c6fcd", cursor: "pointer", padding: 2, display: "flex" }}
          title="Tambah kategori"
        >
          <Icon.Plus />
        </button>
      </div>

      {/* ALL */}
      <SidebarItem
        icon={<Icon.Folder />}
        label="Semua"
        active={selected === "__all__"}
        onClick={() => onSelect("__all__")}
      />

      {categories.map((cat) => (
        <SidebarItem
          key={cat}
          icon={<Icon.Folder />}
          label={cat}
          active={selected === cat}
          onClick={() => onSelect(cat)}
          onDelete={() => onDelete(cat)}
        />
      ))}

      {adding && (
        <div style={{ padding: "6px 12px" }}>
          <input
            ref={inputRef}
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") submit(); if (e.key === "Escape") { setAdding(false); setNewName(""); } }}
            onBlur={submit}
            placeholder="Nama kategori..."
            style={{
              width: "100%", background: "#16161f", border: "1px solid #7c6fcd",
              borderRadius: 6, padding: "6px 10px", color: "#e8e8ea", fontSize: 13,
              outline: "none", boxSizing: "border-box"
            }}
          />
        </div>
      )}
    </div>
  );
}

function SidebarItem({ icon, label, active, onClick, onDelete }) {
  const [hover, setHover] = useState(false);
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: "flex", alignItems: "center", gap: 8, padding: "7px 16px",
        cursor: "pointer", borderRadius: "0 8px 8px 0", marginRight: 8,
        background: active ? "rgba(124,111,205,.18)" : hover ? "rgba(255,255,255,.04)" : "transparent",
        color: active ? "#a78bfa" : "#aaa",
        transition: "all .15s", fontSize: 13, userSelect: "none",
      }}
    >
      <span style={{ flexShrink: 0, opacity: active ? 1 : .6 }}>{icon}</span>
      <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
      {onDelete && hover && !active && (
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          style={{ background: "none", border: "none", color: "#f87171", cursor: "pointer", padding: 0, display: "flex", opacity: .7 }}
        >
          <Icon.Trash />
        </button>
      )}
    </div>
  );
}

// ─── UPLOAD QUEUE ──────────────────────────────────────────────────────────────
function UploadQueue({ queue }) {
  if (!queue.length) return null;
  return (
    <div style={{ margin: "12px 0", display: "flex", flexDirection: "column", gap: 6 }}>
      {queue.map((item) => (
        <div key={item.id} style={{
          background: "#111118", border: "1px solid #1e1e2e", borderRadius: 8, padding: "8px 12px"
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
            <span style={{ fontSize: 12, color: "#ccc", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "70%" }}>
              {item.name}
            </span>
            <span style={{ fontSize: 11, color: item.status === "done" ? "#4ade80" : item.status === "error" ? "#f87171" : "#7c6fcd", flexShrink: 0 }}>
              {item.status === "uploading" ? `${item.progress}%` : item.status === "done" ? "✓ selesai" : item.status === "error" ? "✗ gagal" : "menunggu..."}
            </span>
          </div>
          <div style={{ height: 3, background: "#1e1e2e", borderRadius: 99, overflow: "hidden" }}>
            <div style={{
              height: "100%", borderRadius: 99, transition: "width .3s",
              width: `${item.progress}%`,
              background: item.status === "done" ? "#4ade80" : item.status === "error" ? "#f87171" : "#7c6fcd"
            }} />
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── FILE LIST ─────────────────────────────────────────────────────────────────
function FileList({ files, type, onDelete, onPlay, playing }) {
  if (!files.length) return (
    <div style={{ textAlign: "center", padding: "48px 24px", color: "#444" }}>
      <div style={{ marginBottom: 8, opacity: .5 }}>{type === "music" ? <Icon.Music /> : <Icon.Video />}</div>
      <div style={{ fontSize: 13 }}>Belum ada file di kategori ini</div>
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      {files.map((f) => (
        <FileRow key={f.id} file={f} type={type} onDelete={onDelete} onPlay={onPlay} isPlaying={playing?.id === f.id} />
      ))}
    </div>
  );
}

function FileRow({ file, type, onDelete, onPlay, isPlaying }) {
  const [hover, setHover] = useState(false);
  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: "flex", alignItems: "center", gap: 10, padding: "9px 12px",
        borderRadius: 8, background: isPlaying ? "rgba(124,111,205,.15)" : hover ? "rgba(255,255,255,.04)" : "transparent",
        transition: "background .15s", cursor: "default"
      }}
    >
      {/* play button */}
      <button
        onClick={() => onPlay(file)}
        style={{
          width: 28, height: 28, borderRadius: "50%", border: "none",
          background: isPlaying ? "#7c6fcd" : "rgba(255,255,255,.08)",
          color: "#e8e8ea", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
          flexShrink: 0, transition: "background .15s"
        }}
      >
        <Icon.Play />
      </button>

      {/* info */}
      <div style={{ flex: 1, overflow: "hidden" }}>
        <div style={{ fontSize: 13, color: isPlaying ? "#a78bfa" : "#ddd", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {file.name}
        </div>
        <div style={{ fontSize: 11, color: "#555", display: "flex", gap: 8, marginTop: 2 }}>
          <span>{fmtSize(file.size)}</span>
          {file.duration && <span>{fmtDuration(file.duration)}</span>}
          <span style={{ color: "#3a3a5e", background: "#1a1a2e", borderRadius: 4, padding: "0 5px" }}>
            {file.category}
          </span>
        </div>
      </div>

      {/* delete */}
      {hover && (
        <button
          onClick={() => onDelete(file.id)}
          style={{ background: "none", border: "none", color: "#f87171", cursor: "pointer", padding: 4, opacity: .7, display: "flex" }}
        >
          <Icon.Trash />
        </button>
      )}
    </div>
  );
}

// ─── UPLOAD MODAL ──────────────────────────────────────────────────────────────
function UploadModal({ type, categories, onClose, onUpload }) {
  const [selectedCat, setSelectedCat] = useState(categories[0] || "");
  const [pendingFiles, setPendingFiles] = useState([]);
  const accept = type === "music" ? [".mp3", ".wav", ".flac", ".ogg", ".aac", ".m4a"] : [".mp4", ".webm", ".mkv", ".mov", ".avi"];

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,.7)", display: "flex",
      alignItems: "center", justifyContent: "center", zIndex: 1000, backdropFilter: "blur(4px)"
    }}>
      <div style={{
        background: "#0e0e16", border: "1px solid #1e1e2e", borderRadius: 14,
        width: 520, maxWidth: "90vw", padding: 28, boxShadow: "0 24px 64px rgba(0,0,0,.6)"
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h3 style={{ margin: 0, color: "#e8e8ea", fontSize: 16, fontWeight: 600 }}>
            Upload {type === "music" ? "Musik" : "Video"}
          </h3>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#666", cursor: "pointer", display: "flex" }}>
            <Icon.X />
          </button>
        </div>

        {/* Category picker */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 12, color: "#666", display: "block", marginBottom: 6, fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase" }}>
            Kategori
          </label>
          <select
            value={selectedCat}
            onChange={(e) => setSelectedCat(e.target.value)}
            style={{
              width: "100%", background: "#16161f", border: "1px solid #2a2a3e",
              borderRadius: 8, padding: "9px 12px", color: "#e8e8ea", fontSize: 13,
              outline: "none", cursor: "pointer"
            }}
          >
            {categories.length === 0 && <option value="">-- Buat kategori dulu --</option>}
            {categories.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        {/* Drop zone */}
        <DropZone
          onFiles={setPendingFiles}
          accept={accept}
          label={type === "music" ? "MP3, WAV, FLAC, AAC, OGG" : "MP4, MKV, WebM, MOV"}
        />

        {/* Pending list */}
        {pendingFiles.length > 0 && (
          <div style={{ marginTop: 12, maxHeight: 140, overflowY: "auto" }}>
            {pendingFiles.map((f, i) => (
              <div key={i} style={{
                display: "flex", alignItems: "center", gap: 8, padding: "5px 8px",
                borderRadius: 6, fontSize: 12, color: "#aaa"
              }}>
                <Icon.File />
                <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</span>
                <span style={{ color: "#555", flexShrink: 0 }}>{fmtSize(f.size)}</span>
              </div>
            ))}
          </div>
        )}

        {/* Actions */}
        <div style={{ display: "flex", gap: 10, marginTop: 20, justifyContent: "flex-end" }}>
          <button onClick={onClose} style={{
            padding: "9px 18px", borderRadius: 8, border: "1px solid #2a2a3e",
            background: "transparent", color: "#aaa", cursor: "pointer", fontSize: 13
          }}>Batal</button>
          <button
            onClick={() => { if (selectedCat && pendingFiles.length) { onUpload(pendingFiles, selectedCat); onClose(); } }}
            disabled={!selectedCat || !pendingFiles.length}
            style={{
              padding: "9px 20px", borderRadius: 8, border: "none",
              background: selectedCat && pendingFiles.length ? "#7c6fcd" : "#2a2a3e",
              color: selectedCat && pendingFiles.length ? "#fff" : "#555",
              cursor: selectedCat && pendingFiles.length ? "pointer" : "not-allowed",
              fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", gap: 6
            }}
          >
            <Icon.Upload />
            Upload {pendingFiles.length > 0 ? `(${pendingFiles.length})` : ""}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── MINI PLAYER ───────────────────────────────────────────────────────────────
function MiniPlayer({ playing, type, apiBase }) {
  const mediaRef = useRef();
  const [paused, setPaused] = useState(false);
  const [progress, setProgress] = useState(0);

  const url = playing ? `${apiBase}/media/${type}/${encodeURIComponent(playing.category)}/${encodeURIComponent(playing.name)}` : null;

  if (!playing) return null;

  return (
    <div style={{
      position: "fixed", bottom: 0, left: 0, right: 0,
      background: "rgba(10,10,18,.96)", borderTop: "1px solid #1e1e2e",
      backdropFilter: "blur(12px)", padding: "10px 24px",
      display: "flex", alignItems: "center", gap: 16, zIndex: 500
    }}>
      {type === "music"
        ? <audio ref={mediaRef} src={url} autoPlay onTimeUpdate={() => setProgress((mediaRef.current?.currentTime / mediaRef.current?.duration) * 100 || 0)} />
        : <video ref={mediaRef} src={url} autoPlay style={{ display: "none" }} onTimeUpdate={() => setProgress((mediaRef.current?.currentTime / mediaRef.current?.duration) * 100 || 0)} />
      }

      <button
        onClick={() => { paused ? mediaRef.current?.play() : mediaRef.current?.pause(); setPaused(!paused); }}
        style={{
          width: 36, height: 36, borderRadius: "50%", background: "#7c6fcd",
          border: "none", color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0
        }}
      >
        {paused
          ? <Icon.Play />
          : <svg viewBox="0 0 24 24" fill="currentColor" width="13" height="13"><rect x="6" y="4" width="4" height="16" /><rect x="14" y="4" width="4" height="16" /></svg>
        }
      </button>

      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, color: "#ddd", marginBottom: 4, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {playing.name}
        </div>
        <div style={{ height: 3, background: "#1e1e2e", borderRadius: 99, cursor: "pointer" }}
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const pct = (e.clientX - rect.left) / rect.width;
            if (mediaRef.current) { mediaRef.current.currentTime = pct * mediaRef.current.duration; }
          }}
        >
          <div style={{ height: "100%", background: "#7c6fcd", borderRadius: 99, width: `${progress}%`, transition: "width .1s linear" }} />
        </div>
      </div>

      <span style={{ fontSize: 11, color: "#555", flexShrink: 0 }}>{playing.category}</span>
    </div>
  );
}

// ─── SYNC STATUS ───────────────────────────────────────────────────────────────
function SyncBar({ onSync, syncing, lastSync }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 10, padding: "8px 14px",
      background: "#0a0a12", border: "1px solid #1a1a28", borderRadius: 8,
      fontSize: 12, color: "#555"
    }}>
      <Icon.Cloud />
      <span style={{ flex: 1 }}>
        GDrive Sync {lastSync ? `· Terakhir: ${lastSync}` : "· Belum pernah sync"}
      </span>
      <button
        onClick={onSync}
        disabled={syncing}
        style={{
          display: "flex", alignItems: "center", gap: 5, padding: "5px 12px",
          borderRadius: 6, border: "1px solid #2a2a3e",
          background: syncing ? "#1a1a2e" : "transparent",
          color: syncing ? "#7c6fcd" : "#aaa", cursor: syncing ? "not-allowed" : "pointer",
          fontSize: 12, fontWeight: 600, transition: "all .2s"
        }}
      >
        <span style={{ display: "inline-flex", animation: syncing ? "spin 1s linear infinite" : "none" }}>
          <Icon.Sync />
        </span>
        {syncing ? "Syncing..." : "Sync ke Drive"}
      </button>
    </div>
  );
}

// ─── MAIN COMPONENT ────────────────────────────────────────────────────────────
export default function MediaPool() {
  const { toasts, add: addToast, remove: removeToast } = useToast();

  // State
  const [activeTab, setActiveTab] = useState("music");
  const [musicCategories, setMusicCategories] = useState(["Rainy", "Jazz", "Night", "Chill", "Hype"]);
  const [videoCategories, setVideoCategories] = useState(["Overlay", "BRB", "Starting", "Ending"]);
  const [musicCat, setMusicCat] = useState("__all__");
  const [videoCat, setVideoCat] = useState("__all__");
  const [files, setFiles] = useState([]);
  const [uploadQueue, setUploadQueue] = useState([]);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [playing, setPlaying] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState(null);

  const categories = activeTab === "music" ? musicCategories : videoCategories;
  const selectedCat = activeTab === "music" ? musicCat : videoCat;
  const setSelectedCat = activeTab === "music" ? setMusicCat : setVideoCat;

  const visibleFiles = files.filter((f) => {
    if (f.type !== activeTab) return false;
    if (selectedCat === "__all__") return true;
    return f.category === selectedCat;
  });

  // ── Upload flow ──
  const handleUpload = async (rawFiles, category) => {
    const items = rawFiles.map((f) => ({
      id: `${Date.now()}-${Math.random()}`, name: f.name, file: f,
      status: "pending", progress: 0
    }));
    setUploadQueue((q) => [...q, ...items]);

    for (const item of items) {
      try {
        // Update status → uploading
        setUploadQueue((q) => q.map((i) => i.id === item.id ? { ...i, status: "uploading" } : i));

        const formData = new FormData();
        formData.append("file", item.file);
        formData.append("category", category);
        formData.append("type", activeTab);

        const xhr = new XMLHttpRequest();
        await new Promise((resolve, reject) => {
          xhr.upload.onprogress = (e) => {
            const pct = Math.round((e.loaded / e.total) * 100);
            setUploadQueue((q) => q.map((i) => i.id === item.id ? { ...i, progress: pct } : i));
          };
          xhr.onload = () => {
            if (xhr.status === 200) resolve(JSON.parse(xhr.responseText));
            else reject(new Error(`HTTP ${xhr.status}`));
          };
          xhr.onerror = reject;
          xhr.open("POST", `${API_BASE}/upload`);
          xhr.send(formData);
        });

        // Success → tambah ke file list
        setFiles((prev) => [...prev, {
          id: item.id, name: item.name, size: item.file.size,
          type: activeTab, category, status: "done"
        }]);
        setUploadQueue((q) => q.map((i) => i.id === item.id ? { ...i, status: "done", progress: 100 } : i));
        addToast(`${item.name} berhasil diupload`, "success");

        // Auto-sync setelah upload
        triggerSync(true);

      } catch (err) {
        setUploadQueue((q) => q.map((i) => i.id === item.id ? { ...i, status: "error" } : i));
        addToast(`Gagal upload ${item.name}: ${err.message}`, "error");
      }
    }

    // Bersihkan queue setelah 5 detik
    setTimeout(() => {
      setUploadQueue((q) => q.filter((i) => i.status !== "done"));
    }, 5000);
  };

  // ── Sync flow ──
  const triggerSync = async (silent = false) => {
    if (syncing) return;
    setSyncing(true);
    try {
      const res = await fetch(`${API_BASE}/sync`, { method: "POST" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const now = new Date().toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
      setLastSync(now);
      if (!silent) addToast("Sync ke GDrive berhasil ✓", "success");
    } catch (err) {
      addToast(`Sync gagal: ${err.message}`, "error");
    } finally {
      setSyncing(false);
    }
  };

  // ── Category management ──
  const addCategory = (type, name) => {
    if (type === "music") setMusicCategories((c) => [...c, name]);
    else setVideoCategories((c) => [...c, name]);
    addToast(`Kategori "${name}" ditambahkan`, "success");
  };

  const deleteCategory = (type, name) => {
    const hasFiles = files.some((f) => f.type === type && f.category === name);
    if (hasFiles) { addToast(`Kategori "${name}" masih ada filenya`, "error"); return; }
    if (type === "music") setMusicCategories((c) => c.filter((x) => x !== name));
    else setVideoCategories((c) => c.filter((x) => x !== name));
    if (selectedCat === name) setSelectedCat("__all__");
    addToast(`Kategori "${name}" dihapus`, "info");
  };

  const deleteFile = (id) => {
    setFiles((f) => f.filter((x) => x.id !== id));
    if (playing?.id === id) setPlaying(null);
    addToast("File dihapus dari daftar", "info");
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
        * { box-sizing: border-box; }
        body { margin: 0; font-family: 'Inter', sans-serif; background: #090910; }
        ::-webkit-scrollbar { width: 5px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #2a2a3e; border-radius: 99px; }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes slideIn { from { transform: translateX(20px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
      `}</style>

      <div style={{ minHeight: "100vh", background: "#090910", color: "#e8e8ea", fontFamily: "'Inter', sans-serif", paddingBottom: playing ? 80 : 0 }}>

        {/* ── HEADER ── */}
        <div style={{ borderBottom: "1px solid #1e1e2e", padding: "0 24px" }}>
          <div style={{ maxWidth: 1100, margin: "0 auto", display: "flex", alignItems: "center", gap: 24, height: 56 }}>

            {/* Logo / title */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginRight: 8 }}>
              <div style={{ width: 28, height: 28, borderRadius: 7, background: "linear-gradient(135deg,#7c6fcd,#a855f7)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <svg viewBox="0 0 24 24" fill="white" width="14" height="14"><path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" /></svg>
              </div>
              <span style={{ fontWeight: 700, fontSize: 15, color: "#e8e8ea" }}>Media Pool</span>
            </div>

            {/* Tabs */}
            {["music", "video"].map((t) => (
              <button
                key={t}
                onClick={() => setActiveTab(t)}
                style={{
                  display: "flex", alignItems: "center", gap: 6, padding: "0 4px",
                  height: 56, background: "none", border: "none",
                  borderBottom: `2px solid ${activeTab === t ? "#7c6fcd" : "transparent"}`,
                  color: activeTab === t ? "#a78bfa" : "#666",
                  cursor: "pointer", fontSize: 13, fontWeight: 600, transition: "all .15s"
                }}
              >
                {t === "music" ? <Icon.Music /> : <Icon.Video />}
                {t === "music" ? "Musik" : "Video"}
                <span style={{
                  background: "#1a1a2e", borderRadius: 99, padding: "1px 7px", fontSize: 11,
                  color: activeTab === t ? "#a78bfa" : "#444"
                }}>
                  {files.filter((f) => f.type === t).length}
                </span>
              </button>
            ))}

            <div style={{ flex: 1 }} />

            {/* Upload button */}
            <button
              onClick={() => setShowUploadModal(true)}
              style={{
                display: "flex", alignItems: "center", gap: 6, padding: "8px 16px",
                borderRadius: 8, border: "none", background: "#7c6fcd", color: "#fff",
                cursor: "pointer", fontSize: 13, fontWeight: 600, transition: "opacity .15s"
              }}
              onMouseOver={(e) => e.currentTarget.style.opacity = ".85"}
              onMouseOut={(e) => e.currentTarget.style.opacity = "1"}
            >
              <Icon.Upload /> Upload {activeTab === "music" ? "Musik" : "Video"}
            </button>
          </div>
        </div>

        {/* ── BODY ── */}
        <div style={{ maxWidth: 1100, margin: "0 auto", padding: "20px 24px" }}>

          {/* Sync bar */}
          <div style={{ marginBottom: 16 }}>
            <SyncBar onSync={() => triggerSync(false)} syncing={syncing} lastSync={lastSync} />
          </div>

          {/* Upload progress */}
          {uploadQueue.filter((i) => i.type === activeTab || true).length > 0 && (
            <UploadQueue queue={uploadQueue} />
          )}

          {/* Main layout */}
          <div style={{ display: "flex", gap: 0, background: "#0e0e16", border: "1px solid #1e1e2e", borderRadius: 12, overflow: "hidden", minHeight: 420 }}>

            {/* Sidebar */}
            <div style={{ paddingTop: 16, paddingBottom: 16 }}>
              <CategorySidebar
                type={activeTab}
                categories={categories}
                selected={selectedCat}
                onSelect={setSelectedCat}
                onAdd={(name) => addCategory(activeTab, name)}
                onDelete={(name) => deleteCategory(activeTab, name)}
              />
            </div>

            {/* File list area */}
            <div style={{ flex: 1, borderLeft: "1px solid #1e1e2e", padding: 16, overflowY: "auto", maxHeight: 560 }}>
              {/* Breadcrumb */}
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 12, fontSize: 12, color: "#555" }}>
                <span>{activeTab === "music" ? "Musik" : "Video"}</span>
                {selectedCat !== "__all__" && (
                  <>
                    <Icon.ChevronRight />
                    <span style={{ color: "#a78bfa" }}>{selectedCat}</span>
                  </>
                )}
                <span style={{ marginLeft: "auto", color: "#444" }}>{visibleFiles.length} file</span>
              </div>

              <FileList
                files={visibleFiles}
                type={activeTab}
                onDelete={deleteFile}
                onPlay={setPlaying}
                playing={playing}
              />
            </div>
          </div>

          {/* Info box */}
          <div style={{ marginTop: 12, padding: "10px 14px", background: "#0a0a12", border: "1px solid #1a1a28", borderRadius: 8, fontSize: 12, color: "#444", display: "flex", gap: 8 }}>
            <span>ℹ️</span>
            <span>
              File disimpan di VPS: <code style={{ color: "#666" }}>/media/{activeTab}/[kategori]/</code> — lalu di-sync otomatis ke GDrive via rclone setelah upload.
              Untuk stream, gunakan kategori sebagai selector playlist.
            </span>
          </div>
        </div>
      </div>

      {/* ── MODALS & OVERLAYS ── */}
      {showUploadModal && (
        <UploadModal
          type={activeTab}
          categories={categories}
          onClose={() => setShowUploadModal(false)}
          onUpload={handleUpload}
        />
      )}

      <MiniPlayer playing={playing} type={activeTab} apiBase={API_BASE} />
      <Toast toasts={toasts} remove={removeToast} />
    </>
  );
}
