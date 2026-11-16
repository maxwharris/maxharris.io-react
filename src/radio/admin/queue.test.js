// The radio admin's pure parts (queue.js): the catalog's re-anchor, the live queue as the window shows it, the order an
// edit saves, and what it writes. npm test runs them with the station clock's own cases (schedule.test.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { onAir, timeline } from '../schedule.js';
import { reanchor, follow, sameList, liveQueue, savedOrder, placeAfter, moveBy, sameIds, clock, span, eastern, count, low } from './queue.js';

const A = { id: 1, durationMs: 10000 }, B = { id: 2, durationMs: 20000 }, C = { id: 3, durationMs: 30000 }, D = { id: 4, durationMs: 40000 };
const row = (id, extra = {}) => ({ id, title: `song ${id}`, credit: null, duration: 60, ...extra });
const ids = (rows) => rows.map((r) => r.id);

// a seeded generator for the property cases (deterministic runs)
function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const shuffle = (rand, xs) => {
  const out = xs.slice();
  for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; }
  return out;
};
function randomState(rand) {
  const n = 1 + Math.floor(rand() * 8);
  const songs = Array.from({ length: n }, (_, i) => ({ id: 100 + i, durationMs: 1000 + Math.floor(rand() * 400000) }));
  const at = 1e12 + Math.floor(rand() * 1e9);
  return { songs, anchor: { at, songId: songs[Math.floor(rand() * n)].id }, carry: null };
}

// ---------------------------------------------------------------- the catalog's re-anchor

test('re-anchor: the song on air plays on to its end, then the song after it in the new order', () => {
  const old = { songs: [A, B, C], anchor: { at: 1000000, songId: 1 }, carry: null };
  // at 1015000 B is on air (A 1000000-1010000, B 1010000-1030000)
  const next = reanchor(old, [B, A, C], 1015000);
  assert.deepEqual(next.carry, { songId: 2, startedAt: 1010000, endsAt: 1030000 });
  assert.deepEqual(next.anchor, { at: 1030000, songId: 1 });
  assert.equal(onAir(next, 1015000).song.id, 2);
  assert.equal(onAir(next, 1015000).startedAt, 1010000);
  assert.equal(onAir(next, 1030000).song.id, 1);
  // the song after the last one is the first
  assert.deepEqual(reanchor(old, [C, A, B], 1015000).anchor, { at: 1030000, songId: 3 });
});

test('re-anchor: nothing to play, nothing before, and the song on air taken out', () => {
  const old = { songs: [A, B, C], anchor: { at: 1000000, songId: 1 }, carry: null };
  assert.deepEqual(reanchor(old, [], 5), { songs: [], anchor: null, carry: null });
  assert.deepEqual(reanchor({ songs: [], anchor: null, carry: null }, [C, A], 777), { songs: [C, A], anchor: { at: 777, songId: 3 }, carry: null });
  assert.deepEqual(reanchor(null, [B], 9), { songs: [B], anchor: { at: 9, songId: 2 }, carry: null });
  // B on air and taken out: from te, the first song after B in the old order that is still there (C), no carry
  assert.deepEqual(reanchor(old, [A, C], 1015000), { songs: [A, C], anchor: { at: 1015000, songId: 3 }, carry: null });
  // C on air (1030000-1060000) and taken out: after it in the old order, round, comes A (not the new list's first, D)
  assert.deepEqual(reanchor(old, [D, B, A], 1040000).anchor, { at: 1040000, songId: 1 });
});

test('re-anchor: the old order decides the next song when the song on air leaves', () => {
  const old = { songs: [A, B, C, D], anchor: { at: 0, songId: 1 }, carry: null };
  // C on air (30000-60000); the next in the old order still there: D, else round to A, B
  assert.equal(reanchor(old, [D, A], 40000).anchor.songId, 4);
  assert.equal(reanchor(old, [B, A], 40000).anchor.songId, 1);
  // none of the old songs left: the new list's first
  const E = { id: 5, durationMs: 5000 };
  assert.equal(reanchor(old, [E], 40000).anchor.songId, 5);
});

