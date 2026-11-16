// The radio's small pure helpers (no DOM, tested in format.test.js): the title line, the Eastern clock, the song list and
// the station as the engine keeps them, the clock calibration, and the embed's address.

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

const num = (v) => (v === null || v === undefined || v === '' ? NaN : Number(v));
/**
 * The station as GET /catalog/api/radio sends it, kept as every listener can agree on it: {songs (normalizeSongs), version,
 * anchor {at, songId} or null, carry {songId, startedAt, endsAt} or null} (schedule.js reads the last three). Nothing on
 * air (on false, or no song that can play) is no songs, no anchor and no carry. The anchor is kept as sent, so the walk
 * reads it as the catalog's does (a time that is not a number counts as 0 there); a carry whose times are not numbers is
 * left out, as the walk could not place it. Ids take the list's own spelling (the catalog's 12 and "12" are one song),
 * and an id the list lacks is kept as sent.
 */
export function normalizeStation(data) {
  const songs = data && data.on ? normalizeSongs(data.songs) : [];
  if (!songs.length) return { songs, version: '', anchor: null, carry: null };
  const idOf = (raw) => { const s = songs.find((x) => String(x.id) === String(raw)); return s ? s.id : raw; };
  const a = data.anchor, c = data.carry;
  const anchor = a && typeof a === 'object' ? { at: num(a.at), songId: idOf(a.songId) } : null;
  const carry = c && Number.isFinite(num(c.startedAt)) && Number.isFinite(num(c.endsAt))
    ? { songId: idOf(c.songId), startedAt: num(c.startedAt), endsAt: num(c.endsAt) }
    : null;
  return { songs, version: String(data.version ?? ''), anchor, carry };
}

/** What makes two readings of the station the same station (titles and colours aside): the queue, the anchor, the carry. */
export function stationKey(st) {
  if (!st || !st.songs || !st.songs.length) return '';
  const a = st.anchor, c = st.carry;
  return [
    st.version,
    st.songs.map((s) => `${s.id}:${s.durationMs}`).join(','),
    a ? `${a.at}@${a.songId}` : '-',
    c ? `${c.songId}:${c.startedAt}-${c.endsAt}` : '-',
  ].join('|');
}

/**
 * The embed's address (radio/embed/): ?display for the display strip alone (the whole faceplate without it), ?volume=0..100
 * for the knob and ?illum=<a colour in illums> for the light, each optional. {display, volume (0..1 or null), illum or
 * null}; anything else in a value is ignored.
 */
export function embedOptions(search, illums = []) {
  const q = new URLSearchParams(search || '');
  const d = q.get('display');
  const display = d !== null && !/^(0|false|no|off)$/i.test(d.trim());
  const v = num(String(q.get('volume') ?? '').trim());
  const volume = Number.isFinite(v) ? Math.round(Math.min(100, Math.max(0, v))) / 100 : null;
  const i = String(q.get('illum') ?? '').trim().toLowerCase();
  return { display, volume, illum: illums.includes(i) ? i : null };
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
