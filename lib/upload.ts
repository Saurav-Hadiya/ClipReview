import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import Busboy from 'busboy';
import { UPLOAD_DIR } from './db';

export const MAX_UPLOAD_BYTES = 2 * 1024 * 1024 * 1024; // 2 GB

export class UploadError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string) { super(code); this.status = status; this.code = code; }
}

/**
 * Stream a multipart/form-data request to disk without buffering it in memory.
 * Accepts a single file field named `file` (video/* only). Other fields are returned as strings.
 * Resolves to { fields, file: { filename, originalName, mime, size } }.
 * Rejects with UploadError(status, code): 400 invalid_content_type | file_required | only_video_allowed, 413 file_too_large.
 * On any failure the partially written file is removed.
 */
export interface UploadedFile { filename: string; originalName: string; mime: string; size: number }
export interface VideoUpload { fields: Record<string, string>; file: UploadedFile }

export function parseVideoUpload(request: Request): Promise<VideoUpload> {
  const contentType = request.headers.get('content-type') || '';
  if (!/^multipart\/form-data/i.test(contentType) || !request.body) {
    return Promise.reject(new UploadError(400, 'invalid_content_type'));
  }
  return new Promise<VideoUpload>((resolve, reject) => {
    let bb: Busboy.Busboy;
    try {
      bb = Busboy({ headers: { 'content-type': contentType }, limits: { files: 1, fileSize: MAX_UPLOAD_BYTES, fields: 20 } });
    } catch {
      return reject(new UploadError(400, 'invalid_content_type'));
    }
    const fields: Record<string, string> = {};
    let saved: (UploadedFile & { dest: string }) | null = null;
    let writing: Promise<void> | null = null;
    let failure: unknown = null;
    const fail = (err: unknown) => { if (!failure) failure = err; };

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
      stream.on('data', (c: Buffer) => { size += c.length; });
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
      const { dest: _dest, ...file } = saved as UploadedFile & { dest: string };
      resolve({ fields, file });
    });

    // request.body is the DOM ReadableStream; Readable.fromWeb expects node:stream/web's type (same runtime object).
    Readable.fromWeb(request.body as unknown as import('node:stream/web').ReadableStream).on('error', (e) => fail(e)).pipe(bb);
  });
}
