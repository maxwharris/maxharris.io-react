// The radio's small pure helpers (no DOM, tested in format.test.js): what the display writes, the song list as the
// engine keeps it, and the clock calibration. The tempo and key wording are the catalog's (frontend/src/lib/format.js
// bpm, frontend/src/lib/keys.js shortKey), so the record's label reads as it does there: "FLY LOW" over "110 · Cm".

/** A tempo as the catalog writes it: 110, 87.5; '' for none. */
export function bpmText(x) {
  const n = Number(x);
  if (!Number.isFinite(n) || n <= 0) return '';
  return String(Math.round(n * 10) / 10);
}

// The catalog's key parsing (frontend/src/lib/keys.js): "C minor", "Cm", "F# maj", "Bb".
const ROOTS = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
const PC = { C: 0, 'B#': 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, Fb: 4, F: 5, 'E#': 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11, Cb: 11 };
/** A key as the catalog writes it short: "Em", "F#m", "A", "Bb"; '' when it does not read as one. */
export function keyText(s) {
  const m = /^\s*([A-Ga-g])([#b]?)\s*(major|minor|maj|min|m)?\s*$/.exec(String(s || ''));
  if (!m) return '';
  const pc = PC[m[1].toUpperCase() + (m[2] || '')];
  if (pc === undefined) return '';
  return ROOTS[pc] + (/^(minor|min|m)$/.test(m[3] || '') ? 'm' : '');
}

/** The record's label, as the catalog's: [title, "BPM · key"], the second line only with what is known. */
export const recordLabel = (song) => (song ? [song.title, [bpmText(song.bpm), keyText(song.key)].filter(Boolean).join(' · ')] : []);

/** The title with its credit, as the display scrolls it: "fly low (a friend)". */
export const titleLine = (song) => (song ? song.title + (song.credit ? ` (${song.credit})` : '') : '');

const EASTERN = (() => {
  try { return new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit', hour12: true }); } catch { return null; }
})();
/** The station's clock: Eastern time, whatever the listener's own zone. {time: '9:05', ampm: 'PM', text: '9:05 PM'}. */
export function easternClock(ms) {
  if (!EASTERN || !Number.isFinite(ms)) return { time: '--:--', ampm: '', text: '' };
  const parts = EASTERN.formatToParts(new Date(ms));
  const get = (t) => (parts.find((p) => p.type === t) || {}).value || '';
  const time = `${get('hour')}:${get('minute')}`, ampm = get('dayPeriod').toUpperCase();
  return { time, ampm, text: `${time} ${ampm}` };
}

/** When a presigned link stops working (the catalog player's reading): epoch ms, epoch s, seconds from now, or a date. */
export function parseExpires(x, now = Date.now()) {
  if (typeof x === 'number' && Number.isFinite(x)) {
    if (x < 1e6) return now + x * 1000;
    return x < 1e12 ? x * 1000 : x;
  }
  const t = Date.parse(x || '');
  return Number.isNaN(t) ? now + 50 * 60 * 1000 : t;
}

const HEX = /^#[0-9a-f]{6}$/i;
const DARK = { bg: '#0b0b0b', fg: '#f0efea', card: '#161616' }; // the catalog's black, for a song without colours
/**
 * The crate as GET /catalog/api/radio sends it, kept only as far as every listener can agree on it: songs with an id
 * and a whole number of ms above 0, each id once, in the order sent. Every page runs this same filter, so the
 * schedule stays the same everywhere even if a bad row slipped through.
 */
export function normalizeSongs(list) {
  const out = [], seen = new Set();
  for (const s of Array.isArray(list) ? list : []) {
    if (!s || (typeof s.id !== 'number' && typeof s.id !== 'string') || seen.has(String(s.id))) continue;
    const durationMs = Number(s.durationMs);
    if (!Number.isInteger(durationMs) || durationMs <= 0) continue;
    seen.add(String(s.id));
    const look = s.look && HEX.test(s.look.bg) && HEX.test(s.look.fg) ? { bg: s.look.bg, fg: s.look.fg, card: HEX.test(s.look.card) ? s.look.card : s.look.bg } : DARK;
    const bpm = Number(s.bpm);
    out.push({
      id: s.id,
      title: String(s.title ?? '').trim() || 'untitled',
      credit: s.credit ? String(s.credit) : null,
      durationMs,
      bpm: Number.isFinite(bpm) && bpm > 0 ? bpm : null,
      key: s.key ? String(s.key) : null,
      look,
    });
  }
  return out;
}

/**
 * The station clock is the server's: each answer carries its `now`, taken against the midpoint of the request, so the
 * error is at most half the round trip. The tighter sample is kept, unless it is old (10 minutes: a device clock drifts)
 * or the new one disagrees by more than the round trips explain (the device's clock was changed, or it slept).
 * cal: {offset, rtt, at} or null; t0, t1: Date.now() before and after the request. Returns the calibration to use.
 */
export function calibrate(cal, serverNow, t0, t1) {
  if (!Number.isFinite(serverNow) || !(t1 >= t0)) return cal;
  const rtt = t1 - t0, offset = serverNow - (t0 + t1) / 2;
  if (!cal) return { offset, rtt, at: t1 };
  const stale = t1 - cal.at > 10 * 60 * 1000;
  const disagree = Math.abs(offset - cal.offset) > (rtt + cal.rtt) / 2 + 250;
  return rtt <= cal.rtt || stale || disagree ? { offset, rtt, at: t1 } : cal;
}
