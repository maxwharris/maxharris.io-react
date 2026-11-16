// The engine's talk-over against a stand-in browser (npm test): <audio> elements the test plays, ends and breaks, the
// catalog's events stream spoken by the test, fetch answering the radio's routes, and one clock the test moves. What a
// listener hears when Max talks: his last words after the catalog says he stopped, and Max again after a dropped stream.
import { test, mock, afterEach } from 'node:test';
import assert from 'node:assert/strict';

const T0 = Date.UTC(2026, 10, 16, 20, 0, 0);
mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'], now: T0 });
Object.defineProperty(globalThis, 'performance', { value: { now: () => Date.now() - T0 }, configurable: true, writable: true });

// ---------------------------------------------------------------- the stand-in browser
const audios = [];
class FakeAudio {
  constructor() {
    this.attrs = {};
    this.on = {};
    this.asked = []; // every src it was given
    this.muted = false;
    this.volume = 1;
    this.preload = '';
    this.dataset = {};
    this.seeking = false;
    this.duration = NaN;
    this.reset();
    audios.push(this);
  }
  reset() {
    this.paused = true;
    this.ended = false;
    this.error = null;
    this.currentTime = 0;
    this.readyState = 0;
    this.sounding = false; // the test says when a talk's stream starts to sound (a song sounds as it plays)
  }
  get src() { return this.attrs.src || ''; }
  set src(v) { this.attrs.src = String(v); this.asked.push(String(v)); this.reset(); }
  getAttribute(n) { return n in this.attrs ? this.attrs[n] : null; }
  removeAttribute(n) { delete this.attrs[n]; if (n === 'src') this.reset(); }
  load() {}
  play() {
    if (!this.attrs.src) return Promise.reject(Object.assign(new Error('no source'), { name: 'NotSupportedError' }));
    this.paused = false;
    this.readyState = 4;
    return Promise.resolve();
  }
  pause() { this.paused = true; this.sounding = false; }
  addEventListener(ev, fn, opts) { (this.on[ev] ||= []).push({ fn, once: !!(opts && opts.once) }); }
  removeEventListener(ev, fn) { this.on[ev] = (this.on[ev] || []).filter((x) => x.fn !== fn); }
  fire(ev) {
    for (const x of [...(this.on[ev] || [])]) {
      if (x.once) this.removeEventListener(ev, x.fn);
      x.fn({ type: ev, target: this });
    }
  }
}
const sources = [];
class FakeEventSource {
  constructor(url) { this.url = url; this.readyState = 1; this.on = {}; this.onerror = null; sources.push(this); }
  addEventListener(ev, fn) { (this.on[ev] ||= []).push(fn); }
  close() { this.readyState = 2; }
}
const channels = [];
class FakeChannel {
  constructor(name) { this.name = name; this.onmessage = null; channels.push(this); }
  postMessage() {}
  close() {}
}
globalThis.window = { sessionStorage: { getItem: () => null, setItem() {} }, addEventListener() {}, removeEventListener() {} };
globalThis.document = { createElement: () => new FakeAudio(), addEventListener() {}, visibilityState: 'visible' };
globalThis.Audio = FakeAudio;
globalThis.EventSource = FakeEventSource;
globalThis.BroadcastChannel = FakeChannel;

// The catalog: two ten-minute songs, the second on air (no announcer drop over it); GET /radio says no talk.
const SONG = 600000;
const STATION = {
  on: true, version: 'test', anchor: { at: T0 - SONG - 1000, songId: 1 }, carry: null,
  songs: [{ id: 1, title: 'one', durationMs: SONG }, { id: 2, title: 'two', durationMs: SONG }],
};
globalThis.fetch = async (url) => {
  const u = String(url);
  let body = null;
  if (u === '/catalog/api/radio') body = { ...STATION, now: Date.now(), talk: { on: false } };
  else if (u.startsWith('/catalog/api/radio/play/')) body = { url: `/media/${u.split('/').pop()}.m4a`, expires: new Date(Date.now() + 3600000).toISOString() };
  else if (u.startsWith('/catalog/api/radio/peaks/')) body = { peaks: [] };
  return body ? { ok: true, status: 200, json: async () => body } : { ok: false, status: 404, json: async () => ({}) };
};

const engine = await import('./engine.js');

