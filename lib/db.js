import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

// VR_DATA_DIR / VR_UPLOAD_DIR let tests run against a scratch copy instead of real data.
export const DATA_DIR = process.env.VR_DATA_DIR || path.join(process.cwd(), 'data');
export const UPLOAD_DIR = process.env.VR_UPLOAD_DIR || path.join(process.cwd(), 'uploads');
const FILE = path.join(DATA_DIR, 'db.json');

const STATUS_MIGRATION = { in_review: 'needs_review', needs_changes: 'in_progress' };

function load() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  let state = { assets: [], comments: [], shares: [], activity: [] };
  if (fs.existsSync(FILE)) {
    try { state = { ...state, ...JSON.parse(fs.readFileSync(FILE, 'utf8')) }; } catch { /* start empty */ }
  }
  for (const a of state.assets) if (STATUS_MIGRATION[a.status]) a.status = STATUS_MIGRATION[a.status];
  if (!Array.isArray(state.activity)) state.activity = [];
  return state;
}

// Keep ONE state object across Next.js hot reloads and across route-handler module instances.
const g = globalThis;
if (!g.__videoreviewDb) g.__videoreviewDb = load();

/** Mutable singleton. Always read db.comments / db.shares / db.activity fresh (routes may reassign them). */
export const db = g.__videoreviewDb;
export const newId = () => crypto.randomUUID();
export const now = () => new Date().toISOString();

export function save() {
  const tmp = FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, FILE);
}

export function findVersion(versionId) {
  for (const asset of db.assets) {
    const version = asset.versions.find((v) => v.id === versionId);
    if (version) return { asset, version };
  }
  return null;
}
