import { Router } from 'express';
import { db, newId, now, save } from '../db.js';

const router = Router();

const isNum = (n) => typeof n === 'number' && Number.isFinite(n);
const EXPORT_FPS = 24;

function validAnchor(a) {
  return a && typeof a === 'object' && isNum(a.x) && isNum(a.y) && a.x >= 0 && a.x <= 1 && a.y >= 0 && a.y <= 1;
}

function timecode(t, fps = EXPORT_FPS) {
  const total = Math.max(0, Number(t) || 0);
  const whole = Math.floor(total);
  const f = Math.min(fps - 1, Math.floor((total - whole) * fps + 1e-6));
  const p = (n) => String(n).padStart(2, '0');
  return `${p(Math.floor(whole / 3600))}:${p(Math.floor((whole % 3600) / 60))}:${p(whole % 60)}:${p(f)}`;
}

function csvCell(v) {
  let s = v == null ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; // neutralize spreadsheet formulas
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function sanitizeFilename(s) {
  return String(s || 'comments').replace(/[^A-Za-z0-9._-]+/g, '_').slice(0, 80) || 'comments';
}

function listFor(asset, versionId) {
  return db.comments
    .filter((c) => c.assetId === asset.id && (!versionId || c.versionId === versionId))
    .sort((a, b) => a.time - b.time);
}

router.get('/assets/:id/comments', (req, res) => {
  const asset = db.assets.find((a) => a.id === req.params.id);
  if (!asset) return res.status(404).json({ error: 'asset_not_found' });
  res.json(listFor(asset, req.query.versionId));
});

router.get('/assets/:id/comments/export', (req, res) => {
  const asset = db.assets.find((a) => a.id === req.params.id);
  if (!asset) return res.status(404).json({ error: 'asset_not_found' });
  const format = req.query.format === 'json' ? 'json' : req.query.format === 'csv' || !req.query.format ? 'csv' : null;
  if (!format) return res.status(400).json({ error: 'invalid_format' });
  const list = listFor(asset, req.query.versionId);
  const base = sanitizeFilename(asset.name) + '-comments';
  if (format === 'json') {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${base}.json"`);
    return res.send(JSON.stringify(list, null, 2));
  }
  const header = ['timecode', 'author', 'text', 'internal', 'completed', 'created_at'];
  const rows = list.map((c) => [
    timecode(c.time), c.author, c.text, !!c.internal, !!c.completedAt, c.createdAt,
  ]);
  const csv = [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${base}.csv"`);
  res.send('﻿' + csv);
});

router.post('/assets/:id/comments', (req, res) => {
  const asset = db.assets.find((a) => a.id === req.params.id);
  if (!asset) return res.status(404).json({ error: 'asset_not_found' });
  const { versionId, time, endTime, frame, text, author, parentId, anchor, internal, durationFrames, authorEmail } = req.body || {};
  const body = typeof text === 'string' ? text.trim() : '';
  if (!body) return res.status(400).json({ error: 'text_required' });
  if (body.length > 2000) return res.status(400).json({ error: 'text_too_long' });

  let parent = null;
  if (parentId != null) {
    parent = db.comments.find((c) => c.id === parentId);
    if (!parent || parent.assetId !== asset.id) return res.status(400).json({ error: 'invalid_parent' });
    // replies attach to the thread root (one level of nesting)
    if (parent.parentId) {
      const root = db.comments.find((c) => c.id === parent.parentId);
      if (root) parent = root;
    }
  }

  let vId = versionId; let t = time; let end = endTime; let internalFlag = !!internal;
  if (parent) {
    vId = parent.versionId; t = parent.time; end = parent.endTime ?? null; internalFlag = !!parent.internal;
  }
  if (!asset.versions.some((v) => v.id === vId)) return res.status(400).json({ error: 'invalid_version' });
  if (!isNum(t) || t < 0) return res.status(400).json({ error: 'invalid_time' });
  if (end != null && (!isNum(end) || end < t)) return res.status(400).json({ error: 'invalid_end_time' });
  if (anchor != null && !validAnchor(anchor)) return res.status(400).json({ error: 'invalid_anchor' });
  if (durationFrames != null && !(Number.isInteger(durationFrames) && durationFrames >= 0)) return res.status(400).json({ error: 'invalid_duration' });
  const name = (typeof author === 'string' && author.trim().slice(0, 80)) || 'Anonymous';
  const email = typeof authorEmail === 'string' && authorEmail.trim() ? authorEmail.trim().slice(0, 200) : null;

  const comment = {
    id: newId(),
    assetId: asset.id,
    versionId: vId,
    parentId: parent ? parent.id : null,
    time: t,
    endTime: end ?? null,
    frame: Number.isInteger(frame) ? frame : null,
    durationFrames: parent ? null : (durationFrames ?? null),
    anchor: !parent && anchor ? { x: anchor.x, y: anchor.y } : null,
    text: body,
    author: name,
    authorEmail: email,
    internal: internalFlag,
    resolved: false,
    completedAt: null,
    completedBy: null,
    createdAt: now(),
  };
  db.comments.push(comment);
  save();
  res.status(201).json(comment);
});

router.patch('/comments/:id', (req, res) => {
  const c = db.comments.find((x) => x.id === req.params.id);
  if (!c) return res.status(404).json({ error: 'not_found' });
  const { text, resolved, completed, completedBy } = req.body || {};
  if (text !== undefined) {
    const t = typeof text === 'string' ? text.trim() : '';
    if (!t || t.length > 2000) return res.status(400).json({ error: 'invalid_text' });
    c.text = t;
  }
  const done = completed !== undefined ? !!completed : resolved !== undefined ? !!resolved : undefined;
  if (done !== undefined) {
    c.resolved = done;
    c.completedAt = done ? now() : null;
    c.completedBy = done
      ? (typeof completedBy === 'string' && completedBy.trim() ? completedBy.trim().slice(0, 80) : null)
      : null;
  }
  save();
  res.json(c);
});

router.delete('/comments/:id', (req, res) => {
  const i = db.comments.findIndex((x) => x.id === req.params.id);
  if (i < 0) return res.status(404).json({ error: 'not_found' });
  const id = db.comments[i].id;
  db.comments = db.comments.filter((x) => x.id !== id && x.parentId !== id);
  save();
  res.status(204).end();
});

export default router;
