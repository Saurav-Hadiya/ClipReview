import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../api.js';
import VideoPlayer from '../components/VideoPlayer.jsx';
import CommentPanel from '../components/CommentPanel.jsx';
import VersionSwitcher from '../components/VersionSwitcher.jsx';

export default function SharePage() {
  const { token } = useParams();
  const [state, setState] = useState('loading'); // loading | ok | passphrase | expired | notfound | error
  const [data, setData] = useState(null);
  const [versionId, setVersionId] = useState('');
  const [passphrase, setPassphrase] = useState(''); // in-memory only
  const [input, setInput] = useState('');
  const [authError, setAuthError] = useState('');
  const [currentTime, setCurrentTime] = useState(0);
  const seekRef = useRef(null);

  const headers = useCallback(
    (p) => (p ? { 'x-share-passphrase': p } : {}),
    [],
  );

  const load = useCallback(async (pass) => {
    try {
      const d = await api.get(`/api/public/shares/${token}`, headers(pass));
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
      if (e.status === 401) {
        setAuthError(e.data?.error === 'bad_passphrase' ? 'Incorrect passphrase' : '');
        setState('passphrase');
      } else if (e.status === 410) setState('expired');
      else if (e.status === 404) setState('notfound');
      else setState('error');
    }
  }, [token, headers]);

  useEffect(() => { setState('loading'); load(''); }, [load]);

  if (state === 'loading') return <div className="sp-msg">Loading{'…'}</div>;
  if (state === 'expired') return <div className="sp-msg"><h2>Link expired</h2><p>This share link is no longer valid.</p></div>;
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

  const { asset, share, comments } = data;
  const version = asset.versions.find((v) => v.id === versionId);
  const base = `/api/public/shares/${token}/media/${versionId}`;
  const q = passphrase ? `?p=${encodeURIComponent(passphrase)}` : '';
  const src = base + q;
  const downloadUrl = `${base}?download=1${passphrase ? `&p=${encodeURIComponent(passphrase)}` : ''}`;
  const visible = comments.filter((c) => c.versionId === versionId);

  const onAdd = async ({ time, endTime, text, author }) => {
    const c = await api.post(
      `/api/public/shares/${token}/comments`,
      { versionId, time, endTime, text, author: author || 'Guest' },
      headers(passphrase),
    );
    setData((d) => ({ ...d, comments: [...d.comments, c] }));
  };

  return (
    <div className="sp">
      <div className="sp-head">
        <h2>{asset.name}</h2>
        <VersionSwitcher versions={asset.versions} value={versionId} onChange={setVersionId} />
        {share.allowDownload && version && (
          <a className="btn" href={downloadUrl} download>Download</a>
        )}
      </div>
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
          />
        </div>
      </div>
    </div>
  );
}
