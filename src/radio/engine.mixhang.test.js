// The engine on an iPhone whose bucket never answers the mix's check (iphone.harness.js: a weak signal, a captive
// portal): it gives up after MIX_PROBE_MS, and the radio plays as it did before the mix, the talk muting the music.
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { setup } from './iphone.harness.js';

const h = await setup({ bucket: 'hang' });
afterEach(() => h.engine.powerOff());

test('a check the bucket never answers gives up after 6 s, and the song plays as before', async () => {
  h.tap(() => { h.engine.prime(); h.engine.powerOn(); });
  await h.advance(5500);
  assert.equal(h.status(), 'tuning', 'waiting on the check');
  await h.advance(1000);
  assert.equal(h.status(), 'on', 'playing');
  assert.equal(h.ctx().routed.length, 0, 'nothing routed');
  assert.equal(h.music().crossOrigin, null);
  assert.equal(h.session.type, 'auto', 'the playback session given back');
});

test('then the talk mutes the music, as before, and the check is not asked again', async () => {
  await h.tuneIn();
  const el = h.music();
  const { el: v } = await h.onAir();
  h.sound(v);
  await h.advance(500);
  assert.equal(el.muted, true);
  assert.equal(h.probes.length, 1);
});
