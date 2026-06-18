const fs = require('fs');
const file = 'src/app/streams/page.tsx';
let code = fs.readFileSync(file, 'utf8');

if (!code.includes('clearText')) {
  // A. Modifikasi komponen Dropdown agar mendukung teks tombol batal yang fleksibel
  const targetInterface = /function MediaDropdown\(\{ label, options, value, onChange, placeholder, disabled \}: \{ label: string; options: MediaFile\[\]; value: string \| null; onChange: \(path: string \| null\) => void; placeholder\?: string; disabled\?: boolean; \}\) \{/;
  const newInterface = `function MediaDropdown({ label, options, value, onChange, placeholder, disabled, clearText = "— Acak Otomatis —" }: { label: string; options: MediaFile[]; value: string | null; onChange: (path: string | null) => void; placeholder?: string; disabled?: boolean; clearText?: string; }) {`;
  code = code.replace(targetInterface, newInterface);
  
  const targetButton = /<button onClick=\{\(\) => \{ onChange\(null\); setOpen\(false\); \}\} className="w-full text-left px-3 py-2 rounded-lg text-\[11px\] font-medium text-white\/50 hover:bg-white\/10 hover:text-white transition-colors">— Acak Otomatis —<\/button>/g;
  const newButton = `<button onClick={() => { onChange(null); setOpen(false); }} className="w-full text-left px-3 py-2 rounded-lg text-[11px] font-medium text-white/50 hover:bg-white/10 hover:text-white transition-colors">{clearText}</button>`;
  code = code.replace(targetButton, newButton);
}

// B. Masukkan Fake-Option khusus untuk Acak Otomatis di Video Jadi
const oldDropdown = `<MediaDropdown label="Pilih Video Jadi" options={videoReadyFiles} value={config.videoReadyPath} onChange={p => updateConfig(ch.channel_id, { videoReadyPath: p, videoPath: p ? null : config.videoPath, songPath: p ? null : config.songPath })} placeholder="— Tidak pakai stream copy —" />`;
const newDropdown = `<MediaDropdown label="Pilih Video Jadi" options={[{ filename: '🔀 Acak Otomatis (Anti-Duplikat)', path: 'RANDOM_VIDEO_READY', category: 'Sistem' }, ...videoReadyFiles]} value={config.videoReadyPath} onChange={p => updateConfig(ch.channel_id, { videoReadyPath: p, videoPath: p ? null : config.videoPath, songPath: p ? null : config.songPath })} placeholder="— Wajib Pilih (Bisa Diacak) —" clearText="— Batal / Pakai Re-encode —" />`;
code = code.replace(oldDropdown, newDropdown);

fs.writeFileSync(file, code);
console.log('✅ Frontend: Fitur pilihan Acak Otomatis (Anti-Duplikat) berhasil ditambahkan!');
