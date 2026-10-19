import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import Busboy from 'busboy';
import { UPLOAD_DIR } from './db.js';

export const MAX_UPLOAD_BYTES = 2 * 1024 * 1024 * 1024; // 2 GB

export class UploadError extends Error {
  constructor(status, code) { super(code); this.status = status; this.code = code; }
}

/**
 * Stream a multipart/form-data request to disk without buffering it in memory.
 * Accepts a single file field named `file` (video/* only). Other fields are returned as strings.
 * Resolves to { fields, file: { filename, originalName, mime, size } }.
 * Rejects with UploadError(status, code): 400 invalid_content_type | file_required | only_video_allowed, 413 file_too_large.
 * On any failure the partially written file is removed.
 */
export function parseVideoUpload(request) {
  const contentType = request.headers.get('content-type') || '';
  if (!/^multipart\/form-data/i.test(contentType) || !request.body) {
    return Promise.reject(new UploadError(400, 'invalid_content_type'));
  }
  return new Promise((resolve, reject) => {
    let bb;
    try {
      bb = Busboy({ headers: { 'content-type': contentType }, limits: { files: 1, fileSize: MAX_UPLOAD_BYTES, fields: 20 } });
    } catch {
      return reject(new UploadError(400, 'invalid_content_type'));
    }
    const fields = {};
    let saved = null;
    let writing = null;
    let failure = null;
    const fail = (err) => { if (!failure) failure = err; };

    bb.on('field', (name, value) => { fields[name] = value; });
    bb.on('file', (name, stream, info) => {
      if (name !== 'file' || saved || writing) { stream.resume(); return; }
      if (!/^video\//i.test(info.mimeType || '')) {
        fail(new UploadError(400, 'only_video_allowed'));
        stream.resume();
        return;
      }
      const ext = path.extname(info.filename || '').toLowerCase().replace(/[^.a-z0-9]/g, '').slice(0, 10);
      const filename = crypto.randomBytes(16).toString('hex') + ext;
      const dest = path.join(UPLOAD_DIR, filename);
      let size = 0;
      stream.on('data', (c) => { size += c.length; });
      stream.on('limit', () => fail(new UploadError(413, 'file_too_large')));
      writing = pipeline(stream, fs.createWriteStream(dest))
        .then(() => { saved = { filename, originalName: info.filename || filename, mime: info.mimeType, size, dest }; })
        .catch((e) => { fail(e); });
    });
    bb.on('error', (e) => fail(e));
    bb.on('close', async () => {
      try { await writing; } catch { /* captured in failure */ }
      if (!failure && !saved) failure = new UploadError(400, 'file_required');
      if (failure) {
        if (saved) fs.promises.unlink(saved.dest).catch(() => {});
        else if (writing) { /* partial file name unknown; cleaned below */ }
        const err = failure instanceof UploadError ? failure : new UploadError(400, 'upload_failed');
        return reject(err);
      }
      const { dest, ...file } = saved;
      resolve({ fields, file });
    });

    Readable.fromWeb(request.body).on('error', (e) => fail(e)).pipe(bb);
  });
}
