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

const THEMES = ['dark', 'light', 'neutral'];
const HEX = /^#[0-9a-fA-F]{6}$/;
const publicShare = (s) => ({
  token: s.token,
  assetId: s.assetId,
  createdAt: s.createdAt,
  expiresAt: s.expiresAt,
  allowComments: s.allowComments,
  allowDownload: s.allowDownload,
  hasPassphrase: !!s.passphraseHash,
  name: s.name || '',
  enabled: s.enabled !== false,
  showAllVersions: s.showAllVersions !== false,
  theme: THEMES.includes(s.theme) ? s.theme : 'dark',
  accentColor: s.accentColor || null,
  description: s.description || '',
  url: `/s/${s.token}`,
});

// Validate + apply the editable fields of a share. Returns an error code or null.
function applyFields(share, body) {
  const b = body || {};
  if (b.expiresAt !== undefined) {
    if (b.expiresAt === null || b.expiresAt === '') share.expiresAt = null;
    else {
      const d = new Date(b.expiresAt);
      if (Number.isNaN(d.getTime())) return 'bad_expiresAt';
      share.expiresAt = d.toISOString();
    }
  }
  if (b.name !== undefined) {
    if (typeof b.name !== 'string' || b.name.length > 100) return 'bad_name';
    share.name = b.name.trim();
  }
  if (b.description !== undefined) {
    if (typeof b.description !== 'string' || b.description.length > 1000) return 'bad_description';
    share.description = b.description;
  }
  if (b.theme !== undefined) {
    if (!THEMES.includes(b.theme)) return 'bad_theme';
    share.theme = b.theme;
  }
  if (b.accentColor !== undefined) {
    if (b.accentColor === null || b.accentColor === '') share.accentColor = null;
    else if (typeof b.accentColor === 'string' && HEX.test(b.accentColor)) share.accentColor = b.accentColor;
    else return 'bad_accentColor';
  }
  for (const k of ['enabled', 'allowComments', 'allowDownload', 'showAllVersions']) {
    if (b[k] !== undefined) {
      if (typeof b[k] !== 'boolean') return `bad_${k}`;
      share[k] = b[k];
    }
  }
  if (b.passphrase !== undefined) {
    if (typeof b.passphrase !== 'string') return 'bad_passphrase_value';
    share.passphraseHash = b.passphrase ? hashPass(b.passphrase) : null;
  }
  return null;
}

router.post('/assets/:id/shares', (req, res) => {
  const asset = db.assets.find((a) => a.id === req.params.id);
  if (!asset) return res.status(404).json({ error: 'not_found' });
  const share = {
    token: crypto.randomBytes(24).toString('base64url'),
    assetId: asset.id,
    createdAt: now(),
    expiresAt: null,
    passphraseHash: null,
    allowComments: true,
    allowDownload: false,
    name: '',
    enabled: true,
    showAllVersions: true,
    theme: 'dark',
    accentColor: null,
    description: '',
  };
  const err = applyFields(share, req.body);
  if (err) return res.status(400).json({ error: err });
  db.shares.push(share);
  save();
  res.status(201).json(publicShare(share));
});

router.get('/assets/:id/shares', (req, res) => {
  res.json(db.shares.filter((s) => s.assetId === req.params.id).map(publicShare));
});

router.patch('/shares/:token', (req, res) => {
  const share = db.shares.find((s) => s.token === req.params.token);
  if (!share) return res.status(404).json({ error: 'not_found' });
  const err = applyFields(share, req.body);
  if (err) return res.status(400).json({ error: err });
  save();
  res.json(publicShare(share));
});

router.delete('/shares/:token', (req, res) => {
  const i = db.shares.findIndex((s) => s.token === req.params.token);
  if (i < 0) return res.status(404).json({ error: 'not_found' });
  db.shares.splice(i, 1);
  save(); // activity entries are intentionally kept
  res.status(204).end();
});

router.get('/assets/:id/activity', (req, res) => {
  const list = db.activity
    .filter((a) => a.assetId === req.params.id)
    .sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0))
    .slice(0, 100);
  res.json(list);
});

function logActivity(share, type, who = null) {
  db.activity.push({ id: newId(), shareToken: share.token, assetId: share.assetId, type, who, at: now() });
  if (db.activity.length > 5000) db.activity.splice(0, db.activity.length - 5000);
}
const viewSeen = new Set(); // `${token}|${versionId}|${minute}`
function logViewThrottled(share, versionId) {
  const key = `${share.token}|${versionId}|${Math.floor(Date.now() / 60000)}`;
  if (viewSeen.has(key)) return;
  if (viewSeen.size > 2000) viewSeen.clear();
  viewSeen.add(key);
  logActivity(share, 'view');
  save();
}

const latestVersion = (asset) => asset.versions.reduce((m, v) => (!m || v.number > m.number ? v : m), null);

