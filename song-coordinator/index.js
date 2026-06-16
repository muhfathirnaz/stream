const express = require('express');
const fs = require('fs');
const path = require('path');
const app = express();
app.use(express.json());

const MUSIC_BASE_DIR = '/opt/media/music';
const VIDEO_BASE_DIR = '/opt/media/video';

const activeVideos = {};
const activeSongs = {};

function getRandomFile(baseDir, folder, activeMap) {
    const targetDir = folder && folder !== 'Semua' && folder !== 'default' ? path.join(baseDir, folder) : baseDir;
    if (!fs.existsSync(targetDir)) return null;
    let files = [];
    if (folder && folder !== 'Semua' && folder !== 'default') {
        files = fs.readdirSync(targetDir).filter(f => fs.statSync(path.join(targetDir, f)).isFile()).map(f => path.join(targetDir, f));
    } else {
        const items = fs.readdirSync(baseDir);
        for (const item of items) {
            const itemPath = path.join(baseDir, item);
            if (fs.statSync(itemPath).isDirectory()) {
                const subFiles = fs.readdirSync(itemPath).filter(f => fs.statSync(path.join(itemPath, f)).isFile()).map(f => path.join(itemPath, f));
                files.push(...subFiles);
            } else if (fs.statSync(itemPath).isFile()) {
                files.push(itemPath);
            }
        }
    }
    if (files.length === 0) return null;

    // STRICK MODE: Filter membuang file yang sedang dipakai di stream lain
    const usedFiles = Object.values(activeMap);
    let availableFiles = files.filter(f => !usedFiles.includes(f));

    // Fallback: Jika stok file di folder habis terpakai semua, izinkan duplikat agar tidak error
    if (availableFiles.length === 0) {
        console.log(`[Warning] Stok file di ${folder || 'Semua'} habis terpakai. Mengizinkan duplikat sementara.`);
        availableFiles = files;
    }

    return availableFiles[Math.floor(Math.random() * availableFiles.length)];
}

app.post('/next-video', (req, res) => {
    const { channelId, exactPath } = req.body; 
    let filePath = exactPath;
    if (filePath && !fs.existsSync(filePath)) filePath = null;
    if (!filePath) filePath = getRandomFile(VIDEO_BASE_DIR, 'Semua', activeVideos);
    if (!filePath) return res.status(404).json({ error: `Tidak ada video di Media Pool` });
    activeVideos[channelId] = filePath;
    res.json({ path: filePath, filename: path.basename(filePath) });
});

app.post('/next-song', (req, res) => {
    const { channelId, folder, exactPath } = req.body;
    let filePath = exactPath;
    if (filePath && !fs.existsSync(filePath)) filePath = null;
    if (!filePath) filePath = getRandomFile(MUSIC_BASE_DIR, folder, activeSongs);
    if (!filePath) return res.status(404).json({ error: `Tidak ada lagu di folder: ${folder || 'Semua'}` });
    activeSongs[channelId] = filePath;
    res.json({ path: filePath, filename: path.basename(filePath) });
});

app.post('/release-video', (req, res) => { delete activeVideos[req.body.channelId]; res.json({ success: true }); });
app.post('/release-song', (req, res) => { delete activeSongs[req.body.channelId]; res.json({ success: true }); });

const PORT = process.env.PORT || 8090;
app.listen(PORT, '0.0.0.0', () => console.log(`[song-coordinator] Running on port ${PORT}`));
