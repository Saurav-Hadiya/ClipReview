'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { formatTimecode } from '@/lib/api';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

export default function CompareViewer({ srcA, srcB, labelA = 'A', labelB = 'B', fps = 24, onClose, onActiveChange }) {
  const refA = useRef(null);
  const refB = useRef(null);
  const refs = { A: refA, B: refB };
  const barRef = useRef(null);
  const dragging = useRef(false);
  const [linked, setLinked] = useState(true);
  const [active, setActive] = useState('A');
  const [playing, setPlaying] = useState({ A: false, B: false });
  const [times, setTimes] = useState({ A: 0, B: 0 });
  const [dur, setDur] = useState({ A: 0, B: 0 });
  const [rate, setRate] = useState(1);
  const linkedRef = useRef(linked);
  linkedRef.current = linked;
  const activeRef = useRef(active);
  activeRef.current = active;

  const targets = () => (linkedRef.current ? ['A', 'B'] : [activeRef.current]);

  const sync = useCallback(() => {
    const a = refA.current, b = refB.current;
    if (a && b) setTimes({ A: a.currentTime, B: b.currentTime });
    // keep B locked to A while linked
    if (linkedRef.current && a && b && b.duration && Math.abs(a.currentTime - b.currentTime) > 1.5 / fps) {
      b.currentTime = clamp(a.currentTime, 0, b.duration);
    }
  }, [fps]);

  const anyPlaying = playing.A || playing.B;
  useEffect(() => {
    if (!anyPlaying) return undefined;
    let raf;
    const tick = () => { sync(); raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [anyPlaying, sync]);

  useEffect(() => {
    if (refA.current) refA.current.playbackRate = rate;
    if (refB.current) refB.current.playbackRate = rate;
  }, [rate]);

  // when re-linking, align B to A
  useEffect(() => {
    if (!linked) return;
    const a = refA.current, b = refB.current;
    if (a && b) {
      b.currentTime = clamp(a.currentTime, 0, b.duration || Infinity);
      if (!a.paused) b.play().catch(() => {}); else b.pause();
    }
  }, [linked]);

  const playPause = (keys) => {
    const list = keys || targets();
    const anyP = list.some((k) => refs[k].current && !refs[k].current.paused);
    list.forEach((k) => {
      const v = refs[k].current; if (!v) return;
      if (anyP) v.pause(); else v.play().catch(() => {});
    });
  };

  const seekTo = (t) => {
    targets().forEach((k) => {
      const v = refs[k].current; if (v) v.currentTime = clamp(t, 0, v.duration || Infinity);
    });
    sync();
  };

  const stepFrames = (n) => {
    targets().forEach((k) => {
      const v = refs[k].current; if (!v) return;
      v.pause();
      v.currentTime = clamp(v.currentTime + n / fps, 0, v.duration || Infinity);
    });
    sync();
  };

  const handlers = useRef({});
  handlers.current = { stepFrames, playPause };
  useEffect(() => {
    const onKey = (e) => {
      const tag = e.target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.target?.isContentEditable) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === 'ArrowLeft') { e.preventDefault(); handlers.current.stepFrames(e.shiftKey ? -10 : -1); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); handlers.current.stepFrames(e.shiftKey ? 10 : 1); }
      else if (e.key === ' ' || e.key === 'k' || e.key === 'K') { e.preventDefault(); handlers.current.playPause(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const pickActive = (k) => { setActive(k); onActiveChange?.(k); };

  const refTime = linked ? times.A : times[active];
  const refDur = linked ? Math.max(dur.A, dur.B) : dur[active];
  const pct = refDur ? clamp((refTime / refDur) * 100, 0, 100) : 0;

  const fromPointer = (e) => {
    const r = barRef.current.getBoundingClientRect();
    seekTo(clamp((e.clientX - r.left) / r.width, 0, 1) * refDur);
  };

  const side = (k, src, label) => (
    <div className={`cv-side${active === k ? ' active' : ''}`}>
      <button type="button" className="cv-head" onClick={() => pickActive(k)} aria-pressed={active === k}>
        <span className="cv-tag">{k}</span> {label}{active === k ? ' (active)' : ''}
      </button>
      <video
        ref={refs[k]}
        src={src}
        preload="metadata"
        playsInline
        onClick={() => pickActive(k)}
        onLoadedMetadata={(e) => { const v = e.currentTarget; setDur((d) => ({ ...d, [k]: v.duration || 0 })); v.playbackRate = rate; }}
        onPlay={() => {
          setPlaying((p) => ({ ...p, [k]: true }));
          if (linkedRef.current && k === 'A' && refB.current?.paused) refB.current.play().catch(() => {});
        }}
        onPause={() => {
          setPlaying((p) => ({ ...p, [k]: false }));
          if (linkedRef.current && k === 'A' && refB.current && !refB.current.paused) refB.current.pause();
          sync();
        }}
        onSeeked={sync}
      />
      {!linked && (
        <div className="cv-side-ctl">
          <button type="button" onClick={() => playPause([k])}>{playing[k] ? '❚❚' : '▶'}</button>
          <span className="vp-time">{formatTimecode(times[k], fps)}</span>
        </div>
      )}
    </div>
  );

  return (
    <div className="cv">
      <div className="cv-top">
        <strong>Compare versions</strong>
        <label className="cv-link">
          <input type="checkbox" checked={linked} onChange={(e) => setLinked(e.target.checked)} /> Linked
        </label>
        <span className="vp-spacer" />
        <button type="button" onClick={onClose}>Close</button>
      </div>
      <div className="cv-grid">
        {side('A', srcA, labelA)}
        {side('B', srcB, labelB)}
      </div>
      <div
        className="vp-bar"
        ref={barRef}
        onPointerDown={(e) => { dragging.current = true; e.currentTarget.setPointerCapture(e.pointerId); fromPointer(e); }}
        onPointerMove={(e) => { if (dragging.current) fromPointer(e); }}
        onPointerUp={() => { dragging.current = false; }}
        onPointerCancel={() => { dragging.current = false; }}
      >
        <div className="vp-track"><div className="vp-fill" style={{ width: `${pct}%` }} /></div>
        <div className="vp-head" style={{ left: `${pct}%` }} />
      </div>
      <div className="vp-controls">
        <button type="button" onClick={() => playPause()} aria-label="Play/Pause">{(linked ? anyPlaying : playing[active]) ? '❚❚' : '▶'}</button>
        <button type="button" onClick={() => stepFrames(-1)} title="Previous frame (←)">{'‹'}</button>
        <button type="button" onClick={() => stepFrames(1)} title="Next frame (→)">{'›'}</button>
        <span className="vp-time">{formatTimecode(refTime, fps)} <span className="vp-dim">/ {formatTimecode(refDur, fps)}</span></span>
        {!linked && <span className="vp-dim">controls act on side {active}</span>}
        <span className="vp-spacer" />
        <label className="vp-speed" title="Playback speed">
          <input type="range" min="0.25" max="1.75" step="0.05" value={rate} onChange={(e) => setRate(Number(e.target.value))} aria-label="Playback speed" />
          <span>{rate.toFixed(2)}x</span>
        </label>
      </div>
    </div>
  );
}
