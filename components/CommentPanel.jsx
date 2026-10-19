'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { formatTimecode } from '@/lib/api';

function loadAuthor() {
  try { return localStorage.getItem('vr_author') || ''; } catch { return ''; }
}
function saveAuthor(v) {
  try { localStorage.setItem('vr_author', v); } catch { /* ignore */ }
}

const SORTS = [
  ['timecode', 'Timecode'],
  ['newest', 'Newest'],
  ['oldest', 'Oldest'],
  ['commenter', 'Commenter'],
  ['completion', 'Completion'],
];

const isDone = (c) => !!(c.completedAt || c.resolved);
const hasRange = (c) => c.endTime != null && c.endTime > c.time;

function sortThreads(list, mode) {
  const byTime = (a, b) => a.time - b.time;
  const out = [...list];
  switch (mode) {
    case 'newest': return out.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    case 'oldest': return out.sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
    case 'commenter': return out.sort((a, b) => String(a.author).localeCompare(String(b.author)) || byTime(a, b));
    case 'completion': return out.sort((a, b) => Number(isDone(a)) - Number(isDone(b)) || byTime(a, b));
    default: return out.sort(byTime);
  }
}

function LockIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" aria-hidden="true" fill="currentColor">
      <path d="M8 1a3 3 0 0 0-3 3v2H4a1 1 0 0 0-1 1v7a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V7a1 1 0 0 0-1-1h-1V4a3 3 0 0 0-3-3zm-1.5 3a1.5 1.5 0 0 1 3 0v2h-3V4z" />
    </svg>
  );
}

function exportHref(base, format) {
  if (!base) return null;
  return `${base}${base.includes('?') ? '&' : '?'}format=${format}`;
}

