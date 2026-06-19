const fs = require('fs');
const path = 'src/app/media-pool/page.tsx';
let code = fs.readFileSync(path, 'utf8');

const startStr = 'function TextAssetsTab({ toast }: { toast: any }) {';
const endStr = 'function VideoJadiTab({';

const startIdx = code.indexOf(startStr);
const endIdx = code.indexOf(endStr);

if (startIdx !== -1 && endIdx !== -1) {
    const newTab = `function TextAssetsTab({ toast }: { toast: any }) {
  const [titles, setTitles] = useState<any[]>([]); const [descs, setDescs] = useState<any[]>([]);
  const [cats, setCats] = useState<string[]>([]); const [selCat, setSelCat] = useState('__all__');
  const [adding, setAdding] = useState(false); const [newCat, setNewCat] = useState('');
  const [addMode, setAddMode] = useState<'title'|'description'|null>(null);
  const [formVal, setFormVal] = useState(''); const [formLabel, setFormLabel] = useState('');

  const load = async () => {
    try {
      const [tRes, dRes, cRes] = await Promise.all([fetch('/api/assets/titles'), fetch('/api/assets/descriptions'), fetch('/api/assets/text-categories')]);
      if(tRes.ok) setTitles(await tRes.json()); if(dRes.ok) setDescs(await dRes.json());
      if(cRes.ok) { const d = await cRes.json(); setCats(d.categories || []); }
    } catch {}
  };
  useEffect(() => { load(); }, []);

  const saveAsset = async () => {
    if(!formVal || !formLabel) return toast('Isi label & nilai!', 'error');
    await fetch('/api/assets', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ type: addMode, value: formVal, label: formLabel, category: selCat === '__all__' ? 'Uncategorized' : selCat }) });
    setAddMode(null); setFormVal(''); setFormLabel(''); load(); toast('Teks tersimpan', 'success');
  };
  
  const delAsset = async (id: number) => { 
    if(!confirm('Hapus teks ini?')) return; 
    await fetch(\`/api/assets/\${id}\`, { method:'DELETE' }); 
    load(); toast('Dihapus', 'info'); 
  };

  const moveAsset = async (dataStr: string, targetCat: string) => {
    const data = JSON.parse(dataStr); if(data.oldCategory === targetCat) return;
    await fetch('/api/assets/move', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ id: data.id, category: targetCat }) });
    load(); toast(\`Dipindah ke \${targetCat}\`, 'success');
  };

  const addCategory = async () => {
    const n = newCat.trim(); if (!n) return;
    try {
      await fetch('/api/assets/text-categories', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: n }) });
      setAdding(false); setNewCat(''); load(); toast('Kategori ditambah', 'success');
    } catch {}
  };

  const deleteCategory = async (catName: string) => {
    if (!confirm(\`Hapus folder "\${catName}"? Teks di dalamnya akan aman dipindah ke Uncategorized.\`)) return;
    try {
      await fetch(\`/api/assets/text-categories/\${encodeURIComponent(catName)}\`, { method: 'DELETE' });
      if (selCat === catName) setSelCat('__all__');
      load(); toast('Folder dihapus', 'info');
    } catch {}
  };

  const AssetList = ({ type, data }: { type: string, data: any[] }) => (
    <div className="flex-1 glass-card-strong p-4 rounded-[24px]">
      <div className="flex justify-between items-center mb-4">
         <span className="text-[10px] font-bold text-white/50 uppercase tracking-widest">{type === 'title' ? 'Judul Stream' : 'Deskripsi Stream'}</span>
         <button onClick={()=>setAddMode(type as any)} className="bg-white/10 hover:bg-white text-white hover:text-black px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all"><Icon.Plus /> Tambah Baru</button>
      </div>
      <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
        {data.filter((d:any) => selCat === '__all__' || (d.category||'Uncategorized') === selCat).map((d:any) => (
          <div key={d.id} draggable onDragStart={e => e.dataTransfer.setData('text/plain', JSON.stringify({ id: d.id, oldCategory: d.category||'Uncategorized' }))} className="group glass-input p-3 rounded-xl relative cursor-grab hover:ring-1 hover:ring-white/20 transition-all">
             <div className="text-xs font-bold text-white mb-1 pr-6">{d.label}</div>
             <div className="text-[10px] text-white/60 line-clamp-2">{d.value}</div>
             <div className="flex justify-between mt-2"><span className="text-[9px] bg-white/10 px-2 py-0.5 rounded text-white/40">{d.category || 'Uncategorized'}</span></div>
             <button onClick={()=>delAsset(d.id)} className="absolute top-2 right-2 text-white/20 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all"><Icon.Trash /></button>
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
        <div className="flex items-center justify-between px-2 mb-2"><span className="text-[10px] font-semibold text-white/40 uppercase tracking-widest">Kategori Teks</span><button onClick={()=>{setAdding(true)}} className="text-white/40 hover:text-white transition-colors p-1"><Icon.Plus /></button></div>
        <SidebarItem icon={<Icon.Folder />} label="__all__" active={selCat==='__all__'} onClick={()=>setSelCat('__all__')} />
        <SidebarItem icon={<Icon.Folder />} label="Uncategorized" active={selCat==='Uncategorized'} onClick={()=>setSelCat('Uncategorized')} onDropFile={(d:any)=>moveAsset(d, 'Uncategorized')} />
        {cats.map((c:string) => <SidebarItem key={c} icon={<Icon.Folder />} label={c} active={selCat===c} onClick={()=>setSelCat(c)} onDropFile={(d:any)=>moveAsset(d, c)} onDelete={() => deleteCategory(c)} />)}
        {adding && <input value={newCat} onChange={e=>setNewCat(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'){addCategory();}}} onBlur={() => {if(!newCat.trim()) setAdding(false);}} placeholder="Ketik & Enter..." className="glass-input p-2 text-xs rounded-lg mt-2 text-white outline-none" />}
      </div>
      <div className="flex-1 p-6 flex flex-col md:flex-row gap-4"><AssetList type="title" data={titles} /><AssetList type="description" data={descs} /></div>
    </div>
  );
}

`;
    code = code.substring(0, startIdx) + newTab + code.substring(endIdx);
    fs.writeFileSync(path, code);
    console.log('✅ UI Media Pool Selesai: Fitur Hapus Folder & Anti-Double Aktif!');
}
