// maxradio's station clock: the queue in Max's order, looping (Max, 11/15/26: "view the live queue and add to/edit
// queue ... drag to reorder queue"; he picked edits taking effect when the song on air ends).
//
// No program runs the queue and nothing broadcasts. The catalog keeps the radio crate's order and, since the order last
// changed, two small facts (GET /catalog/api/radio):
//   anchor {at, songId}: the moment the current order took over, and the song it took over with;
//   carry {songId, startedAt, endsAt} or null: the song that was on air at that change, which plays on to its end
//   (endsAt = anchor.at), so an edit never cuts the song on air.
// From the anchor the queue plays in order, every song once a rotation, round and round. Every listener's page runs this
// on the server-calibrated clock, so every device works out the same song at the same point, to the millisecond, and
// anyone tuning in joins mid-song. The catalog runs the same walk (backend/lib/radio.js) to set the next anchor when the
// order changes; the shared cases in schedule.test.js pin both. Pure: no DOM, no network, no randomness.

/** One rotation's length in ms: every song once. */
export const rotationMs = (songs) => songs.reduce((n, s) => n + s.durationMs, 0);

/**
 * What is on air at nowMs (station clock, epoch ms). state: {songs, anchor, carry}, songs being the queue in order, each
 * {id, durationMs} with durationMs a whole number of ms above 0. Returns {song, index, offsetMs, startedAt, endsAt, next,
 * slot}, or null with nothing to play. index is the song's place in the queue; startedAt and endsAt are station-clock
 * ms; slot counts the songs started since the anchor (the anchor's song is 0, -1 the one before it, and so on; a carried
 * song is -1), so it steps by one from song to song, which is what the announcer drops alternate on.
 */
export function onAir(state, nowMs) {
  const songs = (state && state.songs) || [];
  const n = songs.length;
  if (!n || !Number.isFinite(nowMs)) return null;
  const L = rotationMs(songs);
  if (!(L > 0)) return null;
  const at = state.anchor && Number.isFinite(state.anchor.at) ? state.anchor.at : 0;
  let i0 = state.anchor ? songs.findIndex((s) => s.id === state.anchor.songId) : 0;
  if (i0 < 0) i0 = 0;

  // the song that was on air when the order changed plays on to its end
  const c = state.carry;
  if (c && nowMs < c.endsAt) {
    const ci = songs.findIndex((s) => s.id === c.songId);
    if (ci >= 0) {
      const offsetMs = Math.min(Math.max(0, nowMs - c.startedAt), Math.max(0, c.endsAt - c.startedAt - 1e-6));
      return { song: songs[ci], index: ci, offsetMs, startedAt: c.startedAt, endsAt: c.endsAt, next: songs[i0], slot: -1 };
    }
  }

  const t = nowMs - at;
  let k = Math.floor(t / L);
  let r = t - k * L;
  // a quotient that rounded across a whole number: put r back in [0, L)
  if (r < 0) { k -= 1; r += L; } else if (r >= L) { k += 1; r -= L; }
  // Where each song starts, in whole ms from the rotation's start, so endsAt is exact even when now carries a fraction
  // of a ms, and onAir(endsAt) is the next song at offset 0.
  let start = at + k * L;
  for (let j = 0; j < n; j++) {
    const i = (i0 + j) % n;
    const d = songs[i].durationMs;
    // the last song takes any rounding left over, so a time is never off the end of its rotation
    if (r < d || j === n - 1) {
      const offsetMs = Math.min(Math.max(0, nowMs - start), d - 1e-6);
      return { song: songs[i], index: i, offsetMs, startedAt: start, endsAt: start + d, next: songs[(i + 1) % n], slot: k * n + j };
    }
    r -= d;
    start += d;
  }
  return null;
}

/**
 * The live queue: the song on air at nowMs and the count - 1 after it, each {song, index, startsAt, endsAt, slot}.
 * Empty with nothing to play.
 */
export function timeline(state, nowMs, count = 10) {
  const out = [];
  let x = onAir(state, nowMs);
  while (x && out.length < count) {
    out.push({ song: x.song, index: x.index, startsAt: x.startedAt, endsAt: x.endsAt, slot: x.slot });
    x = onAir(state, x.endsAt);
  }
  return out;
}

/** Where in a song its announcer drop starts (Max, 11/15/26: "once per track (towards the beginning)"). */
export const DROP_AT_MS = 8000;
/** A drop needs this much of the song left after it, so it never runs into the next song. */
const DROP_TAIL_MS = 2000;

/**
 * The announcer drop over one song on air (an onAir result or a timeline entry): {clip, atMs, endsAt}, clip being the
 * index into clips ([{durationMs}], the recordings, which alternate song by song: "alternating between the two"), atMs
 * and endsAt station-clock ms. null when the song is too short to carry one.
 */
export function dropFor(entry, clips) {
  if (!entry || !clips || !clips.length) return null;
  const n = clips.length;
  const clip = ((entry.slot % n) + n) % n;
  const startedAt = entry.startedAt ?? entry.startsAt;
  const atMs = startedAt + DROP_AT_MS;
  const endsAt = atMs + clips[clip].durationMs;
  if (endsAt + DROP_TAIL_MS > entry.endsAt) return null;
  return { clip, atMs, endsAt };
}
