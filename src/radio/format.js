// The radio's small pure helpers (no DOM, tested in format.test.js): the title line, the Eastern clock, the song list
// as the engine keeps it, and the clock calibration.

/** The title with its credit, as the display scrolls it: "fly low (a friend)". */
export const titleLine = (song) => (song ? song.title + (song.credit ? ` (${song.credit})` : '') : '');

const EASTERN = (() => {
  try { return new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit', hour12: true, timeZoneName: 'short' }); } catch { return null; }
})();
/**
 * The station's clock: Eastern time, whatever the listener's own zone, and which Eastern time it is (EST, or EDT in
 * summer). {time: '9:05', ampm: 'PM', tz: 'EST', text: '9:05 PM'}.
 */
export function easternClock(ms) {
  if (!EASTERN || !Number.isFinite(ms)) return { time: '--:--', ampm: '', tz: '', text: '' };
  const parts = EASTERN.formatToParts(new Date(ms));
  const get = (t) => (parts.find((p) => p.type === t) || {}).value || '';
  const time = `${get('hour')}:${get('minute')}`, ampm = get('dayPeriod').toUpperCase();
  const tz = /^E[SD]T$/.test(get('timeZoneName')) ? get('timeZoneName') : 'ET';
  return { time, ampm, tz, text: `${time} ${ampm}` };
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
