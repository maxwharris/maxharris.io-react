// The React side of MAXradio (engine.js): the snapshot, the session (on when the radio opens, off when it closes), the
// display's words, the station clock, the dial's sweep, the level meter, the scrolling title and the volume knob.
// Radio.jsx only lays these out, so a new faceplate can replace it without touching any of this.

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import * as radio from './engine.js';
import { bpmText, easternClock, keyText, titleLine } from './format.js';

export { radio };

const reducedMotion = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** The engine's snapshot: {status, song, next, volume, volumeWorks, disp, illum, flash, popping, reason, ...}. */
export const useRadio = () => useSyncExternalStore(radio.subscribe, radio.getSnapshot, radio.getSnapshot);

/**
 * The desktop's window and the pop-out page: tune in when the radio opens (the browser may still refuse: PUSH PWR),
 * power off when it closes. closing: the window is on its way out (it goes quiet at once, not after the animation).
 */
export function useRadioSession({ closing = false } = {}) {
  useEffect(() => {
    if (closing) radio.powerOff();
    else radio.tuneIn();
  }, [closing]);
  useEffect(() => () => radio.powerOff(), []);
}

/** The station's clock, Eastern time, as the display shows it: {time: '9:05', ampm: 'PM', text}. */
export function useStationClock() {
  const [c, setC] = useState(() => easternClock(radio.now()));
  useEffect(() => {
    const id = setInterval(() => {
      const n = easternClock(radio.now());
      setC((p) => (p.text === n.text ? p : n));
    }, 1000);
    return () => clearInterval(id);
  }, []);
  return c;
}

