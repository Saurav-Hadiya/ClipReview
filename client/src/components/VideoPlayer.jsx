import { useCallback, useEffect, useRef, useState } from 'react';
import { formatTimecode } from '../api.js';

const SPEEDS = [0.25, 0.5, 1, 1.5, 2];
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

export default function VideoPlayer({ src, fps = 24, comments = [], onTimeUpdate, seekRef }) {
  const videoRef = useRef(null);
  const wrapRef = useRef(null);
  const barRef = useRef(null);
  const draggingRef = useRef(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [rate, setRate] = useState(1);
  const [error, setError] = useState(false);
  const onTimeRef = useRef(onTimeUpdate);
  onTimeRef.current = onTimeUpdate;

  const report = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    setTime(v.currentTime);
    onTimeRef.current?.(v.currentTime);
  }, []);

  const seek = useCallback((t) => {
    const v = videoRef.current;
    if (!v) return;
    const d = v.duration || Infinity;
    v.currentTime = clamp(t, 0, d);
    report();
  }, [report]);

  useEffect(() => {
    if (seekRef) {
      const fn = (t) => seek(t);
      fn.pause = () => { shuttle.current = 0; videoRef.current?.pause(); };
      seekRef.current = fn;
    }
    return () => { if (seekRef) seekRef.current = null; };
  }, [seekRef, seek]);

  // smooth updates while playing
  useEffect(() => {
    if (!playing) return undefined;
    let raf;
    const tick = () => { report(); raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, report]);

  useEffect(() => { setError(false); setTime(0); setPlaying(false); }, [src]);

  const toggle = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) v.play().catch(() => {}); else v.pause();
  }, []);

  const step = useCallback((frames) => {
    const v = videoRef.current;
    if (!v) return;
    v.pause();
    seek(v.currentTime + frames / fps);
  }, [fps, seek]);

  const shuttle = useRef(0);
  const doShuttle = useCallback((dir) => {
    const v = videoRef.current;
    if (!v) return;
    if (dir === 0) { shuttle.current = 0; v.pause(); return; }
    const steps = [1, 2, 4, 8];
    let cur = shuttle.current;
    if (Math.sign(cur) === dir) cur = dir * Math.min(8, steps[Math.min(3, steps.indexOf(Math.abs(cur)) + 1)] || 1);
    else cur = dir;
    shuttle.current = cur;
    if (cur > 0) {
      v.playbackRate = cur; setRate(cur);
      v.play().catch(() => {});
    } else {
      // reverse: step backwards via timer
      v.pause();
    }
  }, []);

  // reverse shuttle driver
  useEffect(() => {
    const id = setInterval(() => {
      const v = videoRef.current;
      if (v && shuttle.current < 0 && v.currentTime > 0) {
        v.currentTime = Math.max(0, v.currentTime - Math.abs(shuttle.current) * 0.1);
        report();
      }
    }, 100);
    return () => clearInterval(id);
  }, [report]);

  useEffect(() => {
    const onKey = (e) => {
      const el = e.target;
      const tag = el?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el?.isContentEditable) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      switch (e.key) {
        case ' ': e.preventDefault(); shuttle.current = 0; toggle(); break;
        case ',': e.preventDefault(); shuttle.current = 0; step(-1); break;
        case '.': e.preventDefault(); shuttle.current = 0; step(1); break;
        case 'j': case 'J': doShuttle(-1); break;
        case 'k': case 'K': doShuttle(0); break;
        case 'l': case 'L': doShuttle(1); break;
        case 'ArrowLeft': e.preventDefault(); seek((videoRef.current?.currentTime || 0) - 5); break;
        case 'ArrowRight': e.preventDefault(); seek((videoRef.current?.currentTime || 0) + 5); break;
        default:
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toggle, step, doShuttle, seek]);

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

  const fullscreen = () => {
    const el = wrapRef.current;
    if (document.fullscreenElement) document.exitFullscreen();
    else el?.requestFullscreen?.();
  };

  const pct = (t) => (duration ? clamp((t / duration) * 100, 0, 100) : 0);

  return (
    <div className="vp" ref={wrapRef}>
      <div className="vp-stage" onClick={toggle}>
        <video
          ref={videoRef}
          src={src}
          preload="metadata"
          playsInline
          onLoadedMetadata={(e) => { setDuration(e.currentTarget.duration || 0); report(); }}
          onDurationChange={(e) => setDuration(e.currentTarget.duration || 0)}
          onPlay={() => setPlaying(true)}
          onPause={() => { setPlaying(false); report(); }}
          onEnded={() => setPlaying(false)}
          onSeeked={report}
          onTimeUpdate={() => { if (!playing) report(); }}
          onError={() => setError(true)}
        />
        {error && <div className="vp-error">Could not load video</div>}
      </div>
      <div className="vp-bar" ref={barRef} onPointerDown={onBarDown} onPointerMove={onBarMove} onPointerUp={onBarUp} onPointerCancel={onBarUp}>
        <div className="vp-track">
          <div className="vp-fill" style={{ width: `${pct(time)}%` }} />
        </div>
        {comments.map((c) => {
          const hasRange = c.endTime != null && c.endTime > c.time;
          return (
            <button
              key={c.id}
              type="button"
              className={`vp-marker${hasRange ? ' range' : ''}${c.resolved ? ' resolved' : ''}`}
              style={{ left: `${pct(c.time)}%`, ...(hasRange ? { width: `${Math.max(0.5, pct(c.endTime) - pct(c.time))}%` } : {}) }}
              title={`${formatTimecode(c.time, fps)} ${c.author}: ${c.text}`}
              onClick={(e) => { e.stopPropagation(); seek(c.time); }}
            />
          );
        })}
        <div className="vp-head" style={{ left: `${pct(time)}%` }} />
      </div>
      <div className="vp-controls">
        <button type="button" onClick={toggle} aria-label={playing ? 'Pause' : 'Play'}>{playing ? '❚❚' : '▶'}</button>
        <button type="button" onClick={() => step(-1)} title="Previous frame (,)">‹</button>
        <button type="button" onClick={() => step(1)} title="Next frame (.)">›</button>
        <span className="vp-time">{formatTimecode(time, fps)} <span className="vp-dim">/ {formatTimecode(duration, fps)}</span></span>
        <span className="vp-spacer" />
        <button type="button" onClick={() => { const v = videoRef.current; v.muted = !muted; setMuted(!muted); }} title="Mute">{muted || volume === 0 ? '🔇' : '🔊'}</button>
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
        <select
          value={rate}
          onChange={(e) => { const r = Number(e.target.value); shuttle.current = 0; videoRef.current.playbackRate = r; setRate(r); }}
          aria-label="Playback speed"
        >
          {[...new Set([...SPEEDS, rate])].sort((a, b) => a - b).map((s) => <option key={s} value={s}>{s}x</option>)}
        </select>
        <button type="button" onClick={fullscreen} title="Fullscreen">⛶</button>
      </div>
    </div>
  );
}