// ---------------------------------------------------------------- what the test does
const flush = () => new Promise((r) => setImmediate(r));
/** Move the clock on, a step at a time: the timers that come due run, and whatever is playing plays on. */
async function advance(ms, step = 50) {
  for (let done = 0; done < ms; done += step) {
    const dt = Math.min(step, ms - done);
    mock.timers.tick(dt);
    for (const a of audios) {
      const src = a.getAttribute('src') || '';
      if (a.paused || !src || (src.includes('/talk/') && !a.sounding)) continue;
      a.currentTime += dt / 1000;
      a.fire('timeupdate');
    }
    await flush();
  }
}
/** The catalog's events stream says where the talk stands. */
function say(talk) {
  const es = sources.filter((s) => s.readyState !== 2).at(-1);
  assert.ok(es, 'the radio has its events stream open');
  for (const fn of es.on.talk || []) fn({ data: JSON.stringify(talk) });
}
/** The radio admin in this browser says it is live (or stopped) on the one-radio channel. */
function admin(talkId, on) {
  for (const c of channels) if (c.onmessage) c.onmessage({ data: { type: 'talking', id: 'admin', talkId, on, at: Date.now() } });
}
/** The element holding a talk's stream now, and how many times a talk's stream was asked for. */
const voiceEl = () => audios.find((a) => (a.getAttribute('src') || '').includes('/talk/'));
const asks = (id) => audios.flatMap((a) => a.asked).filter((s) => s === `/catalog/api/radio/talk/${id}/stream.mp3`).length;
/** The talk's element starts to sound (Chrome: once it holds about 32 KB), reaches the end of its stream, or breaks. */
function sound(el) { el.sounding = true; el.fire('playing'); }
function end(el) { el.ended = true; el.paused = true; el.sounding = false; el.fire('ended'); }
function breaks(el) { el.error = { code: 2 }; el.paused = true; el.sounding = false; el.fire('error'); }
const talking = () => engine.getSnapshot().talking;
const music = () => audios.find((a) => !a.paused && /^\/media\//.test(a.getAttribute('src') || ''));

async function tuneIn() {
  engine.powerOn();
  await advance(300);
  assert.equal(engine.getSnapshot().status, 'on');
}
let n = 0;
/** A fresh talk on air (the catalog's ids are 22 url-safe characters), the radio asked for it and sounding. */
async function onAir() {
  const id = `talk-number-${String(++n).padStart(10, '0')}`;
  say({ on: true, id, since: Date.now() });
  await advance(600); // the radio waits a moment (its own admin's word comes first), then asks
  const el = voiceEl();
  assert.ok(el && asks(id) === 1, 'the talk is asked for');
  return { id, el };
}
afterEach(() => engine.powerOff());

// ---------------------------------------------------------------- the talk's end
test('a talk the catalog ends plays on to his last word; the dip and max live last until then', async () => {
  await tuneIn();
  const { id, el } = await onAir();
  sound(el);
  await advance(10000);
  assert.equal(talking(), true);
  const dipped = music().volume;
  assert.ok(Math.abs(dipped - 0.8 * 0.8 / 3) < 0.01, `the music at a third of the knob, ${dipped}`);
  say({ on: false }); // Max tapped stop: the catalog says so at once, while Chrome still holds about 4.5 s of him
  await advance(4000);
  assert.equal(el.getAttribute('src'), `/catalog/api/radio/talk/${id}/stream.mp3`, 'his last words still playing');
  assert.equal(el.paused, false);
  assert.equal(talking(), true);
  assert.equal(music().volume, dipped, 'the music still under him');
  end(el); // the stream ends after his last word
  assert.equal(talking(), false);
  assert.equal(el.getAttribute('src'), null);
  await advance(600);
  assert.ok(Math.abs(music().volume - 0.64) < 0.01, 'and back up, 450 ms after');
  assert.equal(asks(id), 1, 'nothing asked for again');
});

test('a talk shorter than the player holds back is still heard', async () => {
  await tuneIn();
  const { el } = await onAir();
  await advance(2500);
  say({ on: false }); // "back in a sec": over before Chrome started to play it
  await advance(500);
  assert.ok(el.getAttribute('src'), 'still asked for');
  sound(el); // the stream ended, so Chrome plays what it has
  await advance(100);
  assert.equal(talking(), true);
  await advance(2900);
  end(el);
  assert.equal(talking(), false);
});

test('a stream still playing 12 s after its talk ended is let go', async () => {
  await tuneIn();
  const { el } = await onAir();
  sound(el);
  await advance(3000);
  say({ on: false });
  await advance(11900); // it plays on and on, and never ends
  assert.ok(el.getAttribute('src'), 'still playing out');
  await advance(200);
  assert.equal(el.getAttribute('src'), null, 'let go 12 s after the catalog said it ended');
  assert.equal(talking(), false);
});

test('a stream that stalls after its talk ended is let go by the stall check', async () => {
  await tuneIn();
  const { el } = await onAir();
  sound(el);
  await advance(3000);
  say({ on: false });
  await advance(1000);
  el.sounding = false; // stuck, with no word from the element
  await advance(7000);
  assert.equal(el.getAttribute('src'), null);
  assert.equal(talking(), false);
});

test('a new talk takes over from the end of the last one', async () => {
  await tuneIn();
  const first = await onAir();
  sound(first.el);
  await advance(3000);
  say({ on: false }); // taken over on another device: this one ends and the next is on at once
  const next = `talk-number-${String(++n).padStart(10, '0')}`;
  say({ on: true, id: next, since: Date.now() });
  await advance(300);
  assert.equal(first.el.getAttribute('src'), `/catalog/api/radio/talk/${first.id}/stream.mp3`, 'the last words play while the radio waits');
  await advance(300);
  assert.equal(voiceEl().getAttribute('src'), `/catalog/api/radio/talk/${next}/stream.mp3`);
  assert.equal(asks(next), 1);
});

test("in Max's own browser the end of a talk stops the moment his admin here goes live", async () => {
  await tuneIn();
  const { el } = await onAir(); // a talk from his other device, which this radio plays like anyone's
  sound(el);
  await advance(3000);
  say({ on: false });
  await advance(1000);
  assert.ok(el.getAttribute('src'));
  admin(`talk-number-${String(++n).padStart(10, '0')}`, true); // he takes over here: nothing of him plays here now
  assert.equal(el.getAttribute('src'), null);
  assert.equal(talking(), true, 'the music stays down under him');
  admin(`talk-number-${String(n).padStart(10, '0')}`, false);
  assert.equal(talking(), false);
});

test('power off during the end of a talk is silence at once', async () => {
  await tuneIn();
  const { el } = await onAir();
  sound(el);
  await advance(2000);
  say({ on: false });
  await advance(1000);
  engine.powerOff();
  assert.equal(el.getAttribute('src'), null);
  assert.equal(talking(), false);
});

// ---------------------------------------------------------------- a stream that breaks
test('a talk stream that keeps breaking is asked for again, further apart, for as long as the talk is on', async () => {
  await tuneIn();
  const { id, el } = await onAir();
  sound(el);
  await advance(3000);
  end(el); // the connection dropped: the element played out what it held, and ended
  assert.equal(talking(), false, 'the music back up meanwhile');
  await advance(1100);
  assert.equal(asks(id), 2, 'asked again 1 s later');
  sound(el);
  await advance(2000);
  assert.equal(talking(), true);
  end(el); // dropped again, 2 s on (a phone between cells)
  await advance(2900);
  assert.equal(asks(id), 2, 'not again at once');
  await advance(200);
  assert.equal(asks(id), 3, 'asked again 3 s later, the talk still on');
  breaks(el); // the network still out: refused at once
  await advance(7900);
  assert.equal(asks(id), 3);
  await advance(200);
  assert.equal(asks(id), 4, 'then 8 s later');
  breaks(el);
  await advance(15100);
  assert.equal(asks(id), 5, 'then 15 s');
  breaks(el);
  await advance(30100);
  assert.equal(asks(id), 6, 'then every 30 s');
  breaks(el);
  await advance(30100);
  assert.equal(asks(id), 7);
  sound(el); // the network is back: Max again
  await advance(100);
  assert.equal(talking(), true);
  await advance(21000); // steady for a while: a break now is tried again after a second
  end(el);
  await advance(1100);
  assert.equal(asks(id), 8);
  breaks(el);
  say({ on: false }); // over while the radio waits to ask again: nothing more is asked for
  await advance(60000);
  assert.equal(asks(id), 8);
  assert.equal(el.getAttribute('src'), null);
  assert.equal(talking(), false);
});

test('a talk stream that never starts is asked for again too', async () => {
  await tuneIn();
  const { id } = await onAir();
  await advance(15000); // nothing from the element: it fails on its first check past 15 s
  assert.equal(asks(id), 1);
  await advance(2000); // and is asked for again a second after that
  assert.equal(asks(id), 2);
  await advance(17000); // nothing again: failed, and waiting 3 s this time
  assert.equal(asks(id), 2);
  await advance(2000);
  assert.equal(asks(id), 3);
  sound(voiceEl());
  await advance(100);
  assert.equal(talking(), true);
});
