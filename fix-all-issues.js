const fs = require('fs');

// 1. FIX BACKEND: Menambah API Add & Delete Kategori Teks ke DB
let apiCode = fs.readFileSync('backend/src/routes/assets.js', 'utf8');
const newRoutes = `
router.post('/text-categories', async (req, res) => {
  try {
    try {
      await req.db.query("INSERT INTO broadcast_assets (type, value, label, category) VALUES ('category_marker', '', '', $1)", [req.body.name]);
    } catch(err) {
      await req.db.query("ALTER TABLE broadcast_assets ADD COLUMN IF NOT EXISTS category VARCHAR(100) DEFAULT 'Uncategorized'");
      await req.db.query("INSERT INTO broadcast_assets (type, value, label, category) VALUES ('category_marker', '', '', $1)", [req.body.name]);
    }
    res.json({ success: true });
  } catch(e) { res.status(500).json({error: e.message}); }
});

router.delete('/text-categories/:name', async (req, res) => {
  try {
    const cat = req.params.name;
    // Hapus markernya, dan amankan teks di dalamnya ke Uncategorized
    await req.db.query("DELETE FROM broadcast_assets WHERE type = 'category_marker' AND category = $1", [cat]);
    await req.db.query("UPDATE broadcast_assets SET category = 'Uncategorized' WHERE category = $1", [cat]);
    res.json({ success: true });
  } catch(e) { res.status(500).json({error: e.message}); }
});
`;

if (!apiCode.includes('/text-categories/:name')) {
    apiCode = apiCode.replace(/module\.exports = router;/, newRoutes + '\nmodule.exports = router;');
    fs.writeFileSync('backend/src/routes/assets.js', apiCode);
    console.log('✅ Backend: API Folder Teks (Hapus & Buat) berhasil ditanam!');
}

// 2. FIX MEDIA POOL: Menambah Tombol Delete & Mencegah Kategori Double di Layar
let poolCode = fs.readFileSync('frontend/src/app/media-pool/page.tsx', 'utf8');
const regexDelAsset = /const delAsset = async \(id: number\) => \{[\s\S]*?toast\('Dihapus', 'info'\);\s*\};/;

if (poolCode.match(regexDelAsset) && !poolCode.includes('deleteCategory = async')) {
    const matched = poolCode.match(regexDelAsset)[0];
    const newFunctions = `${matched}

  const addCategory = async () => {
    const n = newCat.trim(); if (!n) return;
    try {
      await fetch('/api/assets/text-categories', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: n }) });
      setAdding(false); setNewCat(''); load(); toast('Kategori ditambah', 'success');
    } catch {}
  };

  const deleteCategory = async (catName: string) => {
    if (!confirm(\`Hapus folder "\${catName}"? Teks di dalamnya akan otomatis dipindah ke Uncategorized biar aman.\`)) return;
    try {
      await fetch(\`/api/assets/text-categories/\${encodeURIComponent(catName)}\`, { method: 'DELETE' });
      if (selCat === catName) setSelCat('__all__');
      load(); toast('Folder dihapus', 'info');
    } catch {}
  };`;
    poolCode = poolCode.replace(regexDelAsset, newFunctions);
    
    // Pasang tombol Delete di Sidebar
    poolCode = poolCode.replace(
      /\{cats\.map\(c => <SidebarItem key=\{c\} icon=\{<span className="text-lg">📁<\/span>\} label=\{c\} active=\{selCat===c\} onClick=\{\(\)=>setSelCat\(c\)\} onDropFile=\{\(d:any\)=>moveAsset\(d, c\)\} \/>\)\}/g,
      `{cats.map(c => <SidebarItem key={c} icon={<span className="text-lg">📁</span>} label={c} active={selCat===c} onClick={()=>setSelCat(c)} onDropFile={(d:any)=>moveAsset(d, c)} onDelete={() => deleteCategory(c)} />)}`
    );
    
    // Ganti Enter jadi manggil API (Mencegah folder double/palsu)
    poolCode = poolCode.replace(
      /if\(e\.key==='Enter'\)\{setCats\(p=>\[\.\.\.p, newCat\]\); setAdding\(false\); setNewCat\(''\);\}/g,
      `if(e.key==='Enter'){addCategory();}`
    );
    
    fs.writeFileSync('frontend/src/app/media-pool/page.tsx', poolCode);
    console.log('✅ Media Pool: Tombol Hapus Folder Teks & Anti-Double UI berhasil!');
}

// 3. FIX STREAMS: Sinkronisasi Kategori AUTO agar tidak meleset
let streamCode = fs.readFileSync('frontend/src/app/streams/page.tsx', 'utf8');
const regexAuto = /\{config\.auto && \([\s\S]*?\{\!config\.auto && \(/;

if (streamCode.match(regexAuto)) {
    const newAutoUI = `{config.auto && (
                      <div className="mb-4">
                        <div className="text-[10px] text-white/40 mb-1.5">{config.mode === 'copy' ? 'Kategori Video Jadi (Multi) untuk Auto:' : 'Kategori Lagu & Video (Multi) untuk Auto:'}</div>
                        <div className="flex flex-wrap gap-1.5">
                          <button onClick={() => updateConfig(ch.channel_id, { folders: [] })} className={\`px-3 py-1 rounded-lg text-[10px] font-semibold transition-all \${config.folders.length === 0 ? 'bg-white text-black' : 'glass-input text-white/60 hover:bg-white/10'}\`}>Semua Kategori</button>
                          {(config.mode === 'copy' ? videoReadyFiles.map((f:any)=>f.category).filter((v:any,i:any,a:any)=>v&&a.indexOf(v)===i) : folders.map((f:any)=>f.name)).map((catName:string) => {
                            const isSelected = config.folders.includes(catName);
                            return (
                              <button key={catName} onClick={() => {
                                const newFolders = isSelected ? config.folders.filter(x => x !== catName) : [...config.folders, catName];
                                updateConfig(ch.channel_id, { folders: newFolders });
                              }} className={\`px-3 py-1 rounded-lg text-[10px] font-semibold transition-all \${isSelected ? 'bg-white text-black' : 'glass-input text-white/60 hover:bg-white/10'}\`}>{catName}</button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                    
                    {!config.auto && (`;
    streamCode = streamCode.replace(regexAuto, newAutoUI);
    fs.writeFileSync('frontend/src/app/streams/page.tsx', streamCode);
    console.log('✅ Streams: Kategori AUTO berhasil disinkronkan dengan Video Jadi!');
}

