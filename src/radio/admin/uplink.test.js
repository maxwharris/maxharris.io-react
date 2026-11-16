// The mic's sending (npm test): four at a time, numbered from 0 without a gap, again after no answer, the oldest waiting
// chunk dropped behind a slow connection, and the end on a 410 or a refusal.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Uplink, IN_FLIGHT, WAITING, AGAIN_MS, LOST_MS } from './uplink.js';

const chunk = (n) => ({ n }); // stands in for an ArrayBuffer
const drain = (u, now) => { const out = []; for (let c = u.next(now); c; c = u.next(now)) out.push(c); return out; };

test('at most four in flight, numbered from 0 as they first go', () => {
  const u = new Uplink(0);
  for (let i = 0; i < 6; i++) u.push(chunk(i));
  const sent = drain(u, 0);
  assert.equal(IN_FLIGHT, 4);
  assert.deepEqual(sent.map((c) => [c.seq, c.pcm.n]), [[0, 0], [1, 1], [2, 2], [3, 3]]);
  assert.equal(u.next(0), null);
  u.done(sent[1], 'ok', 100);
  assert.deepEqual(drain(u, 100).map((c) => c.seq), [4]);
  assert.equal(u.lastOk, 100);
});

test('no answer: the same chunk with the same number goes again first, a moment later', () => {
  const u = new Uplink(0);
  for (let i = 0; i < 3; i++) u.push(chunk(i));
  const [a, b, c] = drain(u, 0);
  u.push(chunk(3));
  u.done(b, 'retry', 50);
  u.done(a, 'ok', 60);
  // b waits AGAIN_MS; nothing overtakes it meanwhile
  assert.equal(u.next(60), null);
  const again = u.next(50 + AGAIN_MS);
  assert.equal(again, b);
  assert.equal(again.seq, 1);
  assert.equal(again.tries, 1);
  assert.equal(u.next(50 + AGAIN_MS).seq, 3, 'then the new one, numbered after the last sent');
  // two at once going again keep their order
  u.done(again, 'retry', 400);
  u.done(c, 'retry', 410);
  const order = [];
  for (let c2 = u.next(1000); c2; c2 = u.next(1000)) order.push(c2.seq);
  assert.deepEqual(order, [1, 2]);
});

test('behind a slow connection the oldest waiting chunk gives way, never a numbered one', () => {
  const u = new Uplink(0);
  for (let i = 0; i < 5; i++) u.push(chunk(i));
  const sent = drain(u, 0); // 0..3 in flight, chunk 4 waiting
  u.done(sent[0], 'retry', 10); // seq 0 waits to go again
  for (let i = 5; i < 5 + WAITING + 3; i++) u.push(chunk(i));
  assert.equal(u.queue.length, WAITING);
  assert.equal(u.queue[0].seq, 0, 'the numbered one stays');
  assert.equal(u.dropped, 5);
  assert.deepEqual(u.queue.slice(1).map((c) => c.pcm.n), [9, 10, 11, 12, 13, 14, 15], 'the newest wait');
  // what goes out still counts on from 3 with no gap
  u.done(sent[1], 'ok', 20);
  u.done(sent[2], 'ok', 20);
  u.done(sent[3], 'ok', 20);
  assert.deepEqual(drain(u, 1000).map((c) => c.seq), [0, 4, 5, 6]);
});

test('a 410 or a refusal ends the sending', () => {
  for (const [outcome, end] of [['gone', 'gone'], ['refused', 'refused']]) {
    const u = new Uplink(0);
    u.push(chunk(0));
    u.push(chunk(1));
    const [a, b] = drain(u, 0);
    u.push(chunk(2));
    u.done(a, outcome, 10);
    assert.equal(u.end, end);
    assert.equal(u.next(10), null);
    u.done(b, 'retry', 20); // an answer still on its way changes nothing
    assert.equal(u.next(1000), null);
    assert.equal(u.inFlight, 0);
  }
});

test('lost once nothing has been taken for a while', () => {
  const u = new Uplink(1000);
  assert.equal(u.lost(1000 + LOST_MS), false);
  assert.equal(u.lost(1000 + LOST_MS + 1), true);
  u.push(chunk(0));
  u.done(u.next(2000), 'ok', 4000);
  assert.equal(u.lost(4000 + LOST_MS), false);
  assert.equal(u.lost(4000 + LOST_MS + 1), true);
});
