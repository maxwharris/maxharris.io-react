// The catalog's record (./ascii.js, its copy kept exactly as the catalog has it) drawn as the dots of a small graphic
// LCD for the radio's display: 40 dots across, backlit in the song's colour with its ink for dots. drawRings draws the
// record as two layers of characters; here each character becomes one dot's brightness, read from the catalog's own
// density ramp: an empty dot glows .06, an unplayed groove .14 to .5, and what is lit (played, the needle, the rim and
// the beat ring as they light up) .6 to 1. No DOM here but the canvas context it is handed.

import { RAMP, ringGeo } from './ascii.js';

/** Dots across the record's shorter side. */
export const DOTS = 40;

/** The grid for a canvas W x H pixels: square dots, n across the shorter side. {g (ascii.js ringGeo), p (pitch)}. */
export function dotGrid(W, H, n = DOTS) {
  if (!(W > 0) || !(H > 0) || !(n > 0)) return null;
  const p = Math.min(W, H) / n;
  const C = Math.floor(W / p + 0.01), R = Math.floor(H / p + 0.01);
  return { g: ringGeo(C, R, p, p), p };
}

// how dense a character draws: its place in the ramp; the rest of drawRings' marks (the arm, the needle, the ring's
// O and o) solid, and the dim dot of a record not yet started in between
const density = (ch) => {
  const k = RAMP.indexOf(ch);
  return k > 0 ? k / 9 : ch === '·' ? 0.3 : 0.9;
};

/** One dot's brightness, 0..1, from its lit (played) and base (not yet) characters. */
export function dotAlpha(lit, base) {
  if (lit && lit !== ' ') return 0.6 + 0.4 * density(lit);
  if (base && base !== ' ') return 0.14 + 0.36 * density(base);
  return 0.06;
}

/**
 * drawRings' two layers (each C characters a row, every row ending in a newline) as one brightness per dot, row by row.
 * out: a Float32Array of C x R to fill (kept between frames), or a new one.
 */
export function dotLevels(C, R, layers, out = new Float32Array(C * R)) {
  const { lit, base } = layers;
  for (let r = 0; r < R; r++) {
    const at = r * (C + 1);
    for (let c = 0; c < C; c++) out[r * C + c] = dotAlpha(lit[at + c], base[at + c]);
  }
  return out;
}

/** Static: about half the dots lit faintly at random, the dial between stations. rnd: () => 0..1. */
export function snowLevels(n, rnd = Math.random, out = new Float32Array(n)) {
  for (let i = 0; i < n; i++) {
    const k = rnd() < 0.5 ? Math.floor(rnd() * rnd() * 8) : 0;
    out[i] = k ? 0.14 + (0.36 * k) / 9 : 0.06;
  }
  return out;
}

/** Paint the dots: the backlight (bg) behind, each dot in ink at its brightness, 82% of the pitch. */
export function paintDots(ctx, C, R, p, levels, bg, ink) {
  const sz = p * 0.82, o = (p - sz) / 2;
  ctx.globalAlpha = 1;
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.fillStyle = ink;
  for (let r = 0; r < R; r++) {
    for (let c = 0; c < C; c++) {
      ctx.globalAlpha = levels[r * C + c];
      ctx.fillRect(c * p + o, r * p + o, sz, sz);
    }
  }
  ctx.globalAlpha = 1;
}
