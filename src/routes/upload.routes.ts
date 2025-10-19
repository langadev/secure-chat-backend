import { Router } from "express";
import multer from "multer";
import path from "path";
import { requireAuth } from "../middlewares/auth.js";

const uploadDir = path.resolve("uploads");
const storage = multer.diskStorage({
  destination: uploadDir,
  filename: (_req, file, cb) => {
    const unique = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, unique + path.extname(file.originalname));
  },
});

const upload = multer({ storage });
const r = Router();

// POST /upload/image
r.post("/image", requireAuth, upload.single("image"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "NO_FILE" });
  const url = `/uploads/${req.file.filename}`;
  return res.json({ url });
});

export default r;
