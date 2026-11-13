// A COPY of levelAt and stretch from the catalog's frontend/src/lib/peaks.js (the catalog repo, ../catalog), so the
// radio's record reads a song's waveform exactly as the catalog's does. Keep it in step: when either changes there,
// copy it here. Only the fetching differs: the radio asks GET /catalog/api/radio/peaks/:songId (engine.js), a public
// route, where the catalog asks its signed-in /files/:id/peaks.

/**
 * Peaks stretched so the quiet tenth reads as nothing and the loud top as full (a mastered song sits near 1 all the
 * way through, which would draw as one flat block): a Float32Array of 0..1, kept per array.
 */
const stretched = new WeakMap();
export function stretch(peaks) {
  if (!peaks || !peaks.length) return null;
  if (stretched.has(peaks)) return stretched.get(peaks);
  const sorted = Float32Array.from(peaks).sort();
  const lo = sorted[Math.floor(sorted.length * 0.1)], hi = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.98))];
  const span = hi - lo > 0.04 ? hi - lo : Math.max(hi, 0.04);
  const base = hi - lo > 0.04 ? lo : 0;
  const out = Float32Array.from(peaks, (v) => Math.min(1, Math.max(0, (v - base) / span)));
  stretched.set(peaks, out);
  return out;
}

/** How loud it is at a fraction (0..1) of the way through: linear between points. */
export function levelAt(s, f) {
  if (!s || !s.length) return 0;
  const x = Math.min(s.length - 1, Math.max(0, f * s.length - 0.5));
  const i = Math.floor(x), t = x - i;
  return s[i] + ((s[Math.min(s.length - 1, i + 1)] ?? s[i]) - s[i]) * t;
}
