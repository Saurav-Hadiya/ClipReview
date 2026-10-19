import fs from 'node:fs';
import path from 'node:path';
import { db, save, UPLOAD_DIR } from '@/lib/db.js';
import { json, fail, noContent, readJson } from '@/lib/http.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const STATUSES = ['needs_review', 'in_progress', 'approved'];

function removeFile(filename) {
  if (!filename) return;
  fs.promises.unlink(path.join(UPLOAD_DIR, path.basename(filename))).catch(() => {});
}

export async function GET(request, { params }) {
  const { id } = await params;
  const asset = db.assets.find((a) => a.id === id);
  if (!asset) return fail(404, 'Asset not found');
  return json(asset);
}

export async function PATCH(request, { params }) {
  const { id } = await params;
  const asset = db.assets.find((a) => a.id === id);
  if (!asset) return fail(404, 'Asset not found');
  const body = await readJson(request);
  const { name, status } = body || {};
  if (name !== undefined) {
    if (typeof name !== 'string' || !name.trim() || name.trim().length > 200) {
      return fail(400, 'Name must be a non-empty string up to 200 characters');
    }
  }
  if (status !== undefined && !STATUSES.includes(status)) {
    return fail(400, `Status must be one of: ${STATUSES.join(', ')}`);
  }
  if (name !== undefined) asset.name = name.trim();
  if (status !== undefined) asset.status = status;
  save();
  return json(asset);
}

export async function DELETE(request, { params }) {
  const { id } = await params;
  const idx = db.assets.findIndex((a) => a.id === id);
  if (idx === -1) return fail(404, 'Asset not found');
  const [asset] = db.assets.splice(idx, 1);
  asset.versions.forEach((v) => removeFile(v.filename));
  db.comments = db.comments.filter((c) => c.assetId !== asset.id);
  db.shares = db.shares.filter((s) => s.assetId !== asset.id);
  db.activity = db.activity.filter((x) => x.assetId !== asset.id);
  save();
  return noContent();
}
