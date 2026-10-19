'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { formatTimecode } from '@/lib/api';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const SHUTTLE_STEPS = [2, 4, 8];

const SHORTCUTS = [
  ['Space / K', 'Play / pause'],
  ['L / J', 'Shuttle forward / reverse (2x, 4x, 8x)'],
  ['← / →', 'Step one frame'],
  ['Shift + ← / →', 'Step ten frames'],
  ['I / O', 'Set in / out point'],
  ['Shift + I / O', 'Jump to in / out point'],
  ['R', 'Toggle range from marks'],
  ['C', 'Add comment'],
  ['F', 'Fullscreen'],
  ['M', 'Mute'],
  ['Ctrl + L', 'Toggle loop'],
  ['?', 'Show / hide this help'],
];

export default function VideoPlayer({
  src, fps = 24, comments = [], onTimeUpdate, seekRef,
  onAddAnchor, pinMode = false, markIn = null, markOut = null, onMarksChange,
  onRequestComment, initialTime,
}) {
  const videoRef = useRef(null);
  const wrapRef = useRef(null);
  const barRef = useRef(null);
  const draggingRef = useRef(false);
  const shuttle = useRef(0);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [rate, setRate] = useState(1);
  const [shuttleLabel, setShuttleLabel] = useState('');
  const [loop, setLoop] = useState(false);
  const [pinOn, setPinOn] = useState(!!pinMode);
  const [showHelp, setShowHelp] = useState(false);
  const [error, setError] = useState(false);
  const [localMarks, setLocalMarks] = useState({ inTime: markIn, outTime: markOut });

  const onTimeRef = useRef(onTimeUpdate);
  onTimeRef.current = onTimeUpdate;
  const loopRef = useRef(false);
  loopRef.current = loop;
  const initialRef = useRef(initialTime);
  initialRef.current = initialTime;

  useEffect(() => { setPinOn(!!pinMode); }, [pinMode]);
  useEffect(() => { setLocalMarks({ inTime: markIn, outTime: markOut }); }, [markIn, markOut]);
  const marks = localMarks;
  const marksRef = useRef(marks);
  marksRef.current = marks;

  const setMarks = useCallback((next) => {
    marksRef.current = next;
    setLocalMarks(next);
    onMarksChange?.(next);
  }, [onMarksChange]);

  const seek = useCallback((t) => {
    const v = videoRef.current;
    if (!v) return;
    const d = v.duration || Infinity;
    v.currentTime = clamp(t, 0, d);
    setTime(v.currentTime);
    onTimeRef.current?.(v.currentTime);
  }, []);

  const report = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    // loop within marks (or whole video via native loop attr)
    const m = marksRef.current;
    if (loopRef.current && !v.paused && m.outTime != null && v.currentTime >= m.outTime) {
      v.currentTime = m.inTime != null ? m.inTime : 0;
    }
    setTime(v.currentTime);
    onTimeRef.current?.(v.currentTime);
  }, []);

  useEffect(() => {
    if (seekRef) {
      const fn = (t) => seek(t);
      fn.pause = () => { shuttle.current = 0; setShuttleLabel(''); videoRef.current?.pause(); };
      seekRef.current = fn;
    }
    return () => { if (seekRef) seekRef.current = null; };
  }, [seekRef, seek]);

  useEffect(() => {
    if (!playing) return undefined;
    let raf;
    const tick = () => { report(); raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, report]);

  useEffect(() => { setError(false); setTime(0); setPlaying(false); shuttle.current = 0; setShuttleLabel(''); }, [src]);

  const toggle = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (shuttle.current !== 0) { shuttle.current = 0; setShuttleLabel(''); v.playbackRate = rate; }
    if (v.paused) v.play().catch(() => {}); else v.pause();
  }, [rate]);

  const step = useCallback((frames) => {
    const v = videoRef.current;
    if (!v) return;
    shuttle.current = 0; setShuttleLabel('');
    v.playbackRate = rate;
    v.pause();
    seek(v.currentTime + frames / fps);
  }, [fps, seek, rate]);

  const doShuttle = useCallback((dir) => {
    const v = videoRef.current;
    if (!v) return;
    const cur = shuttle.current;
    let speed = SHUTTLE_STEPS[0];
    if (Math.sign(cur) === dir) {
      const i = SHUTTLE_STEPS.indexOf(Math.abs(cur));
      speed = SHUTTLE_STEPS[(i + 1) % SHUTTLE_STEPS.length];
    }
    shuttle.current = dir * speed;
    setShuttleLabel(`${dir < 0 ? '◀◀' : '▶▶'} ${speed}x`);
    if (dir > 0) {
      v.playbackRate = speed;
      v.play().catch(() => {});
    } else {
      v.pause();
    }
  }, []);

  // reverse shuttle driver
  useEffect(() => {
    const id = setInterval(() => {
      const v = videoRef.current;
      if (v && shuttle.current < 0) {
        if (v.currentTime > 0) {
          v.currentTime = Math.max(0, v.currentTime - Math.abs(shuttle.current) * 0.1);
          report();
        } else {
          shuttle.current = 0; setShuttleLabel('');
        }
      }
    }, 100);
    return () => clearInterval(id);
  }, [report]);

  const fullscreen = useCallback(() => {
    if (document.fullscreenElement) document.exitFullscreen();
    else wrapRef.current?.requestFullscreen?.();
  }, []);

  const toggleMute = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = !v.muted;
    setMuted(v.muted);
  }, []);

  const setIn = useCallback(() => {
    const v = videoRef.current; if (!v) return;
    const t = v.currentTime;
    const m = marksRef.current;
    setMarks({ inTime: t, outTime: m.outTime != null && m.outTime > t ? m.outTime : null });
  }, [setMarks]);

  const setOut = useCallback(() => {
    const v = videoRef.current; if (!v) return;
    const t = v.currentTime;
    const m = marksRef.current;
    setMarks({ inTime: m.inTime != null && m.inTime < t ? m.inTime : null, outTime: t });
  }, [setMarks]);

  const toggleRange = useCallback(() => {
    const v = videoRef.current; if (!v) return;
    const m = marksRef.current;
    if (m.inTime != null && m.outTime != null) setMarks({ inTime: null, outTime: null });
    else if (m.inTime != null && v.currentTime > m.inTime) setMarks({ inTime: m.inTime, outTime: v.currentTime });
    else setMarks({ inTime: v.currentTime, outTime: null });
  }, [setMarks]);

  useEffect(() => {
    const onKey = (e) => {
      const el = e.target;
      const tag = el?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el?.isContentEditable) return;
      if (e.altKey) return;
      const key = e.key;
      if ((e.ctrlKey || e.metaKey)) {
        if (e.ctrlKey && !e.metaKey && (key === 'l' || key === 'L')) { e.preventDefault(); setLoop((l) => !l); }
        return;
      }
      const lower = key.length === 1 ? key.toLowerCase() : key;
      switch (lower) {
        case ' ': case 'k': e.preventDefault(); toggle(); break;
        case 'l': doShuttle(1); break;
        case 'j': doShuttle(-1); break;
        case 'ArrowLeft': e.preventDefault(); step(e.shiftKey ? -10 : -1); break;
        case 'ArrowRight': e.preventDefault(); step(e.shiftKey ? 10 : 1); break;
        case 'i':
          if (e.shiftKey) { const t = marksRef.current.inTime; if (t != null) seek(t); } else setIn();
          break;
        case 'o':
          if (e.shiftKey) { const t = marksRef.current.outTime; if (t != null) seek(t); } else setOut();
          break;
        case 'r': toggleRange(); break;
        case 'c':
          if (onRequestComment) { videoRef.current?.pause(); e.preventDefault(); onRequestComment(); }
          break;
        case 'f': fullscreen(); break;
        case 'm': toggleMute(); break;
        case '?': setShowHelp((s) => !s); break;
        case 'Escape': setShowHelp(false); break;
        default:
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toggle, step, doShuttle, seek, setIn, setOut, toggleRange, onRequestComment, fullscreen, toggleMute]);

  const seekFromPointer = (e) => {
    const r = barRef.current.getBoundingClientRect();
    const p = clamp((e.clientX - r.left) / r.width, 0, 1);
    seek(p * (duration || 0));
  };
  const onBarDown = (e) => {
    if (e.target.closest('.vp-marker')) return;
    draggingRef.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    seekFromPointer(e);
  };
  const onBarMove = (e) => { if (draggingRef.current) seekFromPointer(e); };
  const onBarUp = () => { draggingRef.current = false; };

  const onStageClick = (e) => {
    if (e.target.closest('.vp-pin')) return;
    if (pinOn && onAddAnchor) {
      const r = videoRef.current.getBoundingClientRect();
      const x = clamp((e.clientX - r.left) / r.width, 0, 1);
      const y = clamp((e.clientY - r.top) / r.height, 0, 1);
      videoRef.current.pause();
      onAddAnchor({ x, y, time: videoRef.current.currentTime });
      return;
    }
    toggle();
  };

  const pct = (t) => (duration ? clamp((t / duration) * 100, 0, 100) : 0);
  const pins = comments.filter((c) => c.anchor && Math.abs(c.time - time) <= 0.5);
  const hasRange = marks.inTime != null && marks.outTime != null && marks.outTime > marks.inTime;

  return (
    <div className="vp" ref={wrapRef}>
      <div className={`vp-stage${pinOn ? ' pinning' : ''}`} onClick={onStageClick}>
        <video
          ref={videoRef}
          src={src}
          preload="metadata"
          playsInline
          loop={loop && marks.outTime == null}
          onLoadedMetadata={(e) => {
            const v = e.currentTarget;
            setDuration(v.duration || 0);
            v.playbackRate = rate;
            if (initialRef.current != null && Number.isFinite(initialRef.current)) v.currentTime = clamp(initialRef.current, 0, v.duration || Infinity);
            report();
          }}
          onDurationChange={(e) => setDuration(e.currentTarget.duration || 0)}
          onPlay={() => setPlaying(true)}
          onPause={() => { setPlaying(false); report(); }}
          onEnded={() => {
            setPlaying(false);
            if (loopRef.current) {
              const v = videoRef.current;
              v.currentTime = marksRef.current.inTime ?? 0;
              v.play().catch(() => {});
            }
          }}
          onSeeked={report}
          onTimeUpdate={() => { if (!playing) report(); }}
          onError={() => setError(true)}
        />
        {pins.map((c) => (
          <button
            key={c.id}
            type="button"
            className="vp-pin"
            style={{ left: `${c.anchor.x * 100}%`, top: `${c.anchor.y * 100}%` }}
            title={`${c.author}: ${c.text}`}
            onClick={(e) => { e.stopPropagation(); videoRef.current?.pause(); seek(c.time); }}
          />
        ))}
        {shuttleLabel && <div className="vp-speed-ind">{shuttleLabel}</div>}
        {error && <div className="vp-error">Could not load video</div>}
        {showHelp && (
          <div className="vp-help" onClick={(e) => { e.stopPropagation(); setShowHelp(false); }}>
            <div className="vp-help-card">
              <h3>Keyboard shortcuts</h3>
              <dl>
                {SHORTCUTS.map(([k, d]) => (<div key={k}><dt>{k}</dt><dd>{d}</dd></div>))}
              </dl>
            </div>
          </div>
        )}
      </div>
      <div className="vp-bar" ref={barRef} onPointerDown={onBarDown} onPointerMove={onBarMove} onPointerUp={onBarUp} onPointerCancel={onBarUp}>
        <div className="vp-track">
          <div className="vp-fill" style={{ width: `${pct(time)}%` }} />
        </div>
        {hasRange && (
          <div className="vp-range" style={{ left: `${pct(marks.inTime)}%`, width: `${pct(marks.outTime) - pct(marks.inTime)}%` }} />
        )}
        {marks.inTime != null && <div className="vp-bracket in" style={{ left: `${pct(marks.inTime)}%` }} title="In" />}
        {marks.outTime != null && <div className="vp-bracket out" style={{ left: `${pct(marks.outTime)}%` }} title="Out" />}
        {comments.filter((c) => !c.parentId).map((c) => {
          const rng = c.endTime != null && c.endTime > c.time;
          return (
            <button
              key={c.id}
              type="button"
              className={`vp-marker${rng ? ' range' : ''}${c.resolved || c.completedAt ? ' resolved' : ''}`}
              style={{ left: `${pct(c.time)}%`, ...(rng ? { width: `${Math.max(0.5, pct(c.endTime) - pct(c.time))}%` } : {}) }}
              title={`${formatTimecode(c.time, fps)} ${c.author}: ${c.text}`}
              onClick={(e) => { e.stopPropagation(); seek(c.time); }}
            />
          );
        })}
        <div className="vp-head" style={{ left: `${pct(time)}%` }} />
      </div>
      <div className="vp-controls">
        <button type="button" onClick={toggle} aria-label={playing ? 'Pause' : 'Play'}>{playing ? '❚❚' : '▶'}</button>
        <button type="button" onClick={() => step(-1)} title="Previous frame (←)">{'‹'}</button>
        <button type="button" onClick={() => step(1)} title="Next frame (→)">{'›'}</button>
        <span className="vp-time">{formatTimecode(time, fps)} <span className="vp-dim">/ {formatTimecode(duration, fps)}</span></span>
        <span className="vp-spacer" />
        {onAddAnchor && (
          <button type="button" className={pinOn ? 'vp-on' : ''} aria-pressed={pinOn} onClick={() => setPinOn((p) => !p)} title="Pin tool: click the video to anchor a comment">{'📍'}</button>
        )}
        <button type="button" className={loop ? 'vp-on' : ''} aria-pressed={loop} onClick={() => setLoop((l) => !l)} title="Loop (Ctrl+L)">{'↻'}</button>
        <button type="button" onClick={toggleMute} title="Mute (M)">{muted || volume === 0 ? '🔇' : '🔊'}</button>
        <input
          className="vp-vol"
          type="range" min="0" max="1" step="0.05" value={muted ? 0 : volume}
          onChange={(e) => {
            const val = Number(e.target.value);
            const v = videoRef.current;
            v.volume = val; v.muted = val === 0;
            setVolume(val); setMuted(val === 0);
          }}
          aria-label="Volume"
        />
        <label className="vp-speed" title="Playback speed">
          <input
            type="range" min="0.25" max="1.75" step="0.05" value={rate}
            onChange={(e) => {
              const r = Number(e.target.value);
              shuttle.current = 0; setShuttleLabel('');
              videoRef.current.playbackRate = r; setRate(r);
            }}
            aria-label="Playback speed"
          />
          <span>{rate.toFixed(2)}x</span>
        </label>
        <button type="button" onClick={() => setShowHelp((s) => !s)} title="Keyboard shortcuts (?)">?</button>
        <button type="button" onClick={fullscreen} title="Fullscreen (F)">{'⛶'}</button>
      </div>
    </div>
  );
}
