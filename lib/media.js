import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { UPLOAD_DIR } from './db.js';

/**
 * Stream a stored upload as a web Response with HTTP Range support (206/416).
 * `request` is the incoming Request; `version` is a Version record from the db.
 */
export function videoResponse(request, version, { download = false } = {}) {
  const file = path.join(UPLOAD_DIR, version.filename);
  let size;
  try { size = fs.statSync(file).size; } catch { return Response.json({ error: 'file_missing' }, { status: 404 }); }

  const headers = new Headers({
    'Accept-Ranges': 'bytes',
    'Content-Type': version.mime || 'application/octet-stream',
    'Cache-Control': 'private, no-store',
  });
  if (download) {
    headers.set('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(version.originalName)}`);
  }

  const open = (opts) => Readable.toWeb(fs.createReadStream(file, opts));
  const range = request.headers.get('range');
  if (!range) {
    headers.set('Content-Length', String(size));
    return new Response(open(), { status: 200, headers });
  }
  const m = /bytes=(\d*)-(\d*)/.exec(range);
  let start = m && m[1] ? parseInt(m[1], 10) : 0;
  let end = m && m[2] ? parseInt(m[2], 10) : size - 1;
  if (m && !m[1] && m[2]) { start = Math.max(0, size - parseInt(m[2], 10)); end = size - 1; }
  if (end >= size) end = size - 1;
  if (!m || start >= size || start > end) {
    headers.set('Content-Range', `bytes */${size}`);
    return new Response(null, { status: 416, headers });
  }
  headers.set('Content-Range', `bytes ${start}-${end}/${size}`);
  headers.set('Content-Length', String(end - start + 1));
  return new Response(open({ start, end }), { status: 206, headers });
}
