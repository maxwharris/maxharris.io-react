// maxradio's engine: the one radio on a page, with no React in it (useRadio.js is the hook over it, Radio.jsx only draws
// what it says). It follows the station clock (schedule.js) on the server's time and the radio's queue as the catalog
// keeps it (GET /catalog/api/radio: the radio crate's songs in Max's order, the anchor the order last took over at, and
// the song carried through that change): there is no broadcast, so every listener's page works out the same song at the
// same offset, and tuning in joins mid-song. The audio is the catalog's own 160 kbps previews, presigned per song (GET
// /catalog/api/radio/play/:id): nothing is copied.
//
// No play, pause, skip or seek, anywhere (Max, 11/13/26): power on is "tune in live", power off is silence.
//
// States: off; tuning (fetching the queue and the song, a burst of static); on; blocked (the browser refused to start
// sound without a tap: the display says PUSH PWR); offair (the queue is empty or off, or the catalog cannot be reached:
// NO SIGNAL, trying again with backoff); released (another tab or window took the radio).
//
// Playback is two <audio> elements: the song on air, and the next one loading about 20 s before its boundary. The queue
// is read again a few seconds before every boundary (and every minute, and when the tab comes back), so the switch uses
// the newest order, and once more as the boundary passes, so an edit made in those last seconds takes over at once
// rather than at the next read, a minute into the song. An edit never cuts the song on air (the catalog carries it to
// its end; Max, 11/15/26: edits take effect when the song on air ends); only taking that song out of the queue retunes
// at once. The music never goes through Web Audio (iOS stops it in the background, and S3 sends no CORS headers, so it
// could not be read anyway); Web Audio only makes the static, and the level meter and the record read the song's
// waveform (GET /catalog/api/radio/peaks/:id) at the live position instead of the sound.
//
// The announcer drops, near the start of every other song, the two recordings taking turns (Max, 11/15/26: "song
// 1-recording 1, song 2- none, song 3-recording 2, song 4- none, repeat"), play on an element of their own, on the
// station clock like the songs (schedule.js dropFor), so a listener tuning in during one joins it partway. Where element
// volume works the music dips under them.
//
// The talk-over: Max goes live in the radio admin (admin/mic.js) and every radio hears him about 5 s later (talk.js,
// TALK_LAG_S: mostly the browser holding back the start of a live MP3), over the music (Max, 11/15/26: "so the user can
// talk over the radio like announcer"; he picked "works everywhere", locked iPhones included). The catalog says when a
// talk is on (GET /radio's talk field, and its events stream, open while the radio is on) and streams it as a live MP3
// (/radio/talk/:id/stream.mp3), which plays on an element of its own, unlocked with the others in the tap that tunes in,
// so it can start later on its own. Once it sounds the music dips to a third (talk.js), or where element volume does not
// work (iPhone, iPad) is muted, playing on in place, until his last word has played; a drop due meanwhile is left out.
// Max's own browser dips but never plays his talk: his radio admin says so on the one-radio channel.

import { onAir, dropFor } from './schedule.js';
import { calibrate, normalizeStation, parseExpires, stationKey, titleLine } from './format.js';
import { stretch, levelAt } from './record/peaks.js';
import { NO_OWN, OWN_MS, heardOwn, musicShare, normalizeTalk, playsOut, sameTalk, takesTalk, talkPlan, voiceRetryMs } from './talk.js';

export const API = '/catalog/api/radio';
export const PAGE_URL = '/radio/';
/** What DISP steps the display through (the station, the song in big dots, the clock in the big digits), and the colours
 * ILLUM steps the display, the knob's ring and the key legends through (vfd.js ILLUM), blue first. */
export const DISPLAY_MODES = ['station', 'text', 'clock'];
export const ILLUMS = ['blue', 'aqua', 'green', 'amber', 'red', 'white'];
export const STATION = 'maxradio'; // Max: "in maxradio, keep all lowercase"
export const FREQ = '999.9';
/** The announcer's two recordings (public/radio/drops), their lengths in ms; schedule.js picks one per song. */
export const DROPS = [{ src: '/radio/drops/1.mp3', durationMs: 4937 }, { src: '/radio/drops/2.mp3', durationMs: 5277 }];

const PRELOAD_MS = 20000; // the next song starts loading this long before its boundary
const READ_AHEAD_MS = 5000; // and the queue is read again this long before it, so the switch follows the newest order
const POLL_MS = 60000; // the queue is read again this often while on (and whenever the tab comes back into view)
const STEP_MS = 1000; // a station song starting this close to the end of this radio's is just the next one (clock error)
const DRIFT_MS = 2000; // further than this from the schedule: jump back to it
const JOIN_MS = 400; // tuning in: once the sound starts, fine-tune once if it is further off than this
const FADE_MS = 200; // the old song fades this long into its boundary, where element volume works
const FADE_IN_MS = 600; // tuning in fades the song up under the static
const START_LEAD = 0.3; // s: a song started partway is started this far ahead, for the moment it takes to sound
const STALL_MS = 8000; // no progress for this long while it should be playing: a fresh link, and rejoin
const LINK_SPARE_MS = 2 * 60 * 1000; // a link with less than this left is renewed before it is used
const HISS_MS = 4000; // the static under a slow tune gives up after this
const TIMEOUT_MS = 12000; // any request, and waiting for a song to start
const RETRY_MS = [0, 1000, 3000]; // a failing song: fetch its link again and rejoin, this long apart, then NO SIGNAL
const BACKOFF_MS = [2000, 4000, 8000, 15000, 30000, 60000]; // NO SIGNAL: try again this long apart
const DUCK_MS = 250; // the dip under a drop or the talk (talk.js, musicShare), ending as the voice starts
const UNDUCK_MS = 450; // and back up once it is over
const DROP_LATE_MS = 300; // a drop with less than this left is not started
const TALK_START_MS = 15000; // the talk's stream not sounding this long after it was asked for: failing
const TALK_STALL_MS = 6000; // sounding, then no progress for this long: failing (the catalog ends a talk after 4 s of silence)
// A failing talk stream is asked for again while the talk is on, further apart each time (talk.js, voiceRetryMs); once it
// has sounded this long after a retry, the next failure starts from the shortest wait again.
const TALK_STEADY_MS = 20000;
// The catalog said the talk is over: its stream plays on to its end, his last words (Chrome holds about 4.5 s of it), and
// then 'ended' lets the music back up. A stream still playing this long after that word is let go anyway.
const TALK_TAIL_MS = 12000;
// A talk that has just come on is asked for this much later: the catalog's word and the radio admin's 'talking' (in Max's
// own browser) arrive at about the same moment, and the admin's must win, so his radio never asks for his voice. The
// stream starts about half a second back, so a listener loses nothing by it.
const TALK_HOLD_MS = 400;
const EVENTS_AGAIN_MS = [5000, 15000, 30000, 60000, 120000]; // the events stream refused (not dropped): open it again
const KEEP = { volume: 'maxradio.volume', disp: 'maxradio.disp', illum: 'maxradio.illum' };

const BROWSER = typeof window !== 'undefined' && typeof document !== 'undefined';
const SELF = Math.random().toString(36).slice(2) + Date.now().toString(36); // this page, to the other radios
let embedded = false; // the embed for Max's stream (embed()): no channel, no lock screen

