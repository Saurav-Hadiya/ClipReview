import { db, save, newId, now } from '@/lib/db.js';
import { json, fail } from '@/lib/http.js';
import { parseVideoUpload } from '@/lib/upload.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CODES = { only_video_allowed: 'video_only' };

export async function POST(request, { params }) {
  const { id } = await params;
  const asset = db.assets.find((a) => a.id === id);
  if (!asset) return fail(404, 'not_found');
  let up;
  try {
    up = await parseVideoUpload(request);
  } catch (err) {
    if (err && err.status) return fail(err.status, CODES[err.code] || err.code);
    return fail(400, 'upload_failed');
  }
  const f = up.file;
  const number = asset.versions.reduce((m, v) => Math.max(m, v.number), 0) + 1;
  asset.versions.push({
    id: newId(),
    number,
    filename: f.filename,
    originalName: f.originalName,
    mime: f.mime,
    size: f.size,
    createdAt: now(),
  });
  asset.status = 'needs_review';
  save();
  return json(asset, 201);
}
