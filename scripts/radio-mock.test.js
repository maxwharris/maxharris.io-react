// The dev mock's queue (npm test): its re-anchor is the catalog's rule (the lead's spec, 11/15/26), so the mock exercises
// what listeners will meet: an edit never cuts the song on air, the new order takes over at its end, and taking the song
// on air out moves on at once to the next of the old order still in the queue.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reanchor, versionOf } from './radio-mock.js';
import { onAir } from '../src/radio/schedule.js';

const A = { id: 1, durationMs: 10000 }, B = { id: 2, durationMs: 20000 }, C = { id: 3, durationMs: 30000 }, E = { id: 5, durationMs: 15000 };
const walk = (st) => ({ songs: st.songs.map(([id, durationMs]) => ({ id, durationMs })), anchor: st.anchor, carry: st.carry });
const store = (list, anchor, carry = null) => ({ version: versionOf(list), songs: list.map((s) => [s.id, s.durationMs]), anchor, carry });

test('nothing playable: nothing stored; the first list anchors at once on its first song', () => {
  assert.deepEqual(reanchor(store([A, B], { at: 0, songId: 1 }), [], '', 5000), { version: '', songs: [], anchor: null, carry: null });
  const first = reanchor({ version: '', songs: [], anchor: null, carry: null }, [B, C], versionOf([B, C]), 1000000);
  assert.deepEqual(first, { version: versionOf([B, C]), songs: [[2, 20000], [3, 30000]], anchor: { at: 1000000, songId: 2 }, carry: null });
  assert.equal(versionOf([]), '');
  assert.notEqual(versionOf([A, B]), versionOf([B, A]), 'the order is in the version');
});

test('a reorder carries the song on air to its end, then the song after it in the new order', () => {
  const old = store([A, B, C], { at: 1000000, songId: 1 });
  // at 1015000 B is on air (A 1000000 to 1010000, B to 1030000); C is moved in front of A
  const now = reanchor(old, [C, A, B], versionOf([C, A, B]), 1015000);
  assert.deepEqual(now.carry, { songId: 2, startedAt: 1010000, endsAt: 1030000 });
  assert.deepEqual(now.anchor, { at: 1030000, songId: 3 }, 'after B comes C, wrapping round the new order');
  const before = onAir(walk(old), 1015000), after = onAir(walk(now), 1015000);
  assert.deepEqual([after.song.id, after.startedAt, after.endsAt, after.offsetMs], [before.song.id, before.startedAt, before.endsAt, before.offsetMs]);
  assert.deepEqual([onAir(walk(now), 1030000).song.id, onAir(walk(now), 1030000).offsetMs], [3, 0]);
});

test('play next: the song moved behind the one on air plays next, and a second edit keeps the same carry', () => {
  let st = store([A, B, C, E], { at: 0, songId: 1 });
  const x = onAir(walk(st), 12000); // B, 10000 to 30000
  st = reanchor(st, [A, B, E, C], versionOf([A, B, E, C]), 12000);
  assert.equal(onAir(walk(st), x.endsAt).song.id, 5);
  st = reanchor(st, [B, E, C, A], versionOf([B, E, C, A]), 20000); // another edit while B still plays
  assert.deepEqual(st.carry, { songId: 2, startedAt: 10000, endsAt: 30000 });
  assert.deepEqual(st.anchor, { at: 30000, songId: 5 });
});

test('taking out the song on air: the next of the old order still in the queue takes over at once', () => {
  const old = store([A, B, C, E], { at: 0, songId: 1 });
  // B is on air at 15000; B and C go: E is the next of the old order still there
  const st = reanchor(old, [E, A], versionOf([E, A]), 15000);
  assert.equal(st.carry, null);
  assert.deepEqual(st.anchor, { at: 15000, songId: 5 });
  assert.deepEqual([onAir(walk(st), 15000).song.id, onAir(walk(st), 15000).offsetMs], [5, 0]);
  // nothing of the old order left after it: the new order's first song
  assert.deepEqual(reanchor(old, [{ id: 9, durationMs: 1000 }], versionOf([{ id: 9, durationMs: 1000 }]), 15000).anchor, { at: 15000, songId: 9 });
});

test('any edit at any moment: the song on air plays on unless it left, and the next song starts at its top', () => {
  let seed = 3;
  const rand = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  const pool = Array.from({ length: 8 }, (_, i) => ({ id: 100 + i, durationMs: 1000 + Math.floor(rand() * 300000) }));
  const pick = () => pool.filter(() => rand() < 0.6).sort(() => rand() - 0.5);
  let st = { version: '', songs: [], anchor: null, carry: null }, t = 1.7e12;
  for (let run = 0; run < 400; run++) {
    t += Math.floor(rand() * 400000);
    const list = pick();
    const before = st.songs.length ? onAir(walk(st), t) : null;
    st = reanchor(st, list, versionOf(list), t);
    if (!list.length) { assert.equal(st.anchor, null); continue; }
    const after = onAir(walk(st), t);
    if (before && list.some((s) => s.id === before.song.id)) {
      assert.deepEqual([after.song.id, after.startedAt, after.endsAt], [before.song.id, before.startedAt, before.endsAt], 'never cut');
      const next = onAir(walk(st), before.endsAt), ids = list.map((s) => s.id);
      assert.equal(next.song.id, ids[(ids.indexOf(before.song.id) + 1) % ids.length]);
      assert.equal(next.offsetMs, 0);
    } else {
      assert.equal(after.startedAt, t, 'moved on at the edit');
      assert.equal(after.offsetMs, 0);
    }
  }
});
