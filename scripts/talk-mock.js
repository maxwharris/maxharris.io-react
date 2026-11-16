// Dev only: the catalog's talk-over, as the contract between the catalog and this site has it (the catalog's
// docs/app.md, Radio). scripts/radio-mock.js (RADIO_MOCK=1) answers its routes from here, and scripts/radio-admin-mock.js
// (RADIO_ADMIN_MOCK=1) puts the talk field from here into its GET /radio. One talk at a time. The PCM a talk is sent is
// encoded by a real ffmpeg into a live MP3 (mono, 44.1 kHz, 128 kbps CBR), and every listener gets whole frames from about
// half a second back, then the rest as it comes; the events stream says where the talk stands. A talk ends on DELETE, on
// a take-over, after 4 s with no audio, after 30 minutes, or from the switch below; ending closes every stream and says
// so on the events stream. vite.config.js loads the mocks only in the dev server, so none of it reaches a build.
//
//   POST   /catalog/api/radio/talk  {} or {"takeOver": true}     201 {id, startedAt, sampleRate: 24000, chunkMs: 250}; 409
//   POST   /catalog/api/radio/talk/:id/audio?seq=n               raw s16le, mono, 24 kHz: 204; 410 ended; 400 bad seq or body
//   DELETE /catalog/api/radio/talk/:id                           204 (an ended one too)
//   GET    /catalog/api/radio/talk/:id/stream.mp3                the live MP3; 404 unknown, 410 ended
//   GET    /catalog/api/radio/events                             text/event-stream: "event: talk", {on: false} or {on: true, id, since}
// A change needs X-Catalog: 1 and an Origin of this host, as the catalog's (lib/guard.js). There is no session here: with
// RADIO_ADMIN_MOCK=1 too, its signin=0 refuses talk changes as the catalog would.
//
// Switches, through /__radio-mock/state (scripts/radio-mock.js):
//   ?talk=on    a talk from "another device": the mock talks itself (a buzzing test voice), as if Max were live elsewhere,
//               so the admin's go live meets a 409 (take over), and the radios play it
//   ?talk=off   the live talk ends, as the catalog ends one (its sender's next chunk gets 410)
//   ?talk=drop  every listener's stream breaks off while the talk stays live (a dropped connection: radios ask again)

import crypto from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';

const RATE = 24000; // the talk's PCM, as the contract has it
const CHUNK_MS = 250;
const MAX_BODY = 65536;
const QUIET_MS = 4000; // no audio this long: the talk ends
const LONGEST_MS = 30 * 60 * 1000;
const FRAME_MS = (1152 / 44100) * 1000; // an MPEG-1 Layer III frame at 44.1 kHz: 26.1 ms
const BACK_FRAMES = Math.ceil(500 / FRAME_MS); // a new listener starts about half a second back
const BEAT_MS = 20000; // a comment on every events stream this often
const MAX_LISTENERS = 50; // streams of one talk at once
const MAX_WATCHERS = 200; // events streams at once
const ENCODE = ['-hide_banner', '-loglevel', 'error', '-f', 's16le', '-ar', String(RATE), '-ac', '1', '-i', 'pipe:0',
  '-ac', '1', '-ar', '44100', '-c:a', 'libmp3lame', '-b:a', '128k', '-write_xing', '0', '-id3v2_version', '0',
  '-flush_packets', '1', '-f', 'mp3', 'pipe:1'];

