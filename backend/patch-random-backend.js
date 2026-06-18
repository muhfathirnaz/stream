const fs = require('fs');
const file = 'src/services/LocalStreamService.js';
let code = fs.readFileSync(file, 'utf8');

// 1. Suntik fungsi radar pengecek video yang nganggur
if (!code.includes('getRandomVideoReady()')) {
  code = code.replace(
    /getUsedAssets\(\) \{[\s\S]*?return \{ titles, descs, thumbs \};\s*\}/,
    `$&
  
  getRandomVideoReady() {
    const dir = '/opt/media/video-ready';
    const path = require('path');
    if (!fs.existsSync(dir)) return null;
    
    // Tarik semua file video di folder
    const allFiles = fs.readdirSync(dir)
      .filter(f => f.match(/\\.(mp4|mkv|mov|avi|flv)$/i))
      .map(f => path.join(dir, f));
      
    // Tarik daftar video yang sedang diputar di stream manapun
    const usedFiles = Object.values(this.activeAssets)
      .map(a => a.videoReadyPath)
      .filter(Boolean);
      
    // Buang video yang sedang tayang dari pilihan
    let available = allFiles.filter(f => !usedFiles.includes(f));
    
    if (available.length === 0) available = allFiles; // Fallback jika semua video kebetulan kepakai
    if (available.length === 0) return null;
    
    return available[Math.floor(Math.random() * available.length)];
  }`
  );
}

// 2. Halau proses Start dan kunci slot videonya
const targetEval = `const useStreamCopy = !!(videoReadyPath && fs.existsSync(videoReadyPath));
      let finalVideoPath, finalVideoFilename;
      if (useStreamCopy) {
        finalVideoPath = videoReadyPath;
        finalVideoFilename = path.basename(videoReadyPath);`;

const newEval = `let actualVideoReadyPath = videoReadyPath;
      if (actualVideoReadyPath === 'RANDOM_VIDEO_READY') {
         actualVideoReadyPath = this.getRandomVideoReady();
         if (!actualVideoReadyPath) throw new Error("Gagal! Tidak ada file video di folder Video Jadi untuk diacak.");
      }

      // Langsung reservasi awal agar anti-duplikat aman dari stream yang start barengan sedetik!
      this.activeAssets[streamId] = { videoReadyPath: actualVideoReadyPath };

      const useStreamCopy = !!(actualVideoReadyPath && fs.existsSync(actualVideoReadyPath));
      let finalVideoPath, finalVideoFilename;
      if (useStreamCopy) {
        finalVideoPath = actualVideoReadyPath;
        finalVideoFilename = path.basename(actualVideoReadyPath);`;

code = code.replace(targetEval, newEval);

// 3. Masukkan jejak tayang di memori untuk keperluan radar di atas
code = code.replace(
  /this\.activeAssets\[streamId\] = \{ title, description, thumbnailPath, playlistPath \};/g,
  `this.activeAssets[streamId] = { title, description, thumbnailPath, playlistPath, videoReadyPath: useStreamCopy ? finalVideoPath : null };`
);

fs.writeFileSync(file, code);
console.log('✅ Backend: Radar Acak Video Jadi (Anti-Duplikat) berhasil ditanam!');
