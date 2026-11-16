// Dev only. `RADIO_MOCK=1 npm run dev` answers the radio's three catalog routes (GET /catalog/api/radio, /play/:id,
// /peaks/:id) with five short test songs, so the radio can be tried before the catalog serves them and a boundary comes
// round in seconds. It also answers the talk-over's routes (Max live on the mic: scripts/talk-mock.js, a real ffmpeg
// encode of the PCM it is sent), and plays a long test tone for any other song id, so `RADIO_MOCK=1 RADIO_ADMIN_MOCK=1
// npm run dev` works as one: the radio plays the radio admin mock's queue, and the admin's mic goes out to the radios.
// Two of the five do what real previews may: 'night drive' runs longer than the schedule says (cut at the boundary) and
// 'low tide' ends early (quiet until it). Only 'sign on' (16 s) and 'long play' (20 s) are long enough for an announcer
// drop (8 s in, on every other song: schedule.js dropFor), and they play one after the other, so one of them carries it
// each time round. The tones are made once into .radio-mock/ (gitignored): AAC in MP4 like the catalog's previews when
// ffmpeg is installed, else WAV. vite.config.js loads this file only in the dev server with RADIO_MOCK=1, so nothing of
// it reaches a build.
//
// The queue works as the catalog's does (Max, 11/15/26): the songs in the crate's order, looping, from a stored anchor,
// with the song on air at an edit carried to its end. Every change below re-anchors at once, at that moment, as an edit
// in the catalog does (reanchor, the catalog's rule; scripts/radio-mock.test.js).
//
// Change the station while it runs (each answers the mock's state as JSON):
//   /__radio-mock/state?talk=on           Max live from "another device": the mock talks itself (talk-mock.js); talk=off
//                                         ends whatever talk is live, as the catalog ends one; talk=drop breaks off every
//                                         listener's stream while the talk goes on
//   /__radio-mock/state?songs=9001,9003   which songs are in the crate, in order (any of 9001 to 9005): an edit; leave out
//                                         the song on air to take it off (the radio retunes)
//   /__radio-mock/state?next=9004         move a song to just after the one on air (the admin's play next)
//   /__radio-mock/state?on=0              no radio crate (NO SIGNAL); on=1 brings it back
//   /__radio-mock/state?fail=2            the next 2 audio requests answer 403, like an expired link
//   /__radio-mock/state?drop=1            the next audio response breaks off a third of the way in (a dropped connection)
//   /__radio-mock/state?skew=5000         the server's clock 5 s ahead of this computer's
//   /__radio-mock/state?ttl=30            links good for 30 s instead of an hour
//   /__radio-mock/state?retitle=9001:a much longer title   a new title, as when Max renames a song (no new version)
//   /__radio-mock/state?reset=1           all of that back to the start, the queue anchored afresh

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { onAir } from '../src/radio/schedule.js';
import { isTalkPath, talkField, talkRoute, talkSwitch } from './talk-mock.js';