// ---------------------------------------------------------------- the snapshot the hook reads
// Choices last for the visit, like the desktop's (sessionStorage; private mode just forgets them).
function kept(key) {
  try { return BROWSER ? window.sessionStorage.getItem(key) : null; } catch { return null; }
}
function keep(key, v) {
  try { if (BROWSER) window.sessionStorage.setItem(key, String(v)); } catch { /* private mode */ }
}
const keptVolume = () => {
  const v = Number(kept(KEEP.volume));
  return kept(KEEP.volume) != null && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0.8;
};
const keptChoice = (key, list) => (list.includes(kept(key)) ? kept(key) : list[0]);
// iOS keeps the volume in the listener's hands: an element's volume reads back 1 whatever it is set to.
function elementVolumeWorks() {
  if (!BROWSER) return true;
  try {
    const ua = navigator.userAgent || '';
    if (/iP(hone|ad|od)/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return false;
    const a = document.createElement('audio');
    a.volume = 0.42;
    return Math.abs(a.volume - 0.42) < 0.01;
  } catch { return true; }
}

let snap = {
  status: 'off',
  song: null, // the song on air on this radio: {id, title, credit, durationMs, bpm, key, look}
  next: null, // what plays after it
  startedAt: 0, // station-clock ms
  endsAt: 0,
  volume: keptVolume(), // 0..1, the knob
  volumeWorks: elementVolumeWorks(),
  disp: keptChoice(KEEP.disp, DISPLAY_MODES),
  illum: keptChoice(KEEP.illum, ILLUMS),
  flash: null, // {text, n}: a moment on the display (no station, vol 24)
  popping: false, // REL pressed: playing on until the new tab says it plays
  reason: '', // offair: 'empty' or 'unreachable'
  waves: 0, // counts waveforms as they arrive, so the record redraws
  talking: false, // Max is on the mic: his talk sounds on this radio (in his own browser: he is live), the music dips
};
const listeners = new Set();
function set(patch) {
  snap = { ...snap, ...patch };
  for (const fn of listeners) fn();
}
export const subscribe = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
export const getSnapshot = () => snap;

// ---------------------------------------------------------------- the station clock, and the queue
let cal = null; // {offset, rtt, at}: the server's clock against this device's (format.js, calibrate)
/** The station's time, epoch ms: the server's clock as measured against this device's. */
export const now = () => Date.now() + (cal ? cal.offset : 0);

// The queue as every listener keeps it (format.js, normalizeStation): {songs, version, anchor, carry}, what schedule.js
// walks. stationN counts its changes (stationKey), so the song on air is checked against each new order once.
let station = { songs: [], version: '', anchor: null, carry: null };
let stationN = 0;
let stationAt = '';

async function getJSON(url) {
  const ctl = typeof AbortController === 'function' ? new AbortController() : null;
  const t = setTimeout(() => ctl && ctl.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(url, { cache: 'no-store', headers: { Accept: 'application/json' }, signal: ctl ? ctl.signal : undefined });
    if (!r.ok) { const e = new Error(`HTTP ${r.status}`); e.status = r.status; throw e; }
    return await r.json();
  } finally {
    clearTimeout(t);
  }
}

let reading = null;
/** Read the queue and the server's clock, one request at a time. Resolves false when the catalog could not be reached. */
function refresh() {
  if (!reading) {
    reading = (async () => {
      const t0 = Date.now();
      let data;
      try { data = await getJSON(API); } catch { return false; }
      cal = calibrate(cal, Number(data && data.now), t0, Date.now());
      station = normalizeStation(data);
      setTalk(normalizeTalk(data && data.talk), 'poll'); // heeded while the events stream is not live
      const k = stationKey(station);
      if (k !== stationAt) { stationAt = k; stationN++; }
      return true;
    })().finally(() => { reading = null; });
  }
  return reading;
}

// A song's slot in the schedule: the same song at the same start is the same slot. slot (schedule.js) counts songs from
// the anchor, which the drops' pattern counts; n is the station it was worked out from.
const slotOf = (x) => ({ song: x.song, startedAt: x.startedAt, endsAt: x.endsAt, slot: x.slot, n: stationN });
const sameSlot = (a, b) => !!a && !!b && a.song.id === b.song.id && a.startedAt === b.startedAt;
const liveSlot = () => { const x = onAir(station, now()); return x ? slotOf(x) : null; };
const inQueue = (id) => station.songs.some((s) => s.id === id);
/** What plays after a slot, as the queue stands now (the walk from the anchor; after an edit, the new order's). */
const nextOf = (slot) => { const x = onAir(station, slot.endsAt); return x ? x.song : null; };

// Presigned links to the previews, kept until a couple of minutes before they expire.
const links = new Map(); // song id -> {url, until}
async function linkFor(id, fresh = false) {
  const c = links.get(id);
  if (!fresh && c && c.until - Date.now() > LINK_SPARE_MS) return c.url;
  const r = await getJSON(`${API}/play/${encodeURIComponent(id)}`);
  if (!r || typeof r.url !== 'string' || !r.url) throw new Error('The catalog gave no link for this song.');
  links.set(id, { url: r.url, until: parseExpires(r.expires) });
  return r.url;
}
// Start a link partway: a media fragment, which the browser keeps to itself, so the signature is untouched.
const at = (url, sec) => (sec > 0.1 ? `${url}#t=${sec.toFixed(2)}` : url);

// Whole waveforms, 20 points a second, fetched once per song and kept for the visit (the record and the meter).
const waves = new Map(); // song id -> {s, p}
export function loadPeaks(id) {
  if (id == null) return Promise.resolve(null);
  let w = waves.get(id);
  if (!w) {
    w = { s: null, p: null };
    w.p = getJSON(`${API}/peaks/${encodeURIComponent(id)}`).then((x) => {
      const arr = Array.isArray(x && x.peaks) ? x.peaks : [];
      w.s = arr.length ? stretch(arr) : null;
      set({ waves: snap.waves + 1 });
      return w.s;
    }, () => {
      setTimeout(() => { if (waves.get(id) === w) waves.delete(id); }, 30000); // try again later
      return null;
    });
    waves.set(id, w);
  }
  return w.p;
}
/** A song's loudness from start to end, 0..1 (stretched as the catalog's record reads it), once it has arrived. */
export const peaksOf = (id) => (waves.get(id) || {}).s || null;

// ---------------------------------------------------------------- the elements
let A = null, B = null; // the music: the song on air, and the next one loading
let D = null; // the announcer drops, never the music's
let V = null; // the talk-over: Max on the mic, the catalog's live MP3 of him
let cur = null; // {slot, el}: on air on this radio; el is null while its song loads
let pre = null; // {slot, el}: the next song, loading ahead of its boundary
let leaving = null; // the last song's element: muted at its boundary, stopped once the next one sounds
let loading = null; // an element being started
let gen = 0; // bumps whenever playback is redirected; async steps holding an older number stop
let session = null; // {alive}: from power on to power off; polling and retries belong to one
let claimAt = 0; // when this radio was last switched on (the newest one keeps the station)
let attempts = 0; // failed starts of the song on air since it last sounded
let notFound = 0; // songs the catalog said it did not have, since the last one that played
let offairTries = 0;
let lastProgress = 0;
let pausedAt = -1e9; // when the song on air was last paused from outside (the pause handler decides what that was)
const T = {}; // named timers
const DROP_TIMERS = ['duck', 'drop', 'dropEnd', 'dropStop'];
const PLAYBACK_TIMERS = ['read', 'preload', 'fade', 'switch', 'retry', 'reconnect', 'hiss', 'leave', 'poll', 'tick', 'popping', ...DROP_TIMERS];

function later(name, fn, ms) {
  clearTimeout(T[name]);
  T[name] = setTimeout(() => { T[name] = 0; fn(); }, Math.max(0, ms));
}
function every(name, fn, ms) {
  clearInterval(T[name]);
  T[name] = setInterval(fn, ms);
}
function cancel(...names) {
  for (const n of names) { clearTimeout(T[n]); clearInterval(T[n]); T[n] = 0; }
}

// A silent 8-bit WAV (the catalog's lib/silence.js): played inside the tap that tunes in, it unlocks each element for
// the programmatic play() calls that follow (iOS, and Safari, only let an element start sound inside a tap).
let unlockUrl = '';
function unlockSource() {
  if (!unlockUrl) {
    const n = 480, buf = new Uint8Array(44 + n), dv = new DataView(buf.buffer);
    const str = (o, s) => { for (let i = 0; i < s.length; i++) buf[o + i] = s.charCodeAt(i); };
    str(0, 'RIFF'); dv.setUint32(4, 36 + n, true); str(8, 'WAVE');
    str(12, 'fmt '); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true);
    dv.setUint32(24, 8000, true); dv.setUint32(28, 8000, true); dv.setUint16(32, 1, true); dv.setUint16(34, 8, true);
    str(36, 'data'); dv.setUint32(40, n, true);
    buf.fill(128, 44);
    unlockUrl = URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
  }
  return unlockUrl;
}
const isUnlock = (el) => !!unlockUrl && el.src === unlockUrl;
function unlock(el) {
  try {
    el.muted = false;
    el.src = unlockSource();
    const p = el.play();
    if (p && p.catch) p.catch(() => {});
    return p;
  } catch { return null; } // the real play() reports any problem
}

