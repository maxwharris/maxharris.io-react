// The station clock's properties (npm test). Every listener's page runs schedule.js and they must all agree, so these
// pin it: a verbatim transcription of the spec to compare against, golden values, and every property the spec lists.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SIGN_ON, mulberry32, fmix32, seed32, order, rawOrder, onAir, rotationMs } from './schedule.js';

// ---------- the spec, transcribed as written (a second copy to catch a slip in the first) ----------
const ref = (() => {
  const mulberry = (a) => function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  const fmix = (h) => { h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16; return h >>> 0; };
  const seed = (k) => fmix(((k | 0) ^ 0x9E3779B9) >>> 0);
  const raw = (songs, k) => {
    const a = songs.slice(), rand = mulberry(seed(k)), n = a.length;
    for (let i = n - 1; i >= 1; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  };
  const ord = (songs, k) => {
    const n = songs.length;
    if (n === 1) return [songs[0]];
    if (n === 2) return songs.slice();
    const a = raw(songs, k);
    if (a[0].id === raw(songs, k - 1)[n - 1].id) [a[0], a[1]] = [a[1], a[0]];
    return a;
  };
  const air = (songs, now) => {
    const n = songs.length;
    if (!n) return null;
    const L = songs.reduce((x, s) => x + s.durationMs, 0);
    const t = now - Date.UTC(2026, 10, 13, 5, 0, 0);
    const k = Math.floor(t / L);
    let r = t - k * L;
    const o = ord(songs, k);
    for (let i = 0; i < n; i++) {
      if (r < o[i].durationMs) return { id: o[i].id, offsetMs: r, endsAt: now + (o[i].durationMs - r), next: (o[i + 1] || ord(songs, k + 1)[0]).id, rotation: k };
      r -= o[i].durationMs;
    }
    return null;
  };
  return { mulberry, fmix, seed, raw, ord, air };
})();

// ---------- fixtures ----------
const crate = (n, seed = 1) => {
  // durations of a few seconds to a few minutes, whole ms, different every song
  const rand = mulberry32(seed);
  return Array.from({ length: n }, (_, i) => ({ id: 100 + i * 7, durationMs: 3000 + Math.floor(rand() * 240000) }));
};
const ids = (list) => list.map((s) => s.id);
const LIVE = [{ id: 1, title: 'hektik', durationMs: 91000 }, { id: 2, title: 'fly low', durationMs: 200700 }];
const KS = [...Array.from({ length: 401 }, (_, i) => i - 200), 2 ** 31 - 3, 2 ** 31 - 2, 2 ** 31 - 1, -(2 ** 31), -(2 ** 31) + 1, -(2 ** 31) + 2, 123456789, -987654321];

// ---------- the clock itself ----------
test('the station signs on at 00:00 Eastern on 11/13/26', () => {
  assert.equal(SIGN_ON, 1794546000000);
  const f = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
  assert.equal(f.format(SIGN_ON), '11/13/2026, 00:00:00');
});

test('the generator, the hash and the seed are the spec, bit for bit', () => {
  for (const k of KS) assert.equal(seed32(k), ref.seed(k), `seed32(${k})`);
  for (const h of [0, 1, 0x9E3779B9, 0xffffffff, 123456789, 2 ** 31]) assert.equal(fmix32(h), ref.fmix(h));
  for (const a of [0, 1, -1, 0xdeadbeef, 2 ** 31 - 1]) {
    const x = mulberry32(a), y = ref.mulberry(a);
    for (let i = 0; i < 50; i++) {
      const v = x();
      assert.equal(v, y());
      assert.ok(v >= 0 && v < 1);
    }
  }
});

test('golden values: the station plays the same on every device, today and after any refactor', () => {
  assert.deepEqual([0, 1, -1, 2 ** 31 - 1, -(2 ** 31)].map(seed32), [2462723854, 920564995, 996586154, 1449607079, 3172115818]);
  const five = [11, 22, 33, 44, 55].map((id) => ({ id, durationMs: id * 1000 }));
  assert.deepEqual(ids(order(five, 0)), [11, 33, 55, 22, 44]);
  assert.deepEqual(ids(order(five, 1)), [22, 11, 55, 44, 33]);
  assert.deepEqual(ids(order(five, -1)), [55, 11, 22, 44, 33]);
  const a = onAir(five, SIGN_ON + 100000); // 11 + 33 + 55 s played, 1 s into the fourth
  assert.deepEqual([a.song.id, a.index, a.offsetMs, a.rotation, a.next.id], [22, 3, 1000, 0, 44]);
  // the live crate on the day it signed on: hektik, then fly low, from 00:00 Eastern
  const b = onAir(LIVE, SIGN_ON);
  assert.deepEqual([b.song.title, b.offsetMs, b.endsAt - SIGN_ON, b.next.title], ['hektik', 0, 91000, 'fly low']);
  const c = onAir(LIVE, Date.UTC(2026, 10, 13, 17, 0, 0)); // noon Eastern: rotation 148 began at 11:59:31.6
  assert.deepEqual([c.song.title, c.rotation, c.offsetMs], ['hektik', 148, 28400]);
});

test('matches the spec transcription at any time, for any crate size', () => {
  const rand = mulberry32(42);
  for (let n = 1; n <= 9; n++) {
    const songs = crate(n, n);
    for (let i = 0; i < 400; i++) {
      const now = SIGN_ON + Math.floor((rand() - 0.5) * 4e10);
      const a = onAir(songs, now), b = ref.air(songs, now);
      assert.deepEqual({ id: a.song.id, offsetMs: a.offsetMs, endsAt: a.endsAt, next: a.next.id, rotation: a.rotation }, b);
    }
    for (const k of KS) assert.deepEqual(ids(order(songs, k)), ids(ref.ord(songs, k)), `n=${n} k=${k}`);
  }
});

// ---------- the properties the spec lists ----------
test('deterministic: the same time and crate give the same answer, whatever objects carry them', () => {
  const songs = crate(6, 7);
  for (const now of [SIGN_ON, SIGN_ON - 1, SIGN_ON + 987654321, Date.UTC(2031, 0, 1)]) {
    const a = onAir(songs, now), b = onAir(songs.map((s) => ({ ...s })), now);
    assert.deepEqual({ ...a, song: a.song.id, next: a.next.id }, { ...b, song: b.song.id, next: b.next.id });
  }
});

test('every song plays exactly once per rotation', () => {
  for (let n = 1; n <= 12; n++) {
    const songs = crate(n, 100 + n), want = ids(songs).sort((x, y) => x - y);
    for (const k of KS) assert.deepEqual(ids(order(songs, k)).sort((x, y) => x - y), want, `n=${n} k=${k}`);
  }
});

test('never the same song twice in a row (n >= 2), across rotations too', () => {
  for (let n = 2; n <= 12; n++) {
    const songs = crate(n, 200 + n);
    for (const k of KS) {
      const o = order(songs, k), after = order(songs, k + 1);
      for (let i = 1; i < n; i++) assert.notEqual(o[i].id, o[i - 1].id);
      assert.notEqual(after[0].id, o[n - 1].id, `n=${n} between rotations ${k} and ${k + 1}`);
    }
  }
});

test('the swap only ever moves the first two songs, so a rotation closes with its raw last song', () => {
  for (let n = 3; n <= 10; n++) {
    const songs = crate(n, 300 + n);
    let swapped = 0;
    for (const k of KS) {
      const raw = rawOrder(songs, k), o = order(songs, k);
      assert.equal(o[n - 1].id, raw[n - 1].id);
      assert.deepEqual(ids(o.slice(2)), ids(raw.slice(2)));
      if (o[0].id !== raw[0].id) { swapped++; assert.equal(o[0].id, raw[1].id); assert.equal(o[1].id, raw[0].id); }
    }
    assert.ok(n > 6 || swapped > 0, `the swap is exercised for n=${n}`);
  }
});

test('two songs alternate in crate order; one song repeats', () => {
  for (const k of KS) assert.deepEqual(ids(order(LIVE, k)), [1, 2]);
  const one = [{ id: 9, durationMs: 60000 }];
  for (const now of [SIGN_ON - 5, SIGN_ON, SIGN_ON + 59999, SIGN_ON + 60000, SIGN_ON + 6e9 + 123]) {
    const a = onAir(one, now);
    assert.equal(a.song.id, 9);
    assert.equal(a.next.id, 9);
    assert.equal(a.offsetMs, ((now - SIGN_ON) % 60000 + 60000) % 60000);
  }
  // the live crate from sign-on: hektik 0-91 s, fly low 91-291.7 s, hektik again
  const at = (s) => onAir(LIVE, SIGN_ON + s * 1000);
  assert.deepEqual([at(0).song.id, at(90.999).song.id, at(91).song.id, at(291.699).song.id, at(291.7).song.id], [1, 1, 2, 2, 1]);
});

test('inside a song the offset grows 1:1 with time, and the next song starts at offset 0 exactly at endsAt', () => {
  const rand = mulberry32(9);
  for (const n of [1, 2, 3, 5, 9]) {
    const songs = crate(n, 400 + n);
    for (let i = 0; i < 300; i++) {
      const now = SIGN_ON + Math.floor((rand() - 0.3) * 3e10);
      const a = onAir(songs, now);
      assert.ok(a.offsetMs >= 0 && a.offsetMs < a.song.durationMs);
      assert.equal(a.endsAt - a.startedAt, a.song.durationMs);
      assert.equal(a.startedAt + a.offsetMs, now);
      const left = a.endsAt - now;
      for (const dt of [1, Math.floor(left / 2), left - 1]) {
        if (dt <= 0 || dt >= left) continue;
        const b = onAir(songs, now + dt);
        assert.equal(b.song.id, a.song.id);
        assert.equal(b.rotation, a.rotation);
        assert.equal(b.index, a.index);
        assert.equal(b.offsetMs, a.offsetMs + dt);
        assert.equal(b.endsAt, a.endsAt);
      }
      const c = onAir(songs, a.endsAt);
      assert.equal(c.song.id, a.next.id);
      assert.equal(c.offsetMs, 0);
      assert.equal(c.startedAt, a.endsAt);
      assert.equal(onAir(songs, a.endsAt - 1).song.id, a.song.id);
    }
  }
});

test('a fraction of a ms still lands exactly on the boundary', () => {
  const songs = crate(4, 77);
  const a = onAir(songs, SIGN_ON + 12345678.9);
  assert.ok(Number.isInteger(a.startedAt) && Number.isInteger(a.endsAt));
  assert.ok(Math.abs(a.startedAt + a.offsetMs - (SIGN_ON + 12345678.9)) < 1e-3);
  const b = onAir(songs, a.endsAt);
  assert.equal(b.song.id, a.next.id);
  assert.equal(b.offsetMs, 0);
});

test('walking from boundary to boundary plays each rotation as a whole, back to back', () => {
  for (const n of [2, 3, 4, 7]) {
    const songs = crate(n, 500 + n), L = rotationMs(songs);
    let a = onAir(songs, SIGN_ON - 3 * L); // starts at a rotation's first song, before sign-on
    assert.equal(a.index, 0);
    assert.equal(a.offsetMs, 0);
    const seen = [];
    for (let i = 0; i < n * 7; i++) {
      seen.push(a.song.id);
      const b = onAir(songs, a.endsAt);
      assert.equal(b.song.id, a.next.id);
      assert.notEqual(b.song.id, a.song.id);
      assert.equal(b.offsetMs, 0);
      a = b;
    }
    for (let r = 0; r < 7; r++) assert.deepEqual(seen.slice(r * n, r * n + n).sort((x, y) => x - y), ids(songs).sort((x, y) => x - y));
  }
});

test('an empty crate means nothing on air', () => {
  assert.equal(onAir([], SIGN_ON), null);
  assert.equal(onAir(null, SIGN_ON), null);
  assert.equal(onAir(undefined, Date.now()), null);
  assert.equal(onAir(LIVE, NaN), null);
});

test('works before sign-on', () => {
  const songs = crate(5, 600);
  const L = rotationMs(songs);
  for (const now of [SIGN_ON - 1, SIGN_ON - L, SIGN_ON - L - 1, SIGN_ON - 1e11]) {
    const a = onAir(songs, now);
    assert.ok(a.rotation < 0);
    assert.ok(a.offsetMs >= 0 && a.offsetMs < a.song.durationMs);
    assert.equal(onAir(songs, a.endsAt).song.id, a.next.id);
  }
  // the last song before sign-on hands over to rotation 0's first song at exactly SIGN_ON
  const last = onAir(songs, SIGN_ON - 1);
  assert.equal(last.rotation, -1);
  assert.equal(last.endsAt, SIGN_ON);
  assert.equal(last.next.id, order(songs, 0)[0].id);
});

test('works far from sign-on, with the rotation number anywhere in +-2^31', () => {
  const songs = crate(6, 700), L = rotationMs(songs);
  for (const k of [2 ** 31 - 2, 2 ** 31 - 1, -(2 ** 31), -(2 ** 31) + 1, 1e9, -1e9]) {
    const now = SIGN_ON + k * L + Math.floor(L / 3);
    const a = onAir(songs, now);
    assert.equal(a.rotation, k);
    assert.ok(a.offsetMs >= 0 && a.offsetMs < a.song.durationMs);
    assert.deepEqual(ids(order(songs, k)).sort(), ids(songs).sort());
    const b = onAir(songs, a.endsAt);
    assert.equal(b.song.id, a.next.id);
    assert.equal(b.offsetMs, 0);
    // across the rotation boundary that follows
    const end = onAir(songs, SIGN_ON + (k + 1) * L - 1), start = onAir(songs, SIGN_ON + (k + 1) * L);
    assert.equal(end.rotation, k);
    assert.equal(start.rotation, k + 1);
    assert.equal(start.index, 0);
    assert.notEqual(start.song.id, end.song.id);
  }
});
