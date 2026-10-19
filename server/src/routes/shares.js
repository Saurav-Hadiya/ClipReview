import { Router } from 'express';
import crypto from 'node:crypto';
import { db, save, now, findVersion, sendVideo, newId } from '../db.js';

const router = Router();

function hashPass(pass) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(pass, salt, 64);
  return `${salt.toString('hex')}:${hash.toString('hex')}`;
}
function checkPass(pass, stored) {
  const [saltHex, hashHex] = String(stored).split(':');
  if (!saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, 'hex');
  const actual = crypto.scryptSync(String(pass), Buffer.from(saltHex, 'hex'), expected.length);
  return crypto.timingSafeEqual(actual, expected);
}
const publicShare = (s) => ({
  token: s.token,
  assetId: s.assetId,
  createdAt: s.createdAt,
  expiresAt: s.expiresAt,
  allowComments: s.allowComments,
  allowDownload: s.allowDownload,
  hasPassphrase: !!s.passphraseHash,
  url: `/s/${s.token}`,
});

router.post('/assets/:id/shares', (req, res) => {
  const asset = db.assets.find((a) => a.id === req.params.id);
  if (!asset) return res.status(404).json({ error: 'not_found' });
  const { expiresAt, passphrase, allowComments, allowDownload } = req.body || {};
  let exp = null;
  if (expiresAt) {
    const d = new Date(expiresAt);
    if (Number.isNaN(d.getTime())) return res.status(400).json({ error: 'bad_expiresAt' });
    exp = d.toISOString();
  }
  const share = {
    token: crypto.randomBytes(24).toString('base64url'),
    assetId: asset.id,
    createdAt: now(),
    expiresAt: exp,
    passphraseHash: typeof passphrase === 'string' && passphrase ? hashPass(passphrase) : null,
    allowComments: allowComments !== false,
    allowDownload: allowDownload === true,
  };
  db.shares.push(share);
  save();
  res.status(201).json(publicShare(share));
});

router.get('/assets/:id/shares', (req, res) => {
  res.json(db.shares.filter((s) => s.assetId === req.params.id).map(publicShare));
});

router.delete('/shares/:token', (req, res) => {
  const i = db.shares.findIndex((s) => s.token === req.params.token);
  if (i < 0) return res.status(404).json({ error: 'not_found' });
  db.shares.splice(i, 1);
  save();
  res.status(204).end();
});

// Resolve + authorize a public share; sends the error response itself and returns null on failure.
function authorize(req, res, { allowQuery = false } = {}) {
  const share = db.shares.find((s) => s.token === req.params.token);
  if (!share) { res.status(404).json({ error: 'not_found' }); return null; }
  if (share.expiresAt && new Date(share.expiresAt).getTime() <= Date.now()) {
    res.status(410).json({ error: 'expired' }); return null;
  }
  const asset = db.assets.find((a) => a.id === share.assetId);
  if (!asset) { res.status(404).json({ error: 'not_found' }); return null; }
  if (share.passphraseHash) {
    let pass = req.headers['x-share-passphrase'];
    if (!pass && allowQuery && typeof req.query.p === 'string') pass = req.query.p;
    if (!pass) { res.status(401).json({ error: 'passphrase_required' }); return null; }
    if (!checkPass(pass, share.passphraseHash)) { res.status(401).json({ error: 'bad_passphrase' }); return null; }
  }
  return { share, asset };
}

router.get('/public/shares/:token', (req, res) => {
  const ctx = authorize(req, res);
  if (!ctx) return;
  const comments = db.comments
    .filter((c) => c.assetId === ctx.asset.id)
    .sort((a, b) => a.time - b.time);
  res.json({
    asset: ctx.asset,
    share: {
      allowComments: ctx.share.allowComments,
      allowDownload: ctx.share.allowDownload,
      hasPassphrase: !!ctx.share.passphraseHash,
    },
    comments,
  });
});

router.get('/public/shares/:token/media/:versionId', (req, res) => {
  const ctx = authorize(req, res, { allowQuery: true });
  if (!ctx) return;
  const found = findVersion(req.params.versionId);
  if (!found || found.asset.id !== ctx.asset.id) return res.status(404).json({ error: 'not_found' });
  const download = req.query.download === '1' || req.query.download === 'true';
  if (download && !ctx.share.allowDownload) return res.status(403).json({ error: 'download_disabled' });
  sendVideo(req, res, found.version, { download });
});

router.post('/public/shares/:token/comments', (req, res) => {
  const ctx = authorize(req, res);
  if (!ctx) return;
  if (!ctx.share.allowComments) return res.status(403).json({ error: 'comments_disabled' });
  const { versionId, time, endTime, frame, text, author } = req.body || {};
  const found = findVersion(versionId);
  if (!found || found.asset.id !== ctx.asset.id) return res.status(400).json({ error: 'bad_version' });
  const t = Number(time);
  if (time === null || time === undefined || time === '' || !Number.isFinite(t) || t < 0) return res.status(400).json({ error: 'bad_time' });
  const body = typeof text === 'string' ? text.trim() : '';
  if (body.length < 1 || body.length > 2000) return res.status(400).json({ error: 'bad_text' });
  const et = endTime === null || endTime === undefined ? null : Number(endTime);
  if (et !== null && (!Number.isFinite(et) || et < t)) return res.status(400).json({ error: 'bad_endTime' });
  const fr = frame === null || frame === undefined ? null : Number(frame);
  if (fr !== null && !Number.isInteger(fr)) return res.status(400).json({ error: 'bad_frame' });
  const name = typeof author === 'string' && author.trim() ? author.trim().slice(0, 80) : 'Guest';
  const comment = {
    id: newId(), assetId: ctx.asset.id, versionId, time: t, endTime: et, frame: fr,
    text: body, author: name, resolved: false, createdAt: now(),
  };
  db.comments.push(comment);
  save();
  res.status(201).json(comment);
});

export default router;