// The knob is a log-ish taper: half way round is about -12 dB, as a real volume pot. The music's share also carries
// its fades and the dip under a drop or the talk; the drop's and the talk's own elements take the knob as it is.
const taper = (v) => v * v;
const fades = new Map(); // element -> {g, timer}: a fade's share of the volume, 0..1
const duck = { g: 1, timer: 0 }; // the music's share while a drop or the talk plays (talk.js, musicShare)
function applyVolume(el) {
  if (!el || !snap.volumeWorks) return;
  const f = fades.get(el), share = el === D || el === V ? 1 : (f ? f.g : 1) * duck.g;
  try { el.volume = Math.min(1, Math.max(0, taper(snap.volume) * share)); } catch { /* not settable */ }
}
function fadeTo(el, to, ms) {
  if (!el) return;
  const f = fades.get(el) || { g: 1, timer: 0 };
  clearInterval(f.timer);
  fades.set(el, f);
  if (!snap.volumeWorks || ms <= 0) { f.g = to; applyVolume(el); return; }
  const from = f.g, t0 = performance.now();
  f.timer = setInterval(() => {
    const k = Math.min(1, (performance.now() - t0) / ms);
    f.g = from + (to - from) * k;
    applyVolume(el);
    if (k >= 1) clearInterval(f.timer);
  }, 25);
}
const gainOf = (el, g) => { const f = fades.get(el) || { g: 1, timer: 0 }; clearInterval(f.timer); f.g = g; fades.set(el, f); applyVolume(el); };
/**
 * The dip under a drop or the talk, on both music elements (iOS: none; a drop plays over the music, and the talk mutes
 * it instead, musicMuted). `to` is talk.js's musicShare for what is on now.
 */
function duckTo(to, ms) {
  clearInterval(duck.timer);
  duck.timer = 0;
  const apply = () => { applyVolume(A); applyVolume(B); };
  if (!snap.volumeWorks || ms <= 0 || duck.g === to) { duck.g = to; apply(); return; }
  const from = duck.g, t0 = performance.now();
  duck.timer = setInterval(() => {
    const k = Math.min(1, (performance.now() - t0) / ms);
    duck.g = from + (to - from) * k;
    apply();
    if (k >= 1) { clearInterval(duck.timer); duck.timer = 0; }
  }, 25);
}

function els() {
  if (!A && BROWSER && typeof Audio === 'function') {
    A = makeEl();
    B = makeEl();
  }
  return [A, B];
}
function makeEl() {
  const el = new Audio();
  el.preload = 'auto';
  for (const [ev, fn] of Object.entries(ON)) el.addEventListener(ev, () => fn(el));
  return el;
}
/** The element free for a new song: not on air, not leaving, not starting. */
function spare() {
  const busy = new Set([cur && cur.el, leaving, loading]);
  return els().find((e) => e && !busy.has(e)) || null;
}
/** Silence an element and let go of its file. */
function stopEl(el) {
  if (!el || isUnlock(el)) return; // the unlock clip: a few ms of silence, left to finish so the unlock holds
  const f = fades.get(el);
  if (f) clearInterval(f.timer);
  fades.delete(el);
  if (!el.paused) { try { el.pause(); } catch { /* gone */ } }
  el.muted = false;
  if (el.getAttribute('src')) { el.removeAttribute('src'); try { el.load(); } catch { /* nothing to drop */ } }
}
function stopAll() {
  for (const el of [A, B]) stopEl(el);
  cur = null; pre = null; leaving = null; loading = null;
}
function dropLeaving() {
  if (leaving && (!cur || leaving !== cur.el)) stopEl(leaving);
  leaving = null;
}

// What the elements say. Only the element on air matters; the unlock clip says nothing.
const ON = {
  playing(el) {
    if (cur && el === cur.el) { lastProgress = performance.now(); attempts = 0; }
  },
  timeupdate(el) {
    if (!cur || el !== cur.el) return;
    if (el.currentTime !== Number(el.dataset.t)) { el.dataset.t = String(el.currentTime); lastProgress = performance.now(); }
    if (now() >= cur.slot.endsAt + 50) boundary(gen); // a timer that came late
  },
  ended(el) {
    // a preview a little shorter than the schedule's length is quiet until the boundary; one that ends at it switches
    if (cur && el === cur.el && now() >= cur.slot.endsAt - 40) boundary(gen);
  },
  pause(el) {
    if (!cur || el !== cur.el || el.ended || isUnlock(el) || snap.status !== 'on') return;
    // Paused by something other than this radio (the system took the audio, a headset button): the radio goes off.
    // Decided a moment later. The radio's own pauses always move on (another element on air, or a new generation),
    // and a failure (an error, a recovery) is never taken for the listener's pause. (No flag for its own pauses: a
    // load() right after a pause() drops the queued pause event, and a flag left behind would hide the next one.)
    pausedAt = performance.now();
    const g = gen;
    setTimeout(() => {
      if (g === gen && cur && el === cur.el && el.paused && !el.ended && !el.error && snap.status === 'on') powerOff();
    }, 400);
  },
  error(el) {
    if (!el.getAttribute('src') || isUnlock(el)) return;
    if (pre && el === pre.el) { stopEl(el); pre = null; return; } // the boundary loads it afresh
    if (cur && el === cur.el) recover();
  },
};

// ---------------------------------------------------------------- the static
let ctx = null, noise = null, hiss = null;
/** The static's audio context, started (inside a tap, or where the browser plays without one). */
function wakeStatic() {
  try {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) ctx = new AC();
    }
    if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
  } catch { ctx = null; }
}
function hissStart(ms = HISS_MS) {
  if (!ctx || ctx.state === 'closed') return;
  try {
    if (ctx.state !== 'running') ctx.resume().catch(() => {}); // without a tap this may stay silent: then no static
    hissStop(true);
    const t = ctx.currentTime;
    if (!noise) {
      noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const d = noise.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    const src = ctx.createBufferSource();
    src.buffer = noise;
    src.loop = true;
    // the dial sweeping onto the station: the hiss's colour rises, then settles
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 0.8;
    bp.frequency.setValueAtTime(500, t);
    bp.frequency.exponentialRampToValueAtTime(4200, t + 0.45);
    bp.frequency.exponentialRampToValueAtTime(1600, t + 0.9);
    const g = ctx.createGain(), peak = 0.0001 + 0.05 * taper(snap.volume);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 0.06);
    g.gain.setValueAtTime(peak, t + 0.5);
    g.gain.linearRampToValueAtTime(peak * 0.45, t + 1);
    src.connect(bp);
    bp.connect(g);
    g.connect(ctx.destination);
    src.start(t);
    hiss = { src, g };
    later('hiss', () => hissStop(), ms);
  } catch { hiss = null; }
}
function hissStop(quick = false) {
  const h = hiss;
  hiss = null;
  cancel('hiss');
  if (!h || !ctx) return;
  try {
    const t = ctx.currentTime, end = quick ? 0.02 : 0.35;
    h.g.gain.cancelScheduledValues(t);
    h.g.gain.setValueAtTime(h.g.gain.value, t);
    h.g.gain.linearRampToValueAtTime(0, t + end);
    h.src.stop(t + end + 0.02);
    h.src.onended = () => {
      try { h.src.disconnect(); h.g.disconnect(); } catch { /* gone */ }
      // a context left running costs an audio thread: rest it between bursts
      if (!hiss && ctx && ctx.state === 'running') ctx.suspend().catch(() => {});
    };
  } catch { /* the context went away */ }
}

