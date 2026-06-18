const fs = require('fs');
const file = 'src/app/streams/page.tsx';
let code = fs.readFileSync(file, 'utf8');

// 1. Kita cari target blok grid yang lama
const oldRegex = /<div className="grid grid-cols-2 lg:grid-cols-4 gap-3 bg-black\/20 p-3 rounded-xl border border-white\/5">[\s\S]*?<\/div>/;

const newLogic = `{config.videoReadyPath ? (
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 bg-black/20 p-3 rounded-xl border border-white/5">
                          <MediaDropdown label="Thumbnail" options={thumbnails} value={config.thumbnailPath} onChange={path => updateConfig(ch.channel_id, { thumbnailPath: path })} placeholder="— Tanpa Thumbnail —" />
                          <AssetDropdown label="Judul" options={titles} value={config.titleId} onChange={id => updateConfig(ch.channel_id, { titleId: id })} onDelete={deleteAsset} placeholder="— Acak Otomatis —" />
                          <AssetDropdown label="Desc" options={descriptions} value={config.descriptionId} onChange={id => updateConfig(ch.channel_id, { descriptionId: id })} onDelete={deleteAsset} placeholder="— Acak Otomatis —" />
                        </div>
                      ) : (
                        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 bg-black/20 p-3 rounded-xl border border-white/5">
                          <MediaDropdown label="Video (Re-encode)" options={videos} value={config.videoPath} onChange={path => updateConfig(ch.channel_id, { videoPath: path, videoReadyPath: null })} placeholder="— Wajib Pilih —" />
                          <MediaDropdown label="Lagu" options={config.folders.length > 0 ? songs.filter(s => s.category && config.folders.includes(s.category)) : songs} value={config.songPath} onChange={path => updateConfig(ch.channel_id, { songPath: path })} placeholder="— Acak Otomatis —" />
                          <MediaDropdown label="Thumbnail" options={thumbnails} value={config.thumbnailPath} onChange={path => updateConfig(ch.channel_id, { thumbnailPath: path })} placeholder="— Tanpa Thumbnail —" />
                          <AssetDropdown label="Judul" options={titles} value={config.titleId} onChange={id => updateConfig(ch.channel_id, { titleId: id })} onDelete={deleteAsset} placeholder="— Acak Otomatis —" />
                          <AssetDropdown label="Desc" options={descriptions} value={config.descriptionId} onChange={id => updateConfig(ch.channel_id, { descriptionId: id })} onDelete={deleteAsset} placeholder="— Acak Otomatis —" />
                        </div>
                      )}`;

if (code.match(oldRegex)) {
  code = code.replace(oldRegex, newLogic);
  
  // 2. Bersihin state songPath biar kalau Video Jadi dipencet, lagunya otomatis ke-reset
  const resetRegex = /onChange=\{p => updateConfig\(ch\.channel_id, \{ videoReadyPath: p, videoPath: p \? null : config\.videoPath \}\)\}/g;
  code = code.replace(resetRegex, "onChange={p => updateConfig(ch.channel_id, { videoReadyPath: p, videoPath: p ? null : config.videoPath, songPath: p ? null : config.songPath })}");

  fs.writeFileSync(file, code);
  console.log('✅ UI Stream berhasil diperbarui! Logika Dropdown sudah dinamis.');
} else {
  console.log('⚠️ Target blok UI tidak ditemukan.');
}
