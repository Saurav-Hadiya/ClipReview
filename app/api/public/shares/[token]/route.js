import { db, save } from '@/lib/db.js';
import { json } from '@/lib/http.js';
import { THEMES, checkAccess, latestVersion, logActivity } from '@/lib/shares.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request, { params }) {
  const { token } = await params;
  const ctx = checkAccess(request, token);
  if (ctx.response) return ctx.response;
  const { share, asset } = ctx;
  const showAll = share.showAllVersions !== false;
  let versions = asset.versions;
  if (!showAll) {
    const latest = latestVersion(asset);
    versions = latest ? [latest] : [];
  }
  const vids = new Set(versions.map((v) => v.id));
  const internalIds = new Set(db.comments.filter((c) => c.assetId === asset.id && c.internal).map((c) => c.id));
  const comments = db.comments
    .filter((c) => c.assetId === asset.id && !c.internal && !internalIds.has(c.parentId) && vids.has(c.versionId))
    .sort((a, b) => a.time - b.time);
  logActivity(share, 'open');
  save();
  return json({
    asset: { ...asset, versions },
    share: {
      allowComments: share.allowComments,
      allowDownload: share.allowDownload,
      hasPassphrase: !!share.passphraseHash,
      name: share.name || '',
      theme: THEMES.includes(share.theme) ? share.theme : 'dark',
      accentColor: share.accentColor || null,
      description: share.description || '',
      showAllVersions: showAll,
    },
    comments,
  });
}
