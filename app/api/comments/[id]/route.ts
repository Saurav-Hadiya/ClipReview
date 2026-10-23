import { db, now, save } from '@/lib/db';
import { json, fail, noContent, readJson } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function PATCH(request: Request, { params }: RouteContext<'/api/comments/[id]'>) {
  const { id } = await params;
  const c = db.comments.find((x) => x.id === id);
  if (!c) return fail(404, 'not_found');
  const body = await readJson(request);
  const { text, resolved, completed, completedBy } = body || {};
  if (text !== undefined) {
    const t = typeof text === 'string' ? text.trim() : '';
    if (!t || t.length > 2000) return fail(400, 'invalid_text');
    c.text = t;
  }
  const done = completed !== undefined ? !!completed : resolved !== undefined ? !!resolved : undefined;
  if (done !== undefined) {
    c.resolved = done;
    c.completedAt = done ? now() : null;
    c.completedBy = done
      ? (typeof completedBy === 'string' && completedBy.trim() ? completedBy.trim().slice(0, 80) : null)
      : null;
  }
  save();
  return json(c);
}

export async function DELETE(request: Request, { params }: RouteContext<'/api/comments/[id]'>) {
  const { id } = await params;
  const i = db.comments.findIndex((x) => x.id === id);
  if (i < 0) return fail(404, 'not_found');
  const cid = db.comments[i].id;
  db.comments = db.comments.filter((x) => x.id !== cid && x.parentId !== cid);
  save();
  return noContent();
}
