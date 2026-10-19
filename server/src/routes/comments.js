import { Router } from 'express';
import { db, newId, now, save } from '../db.js';

const router = Router();

const isNum = (n) => typeof n === 'number' && Number.isFinite(n);

router.get('/assets/:id/comments', (req, res) => {
  const asset = db.assets.find((a) => a.id === req.params.id);
  if (!asset) return res.status(404).json({ error: 'asset_not_found' });
  const { versionId } = req.query;
  const list = db.comments
    .filter((c) => c.assetId === asset.id && (!versionId || c.versionId === versionId))
    .sort((a, b) => a.time - b.time);
  res.json(list);
});

router.post('/assets/:id/comments', (req, res) => {
  const asset = db.assets.find((a) => a.id === req.params.id);
  if (!asset) return res.status(404).json({ error: 'asset_not_found' });
  const { versionId, time, endTime, frame, text, author } = req.body || {};
  if (!asset.versions.some((v) => v.id === versionId)) return res.status(400).json({ error: 'invalid_version' });
  if (!isNum(time) || time < 0) return res.status(400).json({ error: 'invalid_time' });
  if (endTime != null && (!isNum(endTime) || endTime < time)) return res.status(400).json({ error: 'invalid_end_time' });
  const body = typeof text === 'string' ? text.trim() : '';
  if (!body) return res.status(400).json({ error: 'text_required' });
  if (body.length > 2000) return res.status(400).json({ error: 'text_too_long' });
  const name = (typeof author === 'string' && author.trim().slice(0, 80)) || 'Anonymous';
  const comment = {
    id: newId(),
    assetId: asset.id,
    versionId,
    time,
    endTime: endTime ?? null,
    frame: Number.isInteger(frame) ? frame : null,
    text: body,
    author: name,
    resolved: false,
    createdAt: now(),
  };
  db.comments.push(comment);
  save();
  res.status(201).json(comment);
});

router.patch('/comments/:id', (req, res) => {
  const c = db.comments.find((x) => x.id === req.params.id);
  if (!c) return res.status(404).json({ error: 'not_found' });
  const { text, resolved } = req.body || {};
  if (text !== undefined) {
    const t = typeof text === 'string' ? text.trim() : '';
    if (!t || t.length > 2000) return res.status(400).json({ error: 'invalid_text' });
    c.text = t;
  }
  if (resolved !== undefined) c.resolved = !!resolved;
  save();
  res.json(c);
});

router.delete('/comments/:id', (req, res) => {
  const i = db.comments.findIndex((x) => x.id === req.params.id);
  if (i < 0) return res.status(404).json({ error: 'not_found' });
  db.comments.splice(i, 1);
  save();
  res.status(204).end();
});

export default router;