test('re-anchor: a carried song is carried on with the same times', () => {
  const old = { songs: [A, B, C], anchor: { at: 2000000, songId: 1 }, carry: { songId: 3, startedAt: 1985000, endsAt: 2000000 } };
  const next = reanchor(old, [C, B, A], 1990000);
  assert.deepEqual(next.carry, { songId: 3, startedAt: 1985000, endsAt: 2000000 });
  assert.deepEqual(next.anchor, { at: 2000000, songId: 2 });
});

test('follow: the same playable list keeps the stored anchor and carry', () => {
  const old = { songs: [A, B, C], anchor: { at: 1000000, songId: 1 }, carry: null };
  const same = follow(old, [{ ...A }, { ...B }, { ...C }], 1015000);
  assert.deepEqual(same.anchor, old.anchor);
  assert.equal(same.carry, null);
  assert.ok(sameList([A, B], [{ id: 1, durationMs: 10000 }, { id: 2, durationMs: 20000 }]));
  assert.ok(!sameList([A, B], [B, A]));
  assert.ok(!sameList([A, B], [A, { id: 2, durationMs: 20001 }]));
  // a length that changed is a change
  assert.notDeepEqual(follow(old, [A, { id: 2, durationMs: 21000 }, C], 1015000).anchor, old.anchor);
});

test('re-anchor, property: an edit never moves the song on air, and the new order follows it', () => {
  const rand = rng(23);
  for (let run = 0; run < 400; run++) {
    const old = randomState(rand);
    const te = old.anchor.at + Math.floor(rand() * 4e6) - 1e6;
    const S = onAir(old, te);
    // a new order with the song on air kept, maybe a song dropped and one added
    let list = shuffle(rand, old.songs);
    if (list.length > 1 && rand() < 0.4) list = list.filter((s) => s.id === S.song.id || rand() < 0.7);
    if (rand() < 0.3) list.splice(Math.floor(rand() * (list.length + 1)), 0, { id: 999, durationMs: 1000 + Math.floor(rand() * 300000) });
    const next = follow(old, list, te);
    const now = onAir(next, te);
    assert.equal(now.song.id, S.song.id, 'the same song on air');
    assert.equal(now.startedAt, S.startedAt, 'from the same start');
    assert.equal(now.endsAt, S.endsAt, 'to the same end');
    if (!sameList(old.songs, list)) {
      const i = list.findIndex((s) => s.id === S.song.id);
      const after = onAir(next, S.endsAt);
      assert.equal(after.song.id, list[(i + 1) % list.length].id, 'then the song after it in the new order');
      assert.equal(after.offsetMs, 0);
      // and then the whole new order, once each, round to the song that was on air
      const tl = timeline(next, S.endsAt, list.length);
      assert.deepEqual(tl.map((e) => e.song.id), [...list.slice(i + 1), ...list.slice(0, i + 1)].map((s) => s.id));
    }
  }
});

// ---------------------------------------------------------------- the live queue

test('live queue: the song on air, then the rest in play order with their times, songs that cannot play in place', () => {
  const state = { songs: [A, B, C, D], anchor: { at: 1000000, songId: 1 }, carry: null };
  // crate: A, B, X (no preview), C, D; at 1015000 B is on air (1010000-1030000)
  const crate = [row(1), row(2), row(77), row(3), row(4)];
  const q = liveQueue(crate, state, 1015000);
  assert.equal(q.onAir.id, 2);
  assert.equal(q.onAir.offsetMs, 5000);
  assert.equal(q.onAir.startsAt, 1010000);
  assert.equal(q.onAir.endsAt, 1030000);
  assert.equal(q.onAir.carried, false);
  assert.deepEqual(ids(q.rows), [77, 3, 4, 1]);
  assert.equal(q.rows[0].song, null, 'X cannot play');
  assert.equal(q.rows[0].startsAt, null);
  assert.deepEqual(q.rows.slice(1).map((r) => [r.id, r.startsAt, r.endsAt]), [[3, 1030000, 1060000], [4, 1060000, 1100000], [1, 1100000, 1110000]]);
  assert.equal(q.songs, 4);
  assert.equal(q.ms, 100000);
  assert.equal(q.waiting, 1);
});

