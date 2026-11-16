// The station clock (schedule.js): the queue in Max's order from the anchor, the carried song, the live queue and the
// announcer drops. The SHARED cases are repeated in the catalog's backend/test (lib/radio.js runs the same walk to set
// the next anchor), so a change here must change both.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { onAir, timeline, rotationMs, dropFor, DROP_AT_MS } from './schedule.js';

const A = { id: 1, durationMs: 10000 }, B = { id: 2, durationMs: 20000 }, C = { id: 3, durationMs: 30000 };
const pick = (x) => x && { id: x.song.id, offsetMs: x.offsetMs, startedAt: x.startedAt, endsAt: x.endsAt, next: x.next.id, slot: x.slot };

test('SHARED: from the anchor, in queue order, looping', () => {
  const s = { songs: [A, B, C], anchor: { at: 1000000, songId: 2 }, carry: null };
  assert.equal(rotationMs(s.songs), 60000);
  assert.deepEqual(pick(onAir(s, 1000000)), { id: 2, offsetMs: 0, startedAt: 1000000, endsAt: 1020000, next: 3, slot: 0 });
  assert.deepEqual(pick(onAir(s, 1019999)), { id: 2, offsetMs: 19999, startedAt: 1000000, endsAt: 1020000, next: 3, slot: 0 });
  assert.deepEqual(pick(onAir(s, 1020000)), { id: 3, offsetMs: 0, startedAt: 1020000, endsAt: 1050000, next: 1, slot: 1 });
  assert.deepEqual(pick(onAir(s, 1050000)), { id: 1, offsetMs: 0, startedAt: 1050000, endsAt: 1060000, next: 2, slot: 2 });
  assert.deepEqual(pick(onAir(s, 1060000)), { id: 2, offsetMs: 0, startedAt: 1060000, endsAt: 1080000, next: 3, slot: 3 });
  // before the anchor the same loop runs backwards
  assert.deepEqual(pick(onAir(s, 999999)), { id: 1, offsetMs: 9999, startedAt: 990000, endsAt: 1000000, next: 2, slot: -1 });
  // a day later, still whole songs from the anchor
  const day = onAir(s, 1000000 + 86400000);
  assert.equal((day.startedAt - 1000000) % 10000, 0);
});

test('SHARED: the song on air at an edit plays on to its end, then the anchor song', () => {
  const s = { songs: [A, B, C], anchor: { at: 2000000, songId: 1 }, carry: { songId: 3, startedAt: 1985000, endsAt: 2000000 } };
  assert.deepEqual(pick(onAir(s, 1990000)), { id: 3, offsetMs: 5000, startedAt: 1985000, endsAt: 2000000, next: 1, slot: -1 });
  assert.deepEqual(pick(onAir(s, 2000000)), { id: 1, offsetMs: 0, startedAt: 2000000, endsAt: 2010000, next: 2, slot: 0 });
  // a carried song that left the queue is not played; the loop runs instead
  const gone = { songs: [A, B], anchor: { at: 2000000, songId: 1 }, carry: { songId: 3, startedAt: 1985000, endsAt: 2000000 } };
  assert.notEqual(onAir(gone, 1990000).song.id, 3);
});

test('SHARED: edge cases', () => {
  assert.equal(onAir({ songs: [], anchor: null, carry: null }, 5), null);
  assert.equal(onAir(null, 5), null);
  // an anchor song that is not in the queue starts the loop at the first song
  assert.equal(onAir({ songs: [A, B], anchor: { at: 0, songId: 99 }, carry: null }, 0).song.id, 1);
  // one song repeats
  const one = { songs: [B], anchor: { at: 0, songId: 2 }, carry: null };
  assert.deepEqual(pick(onAir(one, 30000)), { id: 2, offsetMs: 10000, startedAt: 20000, endsAt: 40000, next: 2, slot: 1 });
});

