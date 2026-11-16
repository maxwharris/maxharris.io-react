// The radio admin's pure parts (no DOM, no network; tested in queue.test.js): the live queue as the admin shows it, the
// order an edit saves, the catalog's re-anchor, and the times and lengths it writes.
//
// The radio plays the radio crate's songs that can play, in the crate's order, round and round from the catalog's anchor,
// and the song on air when the order changes plays on to its end (schedule.js). So the admin's queue is the song on air,
// then the rest in play order, each once, with the crate's songs that cannot play yet (no preview) in their crate places;
// and an edit saves that list as the crate's order with the song on air first, so the new order takes over when the song
// on air ends (Max, 11/15/26: "your order, edits take effect when the song on air ends").
//
// The re-anchor is the catalog's (it runs it when the playable list changes, backend/lib/radio.js): the window runs it on
// an edit to show the outcome before the catalog answers, and the dev mock (scripts/radio-admin-mock.js) answers with it.

import { onAir, timeline, rotationMs } from '../schedule.js';
import { easternClock } from '../format.js';

/** Whether two playable lists are the same to the schedule (what the catalog's version names): ids and lengths, in order. */
export function sameList(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i].id !== b[i].id || a[i].durationMs !== b[i].durationMs) return false;
  return true;
}

/**
 * The catalog's re-anchor at te (epoch ms), when the playable list has changed: old is the stored {songs, anchor, carry},
 * list the playable list now ([{id, durationMs}], in crate order). Returns the new {songs, anchor, carry}:
 *   nothing to play: no anchor, no carry (the radio is off);
 *   nothing was on air at te: the list starts at te from its first song;
 *   the song on air at te is still in the list: it plays on to its end (carry), then the song after it in the list;
 *   it left the list: no carry, and from te the first song after it in the old order that is still in the list.
 */
export function reanchor(old, list, te) {
  const songs = list || [];
  if (!songs.length) return { songs: [], anchor: null, carry: null };
  const S = onAir(old, te);
  if (!S) return { songs, anchor: { at: te, songId: songs[0].id }, carry: null };
  const i = songs.findIndex((s) => s.id === S.song.id);
  if (i >= 0) {
    return {
      songs,
      anchor: { at: S.endsAt, songId: songs[(i + 1) % songs.length].id },
      carry: { songId: S.song.id, startedAt: S.startedAt, endsAt: S.endsAt },
    };
  }
  const keep = new Set(songs.map((s) => s.id));
  const was = old.songs;
  let next = songs[0].id;
  for (let k = 1; k <= was.length; k++) {
    const c = was[(S.index + k) % was.length];
    if (keep.has(c.id)) { next = c.id; break; }
  }
  return { songs, anchor: { at: te, songId: next }, carry: null };
}

/** What the catalog keeps after a change to the radio crate at te: the same state when the playable list did not change. */
export function follow(old, list, te) {
  if (old && sameList(old.songs || [], list || [])) return { songs: list, anchor: old.anchor ?? null, carry: old.carry ?? null };
  return reanchor(old, list, te);
}

/**
 * The live queue at nowMs. crateRows: the radio crate's songs in crate order (every one, stale and unplayable included,
 * each with an id); state: the radio's {songs, anchor, carry}, songs being what can play. Returns
 *   onAir: {id, row, song, startsAt, endsAt, offsetMs, carried} or null (row: the crate's, null when the crate does not
 *     have it; carried: it was on air when the order last changed and plays on to its end);
 *   rows: the crate's other songs in the order they play after it, each once, each {id, row, song, startsAt, endsAt}:
 *     the times from timeline(); a song that cannot play (song null, no times) in its crate place;
 *   songs, ms: how many songs play and one loop's length; waiting: how many crate songs cannot play.
 */