let hasFfmpeg = null;
const ffmpegThere = () => (hasFfmpeg ??= spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' }).status === 0);

let live = null; // {id, since, last, ff, frames, carry, clients, next, held, timer}
const ended = new Map(); // id -> when it ended: 410 for those
const watchers = new Set(); // the events streams
let beat = null;
let self = null; // {t, timer}: the mock talking itself (?talk=on)

/** GET /radio's talk field. */
export const talkField = () => (live ? { on: true, id: live.id, since: live.since } : { on: false });

// ---------------------------------------------------------------- http bits
function json(res, code, body) {
  res.statusCode = code;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(body === undefined ? '' : JSON.stringify(body));
}
function sameHost(origin, host) {
  try {
    const o = new URL(origin);
    return o.host === new URL(`${o.protocol}//${host}`).host;
  } catch {
    return false;
  }
}
/** Every change needs X-Catalog: 1 and, when the browser sends one, an Origin of this host. */
function guard(req, res) {
  if (req.headers['x-catalog'] !== '1') {
    json(res, 403, { error: 'A change needs the X-Catalog: 1 header, which the app sends. Reload the app and try again.' });
    return false;
  }
  const origin = req.headers.origin;
  if (origin && !sameHost(origin, req.headers.host)) {
    json(res, 403, { error: 'This change came from another site, so it was refused. Open the catalog at its own address and try again.' });
    return false;
  }
  return true;
}
/** The body as a Buffer, or null past max bytes (or on an error). */
function readRaw(req, max) {
  return new Promise((resolve) => {
    const parts = [];
    let n = 0, over = false;
    req.on('data', (c) => {
      n += c.length;
      if (n > max) over = true;
      else if (!over) parts.push(c);
    });
    req.on('end', () => resolve(over ? null : Buffer.concat(parts)));
    req.on('error', () => resolve(null));
  });
}

// ---------------------------------------------------------------- the events stream
const eventOf = () => `event: talk\ndata: ${JSON.stringify(talkField())}\n\n`;
function tell() {
  const e = eventOf();
  for (const r of watchers) r.write(e);
}
function events(req, res) {
  if (watchers.size >= MAX_WATCHERS) { json(res, 503, { error: 'Too many listeners right now.' }); return; }
  res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no', Connection: 'keep-alive' });
  res.write(`retry: 3000\n\n${eventOf()}`);
  watchers.add(res);
  if (!beat) {
    beat = setInterval(() => { for (const r of watchers) r.write(': still here\n\n'); }, BEAT_MS);
    beat.unref();
  }
  req.on('close', () => watchers.delete(res));
}

// ---------------------------------------------------------------- one talk: ffmpeg in, whole MP3 frames out
const KBPS = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0]; // MPEG-1 Layer III
const HZ = [44100, 48000, 32000, 0];
/** The length of the MPEG-1 Layer III frame whose header is at b[i], or 0 for no header there. */
export function frameLength(b, i = 0) {
  if (b.length - i < 4 || b[i] !== 0xff || (b[i + 1] & 0xe0) !== 0xe0) return 0;
  if (((b[i + 1] >> 3) & 3) !== 3 || ((b[i + 1] >> 1) & 3) !== 1) return 0; // MPEG-1, Layer III: what the encoder makes
  const kbps = KBPS[b[i + 2] >> 4], hz = HZ[(b[i + 2] >> 2) & 3];
  if (!kbps || !hz) return 0;
  return Math.floor((144000 * kbps) / hz) + ((b[i + 2] >> 1) & 1);
}
/** Split what the encoder wrote into whole frames: each kept for listeners joining, and sent to everyone listening. */
function frames(t, data) {
  t.carry = t.carry.length ? Buffer.concat([t.carry, data]) : data;
  let i = 0;
  while (t.carry.length - i >= 4) {
    const n = frameLength(t.carry, i);
    if (!n) { i++; continue; } // not on a frame: look for the next one
    if (t.carry.length - i < n) break;
    const f = Buffer.from(t.carry.subarray(i, i + n));
    i += n;
    t.frames.push(f);
    if (t.frames.length > BACK_FRAMES) t.frames.shift();
    for (const res of t.clients) res.write(f);
  }
  t.carry = t.carry.subarray(i);
}
function closeClients(t) {
  for (const res of t.clients) { try { res.end(); } catch { /* gone */ } }
  t.clients.clear();
}

