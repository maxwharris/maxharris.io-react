// The engine on an iPhone whose bucket answers with CORS (iphone.harness.js): the music plays through Web Audio, the
// mix, so the talk can dip it to half rather than mute it (Max, 11/16/26: the music should overlap his voice). The page
// opens as the pop-out does, tuning in before any tap, so the first test is that page's first start.
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { setup } from './iphone.harness.js';

const h = await setup({ bucket: 'ok' });
afterEach(() => h.engine.powerOff());

test('the pop-out tunes in before any tap: PUSH PWR, and the tap that answers it routes the music', async () => {
  h.engine.tuneIn(); // the page opening (useRadioSession): no tap, so iOS will not start sound
  await h.advance(500);
  assert.equal(h.status(), 'blocked', 'PUSH PWR');
  assert.equal(h.probes.length, 0, 'not settled without an audio context');
  assert.equal(h.session.type, 'auto');
  h.tap(() => h.engine.power()); // the tap on PUSH PWR
  await h.advance(300);
  assert.equal(h.status(), 'on');
  assert.equal(h.session.type, 'playback', 'set in the tap, before the context starts');
  assert.equal(h.probes.length, 1, "the song's link asked once, from the page, before the song loaded");
  assert.equal(h.probes[0].mode, 'cors');
  assert.equal(h.ctx().state, 'running');
  assert.equal(h.ctx().routed.length, 2, 'both music elements routed');
  const loads = h.audios.flatMap((a) => a.asked).filter((a) => a.src.startsWith('https://bucket.example/'));
  const before = loads.filter((a) => a.crossOrigin == null), after = loads.filter((a) => a.crossOrigin === 'anonymous');
  assert.ok(after.length >= 1, 'the song loads with CORS');
  assert.ok(after.every((a) => !before.some((b) => b.src.split('#')[0] === a.src.split('#')[0])), 'never from a link an element took outside CORS');
});

test('on an iPhone the music plays through Web Audio, loaded with CORS, at full', async () => {
  assert.equal(h.engine.getSnapshot().volumeWorks, false, "an iPhone's element volume is the listener's");
  await h.tuneIn();
  assert.equal(h.probes.length, 1, 'decided once per page');
  const c = h.ctx();
  const el = h.music();
  assert.ok(el, 'a song plays');
  assert.equal(el.crossOrigin, 'anonymous');
  const loads = el.asked.filter((a) => a.src.startsWith('https://bucket.example/'));
  const first = loads.findIndex((a) => a.crossOrigin === 'anonymous');
  assert.ok(first >= 0 && loads.slice(first).every((a) => a.crossOrigin === 'anonymous'), 'every song since it was routed, loaded with CORS');
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

test('a song boundary during a talk: the last song silent on its own gain, the next at full, the dip held', async () => {
  await h.tuneIn();
  const first = h.music();
  const { el: v } = await h.onAir();
  h.sound(v);
  await h.advance(500);
  const left = h.engine.getSnapshot().endsAt - Date.now();
  assert.ok(left > 0 && left < 600000, `the boundary ${left} ms away`);
  const own = h.route(first).own.gain;
  await h.advance(left + 600, 200);
  assert.equal(h.talking(), true, 'he is still on');
  const next = h.music();
  assert.ok(next && next !== first, 'the next song plays, on the other element');
  assert.ok(own.history.includes(0), 'the last song went silent on its own gain at the boundary');
  assert.equal(h.route(next).own.gain.value, 1);
  assert.equal(next.muted, false);
  assert.equal(h.route(next).dip.gain.value, 0.5, 'still half under him');
  assert.ok(next.asked.at(-1).crossOrigin === 'anonymous', 'loaded with CORS');
});

test('iOS leaves the context suspended while it plays: asked to resume, and PUSH PWR if it will not', async () => {
  await h.tuneIn();
  const c = h.ctx();
  c.becomes('suspended'); // after a call, say
  await h.advance(100);
  assert.equal(c.state, 'running', 'resumed');
  assert.equal(h.status(), 'on');
  c.refuse = true;
  c.becomes('suspended');
  await h.advance(2400);
  assert.equal(h.status(), 'on', 'given a moment');
  await h.advance(200);
  assert.equal(h.status(), 'blocked', 'PUSH PWR rather than a radio that says it plays and is silent');
  c.refuse = false;
});

test('a call that leaves the context interrupted and turns the radio off: the context rests', async () => {
  await h.tuneIn();
  const c = h.ctx();
  c.becomes('interrupted');
  const el = h.music();
  el.pause(); // iOS takes the audio for the call
  el.fire('pause');
  await h.advance(500);
  assert.equal(h.status(), 'off', 'the pause from outside turns the radio off');
  assert.equal(c.state, 'suspended', 'suspended by the page, so iOS does not start it again when the call ends');
  await h.tuneIn();
  assert.equal(c.state, 'running', 'and the tap that tunes in wakes it');
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

test('a song starting with the context asleep and a browser that will not resume it: PUSH PWR, not silence', async () => {
  await h.tuneIn();
  h.engine.powerOff();
  const c = h.ctx();
  c.refuse = true;
  h.engine.powerOn(); // a start with no tap (NO SIGNAL coming back, say)
  await h.advance(3000);
  assert.equal(c.state, 'suspended');
  assert.equal(h.status(), 'blocked');
  c.refuse = false;
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
