import { Router } from 'express';
import multer from 'multer';
import crypto from 'node:crypto';
import path from 'node:path';
import { db, save, newId, now, UPLOAD_DIR } from '../db.js';

const router = Router();

const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname || '').replace(/[^.\w]/g, '').slice(0, 10);
      cb(null, crypto.randomBytes(16).toString('hex') + ext);
    },
  }),
  fileFilter: (_req, file, cb) => {
    if (/^video\//.test(file.mimetype)) return cb(null, true);
    cb(Object.assign(new Error('video_only'), { status: 400 }));
  },
});

router.post('/assets/:id/versions', (req, res, next) => {
  const asset = db.assets.find((a) => a.id === req.params.id);
  if (!asset) return res.status(404).json({ error: 'not_found' });
  upload.single('file')(req, res, (err) => {
    if (err) return next(Object.assign(err, { status: err.status || 400 }));
    if (!req.file) return res.status(400).json({ error: 'file_required' });
    const number = asset.versions.reduce((m, v) => Math.max(m, v.number), 0) + 1;
    asset.versions.push({
      id: newId(),
      number,
      filename: req.file.filename,
      originalName: req.file.originalname,
      mime: req.file.mimetype,
      size: req.file.size,
      createdAt: now(),
    });
    asset.status = 'needs_review';
    save();
    res.status(201).json(asset);
  });
});

export default router;
