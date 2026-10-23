'use client';

import { useEffect, useState } from 'react';
import { api, errorMessage } from '@/lib/api';
import type { Activity, ActivityType, PublicShare, ShareTheme } from '@/lib/types';

export interface ShareDialogProps {
  assetId: string;
  onClose?: () => void;
}

/** Values submitted by the share form (create or edit). */
interface ShareFormValues {
  name: string;
  enabled: boolean;
  allowComments: boolean;
  allowDownload: boolean;
  showAllVersions: boolean;
  theme: ShareTheme;
  description: string;
  accentColor: string | null;
  expiresAt: string | null;
  passphrase?: string;
}

interface ShareFormProps {
  share?: PublicShare;
  busy: boolean;
  onSubmit: (body: ShareFormValues) => void;
  onCancel?: () => void;
}

const toDateInput = (iso: string | null | undefined) => {
  if (!iso) return '';
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

const ACTIVITY_LABEL: Record<ActivityType, string> = { open: 'opened the link', view: 'viewed the video', comment: 'commented', download: 'downloaded' };

function ShareForm({ share, busy, onSubmit, onCancel }: ShareFormProps) {
  const editing = !!share;
  const [name, setName] = useState(share?.name || '');
  const [enabled, setEnabled] = useState(share ? share.enabled !== false : true);
  const [expiresAt, setExpiresAt] = useState(toDateInput(share?.expiresAt));
  const [passphrase, setPassphrase] = useState('');
  const [removePass, setRemovePass] = useState(false);
  const [allowComments, setAllowComments] = useState(share ? share.allowComments : true);
  const [allowDownload, setAllowDownload] = useState(share ? share.allowDownload : false);
  const [showAllVersions, setShowAllVersions] = useState(share ? share.showAllVersions !== false : true);
  const [theme, setTheme] = useState<ShareTheme>(share?.theme || 'dark');
  const [accentColor, setAccentColor] = useState(share?.accentColor || '');
  const [description, setDescription] = useState(share?.description || '');

  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const body: ShareFormValues = {
      name, enabled, allowComments, allowDownload, showAllVersions, theme, description,
      accentColor: accentColor || null,
      expiresAt: expiresAt ? new Date(`${expiresAt}T23:59:59`).toISOString() : null,
    };
    if (removePass) body.passphrase = '';
    else if (passphrase) body.passphrase = passphrase;
    onSubmit(body);
  };

  return (
    <form className="sd-form" onSubmit={submit}>
      <label>Link name
        <input type="text" value={name} maxLength={100} placeholder="e.g. Client review" onChange={(e) => setName(e.target.value)} />
      </label>
      <label>Description (shown to reviewers)
        <textarea rows={2} value={description} maxLength={1000} onChange={(e) => setDescription(e.target.value)} />
      </label>
      {editing && (
        <label className="sd-check"><input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} /> Link enabled</label>
      )}
      <label>Expires (optional)
        <input type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
      </label>
      <label>{editing && share.hasPassphrase ? 'New passphrase (leave blank to keep current)' : 'Passphrase (optional)'}
        <input type="text" value={passphrase} autoComplete="off" disabled={removePass} onChange={(e) => setPassphrase(e.target.value)} />
      </label>
      {editing && share.hasPassphrase && (
        <label className="sd-check"><input type="checkbox" checked={removePass} onChange={(e) => setRemovePass(e.target.checked)} /> Remove passphrase</label>
      )}
      <label className="sd-check"><input type="checkbox" checked={allowComments} onChange={(e) => setAllowComments(e.target.checked)} /> Allow comments</label>
      <label className="sd-check"><input type="checkbox" checked={allowDownload} onChange={(e) => setAllowDownload(e.target.checked)} /> Allow downloads</label>
      <label className="sd-check"><input type="checkbox" checked={showAllVersions} onChange={(e) => setShowAllVersions(e.target.checked)} /> Show all versions</label>
      <div className="sd-row">
        <label>Theme
          <select value={theme} onChange={(e) => setTheme(e.target.value as ShareTheme)}>
            <option value="dark">Dark</option>
            <option value="light">Light</option>
            <option value="neutral">Neutral</option>
          </select>
        </label>
        <label>Accent color
          <span className="sd-accent">
            <input type="color" value={accentColor || '#4f46e5'} onChange={(e) => setAccentColor(e.target.value)} aria-label="Accent color" />
            {accentColor && <button type="button" onClick={() => setAccentColor('')}>Reset</button>}
          </span>
        </label>
      </div>
      <div className="sd-actions">
        <button type="submit" className="primary" disabled={busy}>
          {busy ? 'Saving…' : editing ? 'Save changes' : 'Create link'}
        </button>
        {editing && <button type="button" onClick={onCancel}>Cancel</button>}
      </div>
    </form>
  );
}

