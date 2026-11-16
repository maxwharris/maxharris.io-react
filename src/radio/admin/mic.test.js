// The radio admin's mic going live, against a stand-in browser (npm test): a catalog that does not answer the start
// leaves the card off air after 10 s with the mic let go, and a tap on the round button while going live stops at once,
// a late answer's talk ended as it comes.
import { test, mock, afterEach } from 'node:test';
import assert from 'node:assert/strict';

mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'] });

// ---------------------------------------------------------------- the stand-in browser
const tracks = [], contexts = [];
class FakeTrack {
  constructor() { this.readyState = 'live'; this.label = 'Default - Studio Mic'; tracks.push(this); }
  stop() { this.readyState = 'ended'; }
  addEventListener() {}
}
class FakeContext {
  constructor() { this.state = 'running'; this.destination = {}; this.audioWorklet = { addModule: async () => {} }; contexts.push(this); }
  resume() { return Promise.resolve(); }
  close() { this.state = 'closed'; return Promise.resolve(); }
  createMediaStreamSource() { return { connect() {}, disconnect() {} }; }
}
globalThis.window = { AudioContext: FakeContext, addEventListener() {}, removeEventListener() {} };
Object.defineProperty(globalThis, 'navigator', {
  configurable: true,
  value: {
    mediaDevices: {
      getUserMedia: async () => { const t = [new FakeTrack()]; return { getTracks: () => t, getAudioTracks: () => t }; },
      enumerateDevices: async () => [],
      addEventListener() {},
      removeEventListener() {},
    },
  },
});
globalThis.AudioWorkletNode = class { constructor() { this.port = { onmessage: null, postMessage() {} }; } connect() {} disconnect() {} };
globalThis.BroadcastChannel = class { constructor() { this.onmessage = null; } postMessage() {} close() {} };

// The catalog: a start answered when the test says (or never), aborted as the browser's fetch would be; the rest 204.
const requests = [];
globalThis.fetch = (url, init = {}) => {
  const req = { url: String(url), method: init.method || 'GET', signal: init.signal, answer: null };
  requests.push(req);
  if (req.method === 'POST' && /\/radio\/talk$/.test(req.url)) {
    return new Promise((resolve, reject) => {
      req.answer = (status, body) => resolve({ ok: status >= 200 && status < 300, status, json: async () => body });
      if (init.signal) init.signal.addEventListener('abort', () => reject(new DOMException('The operation was aborted.', 'AbortError')));
    });
  }
  return Promise.resolve({ ok: true, status: 204, json: async () => null });
};

const { createMic } = await import('./mic.js');

const flush = async () => { for (let i = 0; i < 4; i++) await new Promise((r) => setImmediate(r)); };
const ID = 'AbCdEfGhIjKlMnOpQrSt_-';
let mic = null;
/** The card up, go live (the round button's tap, or start itself): the mic granted, and the catalog asked for a talk. */
async function goLive(tap = true) {
  mic = createMic();
  mic.open();
  if (tap) mic.tap();
  else mic.start();
  await flush();
  assert.equal(mic.get().phase, 'starting');
  const post = requests.filter((r) => r.method === 'POST').at(-1);
  assert.ok(post && post.answer, 'the talk asked for');
  return post;
}
const micOpen = () => tracks.at(-1).readyState === 'live' || contexts.at(-1).state !== 'closed';
afterEach(() => { if (mic) mic.close(); mic = null; });

test('a start the catalog does not answer is off air after 10 s, the mic let go', async () => {
  await goLive(false);
  mock.timers.tick(9900);
  await flush();
  assert.equal(mic.get().phase, 'starting');
  assert.equal(micOpen(), true);
  mock.timers.tick(200);
  await flush();
  assert.equal(mic.get().phase, 'offair');
  assert.equal(mic.get().why, 'could not reach the catalog.');
  assert.equal(micOpen(), false, 'the mic let go');
  // and going live works again
  const again = await goLive(false);
  again.answer(201, { id: ID, startedAt: Date.now(), sampleRate: 24000, chunkMs: 250 });
  await flush();
  assert.equal(mic.get().phase, 'live');
});

test('a tap while going live stops at once, and the late talk is ended as the catalog answers', async () => {
  const post = await goLive();
  mic.tap();
  assert.equal(mic.get().phase, 'ready');
  assert.equal(micOpen(), false, 'the mic let go at once');
  mock.timers.tick(15000); // slow, but answered: the start is not given up on after a stop, so its talk can be ended
  await flush();
  assert.equal(post.signal.aborted, false);
  post.answer(201, { id: ID, startedAt: Date.now(), sampleRate: 24000, chunkMs: 250 });
  await flush();
  assert.equal(mic.get().phase, 'ready');
  assert.ok(requests.some((r) => r.method === 'DELETE' && r.url.endsWith(`/radio/talk/${ID}`)), 'the late talk ended');
});

test('the round button: nothing while the browser asks for the mic, a stop once live', async () => {
  mic = createMic();
  mic.open();
  mic.tap();
  assert.equal(mic.get().phase, 'asking');
  mic.tap(); // the browser's prompt is up: the tap does nothing
  assert.equal(mic.get().phase, 'asking');
  await flush();
  const post = requests.filter((r) => r.method === 'POST').at(-1);
  post.answer(201, { id: ID, startedAt: Date.now(), sampleRate: 24000, chunkMs: 250 });
  await flush();
  assert.equal(mic.get().phase, 'live');
  mic.tap();
  assert.equal(mic.get().phase, 'ready');
  assert.equal(micOpen(), false);
});