const DIR = path.resolve(process.cwd(), '.radio-mock');
const RATE = 44100;
const SONGS = [
  { id: 9001, title: 'test pattern', credit: null, seconds: 13.5, audio: 13.5, bpm: 120, key: 'A minor', notes: [57, 60, 64, 67, 72, 67, 64, 60], look: { bg: '#5a33dd', fg: '#ffffff', card: '#4826ba' } },
  { id: 9002, title: 'night drive', credit: 'the static', seconds: 9, audio: 9.8, bpm: 96, key: 'C minor', notes: [48, 55, 51, 58, 60, 58, 55, 51], look: { bg: '#f7d75c', fg: '#15130f', card: '#fae38a' } },
  { id: 9003, title: 'sign on', credit: null, seconds: 16, audio: 16, bpm: null, key: null, notes: [62, 66, 69, 74, 69, 66], look: { bg: '#06110a', fg: '#4aee7f', card: '#0b1c11' } },
  { id: 9004, title: 'low tide', credit: 'a friend', seconds: 11.2, audio: 10.6, bpm: 140, key: 'F major', notes: [53, 57, 60, 65, 64, 60, 57, 55], look: { bg: '#1430c4', fg: '#ffffff', card: '#0c2194' } },
  { id: 9005, title: 'long play', credit: null, seconds: 20, audio: 20, bpm: 100, key: 'D minor', notes: [50, 53, 57, 62, 60, 57, 53, 52], look: { bg: '#d9472b', fg: '#fff4e8', card: '#b83a22' } },
];
const OWN_IDS = new Set(SONGS.map((s) => s.id));
// Any other song id (the radio admin mock's, with both mocks on) plays one of these, looped to ANY_SECONDS: longer than
// any of its songs, so the radio is never quiet before a boundary. Made only with ffmpeg (a WAV that long is 30 MB).
const ANY_SECONDS = 360;
const ANY = [
  { notes: [57, 64, 69, 72, 76, 72, 69, 64], bpm: 104 },
  { notes: [50, 57, 62, 65, 69, 65, 62, 57], bpm: 92 },
  { notes: [55, 62, 67, 71, 74, 71, 67, 62], bpm: 118 },
  { notes: [52, 59, 64, 67, 71, 67, 64, 59], bpm: 98 },
].map((v) => ({ ...v, loop: true, audio: (60 / v.bpm) * 16 })); // 4 bars, looped
let anyReady = false;
const START = { ids: [9001, 9002, 9003, 9005, 9004], on: true, fail: 0, drop: 0, skew: 0, ttl: 3600, titles: {} };
let state = { ...START };

