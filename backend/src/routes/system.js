/**
 * GET /api/system — VPS resource usage
 * Dipanggil dashboard tiap 15 menit (sesuai arsitektur)
 */

const router = require('express').Router();
const { execSync } = require('child_process');

function getCpuPercent() {
  try {
    const out = execSync("top -bn1 | grep 'Cpu(s)' | awk '{print $2}'").toString().trim();
    return parseFloat(out) || 0;
  } catch { return 0; }
}

function getMemInfo() {
  try {
    const out = execSync("free -m | awk 'NR==2{print $2,$3}'").toString().trim();
    const [total, used] = out.split(' ').map(Number);
    return { totalMb: total, usedMb: used, percent: Math.round((used / total) * 100) };
  } catch { return { totalMb: 0, usedMb: 0, percent: 0 }; }
}

function getDiskInfo() {
  try {
    const out = execSync("df -m / | awk 'NR==2{print $2,$3}'").toString().trim();
    const [total, used] = out.split(' ').map(Number);
    return { totalMb: total, usedMb: used, percent: Math.round((used / total) * 100) };
  } catch { return { totalMb: 0, usedMb: 0, percent: 0 }; }
}

router.get('/', (req, res) => {
  res.json({
    cpu: { percent: getCpuPercent() },
    memory: getMemInfo(),
    disk: getDiskInfo(),
    uptime: process.uptime(),
    ts: new Date().toISOString(),
  });
});

module.exports = router;
