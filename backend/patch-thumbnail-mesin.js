const fs = require('fs');
const file = 'src/services/LocalStreamService.js';
let code = fs.readFileSync(file, 'utf8');

const targetBroadcast = /const ytRes = await this\.youtubeService\.createBroadcast\(\{ refreshToken, title, description, thumbnailPath \}\);/;

const newBroadcast = `let actualThumb = thumbnailPath;
        if (actualThumb === 'RANDOM_THUMBNAIL') {
          const thumbDir = '/opt/media/thumbnails';
          if (fs.existsSync(thumbDir)) {
              // Tarik semua file gambar yang ada
              const files = fs.readdirSync(thumbDir)
                  .filter(f => f.match(/\\.(jpg|jpeg|png)$/i))
                  .map(f => require('path').join(thumbDir, f));
              
              // Pilih satu secara acak!
              actualThumb = files.length > 0 ? files[Math.floor(Math.random() * files.length)] : null;
          } else {
              actualThumb = null;
          }
        }
        
        const ytRes = await this.youtubeService.createBroadcast({ refreshToken, title, description, thumbnailPath: actualThumb });`;

if (code.match(targetBroadcast)) {
    code = code.replace(targetBroadcast, newBroadcast);
    
    // Memastikan jejak thumbnail yang tersimpan adalah yang terpilih, bukan tulisan "RANDOM_THUMBNAIL"
    code = code.replace(/thumbnailPath,\s*playlistPath/g, 'thumbnailPath: actualThumb, playlistPath');
    
    fs.writeFileSync(file, code);
    console.log('✅ Backend: Mesin Pengocok Thumbnail Otomatis berhasil dipasang!');
} else {
    console.log('⚠️ Target Backend Thumbnail tidak ditemukan.');
}
