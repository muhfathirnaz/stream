const fs = require('fs');

// --- A. PATCH STREAMS UI ---
const streamFile = 'src/app/streams/page.tsx';
let sCode = fs.readFileSync(streamFile, 'utf8');

if (!sCode.includes('CategoryFileSelect')) {
  const comp = `
function CategoryFileSelect({ label, type, folders, items, folderVal, fileVal, onChange, isText = false }: any) {
  const visibleItems = items.filter((i:any) => folderVal === '__all__' || (i.category || 'Uncategorized') === folderVal);
  return (
    <div className="bg-black/40 p-3 rounded-xl border border-white/5 flex flex-col gap-2">
      <div className="text-[10px] font-semibold text-white/50 uppercase tracking-widest">{label}</div>
      <div className="flex gap-2">
        <select value={folderVal} onChange={e => onChange({ folder: e.target.value, file: 'RANDOM' })} className="w-1/3 glass-input rounded-lg px-2 py-2 text-[11px] font-medium text-white outline-none bg-[#111318] border border-white/10">
          <option value="__all__">📁 Semua Folder</option>
          {folders.map((f:string) => <option key={f} value={f}>📁 {f}</option>)}
        </select>
        <select value={fileVal === null ? 'RANDOM' : fileVal} onChange={e => onChange({ folder: folderVal, file: e.target.value === 'RANDOM' ? null : isText ? Number(e.target.value) : e.target.value })} className="w-2/3 glass-input rounded-lg px-2 py-2 text-[11px] font-medium text-white outline-none bg-[#111318] border border-white/10">
          <option value="RANDOM">🔀 Acak Otomatis (Dari Folder Terpilih)</option>
          {visibleItems.map((i:any) => <option key={i.id || i.path || i.filename} value={i.id || i.path || i.filename}>{i.label || i.filename || i.value}</option>)}
        </select>
      </div>
    </div>
  );
}
`;
  sCode = sCode.replace(/export default function Streams\(\) \{/, comp + '\nexport default function Streams() {');
}

const blockStart = sCode.indexOf('{!config.auto && (');
const blockEnd = sCode.indexOf('<div className="mt-4 flex justify-end gap-3">');

if (blockStart !== -1 && blockEnd !== -1) {
  const newUi = `{!config.auto && (
              <div className="space-y-3 mt-3 animate-in fade-in">
                <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-3">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-[10px] font-bold text-amber-400 uppercase tracking-widest">⚡ Mode Stream</span>
                    <select value={config.mode || 'copy'} onChange={e => updateConfig(ch.channel_id, { mode: e.target.value })} className="glass-input rounded-md px-2 py-1 text-[10px] font-bold text-white outline-none bg-[#111318] border border-white/10">
                      <option value="copy">PAKAI VIDEO JADI (HEMAT CPU)</option>
                      <option value="encode">RE-ENCODE (VIDEO BIASA + AUDIO)</option>
                    </select>
                  </div>
                  {config.mode !== 'encode' && (
                    <CategoryFileSelect label="Pilih Video Jadi" type="video-ready" folders={videoReadyFiles.map((f:any)=>f.category).filter((v:any,i:any,a:any)=>v&&a.indexOf(v)===i)} items={videoReadyFiles} folderVal={config.vrFolder||'__all__'} fileVal={config.vrPath||null} onChange={(v:any) => updateConfig(ch.channel_id, { vrFolder: v.folder, vrPath: v.file })} />
                  )}
                </div>
                {config.mode === 'encode' && (
                  <div className="bg-white/5 p-3 rounded-xl border border-white/5 space-y-3">
                    <div className="text-[10px] font-bold text-white/50 uppercase tracking-widest mb-1">Video & Audio Setup</div>
                    <CategoryFileSelect label="Video Visual" type="video" folders={folders.map((f:any)=>f.name)} items={videos} folderVal={config.vidFolder||'__all__'} fileVal={config.vidPath||null} onChange={(v:any) => updateConfig(ch.channel_id, { vidFolder: v.folder, vidPath: v.file })} />
                    <CategoryFileSelect label="Lagu / Audio" type="music" folders={folders.map((f:any)=>f.name)} items={songs} folderVal={config.songFolder||'__all__'} fileVal={config.songPath||null} onChange={(v:any) => updateConfig(ch.channel_id, { songFolder: v.folder, songPath: v.file })} />
                  </div>
                )}
                <div className="bg-white/5 p-3 rounded-xl border border-white/5 space-y-3">
                  <div className="text-[10px] font-bold text-white/50 uppercase tracking-widest mb-1">Teks & Thumbnail</div>
                  <CategoryFileSelect label="Thumbnail" type="thumbnail" folders={thumbnails.map((f:any)=>f.category).filter((v:any,i:any,a:any)=>v&&a.indexOf(v)===i)} items={thumbnails} folderVal={config.thumbFolder||'__all__'} fileVal={config.thumbPath||null} onChange={(v:any) => updateConfig(ch.channel_id, { thumbFolder: v.folder, thumbPath: v.file })} />
                  <CategoryFileSelect label="Judul Stream" type="title" folders={titles.map((t:any)=>t.category||'Uncategorized').filter((v:any,i:any,a:any)=>v&&a.indexOf(v)===i)} items={titles} folderVal={config.titleFolder||'__all__'} fileVal={config.titleId||null} onChange={(v:any) => updateConfig(ch.channel_id, { titleFolder: v.folder, titleId: v.file })} isText />
                  <CategoryFileSelect label="Deskripsi Stream" type="desc" folders={descriptions.map((d:any)=>d.category||'Uncategorized').filter((v:any,i:any,a:any)=>v&&a.indexOf(v)===i)} items={descriptions} folderVal={config.descFolder||'__all__'} fileVal={config.descId||null} onChange={(v:any) => updateConfig(ch.channel_id, { descFolder: v.folder, descId: v.file })} isText />
                </div>
              </div>
            )}`;
  sCode = sCode.substring(0, blockStart) + newUi + '\n              ' + sCode.substring(blockEnd);
}
fs.writeFileSync(streamFile, sCode);

// --- B. PATCH MEDIA POOL UI ---
const poolFile = 'src/app/media-pool/page.tsx';
let pCode = fs.readFileSync(poolFile, 'utf8');

if (!pCode.includes('"teks"')) {
  pCode = pCode.replace(/"music"\|"video"\|"thumbnails" \| "video-jadi"/, '"music"|"video"|"thumbnails" | "video-jadi" | "teks"');
  pCode = pCode.replace(/<button onClick=\{.*?\}\s*className=\{.*?\}\>.*?Video Jadi<\/button>/, `$&
            <button onClick={()=>setActiveTab("teks")} className={\`px-5 py-2.5 rounded-full text-xs font-bold transition-all duration-300 flex items-center gap-2 \${activeTab==="teks" ? 'bg-white text-black shadow-lg' : 'text-white/50 hover:text-white hover:bg-white/5'}\`}>📝 Teks</button>`);
}

if (!pCode.includes('TextAssetsTab')) {
  const textTabComp = `
function TextAssetsTab({ toast }: { toast: any }) {
  const [titles, setTitles] = useState<any[]>([]); const [descs, setDescs] = useState<any[]>([]);
  const [cats, setCats] = useState<string[]>([]); const [selCat, setSelCat] = useState('__all__');
  const [adding, setAdding] = useState(false); const [newCat, setNewCat] = useState('');
  const [addMode, setAddMode] = useState<'title'|'description'|null>(null);
  const [formVal, setFormVal] = useState(''); const [formLabel, setFormLabel] = useState('');

  const load = async () => {
    try {
      const [tRes, dRes, cRes] = await Promise.all([fetch('/media-pool-api/assets/titles'), fetch('/media-pool-api/assets/descriptions'), fetch('/media-pool-api/assets/text-categories')]);
      if(tRes.ok) setTitles(await tRes.json()); if(dRes.ok) setDescs(await dRes.json());
      if(cRes.ok) { const d = await cRes.json(); setCats(d.categories || []); }
    } catch {}
  };
  useEffect(() => { load(); }, []);

  const saveAsset = async () => {
    if(!formVal || !formLabel) return toast('Isi label & nilai!', 'error');
    await fetch('/media-pool-api/assets', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ type: addMode, value: formVal, label: formLabel, category: selCat === '__all__' ? 'Uncategorized' : selCat }) });
    setAddMode(null); setFormVal(''); setFormLabel(''); load(); toast('Teks tersimpan', 'success');
  };
  const delAsset = async (id: number) => { if(!confirm('Hapus teks ini?')) return; await fetch(\`/media-pool-api/assets/\${id}\`, { method:'DELETE' }); load(); toast('Dihapus', 'info'); };

  const moveAsset = async (dataStr: string, targetCat: string) => {
    const data = JSON.parse(dataStr); if(data.oldCategory === targetCat) return;
    await fetch('/media-pool-api/assets/move', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ id: data.id, category: targetCat }) });
    load(); toast(\`Dipindah ke \${targetCat}\`, 'success');
  };

  const AssetList = ({ type, data }: { type: string, data: any[] }) => (
    <div className="flex-1 glass-card-strong p-4 rounded-[24px]">
      <div className="flex justify-between items-center mb-4">
         <span className="text-[10px] font-bold text-white/50 uppercase tracking-widest">{type === 'title' ? 'Judul Stream' : 'Deskripsi Stream'}</span>
         <button onClick={()=>setAddMode(type as any)} className="bg-white/10 hover:bg-white text-white hover:text-black px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all">Tambah Baru</button>
      </div>
      <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
        {data.filter(d => selCat === '__all__' || (d.category||'Uncategorized') === selCat).map(d => (
          <div key={d.id} draggable onDragStart={e => e.dataTransfer.setData('text/plain', JSON.stringify({ id: d.id, oldCategory: d.category||'Uncategorized' }))} className="group glass-input p-3 rounded-xl relative cursor-grab hover:ring-1 hover:ring-white/20 transition-all">
             <div className="text-xs font-bold text-white mb-1 pr-6">{d.label}</div>
             <div className="text-[10px] text-white/60 line-clamp-2">{d.value}</div>
             <div className="flex justify-between mt-2"><span className="text-[9px] bg-white/10 px-2 py-0.5 rounded text-white/40">{d.category || 'Uncategorized'}</span></div>
             <button onClick={()=>delAsset(d.id)} className="absolute top-2 right-2 text-white/20 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all">X</button>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div className="glass-card rounded-[32px] overflow-hidden flex flex-col md:flex-row min-h-[500px] relative">
      {addMode && (
        <div className="absolute inset-0 bg-black/80 backdrop-blur-sm flex justify-center items-center z-50 p-4">
           <div className="bg-[#111318] p-6 rounded-2xl w-full max-w-md border border-white/10">
              <h3 className="text-sm font-bold text-white mb-4">Tambah {addMode === 'title' ? 'Judul' : 'Deskripsi'}</h3>
              <input value={formLabel} onChange={e=>setFormLabel(e.target.value)} placeholder="Nama / Label Penanda" className="w-full glass-input p-3 rounded-xl text-xs text-white mb-3 outline-none" />
              <textarea value={formVal} onChange={e=>setFormVal(e.target.value)} placeholder="Isi teks..." rows={addMode==='title'?2:5} className="w-full glass-input p-3 rounded-xl text-xs text-white mb-4 outline-none resize-none" />
              <div className="flex gap-2 justify-end">
                 <button onClick={()=>setAddMode(null)} className="px-4 py-2 text-xs text-white/50 hover:text-white">Batal</button>
                 <button onClick={saveAsset} className="px-4 py-2 bg-white text-black text-xs font-bold rounded-xl hover:scale-95 transition-all">Simpan</button>
              </div>
           </div>
        </div>
      )}
      <div className="w-full md:w-56 bg-white/[0.02] border-r border-white/5 p-4 flex flex-col gap-1">
        <div className="flex items-center justify-between px-2 mb-2"><span className="text-[10px] font-semibold text-white/40 uppercase tracking-widest">Kategori Teks</span><button onClick={()=>{setAdding(true)}} className="text-white/40 hover:text-white transition-colors p-1">+</button></div>
        <SidebarItem icon={<span className="text-lg">📁</span>} label="__all__" active={selCat==='__all__'} onClick={()=>setSelCat('__all__')} />
        <SidebarItem icon={<span className="text-lg">📁</span>} label="Uncategorized" active={selCat==='Uncategorized'} onClick={()=>setSelCat('Uncategorized')} onDropFile={(d:any)=>moveAsset(d, 'Uncategorized')} />
        {cats.map(c => <SidebarItem key={c} icon={<span className="text-lg">📁</span>} label={c} active={selCat===c} onClick={()=>setSelCat(c)} onDropFile={(d:any)=>moveAsset(d, c)} />)}
        {adding && <input value={newCat} onChange={e=>setNewCat(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'){setCats(p=>[...p, newCat]); setAdding(false); setNewCat('');}}} placeholder="Ketik & Enter..." className="glass-input p-2 text-xs rounded-lg mt-2 text-white outline-none" />}
      </div>
      <div className="flex-1 p-6 flex flex-col md:flex-row gap-4"><AssetList type="title" data={titles} /><AssetList type="description" data={descs} /></div>
    </div>
  );
}
`;
  pCode = pCode.replace(/export default function MediaPool/, textTabComp + '\nexport default function MediaPool');
}

pCode = pCode.replace(/activeTab === "video-jadi" \? <VideoJadiTab.*? \/> : activeTab === "thumbnails"/, `activeTab === "teks" ? <TextAssetsTab toast={addToast} /> : activeTab === "video-jadi" ? <VideoJadiTab toast={addToast} queue={queue} onUpload={handleUpload} refresh={refreshCount} /> : activeTab === "thumbnails"`);

fs.writeFileSync(poolFile, pCode);
console.log('✅ Bagian 4 Selesai: UI Streams & Media Pool 100% diperbarui!');
