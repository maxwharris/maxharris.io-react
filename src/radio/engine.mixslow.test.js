// The engine on an iPhone whose bucket takes 2 s to answer the mix's check (iphone.harness.js): switched off meanwhile,
// the music is routed when the answer comes, but the audio context it would play through is left at rest.
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { setup } from './iphone.harness.js';

const h = await setup({ bucket: 'slow' });
afterEach(() => h.engine.powerOff());

test('switched off while the bucket is checked: routed when it answers, the context at rest', async () => {
  h.tap(() => { h.engine.prime(); h.engine.powerOn(); });
  await h.advance(500);
  assert.equal(h.status(), 'tuning', 'waiting on the check');
  h.engine.powerOff();
  await h.advance(3000);
  assert.equal(h.ctx().routed.length, 2, 'routed when the bucket answered');
  assert.equal(h.ctx().state, 'suspended', 'and not left running with the radio off');
});

test('the next tap tunes in through the mix', async () => {
  await h.tuneIn();
  assert.equal(h.probes.length, 1);
  assert.equal(h.ctx().state, 'running');
  assert.equal(h.music().crossOrigin, 'anonymous');
});