function begin() {
  const id = crypto.randomBytes(16).toString('base64url'); // 22 url-safe characters
  const ff = spawn('ffmpeg', ENCODE, { stdio: ['pipe', 'pipe', 'ignore'] });
  const t = { id, since: Date.now(), last: Date.now(), ff, frames: [], carry: Buffer.alloc(0), clients: new Set(), next: 0, held: new Map(), timer: 0 };
  ff.stdout.on('data', (d) => frames(t, d));
  ff.stdout.on('end', () => closeClients(t));
  ff.stdin.on('error', () => {}); // a write after it was stopped
  ff.on('error', () => { if (live === t) end(); });
  t.timer = setInterval(() => {
    if (live !== t) return;
    const n = Date.now();
    if (n - t.last > QUIET_MS || n - t.since > LONGEST_MS) end();
  }, 250);
  live = t;
  tell();
  return t;
}
/** The live talk ends: no more audio taken (410), the encoder's last frames out, every stream closed, and the word out. */
function end() {
  const t = live;
  if (!t) return;
  live = null;
  clearInterval(t.timer);
  if (self && self.t === t) { clearInterval(self.timer); self = null; }
  ended.set(t.id, Date.now());
  if (ended.size > 100) ended.delete(ended.keys().next().value);
  try { t.ff.stdin.end(); } catch { /* stopped */ }
  setTimeout(() => {
    closeClients(t);
    try { t.ff.kill('SIGKILL'); } catch { /* gone */ }
  }, 400);
  tell();
}
/** A chunk of PCM as number seq: in order to the encoder; one ahead waits a little for the ones before it. */
function feed(t, seq, pcm) {
  t.last = Date.now();
  if (seq < t.next) return; // sent twice
  t.held.set(seq, pcm);
  if (!t.held.has(t.next) && t.held.size > 4) t.next = Math.min(...t.held.keys()); // a gap that never filled: past it
  while (t.held.has(t.next)) {
    try { t.ff.stdin.write(t.held.get(t.next)); } catch { /* stopped */ }
    t.held.delete(t.next);
    t.next += 1;
  }
}

