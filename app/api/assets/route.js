import fs from 'node:fs';
import path from 'node:path';
import { db, newId, now, save, UPLOAD_DIR } from '@/lib/db.js';
import { json, fail } from '@/lib/http.js';
import { parseVideoUpload } from '@/lib/upload.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UPLOAD_ERRORS = {
  only_video_allowed: 'Only video files are accepted',
  file_too_large: 'File too large (max 2GB)',
  file_required: 'Missing file (multipart field "file")',
};

export async function GET() {
  const list = [...db.assets].sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
  return json(list);
}

export async function POST(request) {
  let up;
  try {
    up = await parseVideoUpload(request);
  } catch (err) {
    if (err && err.status) return fail(err.status, UPLOAD_ERRORS[err.code] || err.code);
    return fail(500, 'Upload failed');
  }
  const { fields, file: f } = up;
  let name = typeof fields.name === 'string' ? fields.name.trim() : '';
  if (name.length > 200) {
    fs.promises.unlink(path.join(UPLOAD_DIR, f.filename)).catch(() => {});
    return fail(400, 'Name too long (max 200)');
  }
  if (!name) name = path.basename(f.originalName || 'Untitled', path.extname(f.originalName || '')) || 'Untitled';
  const t = now();
  const asset = {
    id: newId(),
    name,
    status: 'needs_review',
    createdAt: t,
    versions: [{
      id: newId(),
      number: 1,
      filename: f.filename,
      originalName: f.originalName,
      mime: f.mime,
      size: f.size,
      createdAt: t,
    }],
  };
  db.assets.push(asset);
  save();
  return json(asset, 201);
}
