import { db, newId, now, save } from '@/lib/db.js';
import { json, fail, readJson } from '@/lib/http.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const isNum = (n) => typeof n === 'number' && Number.isFinite(n);

function validAnchor(a) {
  return a && typeof a === 'object' && isNum(a.x) && isNum(a.y) && a.x >= 0 && a.x <= 1 && a.y >= 0 && a.y <= 1;
}

export async function GET(request, { params }) {
  const { id } = await params;
  const asset = db.assets.find((a) => a.id === id);
  if (!asset) return fail(404, 'asset_not_found');
  const versionId = new URL(request.url).searchParams.get('versionId');
  const list = db.comments
    .filter((c) => c.assetId === asset.id && (!versionId || c.versionId === versionId))
    .sort((a, b) => a.time - b.time);
  return json(list);
}

export async function POST(request, { params }) {
  const { id } = await params;
  const asset = db.assets.find((a) => a.id === id);
  if (!asset) return fail(404, 'asset_not_found');
  const reqBody = await readJson(request);
  const { versionId, time, endTime, frame, text, author, parentId, anchor, internal, durationFrames, authorEmail } = reqBody || {};
  const body = typeof text === 'string' ? text.trim() : '';
  if (!body) return fail(400, 'text_required');
  if (body.length > 2000) return fail(400, 'text_too_long');

  let parent = null;
  if (parentId != null) {
    parent = db.comments.find((c) => c.id === parentId);
    if (!parent || parent.assetId !== asset.id) return fail(400, 'invalid_parent');
    // replies attach to the thread root (one level of nesting)
    if (parent.parentId) {
      const root = db.comments.find((c) => c.id === parent.parentId);
      if (root) parent = root;
    }
  }

  let vId = versionId; let t = time; let end = endTime; let internalFlag = !!internal;
  if (parent) {
    vId = parent.versionId; t = parent.time; end = parent.endTime ?? null; internalFlag = !!parent.internal;
  }
  if (!asset.versions.some((v) => v.id === vId)) return fail(400, 'invalid_version');
  if (!isNum(t) || t < 0) return fail(400, 'invalid_time');
  if (end != null && (!isNum(end) || end < t)) return fail(400, 'invalid_end_time');
  if (anchor != null && !validAnchor(anchor)) return fail(400, 'invalid_anchor');
  if (durationFrames != null && !(Number.isInteger(durationFrames) && durationFrames >= 0)) return fail(400, 'invalid_duration');
  const name = (typeof author === 'string' && author.trim().slice(0, 80)) || 'Anonymous';
  const email = typeof authorEmail === 'string' && authorEmail.trim() ? authorEmail.trim().slice(0, 200) : null;

  const comment = {
    id: newId(),
    assetId: asset.id,
    versionId: vId,
    parentId: parent ? parent.id : null,
    time: t,
    endTime: end ?? null,
    frame: Number.isInteger(frame) ? frame : null,
    durationFrames: parent ? null : (durationFrames ?? null),
    anchor: !parent && anchor ? { x: anchor.x, y: anchor.y } : null,
    text: body,
    author: name,
    authorEmail: email,
    internal: internalFlag,
    resolved: false,
    completedAt: null,
    completedBy: null,
    createdAt: now(),
  };
  db.comments.push(comment);
  save();
  return json(comment, 201);
}
