import { useEffect, useState } from 'react';
import { api } from '../api.js';

export default function ShareDialog({ assetId, onClose }) {
  const [shares, setShares] = useState([]);
  const [expiresAt, setExpiresAt] = useState('');
  const [passphrase, setPassphrase] = useState('');
  const [allowComments, setAllowComments] = useState(true);
  const [allowDownload, setAllowDownload] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState('');

  const load = () =>
    api.get(`/api/assets/${assetId}/shares`).then(setShares).catch((e) => setError(e.message));

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [assetId]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const create = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const body = { allowComments, allowDownload };
      if (expiresAt) body.expiresAt = new Date(`${expiresAt}T23:59:59`).toISOString();
      if (passphrase) body.passphrase = passphrase;
      await api.post(`/api/assets/${assetId}/shares`, body);
      setPassphrase('');
      setExpiresAt('');
      await load();
    } catch (err) {
      setError(err.message || 'Could not create link');
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (token) => {
    setError('');
    try {
      await api.del(`/api/shares/${token}`);
      setShares((s) => s.filter((x) => x.token !== token));
    } catch (err) {
      setError(err.message || 'Could not revoke');
    }
  };

  const copy = async (token) => {
    const url = `${location.origin}/s/${token}`;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      window.prompt('Copy this link', url);
    }
    setCopied(token);
    setTimeout(() => setCopied((c) => (c === token ? '' : c)), 1500);
  };

  const expired = (s) => s.expiresAt && new Date(s.expiresAt).getTime() <= Date.now();

  return (
    <div className="sd-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }}>
      <div className="sd" role="dialog" aria-modal="true" aria-label="Share">
        <div className="sd-head">
          <strong>Share for review</strong>
          <button type="button" onClick={onClose} aria-label="Close">{'×'}</button>
        </div>

        <form className="sd-form" onSubmit={create}>
          <label>Expires (optional)
            <input type="date" value={expiresAt} min={new Date().toISOString().slice(0, 10)} onChange={(e) => setExpiresAt(e.target.value)} />
          </label>
          <label>Passphrase (optional)
            <input type="text" value={passphrase} autoComplete="off" onChange={(e) => setPassphrase(e.target.value)} />
          </label>
          <label className="sd-check"><input type="checkbox" checked={allowComments} onChange={(e) => setAllowComments(e.target.checked)} /> Allow comments</label>
          <label className="sd-check"><input type="checkbox" checked={allowDownload} onChange={(e) => setAllowDownload(e.target.checked)} /> Allow downloads</label>
          <button type="submit" className="primary" disabled={busy}>{busy ? 'Creating…' : 'Create link'}</button>
        </form>

        {error && <div className="sd-error" role="alert">{error}</div>}

        <div className="sd-list">
          {shares.length === 0 && <div className="sd-empty">No share links yet.</div>}
          {shares.map((s) => (
            <div className="sd-item" key={s.token}>
              <div className="sd-url">{`${location.origin}/s/${s.token}`}</div>
              <div className="sd-badges">
                {s.hasPassphrase && <span className="sd-badge">passphrase</span>}
                {s.expiresAt && (
                  <span className={`sd-badge${expired(s) ? ' sd-badge-bad' : ''}`}>
                    {expired(s) ? 'expired ' : 'expires '}{new Date(s.expiresAt).toLocaleDateString()}
                  </span>
                )}
                <span className="sd-badge">{s.allowComments ? 'comments' : 'view only'}</span>
                {s.allowDownload && <span className="sd-badge">download</span>}
              </div>
              <div className="sd-actions">
                <button type="button" onClick={() => copy(s.token)}>{copied === s.token ? 'Copied' : 'Copy link'}</button>
                <button type="button" onClick={() => revoke(s.token)}>Revoke</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
