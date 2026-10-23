'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { api, errorMessage } from '@/lib/api';
import type { Asset, AssetStatus } from '@/lib/types';

interface UploadItem {
  key: string;
  name: string;
  progress: number; // 0..1
  error: string;
}

interface AssetCardProps {
  asset: Asset;
  onRenamed: (asset: Asset) => void;
  onDeleted: (id: string) => void;
  onError: (message: string) => void;
}

const STATUS_LABEL: Record<AssetStatus, string> = { needs_review: 'Needs Review', in_progress: 'In Progress', approved: 'Approved' };

function fmtSize(n: number) {
  if (!n) return '';
  const u = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
  return `${n.toFixed(i ? 1 : 0)} ${u[i]}`;
}

function uploadFile(file: File, onProgress: (fraction: number) => void): Promise<Asset> {
  return new Promise<Asset>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/assets');
    xhr.responseType = 'json'; // response is Asset on success, { error?: string } on failure
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(e.loaded / e.total); };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) return resolve(xhr.response as Asset);
      const body = xhr.response as { error?: string } | null;
      reject(new Error((body && body.error) || `Upload failed (${xhr.status})`));
    };
    xhr.onerror = () => reject(new Error('Network error during upload'));
    xhr.onabort = () => reject(new Error('Upload cancelled'));
    const fd = new FormData();
    fd.append('file', file);
    xhr.send(fd);
  });
}

function AssetCard({ asset, onRenamed, onDeleted, onError }: AssetCardProps) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(asset.name);
  const [busy, setBusy] = useState(false);
  const latest = asset.versions[asset.versions.length - 1];

  async function commitRename() {
    const next = name.trim();
    setEditing(false);
    if (!next || next === asset.name) { setName(asset.name); return; }
    setBusy(true);
    try { onRenamed(await api.patch<Asset>(`/api/assets/${asset.id}`, { name: next })); }
    catch (e) { setName(asset.name); onError(errorMessage(e)); }
    finally { setBusy(false); }
  }

  async function remove() {
    if (!window.confirm(`Delete "${asset.name}" and all its versions, comments and share links?`)) return;
    setBusy(true);
    try { await api.del(`/api/assets/${asset.id}`); onDeleted(asset.id); }
    catch (e) { onError(errorMessage(e)); setBusy(false); }
  }

  return (
    <div className="lib-card" aria-busy={busy}>
      <Link href={`/asset/${asset.id}`} className="lib-thumb" aria-label={`Open ${asset.name}`}>
        {latest && (
          <video src={`/api/media/${latest.id}#t=0.1`} preload="metadata" muted playsInline tabIndex={-1} />
        )}
      </Link>
      <div className="lib-body">
        {editing ? (
          <input
            className="lib-rename"
            autoFocus
            value={name}
            maxLength={200}
            onChange={(e) => setName(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur();
              if (e.key === 'Escape') { setName(asset.name); setEditing(false); }
            }}
          />
        ) : (
          <Link href={`/asset/${asset.id}`} className="lib-name" title={asset.name}>{asset.name}</Link>
        )}
        <div className="lib-meta">
          <span className={`lib-badge lib-${asset.status}`}>{STATUS_LABEL[asset.status] || asset.status}</span>
          <span>{asset.versions.length} version{asset.versions.length === 1 ? '' : 's'}</span>
          <span>{new Date(asset.createdAt).toLocaleDateString()}</span>
          {latest && <span>{fmtSize(latest.size)}</span>}
        </div>
        <div className="lib-actions">
          <button type="button" disabled={busy} onClick={() => { setName(asset.name); setEditing(true); }}>Rename</button>
          <button type="button" disabled={busy} onClick={remove}>Delete</button>
        </div>
      </div>
    </div>
  );
}

export default function Library() {
  const [assets, setAssets] = useState<Asset[] | null>(null);
  const [loadError, setLoadError] = useState('');
  const [notice, setNotice] = useState('');
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const [drag, setDrag] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoadError('');
    try { setAssets(await api.get<Asset[]>('/api/assets')); }
    catch (e) { setLoadError(errorMessage(e) || 'Failed to load assets'); setAssets((a) => a || []); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const patchUpload = (key: string, patch: Partial<UploadItem>) =>
    setUploads((u) => u.map((x) => (x.key === key ? { ...x, ...patch } : x)));

  async function handleFiles(fileList: FileList | null) {
    const files = Array.from(fileList || []);
    if (!files.length) return;
    setNotice('');
    for (const file of files) {
      const key = `${Date.now()}-${Math.random()}`;
      if (!file.type.startsWith('video/')) {
        setUploads((u) => [...u, { key, name: file.name, progress: 0, error: 'Not a video file' }]);
        continue;
      }
      setUploads((u) => [...u, { key, name: file.name, progress: 0, error: '' }]);
      try {
        const asset = await uploadFile(file, (p) => patchUpload(key, { progress: p }));
        setAssets((a) => [asset, ...(a || [])]);
        setUploads((u) => u.filter((x) => x.key !== key));
      } catch (e) {
        patchUpload(key, { error: errorMessage(e) });
      }
    }
  }

  function onDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDrag(false);
    handleFiles(e.dataTransfer.files);
  }

  return (
    <div className="page lib">
      <h1 className="lib-title">Library</h1>

      <div
        className={`lib-drop${drag ? ' lib-drag' : ''}`}
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current && inputRef.current.click()}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); inputRef.current && inputRef.current.click(); } }}
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={onDrop}
      >
        <strong>Drop videos here</strong> or click to browse
        <input
          ref={inputRef}
          type="file"
          accept="video/*"
          multiple
          hidden
          onChange={(e) => { handleFiles(e.target.files); e.target.value = ''; }}
        />
      </div>

      {uploads.length > 0 && (
        <ul className="lib-uploads">
          {uploads.map((u) => (
            <li key={u.key}>
              <div className="lib-up-row">
                <span className="lib-up-name">{u.name}</span>
                {u.error ? (
                  <span className="lib-err">
                    {u.error}{' '}
                    <button type="button" onClick={() => setUploads((x) => x.filter((i) => i.key !== u.key))}>Dismiss</button>
                  </span>
                ) : (
                  <span>{Math.round(u.progress * 100)}%</span>
                )}
              </div>
              {!u.error && (
                <div className="lib-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(u.progress * 100)}>
                  <div style={{ width: `${u.progress * 100}%` }} />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {notice && <p className="lib-err" role="alert">{notice}</p>}
      {loadError && (
        <p className="lib-err" role="alert">
          {loadError} <button type="button" onClick={load}>Retry</button>
        </p>
      )}

      {assets === null ? (
        <p className="lib-muted">Loading...</p>
      ) : assets.length === 0 && !loadError ? (
        <div className="lib-empty">
          <p><strong>No videos yet</strong></p>
          <p className="lib-muted">Upload your first video to start collecting feedback.</p>
        </div>
      ) : (
        <div className="lib-grid">
          {assets.map((a) => (
            <AssetCard
              key={a.id}
              asset={a}
              onError={setNotice}
              onRenamed={(n) => setAssets((l) => (l || []).map((x) => (x.id === n.id ? n : x)))}
              onDeleted={(id) => setAssets((l) => (l || []).filter((x) => x.id !== id))}
            />
          ))}
        </div>
      )}
    </div>
  );
}
