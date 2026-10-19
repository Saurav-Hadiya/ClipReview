import { Router } from 'express';
import multer from 'multer';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { db, newId, now, save, findVersion, sendVideo, UPLOAD_DIR } from '../db.js';

const router = Router();
const STATUSES = ['needs_review', 'in_progress', 'approved'];
const MAX_SIZE = 2 * 1024 * 1024 * 1024;

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase().replace(/[^.a-z0-9]/g, '').slice(0, 10);
    cb(null, crypto.randomBytes(16).toString('hex') + ext);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: MAX_SIZE, files: 1 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype && file.mimetype.startsWith('video/')) return cb(null, true);
    cb(Object.assign(new Error('Only video files are accepted'), { code: 'NOT_VIDEO' }));
  },
}).single('file');

function uploadMiddleware(req, res, next) {
  upload(req, res, (err) => {
    if (!err) return next();
    if (err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'File too large (max 2GB)' });
    if (err.code === 'NOT_VIDEO') return res.status(400).json({ error: err.message });
    if (err instanceof multer.MulterError) return res.status(400).json({ error: err.message });
    return res.status(500).json({ error: 'Upload failed' });
  });
}

function removeFile(filename) {
  if (!filename) return;
  fs.promises.unlink(path.join(UPLOAD_DIR, path.basename(filename))).catch(() => {});
}

router.get('/assets', (req, res) => {
  const list = [...db.assets].sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
  res.json(list);
});

router.post('/assets', uploadMiddleware, (req, res) => {
  const f = req.file;
  if (!f) return res.status(400).json({ error: 'Missing file (multipart field "file")' });
  let name = req.body && typeof req.body.name === 'string' ? req.body.name.trim() : '';
  if (name.length > 200) {
    removeFile(f.filename);
    return res.status(400).json({ error: 'Name too long (max 200)' });
  }
  if (!name) name = path.basename(f.originalname || 'Untitled', path.extname(f.originalname || '')) || 'Untitled';
  const t = now();
  const asset = {
    id: newId(),
    name,
    status: 'needs_review',
    createdAt: t,
    versions: [{
      id: newId(),
      number: 1,
      filename: f.filename,
      originalName: f.originalname,
      mime: f.mimetype,
      size: f.size,
      createdAt: t,
    }],
  };
  db.assets.push(asset);
  save();
  res.status(201).json(asset);
});

router.get('/assets/:id', (req, res) => {
  const asset = db.assets.find((a) => a.id === req.params.id);
  if (!asset) return res.status(404).json({ error: 'Asset not found' });
  res.json(asset);
});

router.patch('/assets/:id', (req, res) => {
  const asset = db.assets.find((a) => a.id === req.params.id);
  if (!asset) return res.status(404).json({ error: 'Asset not found' });
  const { name, status } = req.body || {};
  if (name !== undefined) {
    if (typeof name !== 'string' || !name.trim() || name.trim().length > 200) {
      return res.status(400).json({ error: 'Name must be a non-empty string up to 200 characters' });
    }
  }
  if (status !== undefined && !STATUSES.includes(status)) {
    return res.status(400).json({ error: `Status must be one of: ${STATUSES.join(', ')}` });
  }
  if (name !== undefined) asset.name = name.trim();
  if (status !== undefined) asset.status = status;
  save();
  res.json(asset);
});

router.delete('/assets/:id', (req, res) => {
  const idx = db.assets.findIndex((a) => a.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Asset not found' });
  const [asset] = db.assets.splice(idx, 1);
  asset.versions.forEach((v) => removeFile(v.filename));
  db.comments = db.comments.filter((c) => c.assetId !== asset.id);
  db.shares = db.shares.filter((s) => s.assetId !== asset.id);
  db.activity = db.activity.filter((x) => x.assetId !== asset.id);
  save();
  res.status(204).end();
});

router.get('/media/:versionId', (req, res) => {
  const found = findVersion(req.params.versionId);
  if (!found) return res.status(404).json({ error: 'Version not found' });
  sendVideo(req, res, found.version);
});

export default router;
