import crypto from 'node:crypto';
import { db, save, now, newId } from './db';
import { fail } from './http';
import type { ActivityType, Asset, PublicShare, Share, ShareTheme, Version } from './types';

export function hashPassphrase(pass: string): string {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(pass, salt, 64);
  return `${salt.toString('hex')}:${hash.toString('hex')}`;
}
export function checkPassphrase(pass: string, stored: string): boolean {
  const [saltHex, hashHex] = String(stored).split(':');
  if (!saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, 'hex');
  const actual = crypto.scryptSync(String(pass), Buffer.from(saltHex, 'hex'), expected.length);
  return crypto.timingSafeEqual(actual, expected);
}

export const THEMES: readonly ShareTheme[] = ['dark', 'light', 'neutral'];
const HEX = /^#[0-9a-fA-F]{6}$/;

export const toPublicShare = (s: Share): PublicShare => ({
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
export function applyFields(share: Share, body: Record<string, unknown> | null | undefined): string | null {
  const b = body || {};
  if (b.expiresAt !== undefined) {
    if (b.expiresAt === null || b.expiresAt === '') share.expiresAt = null;
    else {
      const d = new Date(b.expiresAt as string | number);
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
    if (!THEMES.includes(b.theme as ShareTheme)) return 'bad_theme';
    share.theme = b.theme as ShareTheme;
  }
  if (b.accentColor !== undefined) {
    if (b.accentColor === null || b.accentColor === '') share.accentColor = null;
    else if (typeof b.accentColor === 'string' && HEX.test(b.accentColor)) share.accentColor = b.accentColor;
    else return 'bad_accentColor';
  }
  for (const k of ['enabled', 'allowComments', 'allowDownload', 'showAllVersions'] as const) {
    const v = b[k];
    if (v !== undefined) {
      if (typeof v !== 'boolean') return `bad_${k}`;
      share[k] = v;
    }
  }
  if (b.passphrase !== undefined) {
    if (typeof b.passphrase !== 'string') return 'bad_passphrase_value';
    share.passphraseHash = b.passphrase ? hashPassphrase(b.passphrase) : null;
  }
  return null;
}

export function logActivity(share: Share, type: ActivityType, who: string | null = null): void {
  db.activity.push({ id: newId(), shareToken: share.token, assetId: share.assetId, type, who, at: now() });
  if (db.activity.length > 5000) db.activity.splice(0, db.activity.length - 5000);
}

declare global {
  var __videoreviewViewSeen: Set<string> | undefined;
}
const viewSeen: Set<string> = (globalThis.__videoreviewViewSeen ||= new Set()); // `${token}|${versionId}|${minute}`
export function logViewThrottled(share: Share, versionId: string): void {
  const key = `${share.token}|${versionId}|${Math.floor(Date.now() / 60000)}`;
  if (viewSeen.has(key)) return;
  if (viewSeen.size > 2000) viewSeen.clear();
  viewSeen.add(key);
  logActivity(share, 'view');
  save();
}

export const latestVersion = (asset: Asset): Version | null =>
  asset.versions.reduce<Version | null>((m, v) => (!m || v.number > m.number ? v : m), null);

/** Resolve + authorize a public share. Returns {share, asset} or {response} (error Response). */
export type AccessResult = { share: Share; asset: Asset; response?: undefined } | { response: Response };

export function checkAccess(request: Request, token: string, { allowQuery = false }: { allowQuery?: boolean } = {}): AccessResult {
  const share = db.shares.find((s) => s.token === token);
  if (!share) return { response: fail(404, 'not_found') };
  if (share.enabled === false) return { response: fail(403, 'disabled') };
  if (share.expiresAt && new Date(share.expiresAt).getTime() <= Date.now()) {
    return { response: fail(410, 'expired') };
  }
  const asset = db.assets.find((a) => a.id === share.assetId);
  if (!asset) return { response: fail(404, 'not_found') };
  if (share.passphraseHash) {
    let pass: string | null = request.headers.get('x-share-passphrase');
    if (!pass && allowQuery) {
      const p = new URL(request.url).searchParams.get('p');
      if (typeof p === 'string') pass = p;
    }
    if (!pass) return { response: fail(401, 'passphrase_required') };
    if (!checkPassphrase(pass, share.passphraseHash)) return { response: fail(401, 'bad_passphrase') };
  }
  return { share, asset };
}