// ---------------------------------------------------------------- the tones
const hz = (midi) => 440 * 2 ** ((midi - 69) / 12);
function synth(song) {
  const n = Math.round(song.audio * RATE), out = new Float32Array(n);
  const beat = song.bpm ? 60 / song.bpm : 0.75;
  for (let i = 0; i < n; i++) {
    const t = i / RATE, b = Math.floor(t / beat), tb = t - b * beat;
    // a soft kick on every beat (none for the song without a tempo), louder on the downbeat
    const kick = song.bpm ? (b % 4 === 0 ? 0.62 : 0.4) * Math.exp(-tb / 0.11) * Math.sin(2 * Math.PI * (48 + 90 * Math.exp(-tb / 0.03)) * tb) : 0;
    // an arpeggio, one note a beat, and a quiet pad under it that swells over each bar
    const f = hz(song.notes[b % song.notes.length]);
    const note = 0.22 * Math.exp(-tb / 0.32) * (Math.sin(2 * Math.PI * f * t) + 0.3 * Math.sin(4 * Math.PI * f * t));
    const root = hz(song.notes[0] - 12), bar = (t % (beat * 4)) / (beat * 4);
    const pad = 0.07 * (0.6 + 0.4 * Math.sin(Math.PI * bar)) * (Math.sin(2 * Math.PI * root * t) + 0.5 * Math.sin(2 * Math.PI * root * 1.5 * t));
    const env = song.loop ? 1 : Math.min(1, t / 0.25, (song.audio - t) / 0.5); // a loop runs on with no fades
    out[i] = Math.max(-1, Math.min(1, (kick + note + pad) * env));
  }
  return out;
}
function wav(samples) {
  const buf = Buffer.alloc(44 + samples.length * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + samples.length * 2, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(RATE, 24); buf.writeUInt32LE(RATE * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(samples.length * 2, 40);
  for (let i = 0; i < samples.length; i++) buf.writeInt16LE(Math.round(samples[i] * 32767), 44 + i * 2);
  return buf;
}
// the catalog's waveform: the loudest sample in each 50 ms, 20 points a second, over the length the schedule uses (the
// catalog's comes from the original file, whose length that is; a preview may run a little longer or shorter)
function peaks(samples, duration) {
  const step = RATE / 20, out = [];
  for (let k = 0; k < Math.round(duration * 20); k++) {
    let m = 0;
    for (let j = k * step; j < Math.min(samples.length, (k + 1) * step); j++) m = Math.max(m, Math.abs(samples[j]));
    out.push(Math.round(m * 1000) / 1000);
  }
  return { v: 1, pps: 20, duration, peaks: out };
}
/** The same for a loop played over and over for `duration` seconds. */
function loopPeaks(samples, duration) {
  const step = RATE / 20, out = [];
  for (let k = 0; k < Math.round(duration * 20); k++) {
    let m = 0;
    for (let j = 0; j < step; j++) m = Math.max(m, Math.abs(samples[(k * step + j) % samples.length]));
    out.push(Math.round(m * 1000) / 1000);
  }
  return { v: 1, pps: 20, duration, peaks: out };
}

let ext = 'wav';
function make(log) {
  fs.mkdirSync(DIR, { recursive: true });
  const ffmpeg = spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' }).status === 0;
  ext = ffmpeg ? 'm4a' : 'wav';
  const stamp = crypto.createHash('sha1').update(JSON.stringify([SONGS, ANY, ANY_SECONDS, ext, synth.toString(), loopPeaks.toString()])).digest('hex');
  const stampFile = path.join(DIR, 'stamp');
  anyReady = ffmpeg;
  if (!ffmpeg) log('radio mock: without ffmpeg only its own five songs play (no tones for other ids, no talk-over)');
  if (fs.existsSync(stampFile) && fs.readFileSync(stampFile, 'utf8') === stamp) return;
  for (const s of SONGS) {
    const samples = synth(s);
    const w = path.join(DIR, `${s.id}.wav`);
    fs.writeFileSync(w, wav(samples));
    fs.writeFileSync(path.join(DIR, `${s.id}.json`), JSON.stringify(peaks(samples, s.seconds)));
    if (ffmpeg) {
      const r = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', w, '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', path.join(DIR, `${s.id}.m4a`)]);
      if (r.status !== 0) throw new Error(`ffmpeg failed for ${s.id}: ${r.stderr}`);
    }
  }
  if (ffmpeg) {
    ANY.forEach((v, k) => {
      const samples = synth(v), w = path.join(DIR, `any-${k}.wav`);
      fs.writeFileSync(w, wav(samples));
      fs.writeFileSync(path.join(DIR, `any-${k}.json`), JSON.stringify(loopPeaks(samples, ANY_SECONDS)));
      const r = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-stream_loop', '-1', '-i', w, '-t', String(ANY_SECONDS), '-c:a', 'aac', '-b:a', '96k', '-movflags', '+faststart', path.join(DIR, `any-${k}.m4a`)]);
      fs.rmSync(w, { force: true });
      if (r.status !== 0) throw new Error(`ffmpeg failed for the tone any-${k}: ${r.stderr}`);
    });
  }
  fs.writeFileSync(stampFile, stamp);
  log(`radio mock: made ${SONGS.length} test songs${ffmpeg ? ` and ${ANY.length} long tones for any other id` : ''} in ${path.relative(process.cwd(), DIR)}/ (${ext})`);
}

// ---------------------------------------------------------------- the queue
/**
 * The catalog's re-anchor (its backend/lib/radio.js), run when the playable list changes, at that moment te (station
 * clock ms). old: what was stored, {songs: [[id, durationMs], ...], anchor, carry}; list: the playable songs now, in
 * order, [{id, durationMs}]. Returns what to store. The song on air at te (the old order's walk, schedule.js onAir) plays
 * on to its end when it is still in the list, and the new order takes over with the song after it; a song on air that
 * left the list stops at te, and the next of the old order still in the list takes over at once.
 */
export function reanchor(old, list, version, te) {
  if (!list.length) return { version, songs: [], anchor: null, carry: null };
  const was = { songs: (old && old.songs ? old.songs : []).map(([id, durationMs]) => ({ id, durationMs })), anchor: old ? old.anchor : null, carry: old ? old.carry : null };
  const ids = list.map((s) => s.id), S = onAir(was, te);
  let anchor, carry = null;
  if (!S) anchor = { at: te, songId: ids[0] };
  else if (ids.includes(S.song.id)) {
    carry = { songId: S.song.id, startedAt: S.startedAt, endsAt: S.endsAt };
    anchor = { at: S.endsAt, songId: ids[(ids.indexOf(S.song.id) + 1) % ids.length] };
  } else {
    const order = was.songs.map((s) => s.id), i = order.indexOf(S.song.id);
    let songId = ids[0];
    for (let j = 1; j < order.length; j++) {
      const id = order[(i + j) % order.length];
      if (ids.includes(id)) { songId = id; break; }
    }
    anchor = { at: te, songId };
  }
  return { version, songs: list.map((s) => [s.id, s.durationMs]), anchor, carry };
}
/** The list's version, as the catalog writes it: 12 hex of a sha1 of id:durationMs in order ('' when empty). */
export const versionOf = (list) => (list.length ? crypto.createHash('sha1').update(list.map((s) => `${s.id}:${s.durationMs}`).join(',')).digest('hex').slice(0, 12) : '');

let station = { version: '', songs: [], anchor: null, carry: null }; // the catalog's one row
const serverNow = () => Date.now() + state.skew;
const crate = () => (state.on ? state.ids.map((id) => SONGS.find((s) => s.id === id)).filter(Boolean) : []);
/** Re-anchor when the playable list is not the stored one (lazily on GET, and at once after every change). */
function sync() {
  const list = crate().map((s) => ({ id: s.id, durationMs: Math.round(s.seconds * 1000) }));
  const version = versionOf(list);
  if (version !== station.version) station = reanchor(station, list, version, serverNow());
}
const walkable = () => ({ songs: station.songs.map(([id, durationMs]) => ({ id, durationMs })), anchor: station.anchor, carry: station.carry });

// ---------------------------------------------------------------- the routes
const inCrate = (raw) => (/^[1-9]\d{0,9}$/.test(raw) ? crate().find((s) => s.id === Number(raw)) : null);
/**
 * The files for a song id: its own while one of the five test songs is in the crate (one taken out answers 404, as the
 * catalog does for a song that left the radio), and for any other id one of the long tones. null: nothing to play.
 */
function filesOf(raw) {
  if (!/^[1-9]\d{0,9}$/.test(raw)) return null;
  const id = Number(raw);
  if (OWN_IDS.has(id)) {
    const s = inCrate(raw);
    return s ? { name: String(s.id), ext } : null;
  }
  return anyReady ? { name: `any-${id % ANY.length}`, ext: 'm4a' } : null;
}
function radioList() {
  sync();
  const songs = crate().map((s) => ({ id: s.id, title: state.titles[s.id] || s.title, credit: s.credit, durationMs: Math.round(s.seconds * 1000), bpm: s.bpm, key: s.key, look: s.look }));
  return { on: songs.length > 0, now: serverNow(), version: station.version, songs, anchor: station.anchor, carry: station.carry, talk: talkField() };
}
function json(res, code, body) {
  res.statusCode = code;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  res.end(JSON.stringify(body));
}
// the audio with byte ranges, as S3 serves it (an element seeks with a Range request)
function sendFile(req, res, file, type) {
  const size = fs.statSync(file).size;
  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Content-Type', type);
  res.setHeader('Cache-Control', 'no-store');
  const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
  let start = 0, end = size - 1;
  if (m && (m[1] || m[2])) {
    if (m[1]) { start = Number(m[1]); end = m[2] ? Math.min(Number(m[2]), size - 1) : size - 1; }
    else { start = Math.max(0, size - Number(m[2])); }
    if (start >= size || start > end) { res.statusCode = 416; res.setHeader('Content-Range', `bytes */${size}`); res.end(); return; }
    res.statusCode = 206;
    res.setHeader('Content-Range', `bytes ${start}-${end}/${size}`);
  }
  res.setHeader('Content-Length', end - start + 1);
  if (req.method === 'HEAD') { res.end(); return; }
  if (state.drop > 0 && end - start > 4096) {
    // a dropped connection: a third of what was promised, then the socket closes
    state.drop--;
    const cut = start + Math.floor((end - start) / 3);
    const rs = fs.createReadStream(file, { start, end: cut });
    rs.on('data', (b) => res.write(b));
    rs.on('end', () => setTimeout(() => res.destroy(), 50));
    return;
  }
  fs.createReadStream(file, { start, end }).pipe(res);
}

function handle(req, res, next) {
  const url = new URL(req.url, 'http://localhost');
  const p = url.pathname;
  if (isTalkPath(p)) { talkRoute(req, res, url); return; } // the talk-over: its own routes and checks (talk-mock.js)
  if (req.method !== 'GET' && req.method !== 'HEAD' && (p.startsWith('/catalog/api/radio') || p.startsWith('/__radio-mock'))) { json(res, 405, { error: 'GET only.' }); return; }
  if (p === '/catalog/api/radio') { json(res, 200, radioList()); return; }
  let m = /^\/catalog\/api\/radio\/play\/([^/]*)$/.exec(p);
  if (m) {
    const f = filesOf(m[1]);
    if (!f) { json(res, 404, { error: 'Not found.' }); return; }
    const exp = Date.now() + state.ttl * 1000;
    json(res, 200, { url: `/__radio-mock/media/${f.name}.${f.ext}?sig=${crypto.randomBytes(6).toString('hex')}&exp=${exp}`, expires: new Date(exp).toISOString() });
    return;
  }
  m = /^\/catalog\/api\/radio\/peaks\/([^/]*)$/.exec(p);
  if (m) {
    const f = filesOf(m[1]);
    if (!f) { json(res, 404, { error: 'Not found.' }); return; }
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.end(fs.readFileSync(path.join(DIR, `${f.name}.json`)));
    return;
  }
  if (p.startsWith('/catalog/api/radio')) { json(res, 404, { error: 'Not found.' }); return; }
  m = /^\/__radio-mock\/media\/(\d+|any-\d)\.(m4a|wav)$/.exec(p);
  if (m) {
    const exp = Number(url.searchParams.get('exp'));
    // a drop comes first, so drop=1&fail=3 is a stream that breaks off and is then refused (it dies mid-song)
    if (!(state.drop > 0) && (state.fail > 0 || (exp && Date.now() > exp))) {
      if (state.fail > 0) state.fail--;
      res.statusCode = 403;
      res.setHeader('Content-Type', 'application/xml');
      res.end('<Error><Code>AccessDenied</Code><Message>Request has expired</Message></Error>');
      return;
    }
    const file = path.join(DIR, `${m[1]}.${m[2]}`);
    if (!fs.existsSync(file)) { res.statusCode = 404; res.end(); return; }
    sendFile(req, res, file, m[2] === 'm4a' ? 'audio/mp4' : 'audio/wav');
    return;
  }
  if (p === '/__radio-mock/state') {
    const q = url.searchParams;
    sync(); // the queue as it stood, so an edit here re-anchors from it at this moment
    if (q.has('reset')) { state = { ...START, titles: {} }; station = { version: '', songs: [], anchor: null, carry: null }; }
    if (q.has('retitle')) { const [id, ...t] = q.get('retitle').split(':'); state.titles = { ...state.titles, [Number(id)]: t.join(':') }; }
    if (q.has('songs')) state.ids = [...new Set(q.get('songs').split(',').map(Number).filter((id) => SONGS.some((s) => s.id === id)))];
    if (q.has('next')) {
      const id = Number(q.get('next')), x = onAir(walkable(), serverNow());
      if (x && x.song.id !== id && state.ids.includes(id) && state.ids.includes(x.song.id)) {
        const ids = state.ids.filter((i) => i !== id);
        ids.splice(ids.indexOf(x.song.id) + 1, 0, id);
        state.ids = ids;
      }
    }
    if (q.has('on')) state.on = q.get('on') !== '0';
    for (const k of ['fail', 'drop', 'skew', 'ttl']) if (q.has(k)) state[k] = Number(q.get(k)) || 0;
    if (!state.ttl) state.ttl = START.ttl;
    if (q.has('talk')) talkSwitch(q.get('talk'));
    json(res, 200, { ...state, radio: radioList() });
    return;
  }
  next();
}

export function radioMock() {
  return {
    name: 'radio-mock',
    apply: 'serve',
    configureServer(server) {
      make((msg) => server.config.logger.info(msg));
      server.middlewares.use(handle);
      server.config.logger.info('radio mock: answering /catalog/api/radio (see scripts/radio-mock.js for /__radio-mock/state)');
    },
  };
}
