// The talk-over's decisions (npm test): what a radio plays when Max is on the mic, when it dips, and that Max's own
// browser never plays his voice back.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeTalk, sameTalk, heardOwn, talkPlan, playsOut, musicShare, voiceRetryMs, takesTalk, NO_OWN, OWN_MS, TALK_SHARE, DROP_SHARE, TALK_LAG_S } from './talk.js';

const ID = 'AbCdEfGhIjKlMnOpQrSt_-';
const OTHER = 'zzzzzzzzzzzzzzzzzzzzzz';

test("the catalog's word: on with a usable id, or off", () => {
  assert.deepEqual(normalizeTalk({ on: true, id: ID, since: 1700000000000 }), { on: true, id: ID, since: 1700000000000 });
  assert.deepEqual(normalizeTalk({ on: true, id: ID, since: '1700000000000' }), { on: true, id: ID, since: 1700000000000 });
  assert.deepEqual(normalizeTalk({ on: true, id: ID }), { on: true, id: ID, since: 0 });
  for (const bad of [null, undefined, {}, { on: false, id: ID }, { on: 'yes', id: ID }, { on: true }, { on: true, id: 12345678 },
    { on: true, id: '../../etc/passwd' }, { on: true, id: 'short' }, { on: true, id: 'x'.repeat(65) }, { on: true, id: 'with space in it' }]) {
    assert.deepEqual(normalizeTalk(bad), { on: false }, JSON.stringify(bad));
  }
  assert.ok(sameTalk({ on: false }, { on: false }));
  assert.ok(sameTalk(normalizeTalk({ on: true, id: ID, since: 5 }), normalizeTalk({ on: true, id: ID, since: 5 })));
  assert.ok(!sameTalk({ on: true, id: ID, since: 5 }, { on: true, id: OTHER, since: 5 }));
  assert.ok(!sameTalk({ on: true, id: ID, since: 5 }, { on: false }));
});

test("this browser's admin: on, off, and every own talk remembered (a few)", () => {
  let own = heardOwn(NO_OWN, ID, true, 1000);
  assert.deepEqual(own, { live: ID, at: 1000, ids: [ID] });
  own = heardOwn(own, ID, true, 3000); // said again
  assert.deepEqual(own, { live: ID, at: 3000, ids: [ID] });
  // an off for another talk leaves this one live
  assert.equal(heardOwn(own, OTHER, false, 3500).live, ID);
  own = heardOwn(own, ID, false, 4000);
  assert.deepEqual(own, { live: null, at: 0, ids: [ID] }, 'off keeps the id');
  assert.equal(heardOwn(own, '', true, 5000), own);
  assert.equal(heardOwn(own, undefined, true, 5000), own);
  // only the last eight are kept
  let many = NO_OWN;
  for (let i = 0; i < 12; i++) many = heardOwn(many, `talk-number-${i}`, true, i);
  assert.equal(many.ids.length, 8);
  assert.equal(many.ids[0], 'talk-number-4');
  assert.equal(many.ids[7], 'talk-number-11');
});

test('a radio plays the talk the catalog says is on, unless it is its own browser\'s, or off', () => {
  const on = normalizeTalk({ on: true, id: ID, since: 1 });
  const now = 100000;
  // an ordinary listener
  assert.deepEqual(talkPlan({ enabled: true, talk: on, own: NO_OWN, now }), { play: ID, echo: false });
  assert.deepEqual(talkPlan({ enabled: true, talk: { on: false }, own: NO_OWN, now }), { play: null, echo: false });
  // switched off, or the embed with ?talk=0: nothing at all
  assert.deepEqual(talkPlan({ enabled: false, talk: on, own: heardOwn(NO_OWN, ID, true, now), now }), { play: null, echo: false });
});

