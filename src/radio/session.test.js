// session.js: the page's iOS audio session between the radio admin's mic and the radio's mix, in either order.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/27.2 Mobile/15E148 Safari/604.1';
const nav = { userAgent: IPHONE, maxTouchPoints: 5, audioSession: { type: 'auto' } };
Object.defineProperty(globalThis, 'navigator', { value: nav, configurable: true, writable: true });
const { audioSession } = await import('./session.js');

beforeEach(() => {
  audioSession({ mic: false, radio: false });
  nav.userAgent = IPHONE;
  nav.audioSession = { type: 'auto' };
});

test('the radio wants playback; the mic going live outranks it, and stopping hands it back', () => {
  assert.equal(audioSession({ radio: true }), 'playback');
  assert.equal(audioSession({ mic: true }), 'play-and-record');
  assert.equal(audioSession({ mic: false }), 'playback');
});

test('a radio switched on while the mic is live never takes the mic its session', () => {
  assert.equal(audioSession({ mic: true }), 'play-and-record');
  assert.equal(audioSession({ radio: true }), 'play-and-record');
  assert.equal(audioSession({ mic: false }), 'playback');
});

test('with neither wanting it, the page gets auto back; a type it never set is left alone', () => {
  audioSession({ radio: true });
  assert.equal(audioSession({ radio: false }), 'auto');
  nav.audioSession.type = 'ambient'; // set by someone else
  assert.equal(audioSession({ radio: false }), 'ambient');
});

test('computers and Safari before 16.4: nothing to do', () => {
  nav.userAgent = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/27.2 Safari/605.1.15';
  nav.maxTouchPoints = 0;
  assert.equal(audioSession({ radio: true, mic: true }), '');
  assert.equal(nav.audioSession.type, 'auto');
  nav.maxTouchPoints = 5;
  nav.userAgent = IPHONE;
  delete nav.audioSession;
  assert.equal(audioSession({ radio: true }), '');
});