// ---------------------------------------------------------------- the lock screen (Media Session)
// None for the embed: OBS has no lock screen, and a stream's page must not take over the computer's media keys.
let handlersSet = false;
const lockScreen = () => !embedded && BROWSER && 'mediaSession' in navigator;
function mediaHandlers() {
  if (handlersSet || !lockScreen()) return;
  handlersSet = true;
  const ms = navigator.mediaSession;
  const h = (name, fn) => { try { ms.setActionHandler(name, fn); } catch { /* not supported here */ } };
  h('play', () => { prime(); tuneIn(); }); // power on: live, wherever the station is now
  h('pause', () => powerOff()); // power off
  // a radio has no next, previous or seek; and no position state, so nothing offers to scrub
  for (const a of ['stop', 'seekbackward', 'seekforward', 'seekto', 'previoustrack', 'nexttrack', 'skipad']) h(a, null);
}
function mediaShow(song) {
  if (!lockScreen()) return;
  try {
    if (typeof window.MediaMetadata === 'function') {
      navigator.mediaSession.metadata = new window.MediaMetadata({ title: song ? titleLine(song).toLowerCase() : STATION, artist: `${STATION} ${FREQ} fm`, album: 'maxharris.io' });
    }
    navigator.mediaSession.playbackState = song ? 'playing' : 'paused';
  } catch { /* older browsers */ }
}
function mediaClear() {
  if (!lockScreen()) return;
  try { navigator.mediaSession.metadata = null; navigator.mediaSession.playbackState = 'none'; } catch { /* older browsers */ }
}

// ---------------------------------------------------------------- one radio at a time
// Every radio on this site (other tabs; the desktop's window and the pop-out page) shares a channel. Switching one on
// says so ("claim"); once it actually plays it says so again ("playing"), and every other radio that is on lets go
// (released). So REL leaves this radio playing until the new tab sounds, and a tab the browser kept quiet (PUSH PWR)
// takes nothing from the one still playing. The newest switch-on wins. The embed stays out of it: it is never released
// and never releases another radio (Max's stream plays on whatever he listens to meanwhile); it only listens for the
// radio admin's 'talking', as every radio here does (the talk-over, below).
let chan = null;
function listen() {
  if (chan || !BROWSER || typeof BroadcastChannel !== 'function') return;
  try {
    chan = new BroadcastChannel('maxradio');
    chan.onmessage = (e) => heard(e.data);
  } catch { chan = null; }
}
function post(type) {
  if (embedded) return;
  try { if (chan) chan.postMessage({ type, id: SELF, at: claimAt }); } catch { /* the channel closed */ }
}
const newerThanMine = (m) => !claimAt || m.at > claimAt || (m.at === claimAt && m.id > SELF);
function heard(m) {
  if (!m || m.id === SELF || typeof m.at !== 'number') return;
  if (m.type === 'talking') {
    // the radio admin in this browser is live (or stopped): dip, and never play that talk here
    own = heardOwn(own, m.talkId, m.on === true, Date.now());
    talkFollow();
    return;
  }
  if (embedded) return;
  const st = snap.status;
  if (m.type === 'playing') {
    if (st === 'off' || st === 'released') return;
    if (newerThanMine(m)) release();
    else if (st === 'on') post('playing'); // this one was switched on after it: it lets go
  } else if (m.type === 'claim') {
    // one that is not sounding yet and was switched on earlier lets go now; one that is sounding plays on until the
    // new one actually plays
    if ((st === 'tuning' || st === 'blocked' || st === 'offair') && newerThanMine(m)) release();
  } else if (m.type === 'queue') {
    // the radio admin in this browser saved an edit: the queue now, not at the next read
    if (st === 'on') poll();
  }
}

// ---------------------------------------------------------------- the announcer drops
// One over every other song (schedule.js dropFor: recording 1, none, recording 2, none), DROP_AT_MS in. The
// clip plays on its own element in step with the station clock: tuning in during one joins it partway, and after its
// end there is nothing. The music dips under it (talk.js, musicShare) with short ramps where element volume works; on iOS
// (which keeps volume in the listener's hands) it plays over the music. The next drop's clip loads ahead. While Max is on
// the mic there are none: one sounding stops, and one due meanwhile is left out (not started late once he stops).
let drop = null; // {songId, startedAt, clip, atMs, endsAt, on, dipping}: the drop over the song on air (on: sounding)
let skipped = ''; // the drop left out for the talk, as dropKey: never started again
const dropKey = (songId, startedAt) => `${songId}@${startedAt}`;
const dropDips = () => !!drop && (drop.on || drop.dipping);

function dropEl() {
  if (!D && BROWSER && typeof Audio === 'function') {
    D = new Audio();
    D.preload = 'auto';
    // the unlock clip done (prime): the clip the next drop needs, loaded ahead
    D.addEventListener('ended', () => { if (isUnlock(D)) loadDrop(nextDropClip()); });
  }
  return D;
}
/** Load a clip on the drop's element ahead of its moment (never over a drop sounding, nor the unlock clip playing). */
function loadDrop(clip) {
  const el = dropEl();
  if (!el || clip == null || !DROPS[clip] || (drop && drop.on)) return;
  if (isUnlock(el) && !el.paused && !el.ended) return; // it ends in a moment, and 'ended' loads the clip
  if (el.getAttribute('src') !== DROPS[clip].src) { try { el.src = DROPS[clip].src; } catch { /* the drop just will not play */ } }
}
/** The clip of the next drop to come on this radio: the song on air's while it is still ahead, else the next song's. */
function nextDropClip() {
  if (!cur) return null;
  const p = dropFor(cur.slot, DROPS);
  if (p && now() < p.atMs) return p.clip;
  const x = onAir(station, cur.slot.endsAt), q = x && dropFor(x, DROPS);
  return q ? q.clip : null;
}
/**
 * Plan the drop over the song on air: when it sounds on this radio, and again when the queue is read afresh (a drop
 * already sounding plays on as it began).
 */
function planDrop(g) {
  if (g !== gen || !cur) return;
  const { song, startedAt } = cur.slot;
  if (drop && drop.on && drop.songId === song.id && drop.startedAt === startedAt) return;
  cancel(...DROP_TIMERS);
  if (drop && drop.on) stopDrop();
  const p = dropFor(cur.slot, DROPS), t = now();
  if (!p || t >= p.endsAt - DROP_LATE_MS || skipped === dropKey(song.id, startedAt)) {
    drop = null;
    duckTo(musicShare({ talking, drop: false }), UNDUCK_MS); // a dip already on its way down for a drop no longer due
    loadDrop(nextDropClip());
    return;
  }
  drop = { songId: song.id, startedAt, ...p, on: false, dipping: false };
  loadDrop(p.clip);
  if (t < p.atMs - DUCK_MS) {
    later('duck', () => {
      if (g !== gen || !drop || drop.on || talking) return; // Max on the mic: it will be left out at its moment
      drop.dipping = true;
      duckTo(musicShare({ talking, drop: true }), DUCK_MS);
    }, p.atMs - DUCK_MS - t);
  }
  later('drop', () => startDrop(g), p.atMs - t);
}
/** The drop's moment (or a listener tuning in during it): the clip from where the station clock says it is. */
function startDrop(g) {
  const d = drop, el = dropEl();
  if (g !== gen || !d || d.on || !el || !cur || !cur.el || snap.status !== 'on') return;
  if (talking) { skipDrop(); return; } // due while Max is on the mic: left out
  const t = now();
  if (t >= d.endsAt - DROP_LATE_MS) { drop = null; duckTo(musicShare({ talking, drop: false }), UNDUCK_MS); return; }
  const src = DROPS[d.clip].src;
  if (el.getAttribute('src') !== src) el.src = src;
  d.on = true;
  cancel('duck');
  duckTo(musicShare({ talking, drop: true }), DUCK_MS);
  applyVolume(el);
  const place = () => {
    if (drop !== d) return;
    const want = Math.max(0, (now() - d.atMs) / 1000);
    if (Math.abs(el.currentTime - want) > 0.25) { try { el.currentTime = want; } catch { /* not seekable yet */ } }
  };
  if (el.readyState >= 1) place();
  else el.addEventListener('loadedmetadata', place, { once: true });
  let p = null;
  try { p = el.play(); } catch { p = null; }
  if (p && p.then) {
    p.then(place, () => {
      if (drop !== d) return; // stopped meanwhile
      drop = null; // refused, or the clip would not load: no drop this time
      cancel('dropEnd');
      duckTo(musicShare({ talking, drop: false }), UNDUCK_MS);
    });
  }
  later('dropEnd', () => finishDrop(d), d.endsAt - t);
}
/** Its end on the station clock: the music comes back up, and the next drop's clip loads. */
function finishDrop(d) {
  if (drop !== d) return;
  drop = null;
  duckTo(musicShare({ talking, drop: false }), UNDUCK_MS);
  // the clip ends on its own; one still sounding a moment later (it started late) stops there
  later('dropStop', () => {
    if (D && !isUnlock(D) && !D.paused) { try { D.pause(); } catch { /* gone */ } }
    loadDrop(nextDropClip());
  }, 400);
}
/** Playback moved on (a boundary, a retune, power off): no drop, the music at its full share (a third under the talk). */
function stopDrop() {
  cancel(...DROP_TIMERS);
  drop = null;
  if (D && !isUnlock(D) && !D.paused) { try { D.pause(); } catch { /* gone */ } }
  duckTo(musicShare({ talking, drop: false }), 0);
}
/** Max went live over a drop, or its moment came while he talks: it stops, and is not started again for this song. */
function skipDrop() {
  const d = drop;
  if (!d) return;
  skipped = dropKey(d.songId, d.startedAt);
  cancel(...DROP_TIMERS);
  drop = null;
  if (D && !isUnlock(D) && !D.paused) { try { D.pause(); } catch { /* gone */ } }
  loadDrop(nextDropClip());
}

