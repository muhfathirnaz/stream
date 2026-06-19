const fs = require('fs');
const path = 'src/routes/assets.js';
let apiCode = fs.readFileSync(path, 'utf8');

const newRoutes = `
router.post('/text-categories', async (req, res) => {
  try {
    try {
      await req.db.query("INSERT INTO broadcast_assets (type, value, label, category) VALUES ('category_marker', '', '', $1)", [req.body.name]);
    } catch(err) {
      await req.db.query("ALTER TABLE broadcast_assets ADD COLUMN IF NOT EXISTS category VARCHAR(100) DEFAULT 'Uncategorized'");
      await req.db.query("INSERT INTO broadcast_assets (type, value, label, category) VALUES ('category_marker', '', '', $1)", [req.body.name]);
    }
    res.json({ success: true });
  } catch(e) { res.status(500).json({error: e.message}); }
});

router.delete('/text-categories/:name', async (req, res) => {
  try {
    const cat = req.params.name;
    // Hapus markernya
    await req.db.query("DELETE FROM broadcast_assets WHERE type = 'category_marker' AND category = $1", [cat]);
    // Amankan teks di dalamnya ke Uncategorized
    await req.db.query("UPDATE broadcast_assets SET category = 'Uncategorized' WHERE category = $1", [cat]);
    res.json({ success: true });
  } catch(e) { res.status(500).json({error: e.message}); }
});
`;

if (!apiCode.includes('/text-categories/:name')) {
    apiCode = apiCode.replace(/module\.exports = router;/, newRoutes + '\nmodule.exports = router;');
    fs.writeFileSync(path, apiCode);
    console.log('✅ API Backend: Jalur buat hapus folder teks sukses dibikin!');
}
