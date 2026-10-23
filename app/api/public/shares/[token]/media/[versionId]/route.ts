import { save, findVersion } from '@/lib/db';
import { fail } from '@/lib/http';
import { videoResponse } from '@/lib/media';
import { checkAccess, latestVersion, logActivity, logViewThrottled } from '@/lib/shares';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request, { params }: RouteContext<'/api/public/shares/[token]/media/[versionId]'>) {
  const { token, versionId } = await params;
  const ctx = checkAccess(request, token, { allowQuery: true });
  if (ctx.response) return ctx.response;
  const { share, asset } = ctx;
  const found = findVersion(versionId);
  if (!found || found.asset.id !== asset.id) return fail(404, 'not_found');
  if (share.showAllVersions === false && latestVersion(asset)?.id !== found.version.id) {
    return fail(404, 'not_found');
  }
  const dl = new URL(request.url).searchParams.get('download');
  const download = dl === '1' || dl === 'true';
  if (download && !share.allowDownload) return fail(403, 'download_disabled');
  if (download) { logActivity(share, 'download'); save(); }
  else logViewThrottled(share, found.version.id);
  return videoResponse(request, found.version, { download });
}
