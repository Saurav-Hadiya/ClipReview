import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

const here = path.dirname(fileURLToPath(import.meta.url));
export const DATA_DIR = path.resolve(here, '../data');
export const UPLOAD_DIR = path.resolve(here, '../uploads');
const FILE = path.join(DATA_DIR, 'db.json');

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

let state = { assets: [], comments: [], shares: [], activity: [] };
if (fs.existsSync(FILE)) {
  try { state = { ...state, ...JSON.parse(fs.readFileSync(FILE, 'utf8')) }; } catch { /* start empty */ }
}

const STATUS_MIGRATION = { in_review: 'needs_review', needs_changes: 'in_progress' };
for (const a of state.assets) if (STATUS_MIGRATION[a.status]) a.status = STATUS_MIGRATION[a.status];
if (!Array.isArray(state.activity)) state.activity = [];

export const db = state;
export const newId = () => crypto.randomUUID();
export const now = () => new Date().toISOString();

export function save() {
  const tmp = FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
  fs.renameSync(tmp, FILE);
}

export function findVersion(versionId) {
  for (const asset of state.assets) {
    const version = asset.versions.find((v) => v.id === versionId);
    if (version) return { asset, version };
  }
  return null;
}

/** Stream a stored file with HTTP Range support. */
export function sendVideo(req, res, version, { download = false } = {}) {
  const file = path.join(UPLOAD_DIR, version.filename);
  if (!fs.existsSync(file)) return res.status(404).json({ error: 'file_missing' });
  const size = fs.statSync(file).size;
  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Content-Type', version.mime || 'application/octet-stream');
  if (download) {
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(version.originalName)}`);
  }
  const range = req.headers.range;
  if (!range) {
    res.setHeader('Content-Length', size);
    return fs.createReadStream(file).pipe(res);
  }
  const m = /bytes=(\d*)-(\d*)/.exec(range);
  let start = m && m[1] ? parseInt(m[1], 10) : 0;
  let end = m && m[2] ? parseInt(m[2], 10) : size - 1;
  if (m && !m[1] && m[2]) { start = Math.max(0, size - parseInt(m[2], 10)); end = size - 1; }
  if (end >= size) end = size - 1;
  if (start >= size || start > end) {
    res.setHeader('Content-Range', `bytes */${size}`);
    return res.status(416).end();
  }
  res.status(206);
  res.setHeader('Content-Range', `bytes ${start}-${end}/${size}`);
  res.setHeader('Content-Length', end - start + 1);
  fs.createReadStream(file, { start, end }).pipe(res);
}
