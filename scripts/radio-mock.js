// Dev only. `RADIO_MOCK=1 npm run dev` answers the radio's three catalog routes (GET /catalog/api/radio, /play/:id,
// /peaks/:id) with four short test songs, so the radio can be tried before the catalog serves them and a boundary comes
// round in seconds. Two of them do what real previews may: 'night drive' runs longer than the schedule says (cut at the
// boundary) and 'low tide' ends early (quiet until it). The tones are made once into .radio-mock/ (gitignored): AAC in
// MP4 like the catalog's previews when ffmpeg is installed, else WAV. vite.config.js loads this file only in the dev
// server with RADIO_MOCK=1, so nothing of it reaches a build.
//
// Change the station while it runs (each answers the mock's state as JSON):
//   /__radio-mock/state?songs=9001,9003   which songs are in the crate, in order (any of 9001 to 9004)
//   /__radio-mock/state?on=0              no radio crate (NO SIGNAL); on=1 brings it back
//   /__radio-mock/state?fail=2            the next 2 audio requests answer 403, like an expired link
//   /__radio-mock/state?drop=1            the next audio response breaks off a third of the way in (a dropped connection)
//   /__radio-mock/state?skew=5000         the server's clock 5 s ahead of this computer's
//   /__radio-mock/state?ttl=30            links good for 30 s instead of an hour
//   /__radio-mock/state?retitle=9001:a much longer title   a new title, as when Max renames a song (no new version)
//   /__radio-mock/state?reset=1           all of that back to the start

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';

const DIR = path.resolve(process.cwd(), '.radio-mock');
const RATE = 44100;
const SONGS = [
  { id: 9001, title: 'test pattern', credit: null, seconds: 13.5, audio: 13.5, bpm: 120, key: 'A minor', notes: [57, 60, 64, 67, 72, 67, 64, 60], look: { bg: '#5a33dd', fg: '#ffffff', card: '#4826ba' } },
  { id: 9002, title: 'night drive', credit: 'the static', seconds: 9, audio: 9.8, bpm: 96, key: 'C minor', notes: [48, 55, 51, 58, 60, 58, 55, 51], look: { bg: '#f7d75c', fg: '#15130f', card: '#fae38a' } },
  { id: 9003, title: 'sign on', credit: null, seconds: 16, audio: 16, bpm: null, key: null, notes: [62, 66, 69, 74, 69, 66], look: { bg: '#06110a', fg: '#4aee7f', card: '#0b1c11' } },
  { id: 9004, title: 'low tide', credit: 'a friend', seconds: 11.2, audio: 10.6, bpm: 140, key: 'F major', notes: [53, 57, 60, 65, 64, 60, 57, 55], look: { bg: '#1430c4', fg: '#ffffff', card: '#0c2194' } },
];
const START = { ids: SONGS.map((s) => s.id), on: true, fail: 0, drop: 0, skew: 0, ttl: 3600, titles: {} };
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
    const env = Math.min(1, t / 0.25, (song.audio - t) / 0.5);
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

let ext = 'wav';
function make(log) {
  fs.mkdirSync(DIR, { recursive: true });
  const ffmpeg = spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' }).status === 0;
  ext = ffmpeg ? 'm4a' : 'wav';
  const stamp = crypto.createHash('sha1').update(JSON.stringify([SONGS, ext, synth.toString()])).digest('hex');
  const stampFile = path.join(DIR, 'stamp');
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
  fs.writeFileSync(stampFile, stamp);
  log(`radio mock: made ${SONGS.length} test songs in ${path.relative(process.cwd(), DIR)}/ (${ext})`);
}

// ---------------------------------------------------------------- the routes
const crate = () => (state.on ? state.ids.map((id) => SONGS.find((s) => s.id === id)).filter(Boolean) : []);
const inCrate = (raw) => (/^[1-9]\d{0,9}$/.test(raw) ? crate().find((s) => s.id === Number(raw)) : null);
function radioList() {
  const songs = crate().map((s) => ({ id: s.id, title: state.titles[s.id] || s.title, credit: s.credit, durationMs: Math.round(s.seconds * 1000), bpm: s.bpm, key: s.key, look: s.look }));
  const version = songs.length ? crypto.createHash('sha1').update(songs.map((s) => `${s.id}:${s.durationMs}`).join(',')).digest('hex').slice(0, 12) : '';
  return { on: songs.length > 0, now: Date.now() + state.skew, version, songs };
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
  if (req.method !== 'GET' && req.method !== 'HEAD' && (p.startsWith('/catalog/api/radio') || p.startsWith('/__radio-mock'))) { json(res, 405, { error: 'GET only.' }); return; }
  if (p === '/catalog/api/radio') { json(res, 200, radioList()); return; }
  let m = /^\/catalog\/api\/radio\/play\/([^/]*)$/.exec(p);
  if (m) {
    const s = inCrate(m[1]);
    if (!s) { json(res, 404, { error: 'Not found.' }); return; }
    const exp = Date.now() + state.ttl * 1000;
    json(res, 200, { url: `/__radio-mock/media/${s.id}.${ext}?sig=${crypto.randomBytes(6).toString('hex')}&exp=${exp}`, expires: new Date(exp).toISOString() });
    return;
  }
  m = /^\/catalog\/api\/radio\/peaks\/([^/]*)$/.exec(p);
  if (m) {
    const s = inCrate(m[1]);
    if (!s) { json(res, 404, { error: 'Not found.' }); return; }
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.end(fs.readFileSync(path.join(DIR, `${s.id}.json`)));
    return;
  }
  if (p.startsWith('/catalog/api/radio')) { json(res, 404, { error: 'Not found.' }); return; }
  m = /^\/__radio-mock\/media\/(\d+)\.(m4a|wav)$/.exec(p);
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
    if (q.has('reset')) state = { ...START, titles: {} };
    if (q.has('retitle')) { const [id, ...t] = q.get('retitle').split(':'); state.titles = { ...state.titles, [Number(id)]: t.join(':') }; }
    if (q.has('songs')) state.ids = q.get('songs').split(',').map(Number).filter((id) => SONGS.some((s) => s.id === id));
    if (q.has('on')) state.on = q.get('on') !== '0';
    for (const k of ['fail', 'drop', 'skew', 'ttl']) if (q.has(k)) state[k] = Number(q.get(k)) || 0;
    if (!state.ttl) state.ttl = START.ttl;
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