// ---------------------------------------------------------------- the talk-over
// Max on the mic (the radio admin, admin/mic.js). While the radio is on it follows the catalog's word on the talk (the
// events stream, and each read of the queue while that stream is not live) and plays a talk that is on, from its live MP3,
// on V. Once V sounds the music dips to a third, or is muted where element volume does not work (iOS keeps the volume in
// the listener's hands), and comes back after his last word: the catalog says the talk is over as Max stops, seconds
// before a listener hears the end of it, so V plays its stream on to its end first (talk.js, playsOut). A failing stream
// is asked for again for as long as the catalog says the talk is on, 1, 3, 8 and 15 s after failures in a row, then
// every 30 s (talk.js, voiceRetryMs), so a dropped connection gets Max back once the network is. Max's own browser never
// plays his talk: his radio admin says 'talking' on the channel (heard), so the radios here dip without it. The embed
// with ?talk=0 takes no part.
let talk = { on: false }; // the catalog's word (talk.js, normalizeTalk)
let talkOff = false; // the embed with ?talk=0
let own = NO_OWN; // what this browser's radio admin said (talk.js, heardOwn)
let voice = null; // {id, tries, sounding, down, ending, t0, since, progress, pos}: the talk V plays (ending: over, playing out)
let hold = { id: '', at: 0 }; // when this radio first heard that talk was on (TALK_HOLD_MS)
let talking = false; // the snapshot's talking: V sounds, or this browser's admin is live
let es = null; // the events stream
let esLive = false; // it has said where the talk stands since it last (re)connected
let esTries = 0;
const TALK_TIMERS = ['voiceTick', 'voiceRetry', 'voiceTail', 'voiceHold', 'own', 'events'];

/** Where element volume does not work, the music is muted under the talk instead (and plays on, in place). */
const musicMuted = () => talking && !snap.volumeWorks;

function voiceEl() {
  if (!V && BROWSER && typeof Audio === 'function') {
    V = new Audio();
    V.preload = 'auto';
    const on = (ev, fn) => V.addEventListener(ev, () => { if (voice && !voice.down && !isUnlock(V) && V.getAttribute('src')) fn(voice); });
    on('playing', (v) => {
      v.progress = performance.now();
      if (!v.sounding) { v.sounding = true; v.since = v.progress; talkFollow(); }
    });
    on('timeupdate', (v) => { if (V.currentTime !== v.pos) { v.pos = V.currentTime; v.progress = performance.now(); } });
    // the stream ends with the talk (and the catalog's word follows), or it broke off
    on('ended', voiceFailed);
    on('error', voiceFailed);
  }
  return V;
}

/** Ask for the talk's live stream on V and play it (inside or outside a tap: prime() unlocked V). */
function playVoice(v) {
  const el = voiceEl();
  if (!el || voice !== v) return;
  if (isUnlock(el) && !el.paused && !el.ended) { later('voiceRetry', () => playVoice(v), 100); return; } // its few ms of silence first
  v.down = false;
  v.sounding = false;
  v.t0 = performance.now();
  v.progress = v.t0;
  v.pos = -1;
  el.muted = false;
  applyVolume(el);
  el.src = `${API}/talk/${encodeURIComponent(v.id)}/stream.mp3`;
  let p = null;
  try { p = el.play(); } catch { p = null; }
  if (p && p.catch) p.catch((e) => { if (voice === v && !(e && e.name === 'AbortError') && el.getAttribute('src')) voiceFailed(v); });
  every('voiceTick', voiceTick, 1000);
}
function startVoice(id) {
  stopVoice();
  voice = { id, tries: 0, sounding: false, down: false, ending: false, t0: 0, since: 0, progress: 0, pos: -1 };
  playVoice(voice);
}
/** The catalog said V's talk is over: V plays on to the end of its stream ('ended' stops it), TALK_TAIL_MS at most. */
function endVoice(v) {
  if (v.ending) return;
  v.ending = true;
  later('voiceTail', () => { if (voice === v) { stopVoice(); talkFollow(); } }, TALK_TAIL_MS);
}
/** V silent and empty (its request to the catalog closes with it). */
function quietVoice() {
  const el = V;
  if (!el || isUnlock(el)) return;
  if (!el.paused) { try { el.pause(); } catch { /* gone */ } }
  if (el.getAttribute('src')) { el.removeAttribute('src'); try { el.load(); } catch { /* nothing to drop */ } }
}
function stopVoice() {
  cancel('voiceTick', 'voiceRetry', 'voiceTail');
  voice = null;
  quietVoice();
}
/**
 * V failed (an error, the stream's end, a stall): the music comes back, and while the talk is still on V asks for it
 * again, a little later each time it fails in a row (talk.js, voiceRetryMs). A talk that is over just ends.
 */
function voiceFailed(v) {
  if (voice !== v || v.down) return;
  v.down = true;
  const wait = voiceRetryMs({ tries: v.tries, talk, id: v.id });
  quietVoice();
  v.sounding = false;
  if (wait < 0) stopVoice();
  else {
    v.tries += 1;
    later('voiceRetry', () => { if (voice === v) playVoice(v); }, wait);
  }
  talkFollow();
}
/** Once a second while V has a talk: not starting, or stuck, is failing; a retry that has played a while is forgiven. */
function voiceTick() {
  const v = voice;
  if (!v || !V) { cancel('voiceTick'); return; }
  if (v.down) return; // waiting to try again
  const t = performance.now();
  if (V.currentTime !== v.pos) { v.pos = V.currentTime; v.progress = t; }
  if (v.sounding ? t - v.progress > TALK_STALL_MS : t - v.t0 > TALK_START_MS) { voiceFailed(v); return; }
  if (v.tries && v.sounding && t - v.since > TALK_STEADY_MS) v.tries = 0;
}

/** The music under the talk: down to a third (or muted) while it sounds; a drop sounding then stops. */
function setTalking(on) {
  if (on === talking) return;
  talking = on;
  if (on && dropDips()) skipDrop();
  if (!snap.volumeWorks) for (const el of [A, B]) if (el && el !== leaving) el.muted = on;
  duckTo(musicShare({ talking: on, drop: dropDips() }), on ? DUCK_MS : UNDUCK_MS);
  set({ talking: on });
}

/**
 * Everything the talk-over does, from what is known now: which talk V plays (a talk the catalog says is over plays on to
 * the end of its stream, playsOut), and whether the music dips.
 */
