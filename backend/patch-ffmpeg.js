const fs = require('fs');
const file = 'src/services/LocalStreamService.js';
let code = fs.readFileSync(file, 'utf8');

// 1. Cari blok FFmpeg yang lama (yang keras kepala me-render ulang)
const targetRegex = /const \{ playlistPath, firstSong, count \} = this\.buildPlaylist\([\s\S]*?-f', 'flv', rtmpUrl,\s*\];/;

const newLogic = `      let playlistPath = '';
      let count = 0;
      let ffmpegArgs = [];

      if (useStreamCopy) {
        // MODE HEMAT CPU: Langsung tembak video dan audio bawaan tanpa diubah!
        await new Promise(resolve => setTimeout(resolve, 8000));
        ffmpegArgs = [
          '-y',
          '-fflags', '+genpts',
          '-re', '-stream_loop', '-1', '-i', finalVideoPath,
          '-t', String(remainingSecs),
          '-c:v', 'copy',
          '-c:a', 'copy',
          '-flvflags', 'no_duration_filesize',
          '-rw_timeout', '10000000',
          '-f', 'flv', rtmpUrl,
        ];
      } else {
        // MODE REGULER: Bikin playlist lagu acak dan gabungkan dengan video loop
        const playlistData = this.buildPlaylist(folder, songPath, streamId);
        playlistPath = playlistData.playlistPath;
        count = playlistData.count;

        await new Promise(resolve => setTimeout(resolve, 8000));

        ffmpegArgs = [
          '-y', 
          '-fflags', '+genpts', 
          '-re', '-stream_loop', '-1', '-i', finalVideoPath, 
          '-fflags', '+genpts',
          '-re', '-f', 'concat', '-safe', '0', '-i', playlistPath, 
          '-t', String(remainingSecs),
          '-c:v', 'libx264', '-preset', 'ultrafast', '-tune', 'zerolatency', '-b:v', '1500k', '-maxrate', '1800k', '-bufsize', '3000k',
          '-vf', 'scale=1280:720,format=yuv420p', '-r', '24', '-g', '48',
          '-c:a', 'aac', '-b:a', '128k', '-ar', '44100', '-ac', '2',
          '-async', '1', 
          '-map', '0:v:0', '-map', '1:a:0', 
          '-max_muxing_queue_size', '4096', 
          '-flvflags', 'no_duration_filesize', 
          '-rw_timeout', '10000000', 
          '-f', 'flv', rtmpUrl,
        ];
      }`;

if (code.match(targetRegex)) {
  code = code.replace(targetRegex, newLogic);
  
  // 2. Perbaiki notifikasi ke UI agar tulisan lagunya akurat
  code = code.replace(/song:\s*\`Playlist \(\$\{count\} lagu\)\`/g, "song: useStreamCopy ? 'Audio Asli Video' : `Playlist (${count} lagu)`");
  code = code.replace(/song:\s*\`Playlist \(\$\{count\} lagu, Diacak\)\`/g, "song: useStreamCopy ? 'Audio Asli Video' : `Playlist (${count} lagu, Diacak)`");

  fs.writeFileSync(file, code);
  console.log('✅ Mesin FFmpeg resmi disembuhkan! Mode Stream Copy sekarang utuh (Video + Audio).');
} else {
  console.log('⚠️ Target script FFmpeg tidak ditemukan.');
}