export default function ShareDialog({ assetId, onClose }: ShareDialogProps) {
  const [shares, setShares] = useState<PublicShare[]>([]);
  const [activity, setActivity] = useState<Activity[]>([]);
  const [editing, setEditing] = useState<string | null>(null); // token being edited
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState('');

  const load = () =>
    api.get<PublicShare[]>(`/api/assets/${assetId}/shares`).then(setShares).catch((e) => setError(errorMessage(e)));
  const loadActivity = () =>
    api.get<Activity[]>(`/api/assets/${assetId}/activity`).then(setActivity).catch(() => {});

  useEffect(() => { load(); loadActivity(); /* eslint-disable-next-line */ }, [assetId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const create = async (body: ShareFormValues) => {
    setBusy(true);
    setError('');
    try {
      await api.post(`/api/assets/${assetId}/shares`, body);
      await load();
    } catch (err) {
      setError(errorMessage(err) || 'Could not create link');
    } finally {
      setBusy(false);
    }
  };

  const update = async (token: string, body: ShareFormValues) => {
    setBusy(true);
    setError('');
    try {
      const s = await api.patch<PublicShare>(`/api/shares/${token}`, body);
      setShares((list) => list.map((x) => (x.token === token ? s : x)));
      setEditing(null);
    } catch (err) {
      setError(errorMessage(err) || 'Could not save');
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (token: string) => {
    setError('');
    try {
      await api.del(`/api/shares/${token}`);
      setShares((s) => s.filter((x) => x.token !== token));
      if (editing === token) setEditing(null);
    } catch (err) {
      setError(errorMessage(err) || 'Could not revoke');
    }
  };

  const copy = async (token: string) => {
    const url = `${location.origin}/s/${token}`;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      window.prompt('Copy this link', url);
    }
    setCopied(token);
    setTimeout(() => setCopied((c) => (c === token ? '' : c)), 1500);
  };

  const expired = (s: PublicShare) => s.expiresAt && new Date(s.expiresAt).getTime() <= Date.now();
  const nameOf = (token: string) => shares.find((s) => s.token === token)?.name || '';

  return (
    <div className="sd-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }}>
      <div className="sd" role="dialog" aria-modal="true" aria-label="Share">
        <div className="sd-head">
          <strong>Share for review</strong>
          <button type="button" onClick={onClose} aria-label="Close">{'×'}</button>
        </div>

        <ShareForm key="new" busy={busy && !editing} onSubmit={create} />

        {error && <div className="sd-error" role="alert">{error}</div>}

        <div className="sd-list">
          {shares.length === 0 && <div className="sd-empty">No share links yet.</div>}
          {shares.map((s) => (
            <div className="sd-item" key={s.token}>
              {s.name && <strong>{s.name}</strong>}
              <div className="sd-url">{`${location.origin}/s/${s.token}`}</div>
              <div className="sd-badges">
                {s.enabled === false && <span className="sd-badge sd-badge-bad">disabled</span>}
                {s.hasPassphrase && <span className="sd-badge">passphrase</span>}
                {s.expiresAt && (
                  <span className={`sd-badge${expired(s) ? ' sd-badge-bad' : ''}`}>
                    {expired(s) ? 'expired ' : 'expires '}{new Date(s.expiresAt).toLocaleDateString()}
                  </span>
                )}
                <span className="sd-badge">{s.allowComments ? 'comments' : 'view only'}</span>
                {s.allowDownload && <span className="sd-badge">download</span>}
                <span className="sd-badge">{s.showAllVersions === false ? 'latest version only' : 'all versions'}</span>
              </div>
              <div className="sd-actions">
                <button type="button" onClick={() => copy(s.token)}>{copied === s.token ? 'Copied' : 'Copy link'}</button>
                <button type="button" onClick={() => setEditing(editing === s.token ? null : s.token)}>
                  {editing === s.token ? 'Close editor' : 'Edit'}
                </button>
                <button type="button" onClick={() => revoke(s.token)}>Revoke</button>
              </div>
              {editing === s.token && (
                <ShareForm
                  share={s}
                  busy={busy}
                  onSubmit={(body) => update(s.token, body)}
                  onCancel={() => setEditing(null)}
                />
              )}
            </div>
          ))}
        </div>

        <div className="sd-activity">
          <strong>Recent activity</strong>
          {activity.length === 0 && <div className="sd-empty">No activity yet.</div>}
          <ul>
            {activity.map((a) => (
              <li key={a.id}>
                <span>{a.who || 'Someone'} {ACTIVITY_LABEL[a.type] || a.type}</span>
                {nameOf(a.shareToken) && <span className="sd-badge">{nameOf(a.shareToken)}</span>}
                <time>{new Date(a.at).toLocaleString()}</time>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
