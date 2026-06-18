const fs = require('fs');
const file = 'src/app/streams/page.tsx';
let code = fs.readFileSync(file, 'utf8');

// 1. Menghanguskan panel "Global Assets" lama yang nyangkut
const globalAssetsRegex = /<div className="glass-card rounded-\[20px\] p-4 mb-6 relative z-\[100\]">[\s\S]*?<div className="space-y-4 relative z-\[10\]">/;
code = code.replace(globalAssetsRegex, '<div className="space-y-4 relative z-[10]">');

// 2. Memastikan Komponen Dropdown 2 Step tersedia
if (!code.includes('CategoryFileSelect')) {
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
          <option value="RANDOM">🔀 Acak Otomatis (Sesuai Folder)</option>
          {visibleItems.map((i:any) => <option key={i.id || i.path || i.filename} value={i.id || i.path || i.filename}>{i.label || i.filename || i.value}</option>)}
        </select>
      </div>
    </div>
  );
}
`;
  code = code.replace(/export default function StreamsPage\(\) \{/, comp + '\nexport default function StreamsPage() {');
}

// 3. Update pengiriman Data Start & Schedule ke Backend
code = code.replace(/const body: Record<string, unknown> = \{ channelId, durationSecs: config\.duration \* 3600, folder: payloadFolder, auto: config\.auto \};[\s\S]*?const res = await fetch\('\/api\/streams\/start'/g, 
`const body: Record<string, unknown> = { channelId, durationSecs: config.duration * 3600, folder: payloadFolder, auto: config.auto, mode: config.mode || 'encode' };
      if (!config.auto) {
          body.vrFolder = config.vrFolder; body.vrPath = config.vrPath;
          body.vidFolder = config.vidFolder; body.vidPath = config.vidPath;
          body.songFolder = config.songFolder; body.songPath = config.songPath;
          body.thumbFolder = config.thumbFolder; body.thumbnailPath = config.thumbPath;
          body.titleFolder = config.titleFolder; body.titleId = config.titleId;
          body.descFolder = config.descFolder; body.descriptionId = config.descId;
      }
      const res = await fetch('/api/streams/start'`);

code = code.replace(/const body: Record<string, unknown> = \{ channelId, scheduledAt, durationSecs: config\.duration \* 3600, folder: payloadFolder, auto: config\.auto, title: 'Lofi Jazz Radio', repeatType: form\.repeat \|\| 'none', videoPath: config\.auto \? null : config\.videoPath, videoReadyPath: config\.auto \? null : config\.videoReadyPath, songPath: config\.songPath \};[\s\S]*?const res = await fetch\('\/api\/schedules'/g,
`const body: Record<string, unknown> = { channelId, scheduledAt, durationSecs: config.duration * 3600, folder: payloadFolder, auto: config.auto, mode: config.mode || 'encode', repeatType: form.repeat || 'none', title: 'Lofi Broadcast' };
      if (!config.auto) {
          body.vrFolder = config.vrFolder; body.vrPath = config.vrPath;
          body.vidFolder = config.vidFolder; body.vidPath = config.vidPath;
          body.songFolder = config.songFolder; body.songPath = config.songPath;
          body.thumbFolder = config.thumbFolder; body.thumbnailPath = config.thumbPath;
          body.titleFolder = config.titleFolder; body.titleId = config.titleId;
          body.descFolder = config.descFolder; body.descriptionId = config.descId;
      }
      const res = await fetch('/api/schedules'`);

// 4. Suntik UI Baru menggunakan teknik Target Absolut
const engineStart = '<div className="text-[11px] font-semibold text-white/50 uppercase tracking-widest">Engine Config</div>';
const engineEnd = '<div className="mt-4 flex items-center gap-2">';
const startIndex = code.indexOf(engineStart);
const endIndex = code.indexOf(engineEnd);

if (startIndex !== -1 && endIndex !== -1) {
    const newUI = `${engineStart}
                      <div className="bg-black/30 p-1 rounded-lg flex gap-1 border border-white/5">
                        <button onClick={() => updateConfig(ch.channel_id, { auto: true })} className={\`px-3 py-1 rounded-md text-[10px] font-bold transition-all \${config.auto ? 'bg-white text-black' : 'text-white/50 hover:text-white'}\`}>AUTO</button>
                        <button onClick={() => updateConfig(ch.channel_id, { auto: false })} className={\`px-3 py-1 rounded-md text-[10px] font-bold transition-all \${!config.auto ? 'bg-white text-black' : 'text-white/50 hover:text-white'}\`}>MANUAL</button>
                      </div>
                    </div>
                    
                    <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-3 mb-4">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold text-amber-400 uppercase tracking-widest">⚡ Tipe Stream</span>
                        <select value={config.mode || 'encode'} onChange={e => updateConfig(ch.channel_id, { mode: e.target.value })} className="glass-input rounded-md px-2 py-1 text-[10px] font-bold text-white outline-none bg-[#111318]">
                          <option value="copy">PAKAI VIDEO JADI (HEMAT CPU)</option>
                          <option value="encode">RE-ENCODE (VIDEO BIASA + AUDIO)</option>
                        </select>
                      </div>
                    </div>

                    {config.auto && (
                      <div className="mb-4">
                        <div className="text-[10px] text-white/40 mb-1.5">Kategori Playlist (Multi) untuk Auto:</div>
                        <div className="flex flex-wrap gap-1.5">
                          <button onClick={() => updateConfig(ch.channel_id, { folders: [] })} className={\`px-3 py-1 rounded-lg text-[10px] font-semibold transition-all \${config.folders.length === 0 ? 'bg-white text-black' : 'glass-input text-white/60 hover:bg-white/10'}\`}>Semua Kategori</button>
                          {folders.map(f => {
                            const isSelected = config.folders.includes(f.name);
                            return (
                              <button key={f.name} onClick={() => {
                                const newFolders = isSelected ? config.folders.filter(x => x !== f.name) : [...config.folders, f.name];
                                updateConfig(ch.channel_id, { folders: newFolders });
                              }} className={\`px-3 py-1 rounded-lg text-[10px] font-semibold transition-all \${isSelected ? 'bg-white text-black' : 'glass-input text-white/60 hover:bg-white/10'}\`}>{f.name}</button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                    
                    {!config.auto && (
                      <div className="space-y-3 mb-4 animate-in fade-in">
                        {config.mode === 'copy' ? (
                          <CategoryFileSelect label="Pilih Video Jadi" type="video-ready" folders={videoReadyFiles.map((f:any)=>f.category).filter((v:any,i:any,a:any)=>v&&a.indexOf(v)===i)} items={videoReadyFiles} folderVal={config.vrFolder||'__all__'} fileVal={config.vrPath||null} onChange={(v:any) => updateConfig(ch.channel_id, { vrFolder: v.folder, vrPath: v.file })} />
                        ) : (
                          <div className="bg-black/20 p-3 rounded-xl border border-white/5 space-y-3">
                            <CategoryFileSelect label="Video Visual" type="video" folders={folders.map((f:any)=>f.name)} items={videos} folderVal={config.vidFolder||'__all__'} fileVal={config.vidPath||null} onChange={(v:any) => updateConfig(ch.channel_id, { vidFolder: v.folder, vidPath: v.file })} />
                            <CategoryFileSelect label="Lagu / Audio" type="music" folders={folders.map((f:any)=>f.name)} items={songs} folderVal={config.songFolder||'__all__'} fileVal={config.songPath||null} onChange={(v:any) => updateConfig(ch.channel_id, { songFolder: v.folder, songPath: v.file })} />
                          </div>
                        )}
                        <div className="bg-black/20 p-3 rounded-xl border border-white/5 space-y-3">
                          <CategoryFileSelect label="Thumbnail" type="thumbnail" folders={thumbnails.map((f:any)=>f.category).filter((v:any,i:any,a:any)=>v&&a.indexOf(v)===i)} items={thumbnails} folderVal={config.thumbFolder||'__all__'} fileVal={config.thumbPath||null} onChange={(v:any) => updateConfig(ch.channel_id, { thumbFolder: v.folder, thumbPath: v.file })} />
                          <CategoryFileSelect label="Judul Stream" type="title" folders={titles.map((t:any)=>t.category||'Uncategorized').filter((v:any,i:any,a:any)=>v&&a.indexOf(v)===i)} items={titles} folderVal={config.titleFolder||'__all__'} fileVal={config.titleId||null} onChange={(v:any) => updateConfig(ch.channel_id, { titleFolder: v.folder, titleId: v.file })} isText />
                          <CategoryFileSelect label="Deskripsi Stream" type="desc" folders={descriptions.map((d:any)=>d.category||'Uncategorized').filter((v:any,i:any,a:any)=>v&&a.indexOf(v)===i)} items={descriptions} folderVal={config.descFolder||'__all__'} fileVal={config.descId||null} onChange={(v:any) => updateConfig(ch.channel_id, { descFolder: v.folder, descId: v.file })} isText />
                        </div>
                      </div>
                    )}
                    
                    `;
    code = code.substring(0, startIndex) + newUI + code.substring(endIndex);
    fs.writeFileSync(file, code);
    console.log('✅ UI Streams Baru Berhasil Disuntik!');
} else {
    console.log('⚠️ Warning: Blok UI gagal ditemukan!');
}
