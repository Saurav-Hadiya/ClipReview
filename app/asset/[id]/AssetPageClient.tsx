'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { api, errorMessage, mediaUrl } from '@/lib/api';
import type { Anchor, Asset, AssetStatus, Comment } from '@/lib/types';
import type { Marks, NewComment, PinPlacement } from '@/lib/client-types';
import VideoPlayer, { type SeekFn } from '@/components/VideoPlayer';
import CompareViewer from '@/components/CompareViewer';
import CommentPanel from '@/components/CommentPanel';
import VersionSwitcher from '@/components/VersionSwitcher';
import UploadVersionButton from '@/components/UploadVersionButton';
import ShareDialog from '@/components/ShareDialog';

const STATUSES: [AssetStatus, string][] = [
  ['needs_review', 'Needs Review'],
  ['in_progress', 'In Progress'],
  ['approved', 'Approved'],
];

const sortC = (list: Comment[]) => [...list].sort((a, b) => a.time - b.time);

function storedAuthor() {
  try { return localStorage.getItem('vr_author') || null; } catch { return null; }
}

export default function AssetPage() {
  const { id } = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const [asset, setAsset] = useState<Asset | null>(null);
  const [versionId, setVersionId] = useState<string | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [time, setTime] = useState(0);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [showShare, setShowShare] = useState(false);
  const [name, setName] = useState('');
  const [marks, setMarks] = useState<Marks>({ inTime: null, outTime: null });
  const [pinMode, setPinMode] = useState(false);
  const [pendingAnchor, setPendingAnchor] = useState<Anchor | null>(null);
  const [focusSignal, setFocusSignal] = useState(0);
  const [compare, setCompare] = useState<{ a: string; b: string } | null>(null); // version ids
  const seekRef = useRef<SeekFn | null>(null);
  const timeRef = useRef(0);
  const deepLink = useRef<{ v: string | null; t: number | null } | null>(null);
  const fps = 24;

  if (deepLink.current === null) {
    const t = parseFloat(searchParams.get('t') ?? '');
    deepLink.current = { v: searchParams.get('v') || null, t: Number.isFinite(t) && t >= 0 ? t : null };
  }

  const applyAsset = useCallback((a: Asset, keepVersion: boolean = true) => {
    setAsset(a);
    setName(a.name);
    setVersionId((cur) => {
      if (keepVersion && cur && a.versions.some((v) => v.id === cur)) return cur;
      const want = deepLink.current?.v;
      if (want && a.versions.some((v) => v.id === want)) return want;
      return a.versions[a.versions.length - 1]?.id || null;
    });
  }, []);

  useEffect(() => {
    let alive = true;
    setAsset(null); setError('');
    api.get<Asset>(`/api/assets/${id}`).then((a) => { if (alive) applyAsset(a, false); }).catch((e) => alive && setError(errorMessage(e)));
    return () => { alive = false; };
  }, [id, applyAsset]);

  useEffect(() => {
    if (!versionId) return undefined;
    let alive = true;
    setComments([]);
    api.get<Comment[]>(`/api/assets/${id}/comments?versionId=${encodeURIComponent(versionId)}`)
      .then((c) => alive && setComments(c))
      .catch((e) => alive && setNotice(`Could not load comments: ${errorMessage(e)}`));
    return () => { alive = false; };
  }, [id, versionId]);

  const flash = (msg: string) => { setNotice(msg); setTimeout(() => setNotice(''), 5000); };

  const handleTime = useCallback((t: number) => { timeRef.current = t; setTime(t); }, []);
  const seek = (t: number) => seekRef.current?.(t);

  const changeVersion = (vid: string) => {
    deepLink.current = { v: null, t: null };
    setMarks({ inTime: null, outTime: null });
    setPendingAnchor(null);
    setVersionId(vid);
  };

  const add = async ({ time: t, endTime, durationFrames, text, author, anchor, internal, parentId }: NewComment) => {
    const parent = parentId ? comments.find((c) => c.id === parentId) : null;
    const tmp: Comment = {
      id: `tmp-${Date.now()}`, assetId: id, versionId: versionId as string, parentId: parentId || null,
      time: t, endTime: endTime ?? null, frame: Math.round(t * fps), durationFrames: durationFrames ?? null,
      anchor: anchor || null, internal: parent ? !!parent.internal : !!internal,
      text, author, authorEmail: null, resolved: false, completedAt: null, completedBy: null, createdAt: new Date().toISOString(),
    };
    setComments((c) => sortC([...c, tmp]));
    try {
      const saved = await api.post<Comment>(`/api/assets/${id}/comments`, {
        versionId, time: t, endTime: endTime ?? null, frame: tmp.frame, durationFrames: durationFrames ?? null,
        text, author, anchor: anchor || null, internal: !!internal, parentId: parentId || null,
      });
      setComments((c) => sortC(c.map((x) => (x.id === tmp.id ? saved : x))));
      if (!parentId) setMarks({ inTime: null, outTime: null });
    } catch (e) {
      setComments((c) => c.filter((x) => x.id !== tmp.id));
      throw e;
    }
  };

  const toggleResolved = async (c: Comment) => {
    const next = !(c.completedAt || c.resolved);
    const who = next ? storedAuthor() : null;
    const apply = (patch: Partial<Comment>) => setComments((l) => l.map((x) => (x.id === c.id ? { ...x, ...patch } : x)));
    apply({ resolved: next, completedAt: next ? new Date().toISOString() : null, completedBy: who });
    try {
      const saved = await api.patch<Comment>(`/api/comments/${c.id}`, { completed: next, completedBy: who || undefined });
      apply(saved);
    } catch (e) {
      apply({ resolved: c.resolved, completedAt: c.completedAt ?? null, completedBy: c.completedBy ?? null });
      flash(`Could not update comment: ${errorMessage(e)}`);
    }
  };

  const remove = async (c: Comment) => {
    const prev = comments;
    setComments((l) => l.filter((x) => x.id !== c.id && x.parentId !== c.id));
    try { await api.del(`/api/comments/${c.id}`); } catch (e) {
      setComments(prev);
      flash(`Could not delete comment: ${errorMessage(e)}`);
    }
  };

  const handleAnchor = ({ x, y, time: t }: PinPlacement) => {
    setPendingAnchor({ x, y });
    setPinMode(false);
    if (typeof t === 'number') seekRef.current?.(t);
    seekRef.current?.pause?.();
    setFocusSignal((n) => n + 1);
  };

  const requestComment = () => {
    seekRef.current?.pause?.();
    setFocusSignal((n) => n + 1);
  };

  const openCompare = () => {
    if (!asset) return;
    const vs = [...asset.versions].sort((a, b) => a.number - b.number);
    if (vs.length < 2) return;
    setCompare({ a: vs[vs.length - 2].id, b: vs[vs.length - 1].id });
  };

  const patchAsset = async (body: { name?: string; status?: AssetStatus }) => {
    try { setAsset(await api.patch<Asset>(`/api/assets/${id}`, body)); } catch (e) { flash(`Could not save: ${errorMessage(e)}`); if (asset) setName(asset.name); }
  };
  const commitName = () => {
    if (!asset) return;
    const n = name.trim();
    if (!n) { setName(asset.name); return; }
    if (n !== asset.name) patchAsset({ name: n });
  };

  if (error) return <div className="page"><p>{error}</p><Link href="/">Back to library</Link></div>;
  if (!asset) return <div className="page">Loading…</div>;

  return (
    <div className="page ap">
      <header className="ap-head">
        <Link href="/" className="ap-back">← Library</Link>
        <input
          className="ap-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={commitName}
          onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') { setName(asset.name); e.currentTarget.blur(); } }}
          aria-label="Asset name"
        />
        <select value={asset.status} onChange={(e) => patchAsset({ status: e.target.value as AssetStatus })} aria-label="Status">
          {STATUSES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <VersionSwitcher versions={asset.versions} value={versionId} onChange={changeVersion} />
        <button type="button" disabled={asset.versions.length < 2} onClick={() => (compare ? setCompare(null) : openCompare())} title={asset.versions.length < 2 ? 'Upload a second version to compare' : 'Compare two versions side by side'}>
          {compare ? 'Exit compare' : 'Compare versions'}
        </button>
        <UploadVersionButton assetId={asset.id} onUploaded={(a) => { applyAsset(a, false); }} />
        <button type="button" className="primary" onClick={() => setShowShare((s) => !s)}>Share</button>
      </header>
      {notice && <div className="ap-notice" role="alert">{notice}</div>}
      {compare && (() => {
        const vA = asset.versions.find((v) => v.id === compare.a);
        const vB = asset.versions.find((v) => v.id === compare.b);
        const sorted = [...asset.versions].sort((x, y) => x.number - y.number);
        const opts = sorted.map((v) => <option key={v.id} value={v.id}>{`v${v.number}`}</option>);
        return (
          <div className="ap-compare">
            <div className="ap-compare-pick">
              <label>A <select value={compare.a} onChange={(e) => setCompare((c) => (c ? { ...c, a: e.target.value } : c))}>{opts}</select></label>
              <label>B <select value={compare.b} onChange={(e) => setCompare((c) => (c ? { ...c, b: e.target.value } : c))}>{opts}</select></label>
              <span className="ap-dim">Comments attach to the active side.</span>
            </div>
            {vA && vB && (
              <CompareViewer
                key={`${compare.a}-${compare.b}`}
                srcA={mediaUrl(vA.id)}
                srcB={mediaUrl(vB.id)}
                labelA={`v${vA.number}`}
                labelB={`v${vB.number}`}
                fps={fps}
                onClose={() => setCompare(null)}
                onActiveChange={(side: 'A' | 'B') => { const v = side === 'B' ? vB : vA; if (v && v.id !== versionId) setVersionId(v.id); }}
              />
            )}
          </div>
        );
      })()}
      <div className="ap-main">
        <div className="ap-player">
          {versionId && !compare && (
            <>
              <VideoPlayer
                key={versionId}
                src={mediaUrl(versionId)}
                fps={fps}
                comments={comments.filter((c) => !c.parentId)}
                onTimeUpdate={handleTime}
                seekRef={seekRef}
                pinMode={pinMode}
                onAddAnchor={handleAnchor}
                markIn={marks.inTime}
                markOut={marks.outTime}
                onMarksChange={setMarks}
                onRequestComment={requestComment}
                initialTime={deepLink.current?.t ?? undefined}
              />
              <div className="ap-tools">
                <button type="button" className={pinMode ? 'primary' : ''} onClick={() => setPinMode((p) => !p)} aria-pressed={pinMode}>
                  {pinMode ? 'Click the video to place pin' : 'Pin to frame'}
                </button>
                {(marks.inTime != null || marks.outTime != null) && (
                  <button type="button" onClick={() => setMarks({ inTime: null, outTime: null })}>Clear I/O marks</button>
                )}
              </div>
            </>
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
            pendingAnchor={pendingAnchor}
            onClearAnchor={() => setPendingAnchor(null)}
            marks={marks}
            focusSignal={focusSignal}
            exportUrl={versionId ? `/api/assets/${id}/comments/export?versionId=${encodeURIComponent(versionId)}` : null}
          />
        </div>
      </div>
      {showShare && <ShareDialog assetId={asset.id} onClose={() => setShowShare(false)} />}
    </div>
  );
}
