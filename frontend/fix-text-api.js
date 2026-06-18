const fs = require('fs');
const file = 'src/app/media-pool/page.tsx';
let code = fs.readFileSync(file, 'utf8');

// Mengganti semua URL yang salah sasaran ke rute yang benar
code = code.replace(/\/media-pool-api\/assets/g, '/api/assets');

fs.writeFileSync(file, code);
console.log('✅ Alamat API Teks berhasil dikembalikan ke jalur Database (/api/assets)!');
