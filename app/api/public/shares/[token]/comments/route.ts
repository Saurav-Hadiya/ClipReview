import { db, save, now, newId, findVersion } from '@/lib/db';
import type { Anchor, Comment } from '@/lib/types';
import { json, fail, readJson } from '@/lib/http';
import { checkAccess, latestVersion, logActivity } from '@/lib/shares';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request, { params }: RouteContext<'/api/public/shares/[token]/comments'>) {
  const { token } = await params;
  const ctx = checkAccess(request, token);
  if (ctx.response) return ctx.response;
  const { share, asset } = ctx;
  if (!share.allowComments) return fail(403, 'comments_disabled');
  const { versionId, time, endTime, frame, text, authorName, authorEmail, parentId, anchor, durationFrames } = (await readJson(request)) || {};
  const name = typeof authorName === 'string' ? authorName.trim().slice(0, 80) : '';
  const email = typeof authorEmail === 'string' ? authorEmail.trim().slice(0, 200) : '';
  if (!name) return fail(400, 'authorName_required');
  if (!email || !/^[^\s@]+@[^\s@]+$/.test(email)) return fail(400, 'authorEmail_required');
  const body = typeof text === 'string' ? text.trim() : '';
  if (body.length < 1 || body.length > 2000) return fail(400, 'bad_text');

  let vId: unknown = versionId;
  let t = Number(time);
  let parent: Comment | undefined | null = null;
  if (parentId !== undefined && parentId !== null && parentId !== '') {
    parent = db.comments.find((c) => c.id === parentId && c.assetId === asset.id);
    const grandId = parent ? parent.parentId : null;
    const grand = grandId ? db.comments.find((c) => c.id === grandId) : null;
    if (!parent || parent.internal || (grand && grand.internal)) return fail(400, 'bad_parent');
    vId = parent.versionId;
    t = parent.time;
  }
  const found = findVersion(vId as string); // a non-string vId simply finds nothing -> bad_version
  if (!found || found.asset.id !== asset.id) return fail(400, 'bad_version');
  if (share.showAllVersions === false && latestVersion(asset)?.id !== found.version.id) {
    return fail(400, 'bad_version');
  }
  if (!parent && (time === null || time === undefined || time === '' || !Number.isFinite(t) || t < 0)) {
    return fail(400, 'bad_time');
  }
  const et = parent || endTime === null || endTime === undefined ? null : Number(endTime);
  if (et !== null && (!Number.isFinite(et) || et < t)) return fail(400, 'bad_endTime');
  const fr = parent ? (parent.frame ?? null) : frame === null || frame === undefined ? null : Number(frame);
  if (fr !== null && !Number.isInteger(fr)) return fail(400, 'bad_frame');
  const df = parent || durationFrames === null || durationFrames === undefined ? null : Number(durationFrames);
  if (df !== null && (!Number.isInteger(df) || df < 0)) return fail(400, 'bad_durationFrames');
  let anc = null;
  if (!parent && anchor !== null && anchor !== undefined) {
    const x = Number((anchor as Partial<Anchor>).x);
    const y = Number((anchor as Partial<Anchor>).y);
    if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > 1 || y < 0 || y > 1) {
      return fail(400, 'bad_anchor');
    }
    anc = { x, y };
  }
  const comment: Comment = {
    id: newId(), assetId: asset.id, versionId: vId as string, time: t, endTime: et, frame: fr,
    text: body, author: name, authorEmail: email, resolved: false, createdAt: now(),
    parentId: parent ? parent.id : null, completedAt: null, completedBy: null,
    durationFrames: df, anchor: anc, internal: false,
  };
  db.comments.push(comment);
  logActivity(share, 'comment', name);
  save();
  return json(comment, 201);
}
