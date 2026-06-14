'use client';

import { useEffect, useState, useCallback, useRef } from 'react';

interface ThumbnailFile {
  filename: string;
  path: string;
  sizeBytes: number;
  createdAt: string;
}

type UploadState = 'idle' | 'uploading' | 'done' | 'error';

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function ThumbnailsPage() {
  const [thumbnails, setThumbnails] = useState<ThumbnailFile[]>([]);
  const [uploadState, setUploadState] = useState<UploadState>('idle');
  const [uploadMsg, setUploadMsg] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [syncLoading, setSyncLoading] = useState(false);
  const [previewFile, setPreviewFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchThumbnails = useCallback(async () => {
    try {
      const res = await fetch('/api/thumbnails');
      if (res.ok) {
        const data = await res.json();
        setThumbnails(data.files || []);
      }
    } catch (err) {
      console.error(err);
    }
  }, []);

  useEffect(() => {
    fetchThumbnails();
  }, [fetchThumbnails]);

  useEffect(() => {
    return () => { if (previewUrl) URL.revokeObjectURL(previewUrl); };
  }, [previewUrl]);

  const handleFileSelect = (file: File) => {
    if (!file.type.startsWith('image/')) {
      setUploadMsg('Hanya file gambar yang diizinkan (JPG, PNG, WebP)');
      setUploadState('error');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setUploadMsg('File terlalu besar. Maksimum 5MB');
      setUploadState('error');
      return;
    }
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewFile(file);
    setPreviewUrl(URL.createObjectURL(file));
    setUploadState('idle');
    setUploadMsg('');
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelect(file);
  };

  const handleUpload = async () => {
    if (!previewFile) return;

    setUploadState('uploading');
    setUploadMsg('Mengupload ke VPS...');

    try {
      const formData = new FormData();
      formData.append('file', previewFile);

      const res = await fetch('/api/thumbnails/upload', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        setUploadState('error');
        setUploadMsg(data.error || 'Upload gagal');
        return;
      }

      await fetchThumbnails();
      setUploadState('done');
      setUploadMsg(`✓ ${data.filename} tersimpan`);

      setTimeout(() => {
        setPreviewFile(null);
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        setPreviewUrl(null);
        setUploadState('idle');
        setUploadMsg('');
      }, 3000);

    } catch (err) {
      setUploadState('error');
      setUploadMsg(err instanceof Error ? err.message : 'Terjadi kesalahan');
    }
  };

  const handleManualSync = async () => {
    setSyncLoading(true);
    try {
      const res = await fetch('/api/thumbnails/sync', { method: 'POST' });
      const data = await res.json();
      setUploadMsg(`Sync selesai — ${data.total} file`);
      setUploadState('done');
      setTimeout(() => { setUploadMsg(''); setUploadState('idle'); }, 3000);
    } catch {
      setUploadMsg('Sync gagal');
      setUploadState('error');
    } finally {
      setSyncLoading(false);
    }
  };

  const handleDelete = async (filename: string) => {
    if (!confirm(`Hapus ${filename}?`)) return;
    try {
      await fetch(`/api/thumbnails/${encodeURIComponent(filename)}`, { method: 'DELETE' });
      await fetchThumbnails();
    } catch (err) {
      console.error(err);
    }
  };

  const stateColor = {
    idle: '',
    uploading: 'text-[#f5c85a]',
    done: 'text-[#c8f55a]',
    error: 'text-[#f5655a]',
  }[uploadState];

  return (
    <main className="min-h-screen bg-[#0a0c0f] text-[#e8e6e0] font-sans">
      <header className="h-14 bg-[#111318] border-b border-[#2a2e38] flex items-center justify-between px-6">
        <div className="flex items-center gap-4">
          <a href="/streams" className="text-xs text-[#6b7280] hover:text-[#e8e6e0] font-mono transition-colors">
            ← Streams
          </a>
          <h1 className="text-sm font-bold tracking-widest text-[#c8f55a] uppercase">
            Thumbnail Manager
          </h1>
          <span className="text-xs text-[#6b7280] font-mono">
            Upload → VPS /opt/thumbnails → Drive sync
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[10px] font-mono text-[#6b7280]">
            {thumbnails.length} file
          </span>
          <button
            onClick={handleManualSync}
            disabled={syncLoading}
            className="text-[10px] font-mono px-3 py-1.5 border border-[#2a2e38] rounded text-[#6b7280] hover:border-[#5af5c8] hover:text-[#5af5c8] transition-colors disabled:opacity-50"
          >
            {syncLoading ? '⟳ Syncing...' : '⟳ Sync ke Drive'}
          </button>
        </div>
      </header>

      <div className="p-6 max-w-4xl mx-auto">

        {/* Upload Panel */}
        <div className="bg-[#111318] border border-[#2a2e38] rounded-lg p-5 mb-6">
          <div className="text-[10px] text-[#6b7280] uppercase tracking-widest font-mono mb-4">
            Upload Thumbnail Baru
          </div>

          {/* Drop zone */}
          <div
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
              dragOver
                ? 'border-[#c8f55a] bg-[#0a1500]'
                : previewFile
                ? 'border-[#2a4a1a] bg-[#0a1200]'
                : 'border-[#2a2e38] hover:border-[#3a4a48] hover:bg-[#0d0f12]'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/jpg,image/png,image/webp"
              className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleFileSelect(f); }}
            />

            {previewUrl ? (
              <div className="flex flex-col items-center gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={previewUrl}
                  alt="preview"
                  className="max-h-40 max-w-sm object-contain rounded border border-[#2a2e38]"
                />
                <div className="text-xs font-mono text-[#e8e6e0]">{previewFile?.name}</div>
                <div className="text-[10px] font-mono text-[#6b7280]">
                  {previewFile ? formatBytes(previewFile.size) : ''} · klik untuk ganti
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2">
                <div className="text-3xl opacity-30">🖼</div>
                <div className="text-sm text-[#6b7280] font-mono">
                  Drop gambar di sini atau klik untuk pilih
                </div>
                <div className="text-[10px] text-[#3a3e48] font-mono">
                  JPG · PNG · WebP · max 5MB
                </div>
              </div>
            )}
          </div>

          {uploadMsg && (
            <div className={`mt-3 text-xs font-mono ${stateColor}`}>
              {uploadMsg}
            </div>
          )}

          {previewFile && uploadState !== 'done' && (
            <button
              onClick={handleUpload}
              disabled={uploadState === 'uploading'}
              className="w-full mt-3 py-2.5 rounded bg-[#c8f55a] text-[#0a0c0f] text-sm font-bold font-mono hover:bg-[#b8e54a] transition-colors disabled:opacity-40"
            >
              {uploadState === 'uploading' ? '⟳ Uploading...' : '↑ Upload ke VPS'}
            </button>
          )}
        </div>

        {/* Thumbnail Grid */}
        <div>
          <div className="text-[10px] text-[#6b7280] uppercase tracking-widest font-mono mb-3">
            File di /opt/thumbnails ({thumbnails.length})
          </div>

          {thumbnails.length === 0 ? (
            <div className="bg-[#111318] border border-[#2a2e38] rounded-lg p-8 text-center">
              <div className="text-[#6b7280] text-sm font-mono">Belum ada thumbnail.</div>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
              {thumbnails.map(t => (
                <div
                  key={t.filename}
                  className="bg-[#111318] border border-[#2a2e38] rounded-lg overflow-hidden group hover:border-[#3a3e48] transition-colors"
                >
                  <div className="aspect-video bg-[#0d0f12] flex items-center justify-center relative">
                    <div className="text-2xl opacity-20">🖼</div>
                    <button
                      onClick={() => handleDelete(t.filename)}
                      className="absolute top-1.5 right-1.5 w-5 h-5 rounded bg-[#1a0a0a] border border-[#3a1a1a] text-[#f5655a] text-[10px] opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                    >
                      ✕
                    </button>
                  </div>
                  <div className="p-2">
                    <div className="text-[10px] font-mono text-[#e8e6e0] truncate" title={t.filename}>
                      {t.filename}
                    </div>
                    <div className="text-[9px] font-mono text-[#3a3e48] mt-0.5">
                      {formatBytes(t.sizeBytes)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Info */}
        <div className="mt-6 bg-[#0d0f12] border border-[#1a2a3a] rounded-lg p-4 text-[10px] font-mono text-[#6b7280] leading-relaxed">
          <div className="text-[#5af5c8] mb-2">Flow thumbnail:</div>
          <div>1. Upload dari sini → langsung ke <span className="text-[#e8e6e0]">/opt/thumbnails</span> di VPS</div>
          <div>2. rclone otomatis push ke Google Drive <span className="text-[#e8e6e0]">gdrive:thumbnails</span></div>
          <div>3. Pilih thumbnail di Config panel channel di halaman Streams</div>
        </div>
      </div>
    </main>
  );
}
