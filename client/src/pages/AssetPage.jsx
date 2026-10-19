import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, mediaUrl } from '../api.js';
import VideoPlayer from '../components/VideoPlayer.jsx';
import CommentPanel from '../components/CommentPanel.jsx';
import VersionSwitcher from '../components/VersionSwitcher.jsx';
import UploadVersionButton from '../components/UploadVersionButton.jsx';
import ShareDialog from '../components/ShareDialog.jsx';

const STATUSES = [
  ['in_review', 'In review'],
  ['approved', 'Approved'],
  ['needs_changes', 'Needs changes'],
];

export default function AssetPage() {
  const { id } = useParams();
  const [asset, setAsset] = useState(null);
  const [versionId, setVersionId] = useState(null);
  const [comments, setComments] = useState([]);
  const [time, setTime] = useState(0);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [showShare, setShowShare] = useState(false);
  const [name, setName] = useState('');
  const seekRef = useRef(null);
  const timeRef = useRef(0);
  const fps = 24;

  const applyAsset = useCallback((a, keepVersion = true) => {
    setAsset(a);
    setName(a.name);
    setVersionId((cur) => (keepVersion && cur && a.versions.some((v) => v.id === cur) ? cur : a.versions[a.versions.length - 1]?.id || null));
  }, []);

  useEffect(() => {
    let alive = true;
    setAsset(null); setError('');
    api.get(`/api/assets/${id}`).then((a) => { if (alive) applyAsset(a, false); }).catch((e) => alive && setError(e.message));
    return () => { alive = false; };
  }, [id, applyAsset]);

  useEffect(() => {
    if (!versionId) return undefined;
    let alive = true;
    setComments([]);
    api.get(`/api/assets/${id}/comments?versionId=${encodeURIComponent(versionId)}`)
      .then((c) => alive && setComments(c))
      .catch((e) => alive && setNotice(`Could not load comments: ${e.message}`));
    return () => { alive = false; };
  }, [id, versionId]);

  const flash = (msg) => { setNotice(msg); setTimeout(() => setNotice(''), 5000); };

  const handleTime = useCallback((t) => { timeRef.current = t; setTime(t); }, []);
  const seek = (t) => seekRef.current?.(t);

  const sortC = (list) => [...list].sort((a, b) => a.time - b.time);

  const add = async ({ time: t, endTime, text, author }) => {
    const tmp = {
      id: `tmp-${Date.now()}`, assetId: id, versionId, time: t, endTime, frame: Math.round(t * fps),
      text, author, resolved: false, createdAt: new Date().toISOString(),
    };
    setComments((c) => sortC([...c, tmp]));
    try {
      const saved = await api.post(`/api/assets/${id}/comments`, { versionId, time: t, endTime, frame: tmp.frame, text, author });
      setComments((c) => sortC(c.map((x) => (x.id === tmp.id ? saved : x))));
    } catch (e) {
      setComments((c) => c.filter((x) => x.id !== tmp.id));
      throw e;
    }
  };

  const toggleResolved = async (c) => {
    const next = !c.resolved;
    setComments((l) => l.map((x) => (x.id === c.id ? { ...x, resolved: next } : x)));
    try { await api.patch(`/api/comments/${c.id}`, { resolved: next }); } catch (e) {
      setComments((l) => l.map((x) => (x.id === c.id ? { ...x, resolved: c.resolved } : x)));
      flash(`Could not update comment: ${e.message}`);
    }
  };

  const remove = async (c) => {
    const prev = comments;
    setComments((l) => l.filter((x) => x.id !== c.id));
    try { await api.del(`/api/comments/${c.id}`); } catch (e) {
      setComments(prev);
      flash(`Could not delete comment: ${e.message}`);
    }
  };

  const patchAsset = async (body) => {
    try { setAsset(await api.patch(`/api/assets/${id}`, body)); } catch (e) { flash(`Could not save: ${e.message}`); if (asset) setName(asset.name); }
  };
  const commitName = () => {
    const n = name.trim();
    if (!n) { setName(asset.name); return; }
    if (n !== asset.name) patchAsset({ name: n });
  };

  if (error) return <div className="page"><p>{error}</p><Link to="/">Back to library</Link></div>;
  if (!asset) return <div className="page">Loading…</div>;

  return (
    <div className="page ap">
      <header className="ap-head">
        <Link to="/" className="ap-back">← Library</Link>
        <input
          className="ap-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={commitName}
          onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') { setName(asset.name); e.currentTarget.blur(); } }}
          aria-label="Asset name"
        />
        <select value={asset.status} onChange={(e) => patchAsset({ status: e.target.value })} aria-label="Status">
          {STATUSES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <VersionSwitcher versions={asset.versions} value={versionId} onChange={setVersionId} />
        <UploadVersionButton assetId={asset.id} onUploaded={(a) => { applyAsset(a, false); }} />
        <button type="button" className="primary" onClick={() => setShowShare((s) => !s)}>Share</button>
      </header>
      {notice && <div className="ap-notice" role="alert">{notice}</div>}
      <div className="ap-main">
        <div className="ap-player">
          {versionId && (
            <VideoPlayer key={versionId} src={mediaUrl(versionId)} fps={fps} comments={comments} onTimeUpdate={handleTime} seekRef={seekRef} />
          )}
        </div>
        <div className="ap-side" onFocus={(e) => { if (e.target.tagName === 'TEXTAREA') seekRef.current?.pause?.(); }}>
          <CommentPanel
            comments={comments}
            currentTime={time}
            fps={fps}
            onSeek={seek}
            onAdd={add}
            onToggleResolved={toggleResolved}
            onDelete={remove}
          />
        </div>
      </div>
      {showShare && <ShareDialog assetId={asset.id} onClose={() => setShowShare(false)} />}
    </div>
  );
}