test('live queue: a song that cannot play just before the song on air sits at the end, round the crate', () => {
  const state = { songs: [A, B, C], anchor: { at: 0, songId: 1 }, carry: null };
  // crate: X, A, B, Y, C; B on air at 15000 -> C, X (after C, round), A; Y sits after B, so first
  const q = liveQueue([row(70), row(1), row(2), row(71), row(3)], state, 15000);
  assert.equal(q.onAir.id, 2);
  assert.deepEqual(ids(q.rows), [71, 3, 70, 1]);
  assert.equal(q.waiting, 2);
});

test('live queue: matches timeline() for the songs that play, whatever the anchor and carry', () => {
  const rand = rng(5);
  for (let run = 0; run < 300; run++) {
    const s = randomState(rand);
    // a stored state after an edit: the song on air carried, then the song after it
    const te = s.anchor.at + Math.floor(rand() * 3e6);
    const list = shuffle(rand, s.songs);
    const state = follow(s, list, te);
    const now = te + Math.floor(rand() * 2e6);
    const crate = list.map((x) => row(x.id));
    // and some songs that cannot play, anywhere in the crate
    for (let k = Math.floor(rand() * 3); k > 0; k--) crate.splice(Math.floor(rand() * (crate.length + 1)), 0, row(900 + k));
    const q = liveQueue(crate, state, now);
    const tl = timeline(state, now, list.length);
    assert.equal(q.onAir.id, tl[0].song.id);
    assert.equal(q.onAir.startsAt, tl[0].startsAt);
    const plays = q.rows.filter((r) => r.song);
    assert.deepEqual(plays.map((r) => [r.id, r.startsAt, r.endsAt]), tl.slice(1).map((e) => [e.song.id, e.startsAt, e.endsAt]));
    // every crate song but the one on air, once
    assert.deepEqual(ids(q.rows).sort((a, b) => a - b), crate.map((r) => r.id).filter((id) => id !== q.onAir.id).sort((a, b) => a - b));
  }
});

test('live queue: a carried song is on air once, and the loop after it has every other song', () => {
  const state = { songs: [A, B, C], anchor: { at: 2000000, songId: 1 }, carry: { songId: 3, startedAt: 1985000, endsAt: 2000000 } };
  const q = liveQueue([row(1), row(2), row(3)], state, 1990000);
  assert.equal(q.onAir.id, 3);
  assert.equal(q.onAir.carried, true);
  assert.deepEqual(ids(q.rows), [1, 2]);
  assert.deepEqual(q.rows.map((r) => r.startsAt), [2000000, 2010000]);
});

test('live queue: nothing on air shows the crate as it is; an empty crate is empty', () => {
  const q = liveQueue([row(5), row(6)], { songs: [], anchor: null, carry: null }, 123);
  assert.equal(q.onAir, null);
  assert.deepEqual(ids(q.rows), [5, 6]);
  assert.ok(q.rows.every((r) => r.song === null));
  assert.equal(q.waiting, 2);
  assert.equal(q.songs, 0);
  const empty = liveQueue([], { songs: [], anchor: null, carry: null }, 0);
  assert.equal(empty.onAir, null);
  assert.deepEqual(empty.rows, []);
});

test('live queue: a song on the radio that the crate rows do not have yet is not listed; its time still counts', () => {
  const state = { songs: [A, B, C], anchor: { at: 0, songId: 1 }, carry: null };
  const q = liveQueue([row(1), row(3)], state, 5000);
  assert.equal(q.onAir.id, 1);
  assert.deepEqual(q.rows.map((r) => [r.id, r.startsAt]), [[3, 30000]]);
});

// ---------------------------------------------------------------- the order an edit saves

test('saved order: the song on air first, then up next as arranged, each crate song once', () => {
  assert.deepEqual(savedOrder(2, [77, 3, 4, 1], [1, 2, 77, 3, 4]), [2, 77, 3, 4, 1]);
  // an id the crate does not have is dropped, a crate song the list left out keeps a place at the end
  assert.deepEqual(savedOrder(2, [3, 99, 1], [1, 2, 3, 4]), [2, 3, 1, 4]);
  // nothing on air, or a song on air the crate does not have
  assert.deepEqual(savedOrder(null, [6, 5], [5, 6]), [6, 5]);
  assert.deepEqual(savedOrder(42, [6, 5], [5, 6]), [6, 5]);
  // no repeats
  assert.deepEqual(savedOrder(2, [2, 3, 3, 1], [1, 2, 3]), [2, 3, 1]);
});

