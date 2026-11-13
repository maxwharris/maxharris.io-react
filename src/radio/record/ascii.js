// A COPY of the record's drawing code from the catalog's frontend/src/lib/ascii.js (the catalog repo, ../catalog), with
// makeMotion from its components/Art.jsx, so MAXradio's record is the catalog's record (Max, 11/13/26: "lets also
// reutilize the dynamic graphic for the radio. does not need to be interactive"). Keep it in step: when the record
// changes there, copy the change here. Copied as written: RAMP, CELL, ringGeo, texture, needleRadius, needlePoint,
// drawRings, beatPulse, makeMotion. Left out on purpose: timeAt (tapping a groove; the radio's record takes no input),
// imageGrid and resample (the radio has no images, and fetches the whole waveform), MINI, barOf and pad3.
//
// The catalog's own header: pictures drawn in characters (the demo "Catalog, Golden Look", 10/29/26): the record, from
// a song's own waveform. A drawing is two layers of text the same size: `base` (not played yet, drawn faint) and `lit`
// (played, drawn solid). A cell is 0.6em wide and 1em tall (JetBrains Mono).

import { levelAt } from './peaks.js';

export const RAMP = ' .:-=+*#%@';
export const CELL = 0.6; // a character's width, in ems
const TAU = Math.PI * 2;
const NEEDLE = -0.62; // where the needle sits: up and to the right
const LIGHT = -2.2; // where the sheen lies: a fixed light, so the record turns under it

const joinRows = (arr, C) => {
  let out = '';
  for (let i = 0; i < arr.length; i += C) out += arr.slice(i, i + C).join('') + '\n';
  return out;
};

/** A grid of C x R cells, cw x lh pixels each, with each cell's distance from the centre (1 = the edge) and angle. */
export function ringGeo(C, R, cw, lh) {
  const cx = (C * cw) / 2, cy = (R * lh) / 2, rmax = Math.min(C * cw, R * lh) / 2 - lh * 0.6;
  const rn = new Float32Array(C * R), th = new Float32Array(C * R);
  for (let r = 0; r < R; r++) {
    for (let c = 0; c < C; c++) {
      const x = (c + 0.5) * cw - cx, y = (r + 0.5) * lh - cy, i = r * C + c;
      rn[i] = Math.hypot(x, y) / rmax;
      th[i] = Math.atan2(y, x);
    }
  }
  const N = Math.max(10, Math.min(30, Math.round(rmax / (lh * 1.3))));
  return { C, R, cw, lh, cx, cy, rmax, rn, th, N };
}

/** A few faint marks outside the record, the same for the same size. */
export function texture(g) {
  let x = (g.C * 73856093) ^ (g.R * 19349663) || 1;
  const rnd = () => { x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; };
  const TX = ".:'`-=";
  let out = '';
  for (let r = 0; r < g.R; r++) {
    for (let c = 0; c < g.C; c++) out += g.rn[r * g.C + c] > 1.04 && rnd() < 0.06 ? TX[(rnd() * TX.length) | 0] : ' ';
    out += '\n';
  }
  return out;
}

/** Where the needle is, as a fraction of the record's radius (for a ripple to start from). */
export const needleRadius = (frac) => 0.955 - Math.min(1, Math.max(0, frac || 0)) * (0.955 - 0.37);

/** The needle's tip, in the grid's units (pixels when the grid was made in pixels). */
export function needlePoint(g, frac) {
  const rp = needleRadius(frac) * g.rmax;
  return { x: g.cx + rp * Math.cos(NEEDLE), y: g.cy + rp * Math.sin(NEEDLE) };
}

/**
 * The record (Max, 11/02/26: "more dynamic, more movement, reactive to the track"). Its grooves run from the outer edge
 * (the start) inward (the end) like a real record's spiral: going round a groove is going forward in the song, so each
 * groove carries its stretch of the waveform round it, and the record turns as the song plays, what passes under the
 * needle being what is playing now. A fixed sheen lies across it, and what has played is solid. While it plays, the rim
 * breathes with how loud it is now, the ring round the label beats with the tempo, loud hits send a ripple across the
 * grooves, and the label (the song's image, when it has one) turns with the record.
 *
 * s: the song's loudness from start to end, 0..1 (lib/peaks.js, stretch), or null. frac: how far it has played.
 * level: how loud it is now, 0..1. pulse: the beat, 0..1. ripples: [{r, s}], r a fraction of the radius, s 0..1.
 * label: {lum, n, darkInk}, the image as n x n brightness values. still: reduced motion (the record does not turn).
 */
