/**
 * Media Pool Backend
 * Node.js + Express
 *
 * Endpoints:
 *   POST /upload         — upload file ke /media/{type}/{category}/
 *   POST /sync           — trigger rclone sync ke GDrive
 *   GET  /media/:type/:category/:filename  — serve file
 *   GET  /files          — list semua file dari disk
 *   DELETE /files/:type/:category/:filename — hapus file
 *
 * Install:
 *   npm install express multer cors
 *
 * Jalankan:
 *   node media-pool-server.js
 */

const express = require("express");
const multer  = require("multer");
const cors    = require("cors");
const path    = require("path");
const fs      = require("fs");
const { execFile } = require("child_process");

// ─── CONFIG ────────────────────────────────────────────────────────────────────
const PORT        = 3002;
const MEDIA_ROOT  = path.join(__dirname, "media");   // /media/music/Rainy/, /media/video/Overlay/
const GDRIVE_REMOTE = "gdrive:gdrive";           // ganti nama remote rclone lo + folder GDrive

// ─── SETUP MEDIA_ROOT ──────────────────────────────────────────────────────────
["music", "video"].forEach((t) => {
  const dir = path.join(MEDIA_ROOT, t);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// ─── MULTER STORAGE ────────────────────────────────────────────────────────────
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const type     = req.body.type     || "music";  // music | video
    const category = req.body.category || "Uncategorized";

    // Sanitize: hapus karakter berbahaya dari nama kategori
    const safeCategory = category.replace(/[^a-zA-Z0-9 _\-]/g, "").trim();
    const dir = path.join(MEDIA_ROOT, type, safeCategory);

    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    // Jaga nama asli file, tapi hapus karakter aneh
    const safe = file.originalname.replace(/[^a-zA-Z0-9._\- ]/g, "_");
    cb(null, safe);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 * 1024 }, // 2GB max
  fileFilter: (req, file, cb) => {
    const allowed = [
      ".mp3", ".wav", ".flac", ".ogg", ".aac", ".m4a",   // music
      ".mp4", ".webm", ".mkv", ".mov", ".avi"              // video
    ];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) cb(null, true);
    else cb(new Error(`Tipe file tidak diizinkan: ${ext}`));
  },
});

// ─── APP ───────────────────────────────────────────────────────────────────────
const app = express();
app.use(cors());
app.use(express.json());

// ── Static serve media ──
app.use("/media", express.static(MEDIA_ROOT, {
  setHeaders: (res) => {
    res.setHeader("Accept-Ranges", "bytes");   // support audio range requests
  }
}));

// ── POST /upload ──────────────────────────────────────────────────────────────
app.post("/upload", upload.single("file"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Tidak ada file" });

  const { type, category } = req.body;
  const info = {
    name:     req.file.filename,
    size:     req.file.size,
    type:     type || "music",
    category: category || "Uncategorized",
    path:     req.file.path,
    url:      `/media/${type}/${encodeURIComponent(category)}/${encodeURIComponent(req.file.filename)}`,
  };

  console.log(`[UPLOAD] ${info.type}/${info.category}/${info.name} (${(info.size / 1024 / 1024).toFixed(1)} MB)`);

  // Auto-sync ke GDrive setelah upload (background, non-blocking)
  triggerRclone().catch((err) => console.error("[AUTO-SYNC] Error:", err));

  res.json({ success: true, file: info });
});

// ── POST /sync ────────────────────────────────────────────────────────────────
app.post("/sync", async (req, res) => {
  console.log("[SYNC] Manual sync diminta...");
  try {
    const result = await triggerRclone();
    res.json({ success: true, output: result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── GET /files ────────────────────────────────────────────────────────────────
app.get("/files", (req, res) => {
  const result = [];

  ["music", "video"].forEach((type) => {
    const typeDir = path.join(MEDIA_ROOT, type);
    if (!fs.existsSync(typeDir)) return;

    fs.readdirSync(typeDir).forEach((category) => {
      const catDir = path.join(typeDir, category);
      if (!fs.statSync(catDir).isDirectory()) return;

      fs.readdirSync(catDir).forEach((filename) => {
        const filePath = path.join(catDir, filename);
        const stat = fs.statSync(filePath);
        if (!stat.isFile()) return;

        result.push({
          id:       `${type}-${category}-${filename}`,
          name:     filename,
          size:     stat.size,
          type,
          category,
          url:      `/media/${type}/${encodeURIComponent(category)}/${encodeURIComponent(filename)}`,
          modified: stat.mtime,
        });
      });
    });
  });

  res.json({ files: result, total: result.length });
});

// ── GET /categories ───────────────────────────────────────────────────────────
app.get("/categories/:type", (req, res) => {
  const typeDir = path.join(MEDIA_ROOT, req.params.type);
  if (!fs.existsSync(typeDir)) return res.json({ categories: [] });

  const categories = fs.readdirSync(typeDir)
    .filter((d) => fs.statSync(path.join(typeDir, d)).isDirectory());

  res.json({ categories });
});

// ── DELETE /files/:type/:category/:filename ───────────────────────────────────
app.delete("/files/:type/:category/:filename", (req, res) => {
  const { type, category, filename } = req.params;

  // Validasi path untuk mencegah path traversal
  const safe = (s) => s.replace(/\.\./g, "").replace(/[/\\]/g, "");
  const filePath = path.join(MEDIA_ROOT, safe(type), safe(category), safe(filename));

  if (!filePath.startsWith(MEDIA_ROOT)) {
    return res.status(400).json({ error: "Path tidak valid" });
  }

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: "File tidak ditemukan" });
  }

  fs.unlinkSync(filePath);
  console.log(`[DELETE] ${type}/${category}/${filename}`);

  // Auto-sync setelah delete
  triggerRclone().catch(console.error);

  res.json({ success: true });
});

// ─── RCLONE SYNC ──────────────────────────────────────────────────────────────
function triggerRclone() {
  return new Promise((resolve, reject) => {
    console.log(`[RCLONE] Sync ${MEDIA_ROOT} → ${GDRIVE_REMOTE}`);

    execFile("rclone", [
      "sync",
      MEDIA_ROOT,
      GDRIVE_REMOTE,
      "--progress",
      "--log-level", "INFO",
      "--transfers", "4",
      "--checkers", "8",
    ], { timeout: 5 * 60 * 1000 }, (err, stdout, stderr) => {
      if (err) {
        console.error("[RCLONE] Error:", stderr || err.message);
        reject(new Error(stderr || err.message));
      } else {
        console.log("[RCLONE] Selesai:", stdout || "OK");
        resolve(stdout);
      }
    });
  });
}

// ─── ERROR HANDLER ────────────────────────────────────────────────────────────
app.use((err, req, res, _next) => {
  console.error("[ERROR]", err.message);
  res.status(err.status || 500).json({ error: err.message });
});

// ─── START ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════╗
║       Media Pool Server v1.0         ║
╠══════════════════════════════════════╣
║  Port   : ${PORT}                       ║
║  Media  : ${MEDIA_ROOT}
║  GDrive : ${GDRIVE_REMOTE}              ║
╚══════════════════════════════════════╝
  `);
});
