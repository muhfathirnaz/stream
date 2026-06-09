// src/routes/metrics.js
const router = require('express').Router();

// GET /api/metrics — aggregate dari DB (di-isi oleh Automation 3 n8n)
router.get('/', async (req, res) => {
  try {
    const [watchHrs, subs, revenue] = await Promise.all([
      req.db.query('SELECT SUM(watch_hours) as total FROM daily_metrics WHERE recorded_at > NOW() - INTERVAL \'30 days\''),
      req.db.query('SELECT SUM(subscriber_gain) as total FROM daily_metrics WHERE recorded_at > NOW() - INTERVAL \'7 days\''),
      req.db.query('SELECT SUM(estimated_revenue_usd) as total FROM daily_metrics WHERE recorded_at > NOW() - INTERVAL \'30 days\''),
    ]);

    res.json({
      watchHours30d: watchHrs.rows[0].total || 0,
      subGain7d: subs.rows[0].total || 0,
      revenue30d: revenue.rows[0].total || 0,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;


// ─────────────────────────────────────────────────────────────────────────────
// src/routes/system.js — VPS resource usage
// ─────────────────────────────────────────────────────────────────────────────

// (Terpisah di file beda, tapi digabung di sini untuk kesederhanaan)
// Di production: pisahkan ke file sendiri dan require di server.js