function talkFollow() {
  const t = Date.now(), enabled = !!session && !talkOff;
  const plan = talkPlan({ enabled, talk, own, now: t });
  if (plan.play && (!voice || voice.id !== plan.play)) {
    if (hold.id !== plan.play) hold = { id: plan.play, at: t };
    const wait = hold.at + TALK_HOLD_MS - t;
    if (wait > 0) later('voiceHold', talkFollow, wait + 5);
    else startVoice(plan.play);
  } else if (plan.play) {
    if (voice.ending) { voice.ending = false; cancel('voiceTail'); } // its talk is on after all
  } else {
    cancel('voiceHold');
    if (voice && playsOut({ enabled, talk, own, echo: plan.echo, voice })) endVoice(voice);
    else if (voice) stopVoice();
  }
  setTalking(plan.echo || !!(voice && voice.sounding));
  // the radio admin here going quiet (its window closed with no word) ends the dip once its last word runs out
  if (plan.echo) later('own', talkFollow, own.at + OWN_MS - t + 20);
  else cancel('own');
}
/** A word from the catalog about the talk: from the events stream, or a read of the queue (which waits while that is live). */
function setTalk(t, source) {
  if (!takesTalk(source, esLive) || sameTalk(talk, t)) return;
  talk = t;
  talkFollow();
}

/** The catalog's events stream (GET /radio/events): where the talk stands on connecting, and at every change. */
function openEvents() {
  if (es || talkOff || !session || !BROWSER || typeof EventSource !== 'function') return;
  cancel('events');
  let src;
  try { src = new EventSource(`${API}/events`); } catch { return; }
  es = src;
  src.addEventListener('talk', (e) => {
    if (es !== src) return;
    let d = null;
    try { d = JSON.parse(e.data); } catch { d = null; }
    esLive = true;
    esTries = 0;
    setTalk(normalizeTalk(d), 'events');
  });
  src.onerror = () => {
    if (es !== src) return;
    esLive = false; // a dropped stream reconnects by itself (retry: 3000); the queue's reads stand in meanwhile
    if (src.readyState === 2) {
      // closed for good: the answer was not a stream (an error, or a catalog without the route yet). Again later.
      es = null;
      try { src.close(); } catch { /* closed */ }
      later('events', openEvents, EVENTS_AGAIN_MS[Math.min(esTries++, EVENTS_AGAIN_MS.length - 1)]);
    }
  };
}
function closeEvents() {
  cancel('events');
  if (es) { try { es.close(); } catch { /* closed */ } }
  es = null;
  esLive = false;
}

/** Power off, release, push pwr: no talk, no events, the music unmuted; what is known starts afresh next time. */
function stopTalk() {
  closeEvents();
  stopVoice();
  cancel(...TALK_TIMERS);
  talk = { on: false };
  hold = { id: '', at: 0 };
  if (talking) {
    talking = false;
    if (!snap.volumeWorks) for (const el of [A, B]) if (el && el !== leaving) el.muted = false;
    set({ talking: false });
  }
}

// ---------------------------------------------------------------- playing the schedule
/** Playback is redirected: the song on air's timers stop, and its drop with them. */
function halt() {
  cancel('read', 'preload', 'fade', 'switch', 'retry');
  stopDrop();
}

/**
 * Start a slot on a free element, from wherever the schedule is now. how: 'join' (tuning in: faded up under the
 * static, fine-tuned once), 'switch' (a boundary: on time, at full volume), 'retry' (after an error or a stall).
 */
async function begin(g, slot, how) {
  let el;
  const reuse = pre && sameSlot(pre.slot, slot) && pre.el.getAttribute('src') && !pre.el.error;
  if (reuse) { el = pre.el; pre = null; }
  else {
    if (pre) { stopEl(pre.el); pre = null; }
    // Both busy: the last song still leaving, and a start the schedule has since moved on from (it drops itself when it
    // lands). The leaving one is only kept so iOS sees the page playing: it gives way.
    if (!spare()) dropLeaving();
    el = spare();
    if (!el) return;
  }
  loading = el;
  loadPeaks(slot.song.id);
  if (!reuse) {
    let url;
    try { url = await linkFor(slot.song.id, how === 'retry'); }
    catch (e) {
      if (loading === el) loading = null;
      if (g === gen) failed(e);
      return;
    }
    if (g !== gen) { if (loading === el) loading = null; return; }
    el.muted = musicMuted(); // Max on the mic where volume cannot dip: the song starts muted, in place
    el.src = at(url, (now() - slot.startedAt) / 1000 + START_LEAD); // a little ahead: it takes a moment to start
  }
  gainOf(el, how === 'switch' ? 1 : 0);
  // Where the song is now, once the element knows its length (the time it took to load included), aimed a little
  // ahead for the moment it takes to sound; a song switched in at its top from the preloaded element starts at 0, on
  // time. Never quite to the end: an ended element would start again from the top when played.
  const lead = reuse && how === 'switch' ? 0 : START_LEAD;
  const place = () => {
    if (g !== gen || loading !== el) return;
    const want = (now() - slot.startedAt) / 1000 + lead, dur = Number.isFinite(el.duration) ? el.duration : Infinity;
    const to = Math.max(0, Math.min(want, dur - 0.25));
    if (Math.abs(el.currentTime - to) > 0.3) { try { el.currentTime = to; } catch { /* not seekable yet */ } }
  };
  if (el.readyState >= 1) place();
  else el.addEventListener('loadedmetadata', place, { once: true });
  let timer = 0;
  try {
    await Promise.race([el.play(), new Promise((_, no) => { timer = setTimeout(() => no(Object.assign(new Error('The song took too long to start.'), { name: 'TimeoutError' })), TIMEOUT_MS); })]);
  } catch (e) {
    if (loading === el) loading = null;
    if (g !== gen) return; // redirected meanwhile (that is what an AbortError usually is)
    if (e && e.name === 'NotAllowedError') { blocked(); return; }
    stopEl(el); // so a song that starts late cannot sound on its own
    failed(e);
    return;
  } finally {
    clearTimeout(timer);
  }
  if (loading === el) loading = null;
  if (g !== gen) { stopEl(el); return; }
  handOver(g, el, slot, how);
}

/** The slot's element sounds: it is on air. Let go of the last one, and set the boundary's timers and its drop. */
function handOver(g, el, slot, how) {
  cur = { slot, el };
  dropLeaving();
  for (const e of els()) if (e && e !== el && (!pre || e !== pre.el)) stopEl(e);
  lastProgress = performance.now();
  if (how !== 'switch') {
    // tuning in: the time it took to start is now heard; fine-tune once, then fade up as the static fades out
    const want = (now() - slot.startedAt) / 1000, dur = Number.isFinite(el.duration) ? el.duration : Infinity;
    if (want < dur - 0.3 && Math.abs(el.currentTime - want) * 1000 > JOIN_MS) { try { el.currentTime = want; } catch { /* not seekable */ } }
    fadeTo(el, 1, FADE_IN_MS);
  } else gainOf(el, 1);
  hissStop();
  attempts = 0;
  offairTries = 0;
  notFound = 0;
  armBoundary(g);
  planDrop(g);
  const was = snap.status;
  set({ status: 'on', song: shown(slot), next: nextOf(slot), startedAt: slot.startedAt, endsAt: slot.endsAt, reason: '' });
  mediaShow(slot.song);
  if (was !== 'on' || how !== 'switch') post('playing');
  if (slot.n !== stationN) follow(); // the queue changed while it loaded
}
/** The song as the display shows it: the queue's latest words and colours, the slot's own length. */
function shown(slot) {
  const fresh = station.songs.find((s) => s.id === slot.song.id);
  return { ...(fresh || slot.song), durationMs: slot.song.durationMs };
}

function armBoundary(g) {
  const slot = cur.slot, t = now();
  later('read', () => readAhead(g), slot.endsAt - READ_AHEAD_MS - t);
  later('preload', () => preload(g), slot.endsAt - PRELOAD_MS - t);
  if (snap.volumeWorks) later('fade', () => { if (g === gen && cur && cur.el) fadeTo(cur.el, 0, FADE_MS); }, slot.endsAt - FADE_MS - t);
  later('switch', () => boundary(g), slot.endsAt - t);
}

