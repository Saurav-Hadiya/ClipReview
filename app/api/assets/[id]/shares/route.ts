import crypto from 'node:crypto';
import { db, save, now } from '@/lib/db';
import type { Share } from '@/lib/types';
import { json, fail, readJson } from '@/lib/http';
import { applyFields, toPublicShare } from '@/lib/shares';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request, { params }: RouteContext<'/api/assets/[id]/shares'>) {
  const { id } = await params;
  return json(db.shares.filter((s) => s.assetId === id).map(toPublicShare));
}

export async function POST(request: Request, { params }: RouteContext<'/api/assets/[id]/shares'>) {
  const { id } = await params;
  const asset = db.assets.find((a) => a.id === id);
  if (!asset) return fail(404, 'not_found');
  const share: Share = {
    token: crypto.randomBytes(24).toString('base64url'),
    assetId: asset.id,
    createdAt: now(),
    expiresAt: null,
    passphraseHash: null,
    allowComments: true,
    allowDownload: false,
    name: '',
    enabled: true,
    showAllVersions: true,
    theme: 'dark',
    accentColor: null,
    description: '',
  };
  const err = applyFields(share, await readJson(request));
  if (err) return fail(400, err);
  db.shares.push(share);
  save();
  return json(toPublicShare(share), 201);
}
