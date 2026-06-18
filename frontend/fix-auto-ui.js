const fs = require('fs');
const file = 'src/app/streams/page.tsx';
let code = fs.readFileSync(file, 'utf8');

const startIdx = code.indexOf('{config.auto && (');
const endIdx = code.indexOf('{!config.auto && (');

if (startIdx !== -1 && endIdx !== -1) {
  const newAutoBlock = `{config.auto && (
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
                    
                    `;
  
  code = code.substring(0, startIdx) + newAutoBlock + code.substring(endIdx);
  fs.writeFileSync(file, code);
  console.log('✅ UI Auto-Kategori Berhasil Dibuat Dinamis!');
} else {
  console.log('⚠️ Peringatan: Blok config.auto tidak ditemukan.');
}
