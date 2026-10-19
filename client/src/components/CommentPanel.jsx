import { useMemo, useState } from 'react';
import { formatTimecode } from '../api.js';

function loadAuthor() {
  try { return localStorage.getItem('vr_author') || ''; } catch { return ''; }
}
function saveAuthor(v) {
  try { localStorage.setItem('vr_author', v); } catch { /* ignore */ }
}

export default function CommentPanel({ comments = [], currentTime = 0, fps = 24, onSeek, onAdd, onToggleResolved, onDelete, readOnly = false }) {
  const [filter, setFilter] = useState('all');
  const [text, setText] = useState('');
  const [author, setAuthor] = useState(loadAuthor);
  const [endTime, setEndTime] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const sorted = useMemo(() => [...comments].sort((a, b) => a.time - b.time), [comments]);
  const shown = sorted.filter((c) => filter === 'all' || (filter === 'open' ? !c.resolved : c.resolved));

  // active = the latest comment at or before the playhead (or inside its range)
  const activeId = useMemo(() => {
    const frame = 1 / fps;
    let id = null;
    for (const c of sorted) {
      const end = c.endTime != null && c.endTime > c.time ? c.endTime : c.time + 1.5;
      if (currentTime + frame / 2 >= c.time && currentTime <= end) id = c.id;
    }
    return id;
  }, [sorted, currentTime, fps]);

  const submit = async () => {
    const body = text.trim();
    if (!body || busy) return;
    setBusy(true); setErr('');
    saveAuthor(author.trim());
    try {
      await onAdd({
        time: currentTime,
        endTime: endTime != null && endTime > currentTime ? endTime : null,
        text: body,
        author: author.trim() || 'Anonymous',
      });
      setText(''); setEndTime(null);
    } catch (e) {
      setErr(e.message || 'Failed to add comment');
    } finally { setBusy(false); }
  };

  return (
    <div className="cp">
      <div className="cp-head">
        <strong>Comments ({comments.length})</strong>
        <div className="cp-filter">
          {['all', 'open', 'resolved'].map((f) => (
            <button key={f} type="button" className={filter === f ? 'on' : ''} onClick={() => setFilter(f)}>
              {f[0].toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {!readOnly && (
        <div className="cp-composer">
          <div className="cp-pin">
            <span className="cp-chip">{formatTimecode(currentTime, fps)}</span>
            {endTime != null ? (
              <>
                <span>→</span>
                <span className="cp-chip">{formatTimecode(endTime, fps)}</span>
                <button type="button" onClick={() => setEndTime(currentTime)}>Update out</button>
                <button type="button" onClick={() => setEndTime(null)}>Clear</button>
              </>
            ) : (
              <button type="button" onClick={() => setEndTime(currentTime)}>Set out point</button>
            )}
          </div>
          <textarea
            rows={3}
            placeholder="Add a comment at this frame… (Ctrl+Enter to post)"
            value={text}
            maxLength={2000}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); submit(); } }}
          />
          <div className="cp-row">
            <input placeholder="Your name" value={author} onChange={(e) => setAuthor(e.target.value)} onBlur={() => saveAuthor(author.trim())} />
            <button type="button" className="primary" disabled={!text.trim() || busy} onClick={submit}>Post</button>
          </div>
          {err && <div className="cp-err">{err}</div>}
        </div>
      )}

      <ul className="cp-list">
        {shown.length === 0 && <li className="cp-empty">No comments{filter !== 'all' ? ` (${filter})` : ' yet'}.</li>}
        {shown.map((c) => (
          <li key={c.id} className={`cp-item${c.id === activeId ? ' active' : ''}${c.resolved ? ' resolved' : ''}`}>
            <div className="cp-meta">
              <button type="button" className="cp-chip" onClick={() => onSeek?.(c.time)} title="Jump to time">
                {formatTimecode(c.time, fps)}{c.endTime != null && c.endTime > c.time ? ` – ${formatTimecode(c.endTime, fps)}` : ''}
              </button>
              <span className="cp-author">{c.author}</span>
              <span className="vp-spacer" />
              {!readOnly && (
                <>
                  <label className="cp-resolve">
                    <input type="checkbox" checked={!!c.resolved} onChange={() => onToggleResolved?.(c)} /> Resolved
                  </label>
                  <button type="button" className="cp-del" onClick={() => onDelete?.(c)} title="Delete" aria-label="Delete comment">✕</button>
                </>
              )}
              {readOnly && c.resolved && <span className="cp-dim">Resolved</span>}
            </div>
            <div className="cp-text">{c.text}</div>
          </li>
        ))}
      </ul>
    </div>
  );
}
