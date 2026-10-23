'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { api, errorMessage, isApiError } from '@/lib/api';
import type { Comment } from '@/lib/types';
import type { NewComment, PublicSharePayload } from '@/lib/client-types';
import type { SeekFn } from '@/components/VideoPlayer';
import VideoPlayer from '@/components/VideoPlayer';
import CommentPanel from '@/components/CommentPanel';
import VersionSwitcher from '@/components/VersionSwitcher';

type ShareState = 'loading' | 'ok' | 'passphrase' | 'expired' | 'disabled' | 'notfound' | 'error';

interface Identity { name: string; email: string }

export default function SharePage() {
  const { token } = useParams<{ token: string }>();
  // loading | ok | passphrase | expired | disabled | notfound | error
  const [state, setState] = useState<ShareState>('loading');
  const [data, setData] = useState<PublicSharePayload | null>(null);
  const [versionId, setVersionId] = useState('');
  const [passphrase, setPassphrase] = useState(''); // in-memory only
  const [input, setInput] = useState('');
  const [authError, setAuthError] = useState('');
  const [currentTime, setCurrentTime] = useState(0);
  const [identity, setIdentity] = useState<Identity | null>(null); // component state only
  const [gate, setGate] = useState<NewComment | null>(null); // pending comment payload awaiting identity
  const [gateName, setGateName] = useState('');
  const [gateEmail, setGateEmail] = useState('');
  const [gateError, setGateError] = useState('');
  const seekRef = useRef<SeekFn | null>(null);

  const headers = useCallback(
    (p?: string): Record<string, string> => (p ? { 'x-share-passphrase': p } : {}),
    [],
  );

  const load = useCallback(async (pass: string) => {
    try {
      const d = await api.get<PublicSharePayload>(`/api/public/shares/${token}`, headers(pass));
      setPassphrase(pass || '');
      setData(d);
      setVersionId((cur) => {
        if (cur && d.asset.versions.some((v) => v.id === cur)) return cur;
        const vs = d.asset.versions;
        return vs.length ? vs[vs.length - 1].id : '';
      });
      setAuthError('');
      setState('ok');
    } catch (e) {
      const status = isApiError(e) ? e.status : 0;
      const code = isApiError(e) ? e.data?.error : undefined;
      if (status === 401) {
        setAuthError(code === 'bad_passphrase' ? 'Incorrect passphrase' : '');
        setState('passphrase');
      } else if (status === 410) setState('expired');
      else if (status === 403 && code === 'disabled') setState('disabled');
      else if (status === 404) setState('notfound');
      else setState('error');
    }
  }, [token, headers]);

  useEffect(() => { setState('loading'); load(''); }, [load]);

  if (state === 'loading') return <div className="sp-msg">Loading{'…'}</div>;
  if (state === 'expired') return <div className="sp-msg"><h2>Link expired</h2><p>This share link is no longer valid.</p></div>;
  if (state === 'disabled') return <div className="sp-msg"><h2>Link disabled</h2><p>The owner has turned this share link off.</p></div>;
  if (state === 'notfound') return <div className="sp-msg"><h2>Not found</h2><p>This share link does not exist or was revoked.</p></div>;
  if (state === 'error') return <div className="sp-msg"><h2>Something went wrong</h2></div>;

  if (state === 'passphrase') {
    return (
      <form className="sp-msg sp-pass" onSubmit={(e) => { e.preventDefault(); load(input); }}>
        <h2>Passphrase required</h2>
        <input type="password" autoFocus value={input} onChange={(e) => setInput(e.target.value)} placeholder="Passphrase" />
        <button type="submit" className="primary">Open</button>
        {authError && <div className="sd-error" role="alert">{authError}</div>}
      </form>
    );
  }

  if (!data) return null; // unreachable: state 'ok' always has data
  const { asset, share, comments } = data;
  const version = asset.versions.find((v) => v.id === versionId);
  const base = `/api/public/shares/${token}/media/${versionId}`;
  const q = passphrase ? `?p=${encodeURIComponent(passphrase)}` : '';
  const src = base + q;
  const downloadUrl = `${base}?download=1${passphrase ? `&p=${encodeURIComponent(passphrase)}` : ''}`;
  const visible = comments.filter((c) => c.versionId === versionId);
  const showSwitcher = share.showAllVersions !== false && asset.versions.length > 0;
  const theme = share.theme || 'dark';
  // CSS custom properties are not part of CSSProperties' typing.
  const style = share.accentColor ? ({ '--accent': share.accentColor } as React.CSSProperties) : undefined;

  const post = async (payload: NewComment, who: Identity) => {
    const c = await api.post<Comment>(
      `/api/public/shares/${token}/comments`,
      {
        versionId,
        time: payload.time,
        endTime: payload.endTime,
        durationFrames: payload.durationFrames,
        frame: payload.frame,
        anchor: payload.anchor,
        parentId: payload.parentId,
        text: payload.text,
        authorName: who.name,
        authorEmail: who.email,
      },
      headers(passphrase),
    );
    setData((d) => (d ? { ...d, comments: [...d.comments, c] } : d));
  };

  const onAdd = async (payload: NewComment) => {
    if (!identity) {
      setGate(payload);
      return;
    }
    await post(payload, identity);
  };

  const submitGate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const name = gateName.trim();
    const email = gateEmail.trim();
    if (!name || !/^[^\s@]+@[^\s@]+$/.test(email)) {
      setGateError('Enter your name and a valid email to comment.');
      return;
    }
    if (!gate) return;
    const who = { name, email };
    try {
      await post(gate, who);
      setIdentity(who);
      setGate(null);
      setGateError('');
    } catch (err) {
      setGateError(errorMessage(err) || 'Could not post comment');
    }
  };

  return (
    <div className={`sp sp-theme-${theme}`} style={style}>
      <div className="sp-head">
        <div className="sp-title">
          <h2>{share.name || asset.name}</h2>
          {share.name && <span className="sp-sub">{asset.name}</span>}
        </div>
        {showSwitcher && <VersionSwitcher versions={asset.versions} value={versionId} onChange={setVersionId} />}
        {share.allowDownload && version && (
          <a className="btn" href={downloadUrl} download>Download</a>
        )}
      </div>
      {share.description && <p className="sp-desc">{share.description}</p>}
      <div className="sp-body">
        <div className="sp-player">
          {version && (
            <VideoPlayer key={versionId} src={src} comments={visible} onTimeUpdate={setCurrentTime} seekRef={seekRef} />
          )}
        </div>
        <div className="sp-comments">
          <CommentPanel
            comments={visible}
            currentTime={currentTime}
            fps={24}
            onSeek={(t) => seekRef.current?.(t)}
            onAdd={onAdd}
            onToggleResolved={() => {}}
            onDelete={() => {}}
            readOnly={!share.allowComments}
            showInternalToggle={false}
          />
        </div>
      </div>
      {gate && (
        <div className="sd-overlay">
          <form className="sd sp-gate" onSubmit={submitGate} role="dialog" aria-modal="true" aria-label="Your details">
            <strong>Before you comment</strong>
            <p className="sd-empty">Tell us who you are so the owner knows who left this feedback.</p>
            <label>Name
              <input type="text" autoFocus value={gateName} maxLength={80} onChange={(e) => setGateName(e.target.value)} />
            </label>
            <label>Email
              <input type="email" value={gateEmail} onChange={(e) => setGateEmail(e.target.value)} />
            </label>
            {gateError && <div className="sd-error" role="alert">{gateError}</div>}
            <div className="sd-actions">
              <button type="submit" className="primary">Post comment</button>
              <button type="button" onClick={() => { setGate(null); setGateError(''); }}>Cancel</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