/** About 20 s before the boundary (and again when the queue changes after that): load what will be on air at it. */
async function preload(g) {
  if (g !== gen || !cur) return;
  const x = onAir(station, cur.slot.endsAt);
  if (!x) return;
  const slot = slotOf(x);
  if (pre && sameSlot(pre.slot, slot)) return;
  if (pre) { stopEl(pre.el); pre = null; }
  const el = spare();
  if (!el) return;
  let url;
  try { url = await linkFor(slot.song.id); } catch { return; } // the boundary tries again
  if (g !== gen || !cur || el === cur.el || el === loading || el === leaving) return;
  el.muted = musicMuted();
  gainOf(el, 1);
  el.src = at(url, x.offsetMs / 1000);
  pre = { slot, el };
  loadPeaks(slot.song.id);
}

/**
 * A few seconds before the boundary: the queue as it is now, so the next song is the newest order's. And again as the
 * boundary passes (boundary()), for an edit made in between.
 */
async function readAhead(g) {
  const s = session;
  if (g !== gen || !s || !cur) return;
  const ok = await refresh();
  if (s === session && ok) follow();
}

/**
 * After a fresh read: follow the queue. The song on air plays on to its end (the catalog carries it through an edit),
 * and the new order follows from its boundary; it retunes at once only when that song left the queue, or when this
 * radio is out of step with the station (it went on to a song by an order that has changed since).
 */
function follow() {
  if (!session || snap.status !== 'on') return;
  if (!station.songs.length) { offair('empty'); return; }
  if (!cur) return;
  if (!inQueue(cur.slot.song.id)) { retune(); return; } // the song on air left the queue
  if (cur.slot.n !== stationN) {
    const x = onAir(station, now());
    if (x && sameSlot(x, cur.slot)) {
      // the station's own numbers for it: where it ends, and its place from the new anchor (the drop it takes)
      const moved = x.endsAt !== cur.slot.endsAt;
      cur.slot = slotOf(x);
      if (cur.el) {
        if (moved) armBoundary(gen);
        planDrop(gen);
      }
    } else if (x && x.startedAt < cur.slot.endsAt - STEP_MS) { retune(); return; } // out of step
    else cur.slot = { ...cur.slot, n: stationN };
    // the next song as the new order has it, loaded in time
    if (cur.el && now() >= cur.slot.endsAt - PRELOAD_MS) preload(gen);
  }
  set({ song: shown(cur.slot), next: nextOf(cur.slot) });
}

/** The boundary: cut the last song here, and start whatever the schedule has on air now. */
function boundary(g) {
  if (g !== gen || !session || !cur) return;
  const t = now();
  if (t < cur.slot.endsAt - 20) { later('switch', () => boundary(gen), cur.slot.endsAt - t); return; }
  const x = onAir(station, Math.max(t, cur.slot.endsAt));
  if (!x) { offair('empty'); return; }
  const g2 = ++gen;
  halt();
  if (cur.el) {
    // Muted rather than paused: it plays on silently until the next song sounds, because iOS lets a page that is
    // playing start its next song from the lock screen, and not one that has gone quiet.
    cur.el.muted = true;
    leaving = cur.el;
    later('leave', dropLeaving, 8000);
  }
  cur = { slot: slotOf(x), el: null };
  attempts = 0;
  set({ song: shown(cur.slot), next: nextOf(cur.slot), startedAt: cur.slot.startedAt, endsAt: cur.slot.endsAt });
  // after an edit that took out the song on air the schedule may be partway through a song here: that joins like
  // tuning in, faded up
  begin(g2, cur.slot, x.offsetMs > 500 ? 'join' : 'switch');
  // The queue once more: an edit made since the read before this boundary (play next, or taking out the song that
  // was next) put another song on air here. follow() tunes to it now, before or just as this one sounds, instead of
  // at the next read, which could be a minute into this song.
  readAhead(g2);
}

/** Tune again at once (the song on air left the queue, or this radio fell out of step), joining what is on air now. */
function retune() {
  if (!session) return;
  const x = onAir(station, now());
  if (!x) { offair('empty'); return; }
  const g = ++gen;
  halt();
  if (pre) { stopEl(pre.el); pre = null; }
  if (cur && cur.el) { cur.el.muted = true; leaving = cur.el; later('leave', dropLeaving, 8000); }
  cur = { slot: slotOf(x), el: null };
  attempts = 0;
  set({ status: 'tuning', song: null, next: null });
  hissStart(1500);
  begin(g, cur.slot, 'join');
}

/** The song on air would not load or play: a fresh link and rejoin, a few times, then NO SIGNAL (which keeps trying). */
function recover() {
  if (!session || !cur) return;
  const g = ++gen;
  halt();
  links.delete(cur.slot.song.id);
  if (cur.el) stopEl(cur.el);
  cur.el = null;
  if (attempts >= RETRY_MS.length) { offair('unreachable'); return; }
  const wait = RETRY_MS[attempts++];
  later('retry', () => {
    if (g !== gen || !cur) return;
    // the song may have ended while waiting: then whatever is on air now
    const slot = now() < cur.slot.endsAt ? cur.slot : liveSlot();
    if (!slot) { offair('empty'); return; }
    cur = { slot, el: null };
    begin(g, slot, 'retry');
  }, wait);
}
function failed(e) {
  if (!(e && e.status === 404)) { recover(); return; }
  // The one answer for a song the radio does not have: it left the queue since. Read the queue and tune again; a song
  // the queue still lists is a failing link. Twice at most before NO SIGNAL, so a muddle cannot loop.
  if (++notFound > 2) { offair('unreachable'); return; }
  const g = gen;
  refresh().then((ok) => {
    if (g !== gen || !session) return;
    if (!ok) { offair('unreachable'); return; }
    if (!station.songs.length) { offair('empty'); return; }
    if (cur && inQueue(cur.slot.song.id)) recover(); else retune();
  });
}

/** Once a second while on: catch a late boundary, pull a drifting song back to the schedule, notice a stall. */
function tick() {
  if (!session || !cur || snap.status !== 'on') return;
  const t = now();
  if (t >= cur.slot.endsAt + 250) { boundary(gen); return; }
  const el = cur.el;
  if (!el) return;
  // a drop whose moment came while its timer could not run (the song was loading)
  if (drop && !drop.on && !T.drop && t >= drop.atMs) startDrop(gen);
  const want = (t - cur.slot.startedAt) / 1000, dur = Number.isFinite(el.duration) ? el.duration : Infinity;
  if (el.ended || want >= dur - 0.3) return; // the preview's last moment (or past its end): the boundary takes it from here
  // Stopped (with no pause event: a pause from outside powers off) or stuck while the schedule says it should sound:
  // a fresh link, and rejoin live.
  if (el.paused && performance.now() - pausedAt < 1500) return; // a pause from outside: its handler decides
  if (el.paused || performance.now() - lastProgress > STALL_MS) { recover(); return; }
  if (!el.seeking && el.readyState >= 2 && Math.abs(el.currentTime - want) * 1000 > DRIFT_MS) { try { el.currentTime = want; } catch { /* not seekable */ } }
}

/** Every minute while on, and when the tab comes back: the queue as it is now, and the clock again. */
async function poll() {
  const s = session;
  if (!s || snap.status !== 'on') return;
  const ok = await refresh();
  if (s !== session || !ok) return; // unreachable: keep playing what is known
  follow();
}

function offair(reason) {
  if (!session) return;
  gen++;
  halt();
  cancel('leave');
  stopAll();
  hissStop();
  set({ status: 'offair', reason, song: null, next: null });
  mediaShow(null);
  later('reconnect', reconnect, BACKOFF_MS[Math.min(offairTries++, BACKOFF_MS.length - 1)]);
}
async function reconnect() {
  const s = session;
  if (!s || snap.status !== 'offair') return;
  cancel('reconnect');
  const ok = await refresh();
  if (s !== session || snap.status !== 'offair') return;
  if (!ok || !station.songs.length) { offair(ok ? 'empty' : 'unreachable'); return; }
  set({ status: 'tuning', reason: '' });
  hissStart(1500);
  tune();
}
function tune() {
  const slot = liveSlot();
  if (!slot) { offair('empty'); return; }
  const g = ++gen;
  cur = { slot, el: null };
  attempts = 0;
  begin(g, slot, 'join');
}

