'use client';

import { useRef, useState } from 'react';
import { api } from '@/lib/api';

export default function UploadVersionButton({ assetId, onUploaded }) {
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true);
    setError('');
    try {
      const fd = new FormData();
      fd.append('file', file);
      const asset = await api.post(`/api/assets/${assetId}/versions`, fd);
      onUploaded?.(asset);
    } catch (err) {
      setError(err.message || 'Upload failed');
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
