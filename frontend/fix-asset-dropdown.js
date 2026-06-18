const fs = require('fs');
const file = 'src/app/streams/page.tsx';
let code = fs.readFileSync(file, 'utf8');

// Mencari definisi fungsi AssetDropdown dan menambahkan property clearText ke dalamnya
const regexTarget = /function AssetDropdown\(\{ label, options, value, onChange, onDelete, placeholder, disabled \}: \{ label: string; options: Asset\[\]; value: number \| null; onChange: \(id: number \| null\) => void; onDelete: \(id: number\) => void; placeholder\?: string; disabled\?: boolean; \}\) \{/;

const newSignature = `function AssetDropdown({ label, options, value, onChange, onDelete, placeholder, disabled, clearText = "— Acak Otomatis —" }: { label: string; options: Asset[]; value: number | null; onChange: (id: number | null) => void; onDelete: (id: number) => void; placeholder?: string; disabled?: boolean; clearText?: string; }) {`;

if (code.match(regexTarget)) {
    code = code.replace(regexTarget, newSignature);
    fs.writeFileSync(file, code);
    console.log("✅ TypeScript Fix berhasil! AssetDropdown sekarang mengenali clearText.");
} else {
    console.log("⚠️ Target AssetDropdown tidak ditemukan, mungkin format kodenya bergeser.");
}
