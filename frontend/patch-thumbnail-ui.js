const fs = require('fs');
const file = 'src/app/streams/page.tsx';
let code = fs.readFileSync(file, 'utf8');

// Mencari komponen Dropdown Thumbnail dan menukarnya dengan versi yang punya opsi Random
const targetDropdown = /<MediaDropdown label="Thumbnail" options=\{thumbnails\} value=\{config\.thumbnailPath\} onChange=\{path => updateConfig\(ch\.channel_id, \{ thumbnailPath: path \}\)\} placeholder="— Tanpa Thumbnail —" \/>/g;

const newDropdown = `<MediaDropdown label="Thumbnail" options={[{ filename: '🔀 Acak Otomatis', path: 'RANDOM_THUMBNAIL', category: 'Sistem' }, ...thumbnails]} value={config.thumbnailPath} onChange={path => updateConfig(ch.channel_id, { thumbnailPath: path })} placeholder="— Wajib Pilih / Acak —" clearText="— Tanpa Thumbnail —" />`;

if (code.match(targetDropdown)) {
    code = code.replace(targetDropdown, newDropdown);
    fs.writeFileSync(file, code);
    console.log('✅ Frontend: Opsi Acak Thumbnail berhasil ditambahkan ke UI!');
} else {
    console.log('⚠️ Target UI Thumbnail tidak ditemukan (Mungkin sudah di-patch).');
}
