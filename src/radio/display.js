// maxradio's display at work: the three dot-matrix lines, the record in dots and the L/R level meter, redrawn by one
// animation-frame loop while the radio is powered (about 30 times a second; four with reduced motion, when the record
// holds still and a long line turns over a page at a time instead of scrolling). Radio.jsx renders the markup, then
// hands this its canvases and, after every render, what to show; nothing here re-renders React.

import * as radio from './engine.js';
import { beatPulse, drawRings, makeMotion } from './record/ascii.js';
import { levelAt } from './record/peaks.js';
import { dotGrid, dotLevels, paintDots, snowLevels } from './record/dots.js';
import { GHOST, lineView, textCols } from './vfd.js';

const FRAME_MS = 33;
const STILL_FRAME_MS = 250;
const STILL_RECORD_MS = 1000; // reduced motion: the record fills in once a second
const BLINK_MS = 650; // PUSH PWR
const SNOW_MS = { tuning: 60, offair: 90 };
const SNOW = { bg: '#8b959b', fg: '#0f1214' }; // between stations: grey static
const IDLE = { bg: '#8b959b', fg: '#0f1214' }; // PUSH PWR: the record with nothing on air (the CSS dims it)
const METER_STEPS = 14;

const pixelRatio = () => Math.min(3, Math.max(1, (typeof window !== 'undefined' && window.devicePixelRatio) || 1));

/** One line of 5x7 dots: 7 rows, as many columns as its box holds, unlit dots faint behind the lit ones. */
class DotLine {
  constructor(cv) {
    this.cv = cv;
    this.ctx = cv.getContext('2d');
    this.n = 0;
    this.p = 0;
    this.text = null;
    this.cols = [];
    this.t0 = 0;
    this.key = '';
  }
  measure(w = this.cv.clientWidth, h = this.cv.clientHeight) {
    this.key = '';
    if (!w || !h) { this.n = 0; return; }
    const d = pixelRatio();
    this.cv.width = Math.round(w * d);
    this.cv.height = Math.round(h * d);
    this.p = (h * d) / 7;
    this.n = Math.floor((w * d) / this.p + 0.01);
  }
  /** Whether a text fits without scrolling (a line not measured yet, just shown, is taken to fit: it draws once it is). */
  fits(text) {
    return !this.n || textCols(text).length <= this.n;
  }
  draw(text, now, on, reduced) {
    if (text !== this.text) { this.text = text; this.cols = textCols(text); this.t0 = now; }
    if (!this.n) return;
    const view = lineView(this.cols, this.n, now - this.t0, reduced);
    const key = `${on}|${view.join(',')}`;
    if (key === this.key) return;
    this.key = key;
    const { ctx, p, n } = this, sz = p * 0.8, o = (p - sz) / 2;
    ctx.clearRect(0, 0, this.cv.width, this.cv.height);
    // the unlit dots, then the lit ones: two colours, so the fill changes twice a draw and not per dot
    for (const lit of [false, true]) {
      ctx.fillStyle = lit ? on : GHOST;
      for (let c = 0; c < n; c++) {
        for (let r = 0; r < 7; r++) if (((view[c] >> r) & 1) === +lit) ctx.fillRect(c * p + o, r * p + o, sz, sz);
      }
    }
  }
}

/** The record as 40 by 40 dots in the song's colours (record/dots.js over the catalog's drawRings), or static. */
class RecordDots {
  constructor(cv) {
    this.cv = cv;
    this.ctx = cv.getContext('2d');
    this.grid = null;
    this.levels = null;
    this.key = '';
    this.at = -1e9;
  }
  measure(w = this.cv.clientWidth, h = this.cv.clientHeight) {
    this.key = '';
    this.at = -1e9;
    if (!w || !h) { this.grid = null; return; }
    const d = pixelRatio();
    this.cv.width = Math.round(w * d);
    this.cv.height = Math.round(h * d);
    this.grid = dotGrid(this.cv.width, this.cv.height);
    this.levels = this.grid ? new Float32Array(this.grid.g.C * this.grid.g.R) : null;
  }
  dark() {
    if (this.key === 'dark') return;
    this.key = 'dark';
    this.ctx.clearRect(0, 0, this.cv.width, this.cv.height);
  }
  snow(now, every) {
    if (!this.grid || (this.key === 'snow' && now - this.at < every)) return;
    this.key = 'snow';
    this.at = now;
    const { g, p } = this.grid;
    paintDots(this.ctx, g.C, g.R, p, snowLevels(g.C * g.R, Math.random, this.levels), SNOW.bg, SNOW.fg);
  }
  record(s, frac, opts, look, key = '') {
    if (!this.grid || (key && key === this.key)) return;
    this.key = key;
    const { g, p } = this.grid;
    paintDots(this.ctx, g.C, g.R, p, dotLevels(g.C, g.R, drawRings(g, s, frac, opts), this.levels), look.bg, look.fg);
  }
}

