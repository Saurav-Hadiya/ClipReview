import crypto from 'node:crypto';
import { db, save, now, newId } from './db.js';
import { fail } from './http.js';

export function hashPassphrase(pass) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(pass, salt, 64);
  return `${salt.toString('hex')}:${hash.toString('hex')}`;
}
export function checkPassphrase(pass, stored) {
  const [saltHex, hashHex] = String(stored).split(':');
  if (!saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, 'hex');
  const actual = crypto.scryptSync(String(pass), Buffer.from(saltHex, 'hex'), expected.length);
  return crypto.timingSafeEqual(actual, expected);
}

export const THEMES = ['dark', 'light', 'neutral'];
const HEX = /^#[0-9a-fA-F]{6}$/;

export const toPublicShare = (s) => ({
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

/** Validate + apply the editable fields of a share. Returns an error code or null. */
export function applyFields(share, body) {
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
    share.passphraseHash = b.passphrase ? hashPassphrase(b.passphrase) : null;
  }
  return null;
}

export function logActivity(share, type, who = null) {
  db.activity.push({ id: newId(), shareToken: share.token, assetId: share.assetId, type, who, at: now() });
  if (db.activity.length > 5000) db.activity.splice(0, db.activity.length - 5000);
}

const g = globalThis;
const viewSeen = (g.__videoreviewViewSeen ||= new Set()); // `${token}|${versionId}|${minute}`
export function logViewThrottled(share, versionId) {
  const key = `${share.token}|${versionId}|${Math.floor(Date.now() / 60000)}`;
  if (viewSeen.has(key)) return;
  if (viewSeen.size > 2000) viewSeen.clear();
  viewSeen.add(key);
  logActivity(share, 'view');
  save();
}

export const latestVersion = (asset) =>
  asset.versions.reduce((m, v) => (!m || v.number > m.number ? v : m), null);

/** Resolve + authorize a public share. Returns {share, asset} or {response} (error Response). */
export function checkAccess(request, token, { allowQuery = false } = {}) {
  const share = db.shares.find((s) => s.token === token);
  if (!share) return { response: fail(404, 'not_found') };
  if (share.enabled === false) return { response: fail(403, 'disabled') };
  if (share.expiresAt && new Date(share.expiresAt).getTime() <= Date.now()) {
    return { response: fail(410, 'expired') };
  }
  const asset = db.assets.find((a) => a.id === share.assetId);
  if (!asset) return { response: fail(404, 'not_found') };
  if (share.passphraseHash) {
    let pass = request.headers.get('x-share-passphrase');
    if (!pass && allowQuery) {
      const p = new URL(request.url).searchParams.get('p');
      if (typeof p === 'string') pass = p;
    }
    if (!pass) return { response: fail(401, 'passphrase_required') };
    if (!checkPassphrase(pass, share.passphraseHash)) return { response: fail(401, 'bad_passphrase') };
  }
  return { share, asset };
}
