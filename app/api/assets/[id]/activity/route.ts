import { db } from '@/lib/db';
import { json } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request, { params }: RouteContext<'/api/assets/[id]/activity'>) {
  const { id } = await params;
  const list = db.activity
    .filter((a) => a.assetId === id)
    .sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0))
    .slice(0, 100);
  return json(list);
}
