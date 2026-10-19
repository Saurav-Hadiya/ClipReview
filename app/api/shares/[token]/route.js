import { db, save } from '@/lib/db.js';
import { json, fail, noContent, readJson } from '@/lib/http.js';
import { applyFields, toPublicShare } from '@/lib/shares.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function PATCH(request, { params }) {
  const { token } = await params;
  const share = db.shares.find((s) => s.token === token);
  if (!share) return fail(404, 'not_found');
  const err = applyFields(share, await readJson(request));
  if (err) return fail(400, err);
  save();
  return json(toPublicShare(share));
}

export async function DELETE(request, { params }) {
  const { token } = await params;
  const i = db.shares.findIndex((s) => s.token === token);
  if (i < 0) return fail(404, 'not_found');
  db.shares.splice(i, 1);
  save(); // activity entries are intentionally kept
  return noContent();
}
