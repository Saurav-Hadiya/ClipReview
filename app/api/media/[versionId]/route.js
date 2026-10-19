import { findVersion } from '@/lib/db.js';
import { fail } from '@/lib/http.js';
import { videoResponse } from '@/lib/media.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request, { params }) {
  const { versionId } = await params;
  const found = findVersion(versionId);
  if (!found) return fail(404, 'Version not found');
  return videoResponse(request, found.version);
}
