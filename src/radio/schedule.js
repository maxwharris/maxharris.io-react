// maxradio's station clock (Max, 11/13/26: "follow an algorithm following current time of day (according to EST) and
// playlist size"; "it should work like a real radio without a single broadcast source, instead an algorithm").
//
// There is no broadcast and no stored state. Every listener's page runs this on the server-calibrated clock and the
// crate as GET /catalog/api/radio lists it, so every device works out the same song at the same offset, to the
// millisecond, and anyone tuning in joins mid-song. Pure: no DOM, no network, no randomness but the seeded one.
//
// The station signed on at 00:00 Eastern on 11/13/26 and has played ever since, one rotation (every song once) after
// another. It runs on through midnight rather than starting over, so nothing is ever cut at midnight and every song
// keeps getting airtime even once the crate is longer than a day.
//
// A playlist edit changes the rotation's length, so the schedule moves; the engine keeps the song it is playing to its
// end (unless that song left the crate) and then follows the new schedule, joining mid-song like anyone tuning in.
//
// Every device must agree, so change nothing here without changing every listener at once (the tests pin it).

/** 00:00 Eastern (EST, UTC-5) on 11/13/26: the station's sign-on. */
export const SIGN_ON = Date.UTC(2026, 10, 13, 5, 0, 0);

/** The seeded generator: mulberry32, exactly as written in the spec. Returns 0 <= x < 1. */
export function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

/** MurmurHash3's finaliser: scatters neighbouring rotation numbers across the seed space. */
export function fmix32(h) {
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/** The seed of rotation k. */
export const seed32 = (k) => fmix32(((k | 0) ^ 0x9E3779B9) >>> 0);

/** Rotation k's shuffle of the crate order (n >= 3), before the fix that keeps a song from playing twice in a row. */
export function rawOrder(songs, k) {
  const a = songs.slice();
  const rand = mulberry32(seed32(k));
  for (let i = a.length - 1; i >= 1; i--) {
    const j = Math.floor(rand() * (i + 1));
    const x = a[i]; a[i] = a[j]; a[j] = x;
  }
  return a;
}

/**
 * The order rotation k plays the songs in. One song: itself. Two: crate order every time (A B A B ..., never the same
 * song twice in a row). Three or more: a seeded shuffle; if it would open with the song the last rotation closed with,
 * its first two swap. With three or more songs that swap never moves the last song, so a rotation's raw last song is
 * its real last song and nothing chains back through earlier rotations.
 */
export function order(songs, k) {
  const n = songs.length;
  if (n <= 2) return songs.slice();
  const a = rawOrder(songs, k);
  const before = rawOrder(songs, k - 1)[n - 1];
  if (a[0].id === before.id) { const x = a[0]; a[0] = a[1]; a[1] = x; }
  return a;
}

/** One rotation's length in ms: every song once. */
export const rotationMs = (songs) => songs.reduce((n, s) => n + s.durationMs, 0);

/**
 * What is on air at nowMs (station clock, epoch ms). songs: the radio crate in crate order, each {id, durationMs} with
 * durationMs a whole number of ms above 0. Returns {song, index, offsetMs, startedAt, endsAt, next, rotation}, or null
 * when the crate is empty. index is the song's place in its rotation; startedAt and endsAt are station-clock ms.
 */
export function onAir(songs, nowMs) {
  const n = songs ? songs.length : 0;
  if (!n || !Number.isFinite(nowMs)) return null;
  const L = rotationMs(songs);
  if (!(L > 0)) return null;
  const t = nowMs - SIGN_ON;
  let k = Math.floor(t / L);
  let r = t - k * L;
  // a quotient that rounded up or down across a whole number: put r back in [0, L)
  if (r < 0) { k -= 1; r += L; } else if (r >= L) { k += 1; r -= L; }
  const ord = order(songs, k);
  // Where each song starts, in whole ms: endsAt = now + (d - offset) worked out from the rotation's start, so it is
  // exact even when now carries a fraction of a ms, and onAir(endsAt) is the next song at offset 0.
  let start = SIGN_ON + k * L;
  for (let i = 0; i < n; i++) {
    const d = ord[i].durationMs;
    // the last song takes any rounding left over, so a time is never off the end of its rotation
    if (r < d || i === n - 1) {
      const offsetMs = Math.min(Math.max(0, nowMs - start), d - 1e-6);
      const next = i + 1 < n ? ord[i + 1] : order(songs, k + 1)[0];
      return { song: ord[i], index: i, offsetMs, startedAt: start, endsAt: start + d, next, rotation: k };
    }
    r -= d;
    start += d;
  }
  return null;
}
