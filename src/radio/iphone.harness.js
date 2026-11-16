// A stand-in iPhone for the engine's mix tests (engine.mix.test.js, engine.nomix.test.js): Safari's locked element
// volume (the user agent says iPhone), navigator.audioSession, an AudioContext that records what is routed through it,
// <audio> elements the test plays, the catalog's events stream spoken by the test, and fetch answering the radio's
// routes, its probe of a song's link with CORS headers or without. One clock the test moves. Not a test itself: each
// test file sets one up before it imports the engine, so each gets an engine of its own.
import { mock } from 'node:test';
import assert from 'node:assert/strict';

export const T0 = Date.UTC(2026, 10, 16, 22, 0, 0);
const SONG = 600000;

class FakeAudio {
  constructor(list) {
    this.attrs = {};
    this.on = {};
    this.asked = [];
    this.muted = false;
    this.volume = 1;
    this.preload = '';
    this.crossOrigin = null;
    this.dataset = {};
    this.seeking = false;
    this.duration = NaN;
    this.reset();
    list.push(this);
  }
  reset() {
    this.paused = true;
    this.ended = false;
    this.error = null;
    this.currentTime = 0;
    this.readyState = 0;
    this.sounding = false;
  }
  get src() { return this.attrs.src || ''; }
  set src(v) { this.attrs.src = String(v); this.asked.push({ src: String(v), crossOrigin: this.crossOrigin }); this.reset(); }
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

class FakeParam {
  constructor(v) { this.value = v; }
  cancelScheduledValues() {}
  setValueAtTime(v) { this.value = v; }
  linearRampToValueAtTime(v) { this.value = v; } // the ramps land at once: the tests read where they go
  exponentialRampToValueAtTime(v) { this.value = v; }
}
class FakeNode {
  constructor(kind) { this.kind = kind; this.outs = []; }
  connect(to) { this.outs.push(to); return to; }
  disconnect() { this.outs = []; }
}

export async function setup({ cors }) {
  mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'], now: T0 });
  Object.defineProperty(globalThis, 'performance', { value: { now: () => Date.now() - T0 }, configurable: true, writable: true });

  const audios = [];
  const contexts = [];
  class FakeAudioContext {
    constructor() {
      this.state = 'suspended';
      this.sampleRate = 48000;
      this.destination = new FakeNode('destination');
      this.routed = []; // {el, node}: every element routed through this context
      contexts.push(this);
    }
    get currentTime() { return performance.now() / 1000; }
    resume() { this.state = 'running'; return Promise.resolve(); }
    suspend() { this.state = 'suspended'; return Promise.resolve(); }
    createGain() { const n = new FakeNode('gain'); n.gain = new FakeParam(1); return n; }
    createMediaElementSource(el) {
      if (this.routed.some((r) => r.el === el)) throw Object.assign(new Error('already routed'), { name: 'InvalidStateError' });
      const n = new FakeNode('media');
      n.mediaElement = el;
      this.routed.push({ el, node: n });
      return n;
    }
    createBuffer(ch, len) { const d = new Float32Array(len); return { getChannelData: () => d }; }
    createBufferSource() { const n = new FakeNode('buffer'); n.start = () => {}; n.stop = () => {}; return n; }
    createBiquadFilter() { const n = new FakeNode('biquad'); n.frequency = new FakeParam(350); n.Q = new FakeParam(1); return n; }
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
  const session = { type: 'auto' };
  globalThis.window = {
    sessionStorage: { getItem: () => null, setItem() {} }, addEventListener() {}, removeEventListener() {},
    AudioContext: FakeAudioContext,
  };
  globalThis.document = { createElement: () => new FakeAudio(audios), addEventListener() {}, visibilityState: 'visible' };
  Object.defineProperty(globalThis, 'navigator', {
    value: { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/27.2 Mobile/15E148 Safari/604.1', maxTouchPoints: 5, audioSession: session },
    configurable: true, writable: true,
  });
  globalThis.Audio = class extends FakeAudio { constructor() { super(audios); } };
  globalThis.EventSource = FakeEventSource;
  globalThis.BroadcastChannel = FakeChannel;

  // The catalog: two ten-minute songs, the second on air; a song's link is on the bucket, another origin, whose answer
  // to the page's own GET (the mix's probe) carries CORS headers or not.
  const STATION = {
    on: true, version: 'test', anchor: { at: T0 - SONG - 1000, songId: 1 }, carry: null,
    songs: [{ id: 1, title: 'one', durationMs: SONG }, { id: 2, title: 'two', durationMs: SONG }],
  };
  const probes = [];
  globalThis.fetch = async (url, opts = {}) => {
    const u = String(url);
    if (u.startsWith('https://bucket.example/')) {
      probes.push({ url: u, mode: opts.mode });
      if (!cors) throw new TypeError('Load failed'); // what a CORS refusal looks like to the page
      return { ok: true, status: 200, json: async () => ({}) };
    }
    let body = null;
    if (u === '/catalog/api/radio') body = { ...STATION, now: Date.now(), talk: { on: false } };
    else if (u.startsWith('/catalog/api/radio/play/')) body = { url: `https://bucket.example/previews/${u.split('/').pop()}.m4a?sig=x`, expires: new Date(Date.now() + 3600000).toISOString() };
    else if (u.startsWith('/catalog/api/radio/peaks/')) body = { peaks: [] };
    return body ? { ok: true, status: 200, json: async () => body } : { ok: false, status: 404, json: async () => ({}) };
  };

  const engine = await import('./engine.js');

  const flush = () => new Promise((r) => setImmediate(r));
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
  function say(talk) {
    const es = sources.filter((s) => s.readyState !== 2).at(-1);
    assert.ok(es, 'the radio has its events stream open');
    for (const fn of es.on.talk || []) fn({ data: JSON.stringify(talk) });
  }
  function admin(talkId, on) {
    for (const c of channels) if (c.onmessage) c.onmessage({ data: { type: 'talking', id: 'admin', talkId, on, at: Date.now() } });
  }
  const voiceEl = () => audios.find((a) => (a.getAttribute('src') || '').includes('/talk/'));
  const music = () => audios.find((a) => !a.paused && /^https:\/\/bucket\.example\//.test(a.getAttribute('src') || ''));
  function sound(el) { el.sounding = true; el.fire('playing'); }
  function end(el) { el.ended = true; el.paused = true; el.sounding = false; el.fire('ended'); }
  const ctx = () => contexts.at(-1);
  /** Where an element's sound goes through the context: its own gain, then the music's (the dip), then the speakers. */
  function route(el) {
    const c = ctx(), r = c && c.routed.find((x) => x.el === el);
    if (!r) return null;
    const own = r.node.outs[0], dip = own && own.outs[0];
    return { own, dip, out: dip && dip.outs[0], ctx: c };
  }
  let n = 0;
  async function tuneIn() {
    engine.prime(); // the tap: each idle element plays a few silent samples, which end at once
    for (const a of audios) {
      if (!(a.getAttribute('src') || '').startsWith('blob:') || a.paused) continue;
      a.ended = true;
      a.paused = true;
      a.fire('ended');
    }
    engine.powerOn();
    await advance(300);
    assert.equal(engine.getSnapshot().status, 'on');
  }
  async function onAir() {
    const id = `talk-number-${String(++n).padStart(10, '0')}`;
    say({ on: true, id, since: Date.now() });
    await advance(600);
    const el = voiceEl();
    assert.ok(el, 'the talk is asked for');
    return { id, el };
  }
  return { engine, audios, session, probes, advance, say, admin, voiceEl, music, sound, end, ctx, route, tuneIn, onAir, talking: () => engine.getSnapshot().talking };
}