function endSession() {
  if (session) session.alive = false;
  session = null;
  gen++;
  cancel(...PLAYBACK_TIMERS);
  stopTalk();
  stopDrop();
  stopAll();
  hissStop();
  attempts = 0;
  notFound = 0;
  offairTries = 0;
}
function blocked() {
  endSession();
  set({ status: 'blocked', song: null, next: null, popping: false });
  mediaShow(null);
}
function release() {
  endSession();
  claimAt = 0;
  set({ status: 'released', song: null, next: null, popping: false, reason: '' });
  mediaClear();
}

function onVisible() {
  if (document.visibilityState !== 'visible' || !session) return;
  if (!es) openEvents(); // waiting to open it again: now
  if (snap.status === 'offair') { reconnect(); return; }
  poll();
  tick();
}
let wired = false;
function wire() {
  if (wired || !BROWSER) return;
  wired = true;
  document.addEventListener('visibilitychange', onVisible);
  window.addEventListener('online', onVisible);
}

// ---------------------------------------------------------------- what the faceplate and the terminal call
/**
 * Call this synchronously inside the tap or keypress that tunes in (the terminal's Enter, the power button, the radio's
 * icon), so the browser lets the page play afterwards: each idle element, the drops' and the talk's included, plays a
 * few silent samples, and the static's audio context starts. It never interrupts the song playing, a drop, or the talk.
 */
export function prime() {
  if (!BROWSER) return;
  const busy = new Set([cur && cur.el, pre && pre.el, leaving, loading]);
  for (const el of els()) if (el && !busy.has(el)) unlock(el);
  const d = dropEl();
  if (d && !(drop && drop.on)) unlock(d);
  const v = voiceEl();
  if (v && !(voice && v.getAttribute('src') && !isUnlock(v))) unlock(v); // so a talk can start later with no tap (iOS)
  wakeStatic();
  mediaHandlers();
}

/** Tune in: fetch the queue, set the clock, and play whatever is on air now, from where it is now. */
export function powerOn() {
  if (!BROWSER) return;
  els();
  mediaHandlers();
  listen();
  wire();
  endSession();
  const s = { alive: true };
  session = s;
  claimAt = Date.now();
  post('claim');
  set({ status: 'tuning', song: null, next: null, reason: '', popping: false });
  hissStart();
  every('poll', poll, POLL_MS);
  every('tick', tick, 1000);
  openEvents(); // where the talk stands, and every change (the first read of the queue says so too)
  talkFollow(); // the radio admin here may be live already: dip from the start
  refresh().then((ok) => {
    if (s !== session) return;
    if (!ok) { offair('unreachable'); return; }
    if (!station.songs.length) { offair('empty'); return; }
    tune();
  });
}

/** Silence: audio (a drop's too), timers and polling stop. */
export function powerOff() {
  endSession();
  claimAt = 0;
  set({ status: 'off', song: null, next: null, popping: false, reason: '' });
  mediaShow(null);
}

/** The power button: on (live) from off, PUSH PWR or released; off from anything else. Call it inside the tap. */
export function power() {
  const s = snap.status;
  if (s === 'off' || s === 'blocked' || s === 'released') { prime(); powerOn(); } else powerOff();
}

/** The radio opened, or someone typed radio: on unless it already is (NO SIGNAL tries again now). */
export function tuneIn() {
  const s = snap.status;
  if (s === 'off' || s === 'blocked' || s === 'released') powerOn();
  else if (s === 'offair') reconnect();
}

/**
 * The embed for Max's stream (radio/embed/, an OBS browser source): call once, before it powers on. It takes no part
 * in the one-radio channel and sets no Media Session; volume (0..1) and illum (one of ILLUMS) come from its address and
 * outrank what the visit kept, and talk: false (?talk=0) leaves the talk-over out (his stream mic already carries his
 * voice). Anything else is left as it is.
 */
export function embed({ volume = null, illum = null, talk: withTalk = true } = {}) {
  embedded = true;
  talkOff = withTalk === false;
  const patch = {};
  if (Number.isFinite(volume)) patch.volume = Math.round(Math.min(1, Math.max(0, volume)) * 100) / 100;
  if (ILLUMS.includes(illum)) patch.illum = illum;
  if (Object.keys(patch).length) set(patch);
}

/**
 * Switch on with no tap (the embed: OBS plays without one). The silent clip goes first; if the browser lets it play, the
 * static's audio context starts as well. Either way it then tunes in, and a browser that refuses ends at PUSH PWR.
 */
export function autoStart() {
  if (!BROWSER) return;
  const [el] = els();
  const p = el ? unlock(el) : null;
  Promise.resolve(p).then(() => { if (p) wakeStatic(); }, () => {}).then(() => tuneIn());
}

function flash(text, ms = 1600) {
  set({ flash: { text, n: (snap.flash ? snap.flash.n : 0) + 1 } });
  clearTimeout(T.flash);
  T.flash = setTimeout(() => set({ flash: null }), ms);
}

/** The knob: 0..1, kept for the visit; the drops follow it. On iOS the element ignores it (snapshot volumeWorks: false). */
export function setVolume(v) {
  const volume = Math.round(Math.min(1, Math.max(0, Number(v) || 0)) * 100) / 100;
  if (volume !== snap.volume) {
    set({ volume });
    keep(KEEP.volume, volume);
    for (const el of [...els(), D, V]) applyVolume(el);
    if (hiss && ctx) { try { hiss.g.gain.setTargetAtTime(0.0001 + 0.05 * taper(volume), ctx.currentTime, 0.05); } catch { /* ended */ } }
  }
  flash(snap.volumeWorks ? `vol ${Math.round(volume * 30)}` : 'device vol', 1100);
}

export function cycleDisplay() {
  const disp = DISPLAY_MODES[(DISPLAY_MODES.indexOf(snap.disp) + 1) % DISPLAY_MODES.length];
  set({ disp });
  keep(KEEP.disp, disp);
}
export function cycleIllum() {
  const illum = ILLUMS[(ILLUMS.indexOf(snap.illum) + 1) % ILLUMS.length];
  set({ illum });
  keep(KEEP.illum, illum);
}

/** Presets 1 to 6: 1 is maxradio, the only station (it switches the radio on); the rest have nothing stored. */
export function preset(n) {
  if (n === 1) {
    const s = snap.status;
    if (s === 'off' || s === 'blocked' || s === 'released') power();
    else flash(`p1 ${STATION}`);
    return;
  }
  flash('no station');
}

/**
 * REL: the radio in a tab of its own (PAGE_URL). Call it inside the click, so the browser opens the tab. This radio
 * plays on until the new tab actually plays (the channel says so); then it shows released.
 */
export function popOut() {
  if (!BROWSER) return false;
  let w = null;
  try { w = window.open(PAGE_URL, '_blank'); } catch { w = null; }
  if (!w) { flash('tab blocked'); return false; }
  try { w.opener = null; } catch { /* nothing to cut */ }
  if (snap.status === 'on' || snap.status === 'tuning') {
    set({ popping: true });
    later('popping', () => set({ popping: false }), 20000); // the new tab never played (PUSH PWR there): carry on
  }
  return true;
}

/** Where the song on air is now, from the element when it is in step with the schedule, else the schedule. */
export function position() {
  if (!cur || snap.status !== 'on') return null;
  const d = cur.slot.song.durationMs;
  let ms = now() - cur.slot.startedAt;
  const el = cur.el;
  if (el && !el.paused && !el.seeking && el.readyState >= 2 && Math.abs(el.currentTime * 1000 - ms) < DRIFT_MS) ms = el.currentTime * 1000;
  ms = Math.min(d, Math.max(0, ms));
  return { id: cur.slot.song.id, ms, durationMs: d, frac: ms / d };
}
/** How loud the song on air is right now, 0..1, read from its waveform (the meter; the record smooths its own). */
export function level() {
  const p = position();
  if (!p) return 0;
  const s = peaksOf(p.id);
  return s ? levelAt(s, p.frac) : 0;
}