/** The frequency: sweeping up the band while it tunes, then 999.9; nothing while it is off. */
export function useDial(status) {
  const [sweep, setSweep] = useState('');
  useEffect(() => {
    if (status !== 'tuning' || reducedMotion()) return undefined;
    let raf = 0;
    const t0 = performance.now();
    const step = (t) => {
      const k = Math.min(1, (t - t0) / 900), e = 1 - (1 - k) ** 3;
      setSweep((87.5 + (999.9 - 87.5) * e).toFixed(1));
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [status]);
  if (status === 'off') return '';
  return status === 'tuning' && sweep ? sweep : radio.FREQ;
}

/**
 * Everything the display says, worked out: freq, station, clock, main (the line DISP picks, or a state: TUNING,
 * PUSH PWR, NO SIGNAL, RELEASED, a flash), sub (a second, smaller line), blink, scrollable (the title or the next one,
 * which scroll when they do not fit), lit (the backlight), sr (one sentence for screen readers, which changes only
 * when the song or the state does).
 */
export function useDisplay() {
  const s = useRadio();
  const clock = useStationClock();
  const freq = useDial(s.status);
  const song = s.song;
  let main = '', sub = '', blink = false, scrollable = false;
  if (s.flash) main = s.flash.text;
  else if (s.status === 'off') main = '';
  else if (s.status === 'tuning') main = 'TUNING';
  else if (s.status === 'blocked') { main = 'PUSH PWR'; blink = true; sub = 'the browser waits for a tap'; }
  else if (s.status === 'offair') { main = 'NO SIGNAL'; sub = s.reason === 'empty' ? 'the station is quiet' : 'trying again'; }
  else if (s.status === 'released') { main = 'RELEASED'; sub = 'playing in another tab'; }
  else if (s.popping) main = 'OPENING TAB';
  else if (s.disp === 'next') { main = s.next ? `NEXT ${titleLine(s.next)}` : 'NEXT'; scrollable = true; }
  else if (s.disp === 'info') main = [bpmText(song && song.bpm) && `${bpmText(song.bpm)} BPM`, keyText(song && song.key)].filter(Boolean).join(' · ') || radio.STATION;
  else if (s.disp === 'clock') main = clock.text;
  else { main = titleLine(song); scrollable = true; }
  const sr = s.status === 'on' && song ? `${radio.STATION} ${radio.FREQ} FM, now playing ${titleLine(song)}`
    : { off: 'radio off', tuning: 'tuning', blocked: 'press power to listen', offair: 'no signal', released: 'playing in another tab' }[s.status] || '';
  return {
    status: s.status, on: s.status === 'on', lit: s.status !== 'off' || !!s.flash,
    freq, station: s.status === 'off' ? '' : radio.STATION, clock, main, sub, blink, scrollable, sr,
    disp: s.disp, illum: s.illum, song, next: s.next,
  };
}

/** The level meter: sets --lv (0..1) on the element about 25 times a second while the radio plays. */
export function useLevelMeter(ref) {
  const on = useRadio().status === 'on';
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    el.style.setProperty('--lv', '0');
    if (!on) return undefined;
    let raf = 0, env = 0, last = 0;
    const step = (t) => {
      raf = requestAnimationFrame(step);
      if (t - last < 40) return;
      last = t;
      env = Math.max(radio.level(), env * 0.82); // quick up, slower down, like a meter's needle
      el.style.setProperty('--lv', env.toFixed(3));
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [on, ref]);
}

/**
 * A line of text that scrolls when it does not fit: box is the clipping element, inner the text inside it (a block or
 * inline-block: an inline box has no size to measure or observe). Returns {scroll, seconds}: whether it overflows (and
 * may scroll: never with reduced motion), and how long one pass takes.
 */
export function useMarquee(box, inner, text) {
  const [over, setOver] = useState(false);
  useEffect(() => {
    const b = box.current, t = inner.current;
    if (!b || !t || typeof ResizeObserver !== 'function') return undefined;
    const ro = new ResizeObserver(() => setOver(t.getBoundingClientRect().width > b.clientWidth + 1));
    ro.observe(b);
    ro.observe(t);
    return () => ro.disconnect();
  }, [box, inner, text]);
  return { scroll: over && !reducedMotion(), seconds: Math.max(6, String(text || '').length * 0.32) };
}

/**
 * The volume knob: drag it (up or right is louder), turn the wheel over it, or use the arrow keys, Page Up and Down,
 * Home and End. Spread props on the knob's element; turn is its angle in degrees (-135 to 135).
 */
export function useVolumeKnob() {
  const { volume, volumeWorks } = useRadio();
  const ref = useRef(null);
  const drag = useRef(null);
  useEffect(() => {
    // the wheel needs a listener that is not passive, to keep the page from scrolling under it
    const el = ref.current;
    if (!el) return undefined;
    const onWheel = (e) => { e.preventDefault(); radio.setVolume(radio.getSnapshot().volume - e.deltaY / 900); };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);
  const step = 1 / 30;
  const props = {
    ref,
    role: 'slider',
    tabIndex: 0,
    'aria-label': 'volume',
    'aria-valuemin': 0,
    'aria-valuemax': 30,
    'aria-valuenow': Math.round(volume * 30),
    'aria-valuetext': volumeWorks ? `volume ${Math.round(volume * 30)} of 30` : 'volume: use the device buttons',
    onPointerDown(e) {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, v: radio.getSnapshot().volume };
      try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* the pointer is gone */ }
    },
    onPointerMove(e) {
      const d = drag.current;
      if (!d || d.id !== e.pointerId) return;
      radio.setVolume(d.v + (e.clientX - d.x - (e.clientY - d.y)) / 160);
    },
    onPointerUp(e) { if (drag.current && drag.current.id === e.pointerId) drag.current = null; },
    onPointerCancel(e) { if (drag.current && drag.current.id === e.pointerId) drag.current = null; },
    onKeyDown(e) {
      const v = radio.getSnapshot().volume;
      const to = { ArrowUp: v + step, ArrowRight: v + step, ArrowDown: v - step, ArrowLeft: v - step, PageUp: v + step * 5, PageDown: v - step * 5, Home: 0, End: 1 }[e.key];
      if (to === undefined) return;
      e.preventDefault();
      radio.setVolume(to);
    },
  };
  return { props, volume, volumeWorks, turn: -135 + volume * 270 };
}
