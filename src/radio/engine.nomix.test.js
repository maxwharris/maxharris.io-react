// The engine on an iPhone whose bucket answers without CORS (iphone.harness.js): a routed element would play silence,
// so nothing is routed, and the talk mutes the music as before (playing on in place), rather than leaving it silent.
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { setup } from './iphone.harness.js';

const h = await setup({ bucket: 'refuse' });
afterEach(() => h.engine.powerOff());

test('without CORS from the bucket nothing is routed, and the songs load as before', async () => {
  await h.tuneIn();
  assert.equal(h.probes.length, 1);
  assert.equal(h.ctx().routed.length, 0, 'no element routed');
  const el = h.music();
  assert.ok(el, 'the song plays, straight from its element');
  assert.equal(el.crossOrigin, null, 'and loads without CORS');
  assert.equal(el.muted, false);
  assert.equal(h.session.type, 'auto', 'the playback session given back: nothing plays through the context');
});

test('without the mix the talk mutes the music, in place, and unmutes it after', async () => {
  await h.tuneIn();
  const el = h.music();
  const { el: v } = await h.onAir();
  h.sound(v);
  await h.advance(500);
  assert.equal(h.talking(), true);
  assert.equal(el.muted, true, 'muted under him, as before');
  assert.equal(el.paused, false, 'playing on in place');
  h.say({ on: false });
  await h.advance(500);
  h.end(v);
  assert.equal(h.talking(), false);
  assert.equal(el.muted, false);
  await h.tuneIn();
  assert.equal(h.probes.length, 1, 'decided once per page: not asked again');
});
