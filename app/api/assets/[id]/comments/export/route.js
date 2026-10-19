import { db } from '@/lib/db.js';
import { fail } from '@/lib/http.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const EXPORT_FPS = 24;

function timecode(t, fps = EXPORT_FPS) {
  const total = Math.max(0, Number(t) || 0);
  const whole = Math.floor(total);
  const f = Math.min(fps - 1, Math.floor((total - whole) * fps + 1e-6));
  const p = (n) => String(n).padStart(2, '0');
  return `${p(Math.floor(whole / 3600))}:${p(Math.floor((whole % 3600) / 60))}:${p(whole % 60)}:${p(f)}`;
}

function csvCell(v) {
  let s = v == null ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; // neutralize spreadsheet formulas
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function sanitizeFilename(s) {
  return String(s || 'comments').replace(/[^A-Za-z0-9._-]+/g, '_').slice(0, 80) || 'comments';
}

export async function GET(request, { params }) {
  const { id } = await params;
  const asset = db.assets.find((a) => a.id === id);
  if (!asset) return fail(404, 'asset_not_found');
  const q = new URL(request.url).searchParams;
  const fmt = q.get('format');
  const versionId = q.get('versionId');
  const format = fmt === 'json' ? 'json' : fmt === 'csv' || !fmt ? 'csv' : null;
  if (!format) return fail(400, 'invalid_format');
  const list = db.comments
    .filter((c) => c.assetId === asset.id && (!versionId || c.versionId === versionId))
    .sort((a, b) => a.time - b.time);
  const base = sanitizeFilename(asset.name) + '-comments';
  if (format === 'json') {
    return new Response(JSON.stringify(list, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="${base}.json"`,
      },
    });
  }
  const header = ['timecode', 'author', 'text', 'internal', 'completed', 'created_at'];
  const rows = list.map((c) => [
    timecode(c.time), c.author, c.text, !!c.internal, !!c.completedAt, c.createdAt,
  ]);
  const csv = [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
  return new Response('﻿' + csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${base}.csv"`,
    },
  });
}