test('an edit round trip: play next, save, the catalog re-anchors, the window shows it next and the song on air stays', () => {
  const state = { songs: [A, B, C, D], anchor: { at: 1000000, songId: 1 }, carry: null };
  const crate = [row(1), row(2), row(77), row(3), row(4)];
  const t = 1015000;
  const q = liveQueue(crate, state, t);
  // play D next
  const up = [4, ...ids(q.rows).filter((id) => id !== 4)];
  const order = savedOrder(q.onAir.id, up, ids(crate));
  assert.deepEqual(order, [2, 4, 77, 3, 1]);
  const playable = new Map(state.songs.map((s) => [s.id, s]));
  const next = follow(state, order.filter((id) => playable.has(id)).map((id) => playable.get(id)), t + 300);
  const q2 = liveQueue(order.map((id) => crate.find((r) => r.id === id)), next, t + 1000);
  assert.equal(q2.onAir.id, 2);
  assert.equal(q2.onAir.startsAt, q.onAir.startsAt);
  assert.equal(q2.onAir.endsAt, q.onAir.endsAt);
  assert.deepEqual(ids(q2.rows), [4, 77, 3, 1]);
  assert.equal(q2.rows[0].startsAt, q.onAir.endsAt, 'D starts when B ends');
  // and once B ends, D is on air from its start
  const q3 = liveQueue(order.map((id) => crate.find((r) => r.id === id)), next, q.onAir.endsAt);
  assert.equal(q3.onAir.id, 4);
  assert.equal(q3.onAir.offsetMs, 0);
});

test('moves: next to new neighbours, by a place, and the same ids', () => {
  assert.deepEqual(placeAfter([1, 2, 3, 4], 4, null, 1), [4, 1, 2, 3]);
  assert.deepEqual(placeAfter([1, 2, 3, 4], 1, 3, 4), [2, 3, 1, 4]);
  assert.deepEqual(placeAfter([1, 2, 3, 4], 1, 4, null), [2, 3, 4, 1]);
  // the song before the gap went on air mid-drag: before the one after it
  assert.deepEqual(placeAfter([2, 3, 4], 4, 1, 2), [4, 2, 3]);
  // both gone: to the end
  assert.deepEqual(placeAfter([2, 3, 4], 2, 8, 9), [3, 4, 2]);
  // a song not in the list is put in (an undo)
  assert.deepEqual(placeAfter([1, 3], 2, 1, 3), [1, 2, 3]);
  assert.deepEqual(moveBy([1, 2, 3], 2, -1), [2, 1, 3]);
  assert.deepEqual(moveBy([1, 2, 3], 2, 1), [1, 3, 2]);
  const same = [1, 2, 3];
  assert.equal(moveBy(same, 1, -1), same, 'already first');
  assert.equal(moveBy(same, 3, 1), same, 'already last');
  assert.equal(moveBy(same, 9, 1), same);
  assert.ok(sameIds([1, 2], [1, 2]));
  assert.ok(!sameIds([1, 2], [2, 1]));
});

// ---------------------------------------------------------------- what it writes

test('lengths, loops, times and counts, in lowercase', () => {
  assert.equal(clock(0), '0:00');
  assert.equal(clock(222999), '3:42');
  assert.equal(clock(3723000), '1:02:03');
  assert.equal(clock(-5), '0:00');
  assert.equal(span(40000), '40 s');
  assert.equal(span(48 * 60000 + 10000), '48 min');
  assert.equal(span(2 * 3600000), '2 h');
  assert.equal(span(72 * 60000), '1 h 12 min');
  // 9:05 pm Eastern on 11/15/26 (EST, UTC-5) is 02:05 UTC on 11/16
  const t = Date.UTC(2026, 10, 16, 2, 5, 30);
  assert.equal(eastern(t), '9:05 pm');
  assert.equal(eastern(t, true), '9:05 pm est');
  assert.equal(eastern(NaN), '');
  assert.equal(count(1, 'song'), '1 song');
  assert.equal(count(12, 'song'), '12 songs');
  assert.equal(low('Night DRIVE'), 'night drive');
  assert.equal(low(null), '');
});