// ---------------------------------------------------------------- the routes
async function start(req, res) {
  if (!guard(req, res)) return;
  const raw = await readRaw(req, 4096);
  let body = {};
  try { body = raw && raw.length ? JSON.parse(raw.toString('utf8')) : {}; } catch { body = null; }
  if (!body || typeof body !== 'object') { json(res, 400, { error: 'Send JSON: {} or {"takeOver": true}.' }); return; }
  if (!ffmpegThere()) { json(res, 503, { error: 'The dev mock needs ffmpeg to stream a talk. Install it and try again.' }); return; }
  if (live && body.takeOver !== true) {
    json(res, 409, { error: 'You are already on the mic somewhere else. Take over to go live here.', live: { id: live.id, since: live.since } });
    return;
  }
  if (live) end();
  const t = begin();
  json(res, 201, { id: t.id, startedAt: t.since, sampleRate: RATE, chunkMs: CHUNK_MS });
}
async function audio(req, res, id, url) {
  if (!guard(req, res)) return;
  const t = live && live.id === id ? live : null;
  const seqRaw = url.searchParams.get('seq') || '';
  const body = await readRaw(req, MAX_BODY);
  if (!t) { json(res, ended.has(id) ? 410 : 404, { error: ended.has(id) ? 'That talk has ended.' : 'There is no such talk.' }); return; }
  if (!/^\d{1,9}$/.test(seqRaw)) { json(res, 400, { error: 'Send ?seq= with a whole number from 0.' }); return; }
  if (!body || !body.length || body.length % 2) { json(res, 400, { error: `Send raw 16-bit PCM, at most ${MAX_BODY} bytes.` }); return; }
  feed(t, Number(seqRaw), body);
  res.statusCode = 204;
  res.end();
}
function stream(req, res, id) {
  const t = live && live.id === id ? live : null;
  if (!t) { json(res, ended.has(id) ? 410 : 404, { error: ended.has(id) ? 'That talk has ended.' : 'There is no such talk.' }); return; }
  if (t.clients.size >= MAX_LISTENERS) { json(res, 503, { error: 'Too many listeners right now.' }); return; }
  res.writeHead(200, { 'Content-Type': 'audio/mpeg', 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no', Connection: 'keep-alive' });
  if (req.method === 'HEAD') { res.end(); return; }
  for (const f of t.frames) res.write(f);
  t.clients.add(res);
  req.on('close', () => t.clients.delete(res));
}

const ID = '([A-Za-z0-9_-]{1,64})';
const START = /^\/catalog\/api\/radio\/talk\/?$/;
const AUDIO = new RegExp(`^/catalog/api/radio/talk/${ID}/audio$`);
const STREAM = new RegExp(`^/catalog/api/radio/talk/${ID}/stream\\.mp3$`);
const ONE = new RegExp(`^/catalog/api/radio/talk/${ID}$`);

/** Whether a path is the talk-over's. */
export const isTalkPath = (p) => p === '/catalog/api/radio/events' || p === '/catalog/api/radio/talk' || p.startsWith('/catalog/api/radio/talk/');
/** Whether a request changes a talk (and so would need the catalog's session). */
export const changesTalk = (req, p) => isTalkPath(p) && req.method !== 'GET' && req.method !== 'HEAD';

/** Answers a talk-over request (isTalkPath). */
export async function talkRoute(req, res, url) {
  const p = url.pathname, m = req.method;
  const only = (...ok) => {
    if (ok.includes(m)) return true;
    json(res, 405, { error: `${m} is not answered here.` });
    return false;
  };
  let x;
  if (p === '/catalog/api/radio/events') { if (only('GET')) events(req, res); return; }
  if (START.test(p)) { if (only('POST')) await start(req, res); return; }
  if ((x = AUDIO.exec(p))) { if (only('POST')) await audio(req, res, x[1], url); return; }
  if ((x = STREAM.exec(p))) { if (only('GET', 'HEAD')) stream(req, res, x[1]); return; }
  if ((x = ONE.exec(p))) {
    if (!only('DELETE') || !guard(req, res)) return;
    if (live && live.id === x[1]) end();
    res.statusCode = 204;
    res.end();
    return;
  }
  json(res, 404, { error: 'Not found.' });
}

// ---------------------------------------------------------------- the mock talking itself (?talk=on)
let phase = 0;
/** 250 ms of a buzzing test voice: a vowel on a wandering pitch, in syllables. */
function voice(n) {
  const size = (RATE * CHUNK_MS) / 1000, out = Buffer.alloc(size * 2);
  for (let i = 0; i < size; i++) {
    const t = (n * size + i) / RATE;
    const f0 = 118 + 22 * Math.sin(2 * Math.PI * 0.6 * t);
    phase += f0 / RATE;
    const syllable = Math.max(0, Math.sin(2 * Math.PI * 2.4 * t)) ** 0.7 * (0.55 + 0.45 * Math.sin(2 * Math.PI * 0.31 * t));
    let s = 0;
    for (let h = 1; h <= 14; h++) {
      const f = h * f0, w = Math.exp(-(((f - 700) / 260) ** 2)) + 0.6 * Math.exp(-(((f - 1150) / 300) ** 2)) + 0.25 / h;
      s += w * Math.sin(2 * Math.PI * h * phase);
    }
    out.writeInt16LE(Math.round(Math.max(-1, Math.min(1, 0.22 * s * syllable)) * 32767), i * 2);
  }
  return out;
}
/** ?talk=on (the mock live as if from another device), ?talk=off (the live talk ends), ?talk=drop (streams break off). */
export function talkSwitch(v) {
  if (v === 'off') { end(); return; }
  if (v === 'drop') { if (live) closeClients(live); return; }
  if (v !== 'on' || live || !ffmpegThere()) return;
  const t = begin();
  let n = 0;
  const timer = setInterval(() => { if (live === t) feed(t, n, voice(n++)); }, CHUNK_MS);
  self = { t, timer };
}