export function liveQueue(crateRows, state, nowMs) {
  const rows = (crateRows || []).filter((r) => r && r.id != null);
  const list = (state && state.songs) || [];
  const n = list.length;
  const byId = new Map(rows.map((r) => [r.id, r]));
  const playable = new Set(list.map((s) => s.id));
  const tl = n ? timeline(state, nowMs, n + 1) : [];
  const cur = tl[0] || null;
  const onAirId = cur ? cur.song.id : null;

  // after the song on air: every other song once, in play order (a full loop is at most n more)
  const seen = new Set(cur ? [onAirId] : []);
  const play = [];
  for (const e of tl.slice(1)) {
    if (seen.has(e.song.id)) continue;
    seen.add(e.song.id);
    if (byId.has(e.song.id)) play.push(e);
  }

  // A song that cannot play sits after the song before it in the crate that can, reading the crate round from the song
  // on air; with none before it, first.
  const order = rows.map((r) => r.id);
  const at = onAirId == null ? -1 : order.indexOf(onAirId);
  const round = at < 0 ? order : [...order.slice(at + 1), ...order.slice(0, at)];
  const after = new Map();
  let last = null;
  for (const id of round) {
    if (playable.has(id)) { last = id; continue; }
    if (!after.has(last)) after.set(last, []);
    after.get(last).push(id);
  }

  const out = [], placed = new Set();
  const put = (id, e) => {
    placed.add(id);
    out.push({ id, row: byId.get(id), song: e ? e.song : null, startsAt: e ? e.startsAt : null, endsAt: e ? e.endsAt : null });
  };
  for (const id of after.get(null) || []) put(id, null);
  for (const e of play) {
    put(e.song.id, e);
    for (const id of after.get(e.song.id) || []) put(id, null);
  }
  // every crate song gets a place, even one the radio's list did not reach (the two read a moment apart)
  for (const id of order) if (id !== onAirId && !placed.has(id)) put(id, null);

  const c = state && state.carry;
  return {
    onAir: cur && {
      id: onAirId,
      row: byId.get(onAirId) || null,
      song: cur.song,
      startsAt: cur.startsAt,
      endsAt: cur.endsAt,
      offsetMs: Math.min(Math.max(0, nowMs - cur.startsAt), cur.endsAt - cur.startsAt),
      carried: !!c && c.songId === onAirId && c.startedAt === cur.startsAt,
    },
    rows: out,
    songs: n,
    ms: rotationMs(list),
    waiting: rows.filter((r) => !playable.has(r.id)).length,
  };
}

/**
 * The crate order an edit saves (PUT /crates/:id/order): the song on air first, then the up-next list as arranged (songs
 * that cannot play where they sit in it), so the order takes over when the song on air ends. crateIds: every song in the
 * crate. Each goes in once; one the list left out keeps a place at the end, and an id the crate does not have is dropped.
 */
export function savedOrder(onAirId, upNext, crateIds) {
  const inCrate = new Set(crateIds), seen = new Set(), out = [];
  const put = (id) => {
    if (!inCrate.has(id) || seen.has(id)) return;
    seen.add(id);
    out.push(id);
  };
  if (onAirId != null) put(onAirId);
  (upNext || []).forEach(put);
  crateIds.forEach(put);
  return out;
}

/**
 * ids with id moved next to its new neighbours: after `after` when that is still there, else before `before`, else first
 * (after is null: the top) or last. Neighbours rather than a place, so a drop still lands right when the list moved on
 * under it (the song on air ended mid-drag).
 */
export function placeAfter(ids, id, after, before) {
  const out = ids.filter((x) => x !== id);
  let i;
  if (after != null && out.includes(after)) i = out.indexOf(after) + 1;
  else if (before != null && out.includes(before)) i = out.indexOf(before);
  else i = after == null ? 0 : out.length;
  out.splice(i, 0, id);
  return out;
}

/** ids with id moved by delta places (the arrow keys), kept within the list. */
export function moveBy(ids, id, delta) {
  const i = ids.indexOf(id);
  if (i < 0) return ids;
  const j = Math.max(0, Math.min(ids.length - 1, i + delta));
  if (j === i) return ids;
  const out = ids.slice();
  out.splice(i, 1);
  out.splice(j, 0, id);
  return out;
}

export const sameIds = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

// ---------------------------------------------------------------- what it writes (lowercase, like all of maxradio)

/** Text as maxradio writes it: lowercase. */
export const low = (s) => String(s ?? '').toLowerCase();

/** A length as a clock: 3:42, or 1:02:03 from an hour up; whole seconds. */
export function clock(ms) {
  const s = Math.max(0, Math.floor((Number(ms) || 0) / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

/** A loop's length in words: 40 s, 48 min, 2 h, 1 h 12 min. */
export function span(ms) {
  const s = Math.round((Number(ms) || 0) / 1000);
  if (s < 60) return `${s} s`;
  const m = Math.round(s / 60), h = Math.floor(m / 60);
  if (!h) return `${m} min`;
  return m % 60 ? `${h} h ${m % 60} min` : `${h} h`;
}

/** An Eastern time of day as the radio writes it: '9:05 pm'; with zone, '9:05 pm est'. '' without a clock. */
export function eastern(ms, zone = false) {
  const c = easternClock(ms);
  if (!c.text) return '';
  const t = `${c.time} ${c.ampm.toLowerCase()}`;
  return zone && c.tz ? `${t} ${c.tz.toLowerCase()}` : t;
}

/** How many of something: '1 song', '12 songs'. */
export const count = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