export class Display {
  /** parts: {root, main, big, rt, rec} canvases (root: the radio) and meter, the element holding the two bars. */
  constructor({ root, main, big, rt, rec, meter }) {
    this.root = root;
    this.lines = [new DotLine(main), new DotLine(big), new DotLine(rt)];
    this.rec = new RecordDots(rec);
    this.bars = [...meter.querySelectorAll('b')];
    this.barAt = this.bars.map(() => -1);
    this.motion = makeMotion();
    this.st = null;
    this.raf = 0;
    this.last = -1e9;
    this.shown = true;
    this.tick = (t) => this.loop(t);
    for (const l of this.lines) l.measure();
    this.rec.measure();
    this.ro = typeof ResizeObserver === 'function' ? new ResizeObserver((es) => this.resized(es)) : null;
    if (this.ro) for (const el of [root, main, big, rt, rec]) this.ro.observe(el);
  }

  resized(entries) {
    for (const e of entries) {
      const t = e.target, { width, height } = e.contentRect;
      if (t === this.root) this.shown = width > 0; // a minimized window: nothing to draw
      else if (t === this.rec.cv) this.rec.measure(width, height);
      else for (const l of this.lines) if (l.cv === t) l.measure(width, height);
    }
    if (this.st) this.frame(performance.now());
  }

  /**
   * What to show: {status, pw, view, texts: {main, big, rt, flash} (vfd.js vfdText), blink (main and big blink: PUSH
   * PWR), lit (the illumination colour), song, volume (0..1), reduced}. A flash (VOL 24, a preset, what DISP or ILLUM
   * picked) takes the main line, or the big one in the text view, when it fits there whole, and the bottom line when it
   * does not, so it is read at once instead of scrolling away. Powered, the loop runs; otherwise it draws once and rests.
   */
  set(st) {
    const songId = st.song ? st.song.id : null;
    if (!this.st || (this.st.song ? this.st.song.id : null) !== songId || this.st.status !== st.status) {
      // a new song, or a new state: the music's motion starts afresh, and the record is drawn at once
      this.motion = makeMotion();
      this.rec.key = '';
      this.rec.at = -1e9;
    }
    this.st = st;
    if (st.pw && !this.raf) this.raf = requestAnimationFrame(this.tick);
    if (!st.pw) this.stop();
    this.frame(performance.now());
  }

  loop(t) {
    this.raf = requestAnimationFrame(this.tick);
    if (t - this.last < (this.st.reduced ? STILL_FRAME_MS : FRAME_MS)) return;
    this.last = t;
    this.frame(t);
  }

  frame(now) {
    const st = this.st;
    if (!st || !this.shown) return;
    const { status, reduced, lit } = st;
    const dark = st.blink && !reduced && Math.floor(now / BLINK_MS) % 2 === 1;
    let main = dark ? '' : st.texts.main, big = dark ? '' : st.texts.big, rt = st.texts.rt;
    const flash = st.texts.flash;
    if (flash) {
      const line = st.view === 'text' ? this.lines[1] : this.lines[0];
      if (!line.fits(flash)) rt = flash;
      else if (st.view === 'text') big = flash;
      else main = flash;
    }
    this.lines[0].draw(main, now, lit, reduced);
    this.lines[1].draw(big, now, lit, reduced);
    this.lines[2].draw(rt, now, lit, reduced);

    let level = 0;
    if (status === 'on' && st.song) {
      const song = st.song, p = radio.position();
      const live = p && p.id === song.id ? p : null;
      const s = radio.peaksOf(song.id), frac = live ? live.frac : 0;
      const going = !!live && !reduced;
      const raw = live ? levelAt(s, frac) : 0;
      const m = going ? this.motion(now / 1000, frac, raw) : { level: raw * 0.85, ripples: [] };
      level = m.level;
      if (!reduced || now - this.rec.at >= STILL_RECORD_MS) {
        this.rec.at = now;
        this.rec.record(s, frac, {
          started: !!live, arm: true, level: going ? m.level : 0, pulse: going ? beatPulse(song.bpm, live.ms / 1000) : 0,
          ripples: going ? m.ripples : [], still: reduced,
        }, song.look);
      }
    } else if (status === 'blocked') {
      this.rec.record(null, 0, { started: false, arm: true }, IDLE, 'idle');
    } else if (status === 'tuning' || status === 'offair') {
      this.rec.snow(now, reduced ? 1e9 : SNOW_MS[status]);
      if (status === 'tuning') level = 0.12 + Math.random() * 0.18; // the needle twitching between stations
    } else this.rec.dark();

    const lv = status === 'on' ? level * (0.42 + 0.58 * st.volume) : level;
    this.meter(status === 'on' && !reduced
      ? [lv * (0.93 + 0.07 * Math.sin(now / 170)), lv * (0.93 + 0.07 * Math.cos(now / 230))]
      : [lv, lv]);
  }

  meter(levels) {
    this.bars.forEach((b, i) => {
      const q = Math.round(Math.min(1, Math.max(0, levels[i] || 0)) * METER_STEPS) / METER_STEPS;
      if (q === this.barAt[i]) return;
      this.barAt[i] = q;
      b.style.setProperty('--l', q.toFixed(3));
    });
  }

  stop() {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  destroy() {
    this.stop();
    if (this.ro) this.ro.disconnect();
  }
}
