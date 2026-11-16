// The engine on an iPhone whose bucket answers with CORS (iphone.harness.js): the music plays through Web Audio, the
// mix, so the talk can dip it to half rather than mute it (Max, 11/16/26: the music should overlap his voice).
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { setup } from './iphone.harness.js';

const h = await setup({ cors: true });
afterEach(() => h.engine.powerOff());

test('on an iPhone the music plays through Web Audio, with a playback session so it plays on locked', async () => {
  assert.equal(h.engine.getSnapshot().volumeWorks, false, "an iPhone's element volume is the listener's");
  await h.tuneIn();
  assert.equal(h.session.type, 'playback', 'set in the tap, before the context starts');
  assert.equal(h.probes.length, 1, "the song's link asked once, from the page, before the first song loaded");
  assert.equal(h.probes[0].mode, 'cors');
  const c = h.ctx();
  assert.equal(c.state, 'running');
  assert.equal(c.routed.length, 2, 'both music elements routed');
  const el = h.music();
  assert.ok(el, 'a song plays');
  assert.equal(el.crossOrigin, 'anonymous');
  assert.ok(el.asked.filter((a) => a.src.startsWith('https://bucket.example/')).every((a) => a.crossOrigin === 'anonymous'), 'every song it loaded, loaded with CORS');
  const r = h.route(el);
  assert.equal(r.own.gain.value, 1);
  assert.equal(r.dip.gain.value, 1);
  assert.equal(r.out, c.destination);
  assert.equal(el.muted, false);
});

test('the talk dips the music to half, never mutes it, and it comes back after his last word', async () => {
  await h.tuneIn();
  const el = h.music();
  const { el: v } = await h.onAir();
  h.sound(v);
  await h.advance(1000);
  assert.equal(h.talking(), true);
  assert.equal(h.route(el).dip.gain.value, 0.5, 'half under him');
  assert.equal(el.muted, false, 'not muted');
  assert.equal(h.route(el).own.gain.value, 1);
  assert.equal(v.muted, false, 'his voice plays');
  assert.equal(h.ctx().routed.some((x) => x.el === v), false, 'his voice plays straight, not through the context');
  h.say({ on: false });
  await h.advance(2000);
  assert.equal(h.route(el).dip.gain.value, 0.5, 'still under him while his last words play');
  h.end(v);
  assert.equal(h.talking(), false);
  assert.equal(h.route(el).dip.gain.value, 1, 'back up');
});

test("in Max's own browser the music dips while his admin is live, and nothing of him plays", async () => {
  await h.tuneIn();
  const el = h.music();
  h.admin('talk-number-own0000001', true);
  assert.equal(h.talking(), true);
  assert.equal(h.route(el).dip.gain.value, 0.5);
  assert.equal(el.muted, false);
  h.admin('talk-number-own0000001', false);
  assert.equal(h.talking(), false);
  assert.equal(h.route(el).dip.gain.value, 1);
});

test('power off rests the audio context and power on wakes it; the probe is not asked again', async () => {
  await h.tuneIn();
  h.engine.powerOff();
  assert.equal(h.ctx().state, 'suspended', 'rested while off');
  await h.tuneIn();
  assert.equal(h.ctx().state, 'running');
  assert.ok(h.music(), 'playing again');
  assert.equal(h.probes.length, 1, 'decided once per page');
  assert.equal(h.ctx().routed.length, 2, 'routed once');
});

test('switched on with no tap and the context asleep: PUSH PWR, rather than a song nobody hears', async () => {
  await h.tuneIn();
  h.engine.powerOff();
  const c = h.ctx();
  c.resume = () => Promise.resolve(); // the browser will not resume it without a tap
  h.engine.powerOn(); // a path with no tap
  await h.advance(2000);
  assert.equal(c.state, 'suspended');
  assert.equal(h.engine.getSnapshot().status, 'blocked');
  delete c.resume;
});

test('a power off during a talk brings the dip back to full for next time', async () => {
  await h.tuneIn();
  const el = h.music();
  const { el: v } = await h.onAir();
  h.sound(v);
  await h.advance(500);
  assert.equal(h.route(el).dip.gain.value, 0.5);
  h.engine.powerOff();
  assert.equal(h.talking(), false);
  assert.equal(h.route(el).dip.gain.value, 1);
});
