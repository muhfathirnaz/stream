const fs = require('fs');
const { Pool } = require('pg');

(async () => {
  console.log('⏳ Memulai upgrade Database...');
  const pool = new Pool({ user: 'postgres', database: 'lofi_dashboard' });
  try {
    await pool.query("ALTER TABLE broadcast_assets ADD COLUMN IF NOT EXISTS category VARCHAR(100) DEFAULT 'Uncategorized'");
    await pool.query("ALTER TABLE schedules ADD COLUMN IF NOT EXISTS options JSONB DEFAULT '{}'::jsonb");
    console.log('✅ Database berhasil di-upgrade!');
  } catch(e) { console.log('⚠️ Warning DB:', e.message); }
  await pool.end();

  console.log('⏳ Memperbarui API Assets & Schedules...');
  // 1. Update API Assets
  let assetsCode = fs.readFileSync('backend/src/routes/assets.js', 'utf8');
  assetsCode = assetsCode.replace(/const \{ type, value, label \} = req\.body;/, "const { type, value, label, category = 'Uncategorized' } = req.body;");
  assetsCode = assetsCode.replace(/VALUES \(\$1, \$2, \$3\)/, "VALUES ($1, $2, $3, $4)");
  assetsCode = assetsCode.replace(/\[type, value, label\]/, "[type, value, label, category]");
  assetsCode = assetsCode.replace(/RETURNING \*/, ", category RETURNING *");
  if (!assetsCode.includes('/text-categories')) {
    assetsCode = assetsCode.replace(/module\.exports = router;/, `
router.post('/move', async (req, res) => {
  try { await req.db.query("UPDATE broadcast_assets SET category = $1 WHERE id = $2", [req.body.category, req.body.id]); res.json({ success: true }); } catch(e) { res.status(500).json({error: e.message}); }
});
router.get('/text-categories', async (req, res) => {
  try { const { rows } = await req.db.query("SELECT DISTINCT category FROM broadcast_assets WHERE category IS NOT NULL AND category != ''"); res.json({ categories: rows.map(r => r.category) }); } catch(e) { res.status(500).json({error: e.message}); }
});
module.exports = router;`);
  }
  fs.writeFileSync('backend/src/routes/assets.js', assetsCode);

  // 2. Update Schedules & Streams API
  let schedCode = fs.readFileSync('backend/src/routes/schedules.js', 'utf8');
  schedCode = schedCode.replace(/const \{ channelId.*?\} = req\.body;/, "const { channelId, scheduledAt, durationSecs, title, options, repeatType } = req.body;");
  schedCode = schedCode.replace(/INSERT INTO schedules.*?RETURNING \*/s, "INSERT INTO schedules (channel_id, scheduled_at, duration_secs, title, status, repeat_type, options) VALUES ($1, $2, $3, $4, 'pending', $5, $6) RETURNING *");
  schedCode = schedCode.replace(/\[channelId, scheduledAt.*?\]/, "[channelId, scheduledAt, durationSecs, title || 'Live Stream', repeatType || 'none', options || {}]");
  fs.writeFileSync('backend/src/routes/schedules.js', schedCode);

  let streamCode = fs.readFileSync('backend/src/routes/streams.js', 'utf8');
  streamCode = streamCode.replace(/req\.localStreamService\.start\(channelId, req\.body\);/, "req.localStreamService.start(channelId, req.body.options || req.body);");
  fs.writeFileSync('backend/src/routes/streams.js', streamCode);
  
  let schedSvc = fs.readFileSync('backend/src/services/SchedulerService.js', 'utf8');
  schedSvc = schedSvc.replace(/this\.localStreamService\.start\(s\.channel_id,[\s\S]*?\}\);/, "this.localStreamService.start(s.channel_id, s.options || s);");
  fs.writeFileSync('backend/src/services/SchedulerService.js', schedSvc);

  // 3. Update Mesin Utama (LocalStreamService)
  let lss = fs.readFileSync('backend/src/services/LocalStreamService.js', 'utf8');
  if (!lss.includes('getRandomFileUnified')) {
    lss = lss.replace(/class LocalStreamService \{/, `class LocalStreamService {
  getRandomFileUnified(baseDir, folderName, regex, excludePaths = []) {
    const fs = require('fs'); const path = require('path');
    if (!fs.existsSync(baseDir)) return null;
    let targetDirs = [];
    if (folderName === '__all__') {
      const items = fs.readdirSync(baseDir); targetDirs.push(baseDir);
      items.forEach(i => { const p = path.join(baseDir, i); if (fs.statSync(p).isDirectory()) targetDirs.push(p); });
    } else targetDirs.push(path.join(baseDir, folderName));
    let allFiles = [];
    for (const d of targetDirs) {
      if (!fs.existsSync(d)) continue;
      fs.readdirSync(d).forEach(f => {
        const fp = path.join(d, f);
        if (fs.statSync(fp).isFile() && regex.test(f) && !excludePaths.includes(fp)) allFiles.push(fp);
      });
    }
    if (allFiles.length === 0) return null;
    return allFiles[Math.floor(Math.random() * allFiles.length)];
  }
  async resolveTextAsset(db, type, folder, specificId) {
    if (specificId) {
       const { rows } = await db.query("SELECT value FROM broadcast_assets WHERE id=$1", [specificId]);
       if (rows.length) return rows[0].value;
    }
    let q = \`SELECT value FROM broadcast_assets WHERE type=$1\`; let p = [type];
    if (folder && folder !== '__all__') { q += " AND category=$2"; p.push(folder); }
    const { rows } = await db.query(q, p);
    if (rows.length) return rows[Math.floor(Math.random() * rows.length)].value;
    return "";
  }
`);
  }
  fs.writeFileSync('backend/src/services/LocalStreamService.js', lss);
  console.log('✅ Tahap 1 Selesai!');
})();
