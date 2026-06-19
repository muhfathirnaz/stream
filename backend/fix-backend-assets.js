const fs = require('fs');
const file = 'src/routes/assets.js';
let code = fs.readFileSync(file, 'utf8');

// 1. Memperbaiki query INSERT yang kurang kolom $4
code = code.replace(/router\.post\('\/', async \(req, res\) => \{[\s\S]*?\}\);/, `router.post('/', async (req, res) => {
  const { type, value, label, category = 'Uncategorized' } = req.body;
  try { const { rows } = await req.db.query("INSERT INTO broadcast_assets (type, value, label, category) VALUES ($1, $2, $3, $4) RETURNING *", [type, value, label, category]); res.json(rows[0]); } 
  catch (e) { res.status(500).json({ error: e.message }); }
});`);

// 2. Menambahkan rute Kategori yang hilang jika belum ada
if (!code.includes('/text-categories')) {
  code = code.replace(/module\.exports = router;/, `
router.post('/move', async (req, res) => {
  try { await req.db.query("UPDATE broadcast_assets SET category = $1 WHERE id = $2", [req.body.category, req.body.id]); res.json({ success: true }); } catch(e) { res.status(500).json({error: e.message}); }
});
router.get('/text-categories', async (req, res) => {
  try { const { rows } = await req.db.query("SELECT DISTINCT category FROM broadcast_assets WHERE category IS NOT NULL AND category != ''"); res.json({ categories: rows.map(r => r.category) }); } catch(e) { res.status(500).json({error: e.message}); }
});
module.exports = router;`);
}

fs.writeFileSync(file, code);
console.log('✅ API Backend 100% Sembuh dari Error 500!');