// a seeded generator for the property cases (deterministic runs)
function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function randomState(rand) {
  const n = 1 + Math.floor(rand() * 8);
  const songs = Array.from({ length: n }, (_, i) => ({ id: 100 + i, durationMs: 1000 + Math.floor(rand() * 400000) }));
  const at = Math.floor(rand() * 4e12);
  const anchor = { at, songId: songs[Math.floor(rand() * n)].id };
  const carry = rand() < 0.5 ? { songId: songs[Math.floor(rand() * n)].id, startedAt: at - Math.floor(rand() * 300000) - 1, endsAt: at } : null;
  return { songs, anchor, carry };
}

test('boundaries: the next song starts at offset 0 exactly at endsAt, in queue order, slots stepping by one', () => {
  const rand = rng(7);
  for (let run = 0; run < 300; run++) {
    const s = randomState(rand);
    const n = s.songs.length;
    let x = onAir(s, s.anchor.at - Math.floor(rand() * 5e6) + rand());
    for (let step = 0; step < 40; step++) {
      const y = onAir(s, x.endsAt);
      assert.equal(y.offsetMs, 0, 'a song starts at its very beginning');
      assert.equal(y.startedAt, x.endsAt);
      if (x.slot !== -1 || !s.carry || x.endsAt !== s.carry.endsAt) {
        if (!(s.carry && x.endsAt <= s.carry.endsAt)) {
          assert.equal(y.index, (x.index + 1) % n, 'queue order');
          assert.equal(y.slot, x.slot + 1, 'slots step by one');
        }
      }
      // inside a song the offset grows one for one with time
      const mid = onAir(s, y.startedAt + y.song.durationMs / 2);
      assert.equal(mid.song.id, y.song.id);
      assert.equal(mid.offsetMs, y.song.durationMs / 2);
      x = y;
    }
  }
});

test('every song plays once a rotation, and the carried song hands over to the anchor song', () => {
  const rand = rng(11);
  for (let run = 0; run < 200; run++) {
    const s = randomState(rand);
    const n = s.songs.length;
    const tl = timeline(s, s.anchor.at, n);
    assert.equal(tl.length, n);
    assert.equal(tl[0].song.id, s.anchor.songId, 'the anchor song starts at the anchor');
    assert.deepEqual(new Set(tl.map((e) => e.song.id)).size, n, 'each song once');
    if (s.carry) {
      const before = onAir(s, s.anchor.at - 1);
      assert.equal(before.song.id, s.carry.songId);
      assert.equal(before.endsAt, s.anchor.at);
    }
  }
});

test('timeline: consecutive entries from the song on air', () => {
  const s = { songs: [A, B, C], anchor: { at: 1000000, songId: 2 }, carry: null };
  const tl = timeline(s, 1005000, 5);
  assert.deepEqual(tl.map((e) => [e.song.id, e.startsAt, e.endsAt, e.slot]), [
    [2, 1000000, 1020000, 0], [3, 1020000, 1050000, 1], [1, 1050000, 1060000, 2], [2, 1060000, 1080000, 3], [3, 1080000, 1110000, 4],
  ]);
  assert.deepEqual(timeline({ songs: [] }, 0, 5), []);
});

test('announcer drops: alternate song by song, a few seconds in, never over the end', () => {
  const clips = [{ durationMs: 4937 }, { durationMs: 5277 }];
  const s = { songs: [A, B, C], anchor: { at: 1000000, songId: 2 }, carry: null };
  const [b, c, a] = timeline(s, 1000000, 3);
  assert.deepEqual(dropFor(b, clips), { clip: 0, atMs: 1000000 + DROP_AT_MS, endsAt: 1000000 + DROP_AT_MS + 4937 });
  assert.deepEqual(dropFor(c, clips), { clip: 1, atMs: 1020000 + DROP_AT_MS, endsAt: 1020000 + DROP_AT_MS + 5277 });
  assert.equal(dropFor(a, clips), null, 'a 10 s song is too short for one');
  // the carried song (slot -1) takes the other clip from the anchor song's
  const carried = onAir({ songs: [A, B, C], anchor: { at: 2000000, songId: 1 }, carry: { songId: 3, startedAt: 1970000, endsAt: 2000000 } }, 1970000);
  assert.equal(dropFor(carried, clips).clip, 1);
  assert.equal(dropFor(null, clips), null);
});