test("Max's own browser dips but never plays his talk back", () => {
  const on = normalizeTalk({ on: true, id: ID, since: 1 });
  const now = 100000;
  const live = heardOwn(NO_OWN, ID, true, now - 1000);
  // the admin said so before the catalog did: dip at once
  assert.deepEqual(talkPlan({ enabled: true, talk: { on: false }, own: live, now }), { play: null, echo: true });
  // and once the catalog says it is on: still only the dip
  assert.deepEqual(talkPlan({ enabled: true, talk: on, own: live, now }), { play: null, echo: true });
  // the admin went quiet (its window closed without a word): the dip ends after OWN_MS
  assert.deepEqual(talkPlan({ enabled: true, talk: on, own: live, now: now - 1000 + OWN_MS + 1 }), { play: null, echo: false });
  // it stopped: no dip, and the catalog's word that it is still on (for a moment) plays nothing
  const off = heardOwn(live, ID, false, now);
  assert.deepEqual(talkPlan({ enabled: true, talk: on, own: off, now }), { play: null, echo: false });
  // a talk from another device or tab of another browser is played as anyone's would be
  assert.deepEqual(talkPlan({ enabled: true, talk: normalizeTalk({ on: true, id: OTHER }), own: off, now }), { play: OTHER, echo: false });
});

test('a talk the catalog says is over plays on to the end of its stream, his last words', () => {
  const voice = { id: ID, down: false };
  const off = { on: false };
  assert.equal(playsOut({ enabled: true, talk: off, voice }), true);
  // the radio switched off, or the element waiting to try again (it holds nothing): stop
  assert.equal(playsOut({ enabled: false, talk: off, voice }), false);
  assert.equal(playsOut({ enabled: true, talk: off, voice: { id: ID, down: true } }), false);
  assert.equal(playsOut({ enabled: true, talk: off, voice: null }), false);
  // another talk on (it takes over), or this browser's radio admin live: nothing of the last one plays on
  assert.equal(playsOut({ enabled: true, talk: normalizeTalk({ on: true, id: OTHER }), voice }), false);
  assert.equal(playsOut({ enabled: true, talk: off, echo: true, voice }), false);
  // this browser's own talk never plays here at all
  assert.equal(playsOut({ enabled: true, talk: off, own: heardOwn(NO_OWN, ID, false, 1), voice }), false);
});

test('the music dips to a third under the talk, which outranks a drop', () => {
  assert.equal(TALK_SHARE, 1 / 3);
  assert.equal(musicShare({ talking: true, drop: false }), 1 / 3);
  assert.equal(musicShare({ talking: true, drop: true }), 1 / 3);
  assert.equal(musicShare({ talking: false, drop: true }), DROP_SHARE);
  assert.equal(musicShare({ talking: false, drop: false }), 1);
});

test('a failing talk stream is asked for again, further apart, for as long as that talk is on', () => {
  const on = normalizeTalk({ on: true, id: ID });
  const waits = [0, 1, 2, 3, 4, 5, 60].map((tries) => voiceRetryMs({ tries, talk: on, id: ID }));
  assert.deepEqual(waits, [1000, 3000, 8000, 15000, 30000, 30000, 30000]);
  // the talk is over, or another one is on (that one is played instead): nothing to ask for
  assert.equal(voiceRetryMs({ tries: 0, talk: { on: false }, id: ID }), -1);
  assert.equal(voiceRetryMs({ tries: 0, talk: normalizeTalk({ on: true, id: OTHER }), id: ID }), -1);
  assert.equal(voiceRetryMs({ tries: 0, talk: null, id: ID }), -1);
});

test('Max is told how late listeners hear him: about 5 s, mostly Chrome holding back the stream', () => {
  // Chrome starts a live MP3 once it holds about 32 KB: at the catalog's 64 kbps that is 4.1 s, then the mic's 250 ms
  // chunks and the catalog's 0.4 s from a post to its stream (in the dev mocks, 4.5 s from going live to the first sound)
  const chromeHolds = (32 * 1024 * 8) / 64000;
  assert.equal(TALK_LAG_S, Math.round(chromeHolds + 0.25 + 0.4));
  assert.equal(TALK_LAG_S, 5);
});

test("the events stream's word wins while it is live; a queue read stands in when it is not", () => {
  assert.equal(takesTalk('events', true), true);
  assert.equal(takesTalk('events', false), true);
  assert.equal(takesTalk('poll', true), false);
  assert.equal(takesTalk('poll', false), true);
});
