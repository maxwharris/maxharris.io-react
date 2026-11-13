// MAXradio's record: the catalog's record (its frontend/src/components/Art.jsx, drawn by ./ascii.js), for the song on
// air, and not interactive (Max, 11/13/26: "does not need to be interactive"): no pointer, no keys, no seeking. In the
// catalog's look: the grooves carry the song's whole waveform, the record turns with the live position, what has
// played is solid, the rim breathes with how loud it is now, the ring round the label beats with the tempo, loud hits
// ripple across the grooves, and the label reads [TITLE, "BPM · key"] as the catalog's does ("FLY LOW" over
// "110 · Cm"), in the song's own colours. Reduced motion keeps it still (it only fills in, once a second).

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { radio, useRadio } from '../useRadio.js';
import { recordLabel } from '../format.js';
import { beatPulse, CELL, drawRings, makeMotion, ringGeo, texture } from './ascii.js';
import { levelAt } from './peaks.js';
import './record.css';

const still = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
/** The record while nothing is on air: the catalog's black. */
const IDLE_LOOK = { bg: '#0b0b0b', fg: '#f0efea', card: '#161616' };

/** song: the song on air ({id, title, bpm, key, look}) or null; playing: whether it is sounding now. */
export default function Record({ song = null, playing = false, idleLabel = ['MAXradio', '999.9 FM'], className = '' }) {
  const box = useRef(null);
  const tex = useRef(null);
  const base = useRef(null);
  const lit = useRef(null);
  const geo = useRef(null);
  const [size, setSize] = useState(null); // {C, R, fs, W, H}
  const { waves } = useRadio(); // a waveform arrived: draw again

  // Measure: the cell size from the record's diameter (the box's shorter side), so it stays crisp from about 140 px
  // to 520 px across; then the grid of cells that fills the box.
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return undefined;
    const measure = () => {
      const W = el.clientWidth, H = el.clientHeight;
      if (!W || !H) return;
      const fs = Math.round(Math.max(4.5, Math.min(9, Math.min(W, H) / 72 / CELL)) * 4) / 4;
      const C = Math.max(10, Math.floor(W / (fs * CELL))), R = Math.max(6, Math.floor(H / fs));
      setSize((x) => (x && x.C === C && x.R === R && x.fs === fs && x.W === W && x.H === H ? x : { C, R, fs, W, H }));
    };
    measure();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    if (ro) ro.observe(el);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(measure);
    return () => { if (ro) ro.disconnect(); };
  }, []);

  useLayoutEffect(() => {
    if (!size) return;
    const { C, R, fs, W, H } = size;
    const left = Math.floor((W - C * fs * CELL) / 2), top = Math.floor((H - R * fs) / 2);
    for (const p of [tex.current, base.current, lit.current]) {
      if (!p) continue;
      p.style.fontSize = `${fs}px`;
      p.style.lineHeight = `${fs}px`;
      p.style.left = `${left}px`;
      p.style.top = `${top}px`;
    }
    if (box.current) box.current.style.setProperty('--rd', `${Math.min(W, H)}px`);
    geo.current = ringGeo(C, R, fs * CELL, fs);
    if (tex.current) tex.current.textContent = texture(geo.current);
  }, [size]);

  // Draw now, and about 30 times a second while the song plays (once a second with reduced motion).
  const id = song ? song.id : null, bpm = song ? song.bpm : 0;
  useEffect(() => {
    const quiet = still();
    const motion = makeMotion();
    const draw = (now) => {
      const g = geo.current;
      if (!g || !base.current || !lit.current) return;
      const p = playing ? radio.position() : null;
      const live = p && p.id === id ? p : null;
      const s = id != null ? radio.peaksOf(id) : null;
      const frac = live ? live.frac : 0;
      const going = !!live && !quiet;
      const m = going ? motion(now / 1000, frac, levelAt(s, frac)) : { level: 0, ripples: [] };
      const d = drawRings(g, s, frac, { started: !!live, arm: true, level: m.level, pulse: going ? beatPulse(bpm, live.ms / 1000) : 0, ripples: m.ripples, still: quiet });
      base.current.textContent = d.base;
      lit.current.textContent = d.lit;
    };
    draw(performance.now());
    if (!playing) return undefined;
    let raf = 0, last = 0;
    const step = (t) => {
      raf = requestAnimationFrame(step);
      if (t - last < (quiet ? 1000 : 33)) return;
      if (!box.current || !box.current.offsetParent) return; // a minimized window: nothing to draw until it is back
      last = t;
      draw(t);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [id, bpm, playing, size, waves]);

  const look = song ? song.look : IDLE_LOOK;
  const label = song ? recordLabel(song) : idleLabel;
  return (
    <div
      ref={box}
      className={`mr-rec${className ? ` ${className}` : ''}`}
      role="img"
      aria-label={song ? `A record drawn from the waveform of ${song.title}, turning as it plays` : 'A record, waiting for the radio'}
      style={{ '--rec-bg': look.bg, '--rec-fg': look.fg, '--rec-card': look.card }}
    >
      <pre ref={tex} className="tex" aria-hidden="true" />
      <pre ref={base} className="base" aria-hidden="true" />
      <pre ref={lit} className="lit" aria-hidden="true" />
      {label.length ? <div className="mr-lbl" aria-hidden="true"><b>{label[0]}</b>{label[1] || ''}</div> : null}
    </div>
  );
}
