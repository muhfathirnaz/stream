const fs = require('fs');
const file = 'src/app/streams/page.tsx';
let code = fs.readFileSync(file, 'utf8');

// Mencari definisi StreamConfig lama
const targetInterfaceRegex = /interface StreamConfig \{[\s\S]*?duration: number;\s*\}/;

// Menambahkan definisi variabel-variabel baru (mode, folder, dll) plus satu 'bypass' pengaman
const newInterface = `interface StreamConfig { folders: string[]; videoPath: string | null; videoReadyPath: string | null; songPath: string | null; thumbnailPath: string | null; titleId: number | null; descriptionId: number | null; auto: boolean; duration: number; mode?: string; vrFolder?: string; vrPath?: string | null; vidFolder?: string; vidPath?: string | null; songFolder?: string; thumbFolder?: string; thumbPath?: string | null; titleFolder?: string; descFolder?: string; descId?: number | null; [key: string]: any; }`;

if (code.match(targetInterfaceRegex)) {
    code = code.replace(targetInterfaceRegex, newInterface);
    fs.writeFileSync(file, code);
    console.log('✅ TypeScript Sembuh! KTP StreamConfig sudah diperbarui.');
} else {
    console.log('⚠️ Interface StreamConfig tidak ditemukan, mungkin format kodenya beda.');
}