export function drawRings(g, s, frac, { started = frac > 0, arm = true, level = 0, pulse = 0, ripples = [], label = null, still = false } = {}) {
  const { C, R, rn, th, cw, lh, cx, cy, rmax, N } = g, n = C * R;
  const base = new Array(n).fill(' '), lit = new Array(n).fill(' ');
  const RO = 0.955, RI = 0.37;
  const f0 = Math.min(1, Math.max(0, frac || 0));
  const kf = Math.min(N - 1, Math.floor(f0 * N));
  const turn = still ? 0 : TAU * (f0 * N - kf); // one turn a groove
  const phi = NEEDLE + turn;
  const rimCh = !started ? '·' : level > 0.8 ? '#' : level > 0.55 ? '*' : level > 0.3 ? ':' : '·';
  const ringCh = !started ? '·' : pulse > 0.75 ? 'O' : pulse > 0.45 ? 'o' : pulse > 0.2 ? ':' : '·';
  const RL = (RI - 0.06) * rmax;
  const cosT = Math.cos(turn), sinT = Math.sin(turn);
  for (let i = 0; i < n; i++) {
    const r = rn[i];
    if (r > 1) continue;
    if (r > 0.985) {
      if (started && level > 0.3) lit[i] = rimCh; else base[i] = rimCh;
      continue;
    }
    if (r > RO) continue;
    if (r > RI) {
      const u = (RO - r) / (RO - RI), gg = u * N, k = Math.min(N - 1, Math.floor(gg));
      let boost = 0;
      for (const p of ripples) {
        const d = Math.abs(r - p.r);
        if (d < 0.035) boost = Math.max(boost, p.s * (1 - d / 0.035));
      }
      if (gg - Math.floor(gg) > 0.74 && boost < 0.25) continue;
      const alpha = (((phi - th[i]) % TAU) + TAU) % TAU;
      const tc = (k + alpha / TAU) / N;
      const v = s ? levelAt(s, tc) : 0.45;
      const sheen = 0.7 + 0.3 * Math.cos(2 * (th[i] - LIGHT));
      const dens = Math.max(v * sheen, boost);
      let ch = RAMP[Math.max(2, Math.min(9, Math.round(2 + dens * 7.4)))];
      if (started && Math.abs(u - f0) * N < 0.55) {
        // the groove under the needle: solid, and the needle's own spot marked
        const d = Math.abs(((((th[i] - NEEDLE + Math.PI) % TAU) + TAU) % TAU) - Math.PI);
        if (d < 0.14) ch = '@';
        lit[i] = ch;
      } else if (boost > 0.25 || tc < f0) lit[i] = ch;
      else base[i] = ch;
      continue;
    }
    if (r > RI - 0.045) {
      if (started && pulse > 0.2) lit[i] = ringCh; else base[i] = ringCh;
      continue;
    }
    if (label && r < RI - 0.06) {
      // The label's image, turning with the record.
      const x = ((i % C) + 0.5) * cw - cx, y = (Math.floor(i / C) + 0.5) * lh - cy;
      const xr = x * cosT + y * sinT, yr = -x * sinT + y * cosT;
      const ix = Math.floor(((xr / RL + 1) / 2) * label.n), iy = Math.floor(((yr / RL + 1) / 2) * label.n);
      if (ix >= 0 && ix < label.n && iy >= 0 && iy < label.n) {
        const b = label.lum[iy * label.n + ix];
        const ch = RAMP[Math.max(0, Math.min(9, Math.round((label.darkInk ? 1 - b : b) * 9)))];
        if (ch !== ' ') lit[i] = ch;
      }
    }
  }
  if (label) {
    const ci = Math.round(cy / lh - 0.5) * C + Math.round(cx / cw - 0.5);
    if (ci >= 0 && ci < n) lit[ci] = 'o'; // the spindle
  }
  if (arm) {
    const rp = (RO - f0 * (RO - RI)) * rmax;
    const nx = cx + rp * Math.cos(NEEDLE), ny = cy + rp * Math.sin(NEEDLE);
    const px = C * cw - cw * 3, py = lh * 1.6, dx = nx - px, dy = ny - py;
    const slope = Math.abs(dy / (dx || 1e-6));
    const ch = slope > 2.4 ? '|' : slope < 0.42 ? '-' : dx * dy < 0 ? '/' : '\\';
    const steps = Math.ceil(Math.hypot(dx, dy) / (Math.min(cw, lh) * 0.5));
    const put = (x, y, c) => {
      const col = Math.floor(x / cw), row = Math.floor(y / lh);
      if (col >= 0 && col < C && row >= 0 && row < R) { const i = row * C + col; lit[i] = c; base[i] = ' '; }
    };
    for (let k = 1; k < steps; k++) put(px + (dx * k) / steps, py + (dy * k) / steps, ch);
    put(px, py, 'O');
    put(px + cw * 1.2, py - lh * 1.1, '▪');
    put(nx, ny, '◆');
  }
  return { base: joinRows(base, C), lit: joinRows(lit, C) };
}

/** The beat as a flash that fades before the next one (a downbeat flashes fuller), 0..1; 0 with no tempo. */
export function beatPulse(bpm, t) {
  if (!bpm || !(t > 0)) return 0;
  const beats = (t * bpm) / 60, phase = beats - Math.floor(beats);
  return Math.exp(-phase * 5) * (Math.floor(beats) % 4 === 0 ? 1 : 0.62);
}

/** The music's effect on the record: how loud it is now (quick up, slower down), and ripples from loud hits. */
export function makeMotion() {
  let env = 0, avg = 0, lastHit = -9, hits = [];
  return (now, frac, raw) => {
    env = Math.max(raw, env * 0.86);
    avg += (raw - avg) * 0.06;
    if (raw - avg > 0.2 && now - lastHit > 0.28) { lastHit = now; hits.push({ t0: now, r0: needleRadius(frac) }); }
    hits = hits.filter((h) => now - h.t0 < 0.7);
    const ripples = hits.flatMap((h) => {
      const age = now - h.t0, s = 1 - age / 0.7, d = age * 0.75;
      return [{ r: h.r0 + d, s }, { r: h.r0 - d, s: s * 0.6 }];
    });
    return { level: env, ripples };
  };
}
