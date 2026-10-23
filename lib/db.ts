import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import type { Asset, AssetStatus, Comment, Database, Share, Version } from './types';

// VR_DATA_DIR / VR_UPLOAD_DIR let tests run against a scratch copy instead of real data.
export const DATA_DIR = process.env.VR_DATA_DIR || path.join(process.cwd(), 'data');
export const UPLOAD_DIR = process.env.VR_UPLOAD_DIR || path.join(process.cwd(), 'uploads');
const FILE = path.join(DATA_DIR, 'db.json');

// Legacy status values that may still be present in old db.json files.
const STATUS_MIGRATION: Record<string, AssetStatus> = { in_review: 'needs_review', needs_changes: 'in_progress' };

// Defaults for fields that older db.json records may lack (spread first, stored values win).
const COMMENT_DEFAULTS: Partial<Comment> = {
  endTime: null, frame: null, durationFrames: null, parentId: null, anchor: null,
  authorEmail: null, internal: false, completedAt: null, completedBy: null,
};
const SHARE_DEFAULTS: Partial<Share> = {
  name: '', enabled: true, showAllVersions: true, theme: 'dark',
  accentColor: null, description: '', passphraseHash: null, expiresAt: null,
};

function load(): Database {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  let state: Database = { assets: [], comments: [], shares: [], activity: [] };
  if (fs.existsSync(FILE)) {
    try { state = { ...state, ...(JSON.parse(fs.readFileSync(FILE, 'utf8')) as Partial<Database>) }; } catch { /* start empty */ }
  }
  for (const a of state.assets) {
    const migrated = STATUS_MIGRATION[a.status];
    if (migrated) a.status = migrated;
  }
  if (!Array.isArray(state.activity)) state.activity = [];
  // Records written by older versions lack newer fields; fill the documented defaults so the
  // runtime data really matches the types (the routes already treated missing as these defaults).
  state.comments = state.comments.map((c): Comment => ({
    ...COMMENT_DEFAULTS, ...c, resolved: c.resolved ?? Boolean(c.completedAt),
  }));
  state.shares = state.shares.map((s): Share => ({ ...SHARE_DEFAULTS, ...s }));
  return state;
}

declare global {
  var __videoreviewDb: Database | undefined;
}

// Keep ONE state object across Next.js hot reloads and across route-handler module instances.
if (!globalThis.__videoreviewDb) globalThis.__videoreviewDb = load();

/** Mutable singleton. Always read db.comments / db.shares / db.activity fresh (routes may reassign them). */
export const db: Database = globalThis.__videoreviewDb;
export const newId = (): string => crypto.randomUUID();
export const now = (): string => new Date().toISOString();

export function save(): void {
  const tmp = FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, FILE);
}

export function findVersion(versionId: string): { asset: Asset; version: Version } | null {
  for (const asset of db.assets) {
    const version = asset.versions.find((v) => v.id === versionId);
    if (version) return { asset, version };
  }
  return null;
}
