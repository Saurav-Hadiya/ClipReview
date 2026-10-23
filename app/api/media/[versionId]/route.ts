import { findVersion } from '@/lib/db';
import { fail } from '@/lib/http';
import { videoResponse } from '@/lib/media';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request, { params }: RouteContext<'/api/media/[versionId]'>) {
  const { versionId } = await params;
  const found = findVersion(versionId);
  if (!found) return fail(404, 'Version not found');
  return videoResponse(request, found.version);
}
