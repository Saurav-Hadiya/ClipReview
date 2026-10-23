'use client';

import { useRef, useState } from 'react';
import { api, errorMessage } from '@/lib/api';
import type { Asset } from '@/lib/types';

export interface UploadVersionButtonProps {
  assetId: string;
  onUploaded?: (asset: Asset) => void;
}

export default function UploadVersionButton({ assetId, onUploaded }: UploadVersionButtonProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true);
    setError('');
    try {
      const fd = new FormData();
      fd.append('file', file);
      const asset = await api.post<Asset>(`/api/assets/${assetId}/versions`, fd);
      onUploaded?.(asset);
    } catch (err) {
      setError(errorMessage(err) || 'Upload failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <span className="uvb">
      <input ref={inputRef} type="file" accept="video/*" hidden onChange={onFile} />
      <button type="button" disabled={busy} onClick={() => inputRef.current?.click()}>
        {busy ? 'Uploading…' : 'Upload new version'}
      </button>
      {error && <span className="uvb-error" role="alert">{error}</span>}
    </span>
  );
}