export default function CommentPanel({
  comments = [], currentTime = 0, fps = 24, onSeek, onAdd, onToggleResolved, onDelete,
  readOnly = false, pendingAnchor = null, onClearAnchor, marks = null, focusSignal = 0,
  exportUrl = null, showInternalToggle = true,
}) {
  const [filter, setFilter] = useState('all');
  const [sort, setSort] = useState('timecode');
  const [person, setPerson] = useState('');
  const [text, setText] = useState('');
  const [author, setAuthor] = useState(loadAuthor);
  const [endTime, setEndTime] = useState(null);
  const [internal, setInternal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [replyTo, setReplyTo] = useState(null);
  const [replyText, setReplyText] = useState('');
  const [copied, setCopied] = useState('');
  const textRef = useRef(null);

  useEffect(() => {
    if (focusSignal) textRef.current?.focus();
  }, [focusSignal]);

  const { tops, repliesOf } = useMemo(() => {
    const map = new Map();
    const topList = [];
    for (const c of comments) {
      if (c.parentId) {
        if (!map.has(c.parentId)) map.set(c.parentId, []);
        map.get(c.parentId).push(c);
      } else topList.push(c);
    }
    for (const arr of map.values()) arr.sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
    return { tops: topList, repliesOf: map };
  }, [comments]);

  const people = useMemo(() => [...new Set(tops.map((c) => c.author).filter(Boolean))].sort(), [tops]);

  const shown = useMemo(() => sortThreads(
    tops.filter((c) => (filter === 'all' || (filter === 'open' ? !isDone(c) : isDone(c)))
      && (!person || c.author === person)),
    sort,
  ), [tops, filter, person, sort]);

  const timeSorted = useMemo(() => [...tops].sort((a, b) => a.time - b.time), [tops]);
  const activeId = useMemo(() => {
    const frame = 1 / fps;
    let id = null;
    for (const c of timeSorted) {
      const end = hasRange(c) ? c.endTime : c.time + 1.5;
      if (currentTime + frame / 2 >= c.time && currentTime <= end) id = c.id;
    }
    return id;
  }, [timeSorted, currentTime, fps]);

  // Effective timing for a new comment: I/O marks win, else the playhead (+ optional local out point).
  const hasMarks = !!marks && marks.inTime != null;
  const startT = hasMarks ? marks.inTime : currentTime;
  const outT = hasMarks && marks.outTime != null ? marks.outTime : endTime;
  const rangeOut = outT != null && outT > startT ? outT : null;

  const submit = async () => {
    const body = text.trim();
    if (!body || busy) return;
    setBusy(true); setErr('');
    saveAuthor(author.trim());
    try {
      await onAdd({
        time: startT,
        endTime: rangeOut,
        durationFrames: rangeOut != null ? Math.max(1, Math.round((rangeOut - startT) * fps)) : null,
        text: body,
        author: author.trim() || 'Anonymous',
        anchor: pendingAnchor ? { x: pendingAnchor.x, y: pendingAnchor.y } : null,
        internal: showInternalToggle ? internal : false,
        parentId: null,
      });
      setText(''); setEndTime(null); onClearAnchor?.();
    } catch (e) {
      setErr(e.message || 'Failed to add comment');
    } finally { setBusy(false); }
  };

  const submitReply = async (parent) => {
    const body = replyText.trim();
    if (!body || busy) return;
    setBusy(true); setErr('');
    saveAuthor(author.trim());
    try {
      await onAdd({
        time: parent.time,
        endTime: parent.endTime ?? null,
        durationFrames: null,
        text: body,
        author: author.trim() || 'Anonymous',
        anchor: null,
        internal: !!parent.internal,
        parentId: parent.id,
      });
      setReplyText(''); setReplyTo(null);
    } catch (e) {
      setErr(e.message || 'Failed to add reply');
    } finally { setBusy(false); }
  };

  const copyLink = async (c) => {
    const t = Number(c.time).toFixed(3).replace(/\.?0+$/, '') || '0';
    const url = `${location.origin}${location.pathname}?v=${encodeURIComponent(c.versionId)}&t=${t}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(c.id);
      setTimeout(() => setCopied((cur) => (cur === c.id ? '' : cur)), 1500);
    } catch {
      window.prompt('Copy link', url);
    }
  };

  const csvHref = exportHref(exportUrl, 'csv');
  const jsonHref = exportHref(exportUrl, 'json');

  const renderReply = (r) => (
    <li key={r.id} className="cp-reply">
      <div className="cp-meta">
        <span className="cp-author">{r.author}</span>
        {r.internal && <span className="cp-lock" title="Internal"><LockIcon /></span>}
        <span className="cp-dim">{r.createdAt ? new Date(r.createdAt).toLocaleString() : ''}</span>
        <span className="vp-spacer" />
        {!readOnly && (
          <button type="button" className="cp-del" onClick={() => onDelete?.(r)} title="Delete reply" aria-label="Delete reply">✕</button>
        )}
      </div>
      <div className="cp-text">{r.text}</div>
    </li>
  );

  return (
    <div className="cp">
      <div className="cp-head">
        <strong>Comments ({comments.length})</strong>
        <div className="cp-filter">
          {[['all', 'All'], ['open', 'Open'], ['completed', 'Completed']].map(([f, label]) => (
            <button key={f} type="button" className={filter === f ? 'on' : ''} onClick={() => setFilter(f)}>{label}</button>
          ))}
        </div>
      </div>

      <div className="cp-tools">
        <label className="cp-sel">Sort
          <select value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort comments">
            {SORTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </label>
        <label className="cp-sel">Person
          <select value={person} onChange={(e) => setPerson(e.target.value)} aria-label="Filter by person">
            <option value="">Everyone</option>
            {people.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </label>
        {csvHref && (
          <span className="cp-export">
            <a href={csvHref} download>CSV</a>
            <a href={jsonHref} download>JSON</a>
          </span>
        )}
      </div>

      {!readOnly && (
        <div className="cp-composer">
          <div className="cp-pin">
            <span className="cp-chip">{formatTimecode(startT, fps)}</span>
            {rangeOut != null && <><span>→</span><span className="cp-chip">{formatTimecode(rangeOut, fps)}</span></>}
            {!hasMarks && (rangeOut != null ? (
              <>
                <button type="button" onClick={() => setEndTime(currentTime)}>Update out</button>
                <button type="button" onClick={() => setEndTime(null)}>Clear</button>
              </>
            ) : (
              <button type="button" onClick={() => setEndTime(currentTime)}>Set out point</button>
            ))}
            {hasMarks && <span className="cp-dim">from I/O marks</span>}
          </div>
          {pendingAnchor && (
            <div className="cp-pin">
              <span className="cp-chip">Pinned at {pendingAnchor.x.toFixed(2)}, {pendingAnchor.y.toFixed(2)}</span>
              <button type="button" onClick={() => onClearAnchor?.()}>Remove pin</button>
            </div>
          )}
          <textarea
            ref={textRef}
            rows={3}
            placeholder="Add a comment at this frame… (Ctrl+Enter to post)"
            value={text}
            maxLength={2000}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); submit(); } }}
          />
          <div className="cp-row">
            <input placeholder="Your name" value={author} onChange={(e) => setAuthor(e.target.value)} onBlur={() => saveAuthor(author.trim())} />
            {showInternalToggle && (
              <button type="button" className={`cp-vis${internal ? ' on' : ''}`} onClick={() => setInternal((v) => !v)} aria-pressed={internal} title="Internal comments are hidden from share links">
                {internal ? <><LockIcon /> Internal</> : 'Public'}
              </button>
            )}
            <button type="button" className="primary" disabled={!text.trim() || busy} onClick={submit}>Post</button>
          </div>
          {err && <div className="cp-err">{err}</div>}
        </div>
      )}

      <ul className="cp-list">
        {shown.length === 0 && <li className="cp-empty">No comments{filter !== 'all' || person ? ' match' : ' yet'}.</li>}
        {shown.map((c) => {
          const replies = repliesOf.get(c.id) || [];
          const done = isDone(c);
          return (
            <li key={c.id} className={`cp-item${c.id === activeId ? ' active' : ''}${done ? ' resolved' : ''}`}>
              <div className="cp-meta">
                <button type="button" className="cp-chip" onClick={() => onSeek?.(c.time)} title="Jump to time">
                  {formatTimecode(c.time, fps)}{hasRange(c) ? ` – ${formatTimecode(c.endTime, fps)}` : ''}
                </button>
                {c.anchor && <span className="cp-dim" title={`Pinned at ${c.anchor.x.toFixed(2)}, ${c.anchor.y.toFixed(2)}`}>pin</span>}
                <span className="cp-author">{c.author}</span>
                {c.internal && <span className="cp-lock" title="Internal"><LockIcon /></span>}
                <span className="vp-spacer" />
                <button type="button" className="cp-link" onClick={() => copyLink(c)} title="Copy link to this timestamp">
                  {copied === c.id ? 'Copied' : 'Copy link'}
                </button>
                {!readOnly && (
                  <button type="button" className="cp-del" onClick={() => onDelete?.(c)} title="Delete" aria-label="Delete comment">✕</button>
                )}
              </div>
              <div className="cp-text">{c.text}</div>
              <div className="cp-actions">
                {!readOnly ? (
                  <>
                    <label className="cp-resolve">
                      <input type="checkbox" checked={done} onChange={() => onToggleResolved?.(c)} /> {done ? 'Completed' : 'Mark complete'}
                    </label>
                    <button type="button" className="cp-link" onClick={() => { setReplyTo(replyTo === c.id ? null : c.id); setReplyText(''); }}>Reply</button>
                  </>
                ) : done && <span className="cp-dim">Completed</span>}
                {done && c.completedBy && <span className="cp-dim">by {c.completedBy}</span>}
              </div>
              {(replies.length > 0 || replyTo === c.id) && (
                <ul className="cp-replies">
                  {replies.map(renderReply)}
                  {replyTo === c.id && !readOnly && (
                    <li className="cp-replybox">
                      <textarea
                        rows={2}
                        autoFocus
                        placeholder="Reply… (Ctrl+Enter to post)"
                        value={replyText}
                        maxLength={2000}
                        onChange={(e) => setReplyText(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); submitReply(c); } if (e.key === 'Escape') setReplyTo(null); }}
                      />
                      <div className="cp-row">
                        <button type="button" className="primary" disabled={!replyText.trim() || busy} onClick={() => submitReply(c)}>Reply</button>
                        <button type="button" onClick={() => setReplyTo(null)}>Cancel</button>
                      </div>
                    </li>
                  )}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