// Resolve + authorize a public share; sends the error response itself and returns null on failure.
function authorize(req, res, { allowQuery = false } = {}) {
  const share = db.shares.find((s) => s.token === req.params.token);
  if (!share) { res.status(404).json({ error: 'not_found' }); return null; }
  if (share.enabled === false) { res.status(403).json({ error: 'disabled' }); return null; }
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
  const showAll = ctx.share.showAllVersions !== false;
  let versions = ctx.asset.versions;
  if (!showAll) {
    const latest = latestVersion(ctx.asset);
    versions = latest ? [latest] : [];
  }
  const vids = new Set(versions.map((v) => v.id));
  const internalIds = new Set(db.comments.filter((c) => c.assetId === ctx.asset.id && c.internal).map((c) => c.id));
  const comments = db.comments
    .filter((c) => c.assetId === ctx.asset.id && !c.internal && !internalIds.has(c.parentId) && vids.has(c.versionId))
    .sort((a, b) => a.time - b.time);
  logActivity(ctx.share, 'open');
  save();
  res.json({
    asset: { ...ctx.asset, versions },
    share: {
      allowComments: ctx.share.allowComments,
      allowDownload: ctx.share.allowDownload,
      hasPassphrase: !!ctx.share.passphraseHash,
      name: ctx.share.name || '',
      theme: THEMES.includes(ctx.share.theme) ? ctx.share.theme : 'dark',
      accentColor: ctx.share.accentColor || null,
      description: ctx.share.description || '',
      showAllVersions: showAll,
    },
    comments,
  });
});

router.get('/public/shares/:token/media/:versionId', (req, res) => {
  const ctx = authorize(req, res, { allowQuery: true });
  if (!ctx) return;
  const found = findVersion(req.params.versionId);
  if (!found || found.asset.id !== ctx.asset.id) return res.status(404).json({ error: 'not_found' });
  if (ctx.share.showAllVersions === false && latestVersion(ctx.asset)?.id !== found.version.id) {
    return res.status(404).json({ error: 'not_found' });
  }
  const download = req.query.download === '1' || req.query.download === 'true';
  if (download && !ctx.share.allowDownload) return res.status(403).json({ error: 'download_disabled' });
  if (download) { logActivity(ctx.share, 'download'); save(); }
  else logViewThrottled(ctx.share, found.version.id);
  sendVideo(req, res, found.version, { download });
});

router.post('/public/shares/:token/comments', (req, res) => {
  const ctx = authorize(req, res);
  if (!ctx) return;
  if (!ctx.share.allowComments) return res.status(403).json({ error: 'comments_disabled' });
  const { versionId, time, endTime, frame, text, authorName, authorEmail, parentId, anchor, durationFrames } = req.body || {};
  const name = typeof authorName === 'string' ? authorName.trim().slice(0, 80) : '';
  const email = typeof authorEmail === 'string' ? authorEmail.trim().slice(0, 200) : '';
  if (!name) return res.status(400).json({ error: 'authorName_required' });
  if (!email || !/^[^\s@]+@[^\s@]+$/.test(email)) return res.status(400).json({ error: 'authorEmail_required' });
  const body = typeof text === 'string' ? text.trim() : '';
  if (body.length < 1 || body.length > 2000) return res.status(400).json({ error: 'bad_text' });

  let vId = versionId;
  let t = Number(time);
  let parent = null;
  if (parentId !== undefined && parentId !== null && parentId !== '') {
    parent = db.comments.find((c) => c.id === parentId && c.assetId === ctx.asset.id);
    const grand = parent && parent.parentId ? db.comments.find((c) => c.id === parent.parentId) : null;
    if (!parent || parent.internal || (grand && grand.internal)) return res.status(400).json({ error: 'bad_parent' });
    vId = parent.versionId;
    t = parent.time;
  }
  const found = findVersion(vId);
  if (!found || found.asset.id !== ctx.asset.id) return res.status(400).json({ error: 'bad_version' });
  if (ctx.share.showAllVersions === false && latestVersion(ctx.asset)?.id !== found.version.id) {
    return res.status(400).json({ error: 'bad_version' });
  }
  if (!parent && (time === null || time === undefined || time === '' || !Number.isFinite(t) || t < 0)) {
    return res.status(400).json({ error: 'bad_time' });
  }
  const et = parent || endTime === null || endTime === undefined ? null : Number(endTime);
  if (et !== null && (!Number.isFinite(et) || et < t)) return res.status(400).json({ error: 'bad_endTime' });
  const fr = parent ? (parent.frame ?? null) : frame === null || frame === undefined ? null : Number(frame);
  if (fr !== null && !Number.isInteger(fr)) return res.status(400).json({ error: 'bad_frame' });
  const df = parent || durationFrames === null || durationFrames === undefined ? null : Number(durationFrames);
  if (df !== null && (!Number.isInteger(df) || df < 0)) return res.status(400).json({ error: 'bad_durationFrames' });
  let anc = null;
  if (!parent && anchor !== null && anchor !== undefined) {
    const x = Number(anchor.x);
    const y = Number(anchor.y);
    if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > 1 || y < 0 || y > 1) {
      return res.status(400).json({ error: 'bad_anchor' });
    }
    anc = { x, y };
  }
  const comment = {
    id: newId(), assetId: ctx.asset.id, versionId: vId, time: t, endTime: et, frame: fr,
    text: body, author: name, authorEmail: email, resolved: false, createdAt: now(),
    parentId: parent ? parent.id : null, completedAt: null, completedBy: null,
    durationFrames: df, anchor: anc, internal: false,
  };
  db.comments.push(comment);
  logActivity(ctx.share, 'comment', name);
  save();
  res.status(201).json(comment);
});

export default router;
