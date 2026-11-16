// Dev only. `RADIO_ADMIN_MOCK=1 npm run dev` answers the catalog routes the radio admin calls (src/radio/admin) from a
// small library kept in memory, so the admin can be tried before the catalog has its reorder route, and without the real
// catalog or a sign-in:
//   GET  /catalog/api/crates, /catalog/api/crates/:id, /catalog/api/search?q=
//   POST /catalog/api/crates {name}, PUT /catalog/api/crates/:id/order {songIds}
//   POST /catalog/api/crates/:id/songs {songId}, DELETE /catalog/api/crates/:id/songs/:songId
//   GET  /catalog/api/radio: {on, now, version, songs, anchor, carry}, re-anchored the way the catalog does it whenever
//        the playable list changes (src/radio/admin/queue.js, reanchor): on this read, and at once after every change to
//        the radio crate, so the admin's view moves like the real thing.
// A change needs X-Catalog: 1 and an Origin of this host, as the catalog's (lib/guard.js). Any other /catalog/api route
// answers 404 here, so nothing reaches the live catalog; the radio's audio (/catalog/api/radio/play, /peaks) is left to
// RADIO_MOCK=1 when that is on too. vite.config.js loads this file only in the dev server with RADIO_ADMIN_MOCK=1, so
// none of it can reach a build.
//
// Switches while it runs (each answers the mock's state as JSON, the song on air included):
//   /__radio-admin-mock/state?signin=0        every session route answers 401 {signin: true}; signin=1 signs back in
//   /__radio-admin-mock/state?nocrate=1       no crate named radio (the admin offers to make one)
//   /__radio-admin-mock/state?preview=512     a song gets its preview, so it can play
//   /__radio-admin-mock/state?refuse=order    the next order (or add, remove) answers 400 with a plain sentence
//   /__radio-admin-mock/state?slow=800        every answer waits 800 ms (an edit shows before it is saved)
//   /__radio-admin-mock/state?quick=1         songs of 8 to 20 s, to watch the queue roll over; quick=0 back. The song on
//                                             air plays out at its old length (as after any change of lengths), so
//                                             reset=1&quick=1 is the way to start over with short songs at once
//   /__radio-admin-mock/state?elsewhere=add:514   an edit made in the catalog meanwhile (add:<id> or remove:<id>)
//   /__radio-admin-mock/state?reset=1         back to the start

import crypto from 'node:crypto';
import { onAir } from '../src/radio/schedule.js';
import { reanchor } from '../src/radio/admin/queue.js';

// [id, title, credit, seconds, has a preview, year, look]
const LIBRARY = [
  [501, 'Glass Harbor', null, 214.6, true, 2025, ['#1f6f8b', '#f4f1e8']],
  [502, 'Night Drive', 'the static', 252.3, true, 2026, ['#f7d75c', '#15130f']],
  [503, 'Sign On', null, 161.0, true, 2024, ['#06110a', '#4aee7f']],
  [504, 'Low Tide', 'a friend', 238.8, true, 2026, ['#1430c4', '#ffffff']],
  [505, 'Fresh Bounce v3', null, 200.0, false, 2026, null],
  [506, 'Overpass', null, 302.4, true, 2025, ['#d6452f', '#fff4e8']],
  [507, 'Dial Tone', null, 191.9, true, 2023, ['#e9e4d8', '#2a2622']],
  [508, 'Static Bloom', 'max + jules', 280.1, true, 2026, ['#5a33dd', '#ffffff']],
  [509, 'Untitled 11.14', null, 125.5, false, 2026, null],
  [510, 'Late Shift', null, 227.2, true, 2025, ['#2b2f36', '#ffbd70']],
  [511, 'Northbound', null, 245.0, true, 2024, ['#0e5e4e', '#d9fff4']],
  [512, 'Paper Moon', 'a friend', 210.7, false, 2026, ['#f2c6d2', '#3a1220']],
  [513, 'Tunnel Vision', null, 195.3, true, 2025, ['#101820', '#f2aa4c']],
  [514, 'Copper', null, 178.6, true, 2024, ['#b87333', '#fff8f0']],
  [515, 'Afterimage', null, 262.9, true, 2026, ['#c9d6df', '#1e2022']],
  [516, 'Slow Burn', 'the static', 331.0, true, 2023, ['#7a1f1f', '#ffd9c7']],
  [517, 'Cold Open', null, 108.2, true, 2026, ['#e4f0f6', '#0b3954']],
  [518, 'Ferris', null, 183.3, true, 2025, ['#ffcf56', '#2d1e2f']],
];
const T0 = Date.UTC(2026, 10, 1, 17, 0, 0);

function start(quick = false) {
  const songs = LIBRARY.map(([id, title, credit, seconds, preview, year, look], i) => ({
    id, title, credit, seconds, preview, year, look: look ? { bg: look[0], fg: look[1], card: look[0] } : null, added: T0 + i * 86400000,
  }));
  const crates = [
    { id: 3, name: 'late night', createdAt: T0, songIds: [502, 506, 510, 516] },
    { id: 4, name: 'demos', createdAt: T0, songIds: [505, 509, 512] },
    { id: 7, name: 'radio', createdAt: T0, songIds: [501, 502, 503, 504, 505, 506, 507, 508, 509, 510] },
  ];
  const now = Date.now();
  const s = { songs, crates, nextCrate: 8, signin: true, refuse: '', slow: 0, quick, edits: 0, store: { version: null, songs: [], anchor: null, carry: null } };
  // on air from the first song, a minute and a half in
  const list = playable(s);
  s.store = { version: versionOf(list), songs: list.map((x) => [x.id, x.durationMs]), anchor: { at: now - 95000, songId: list[0].id }, carry: null };
  return s;
}

// ---------------------------------------------------------------- the catalog, as far as the admin sees it
const songOf = (s, id) => s.songs.find((x) => x.id === id);
const lengthOf = (s, song) => (s.quick ? 8 + (song.id % 7) * 2 : song.seconds);
const radioCrate = (s) => s.crates.filter((c) => c.name.trim().toLowerCase() === 'radio').sort((a, b) => a.id - b.id)[0] || null;

/** What the radio plays: the radio crate's songs with a preview and a length, in crate order (lib/radio.js, radioSongs). */
function playable(s) {
  const c = radioCrate(s);
  if (!c) return [];
  return c.songIds.map((id) => songOf(s, id)).filter((x) => x && x.preview).map((x) => ({
    id: x.id, title: x.title, credit: x.credit, durationMs: Math.round(lengthOf(s, x) * 1000), bpm: null, key: null, look: x.look,
  }));
}
const versionOf = (list) => crypto.createHash('sha1').update(list.map((x) => `${x.id}:${x.durationMs}`).join(',')).digest('hex').slice(0, 12);

/** The catalog's re-anchor: when the playable list's version differs from the stored one, at te. */
function anchorAt(s, te) {
  const list = playable(s);
  const version = versionOf(list);
  if (version === s.store.version) return list;
  const old = { songs: s.store.songs.map(([id, durationMs]) => ({ id, durationMs })), anchor: s.store.anchor, carry: s.store.carry };
  const next = reanchor(old, list, te);
  s.store = { version, songs: list.map((x) => [x.id, x.durationMs]), anchor: next.anchor, carry: next.carry };
  return list;
}

const iso = (ms) => new Date(ms).toISOString();
/** A compact song row, as GET /api/songs and /api/crates/:id send them (lib/catalog.js, songRows). */
const rowOf = (s, x) => ({
  id: x.id, title: x.title, credit: x.credit, year: x.year, versions: 1, date: iso(x.added), duration: lengthOf(s, x),
  bpm: null, bpmConfirmed: false, key: null, keyConfirmed: false, check: false, tags: [], stems: false, project: false,
  latestFileId: x.id * 10, peaks: null, color: null, art: null,
});
const crateOut = (s, c) => ({ id: c.id, name: c.name, createdAt: iso(c.createdAt), color: null, art: null, radio: radioCrate(s) === c });

function json(res, code, body) {
  res.statusCode = code;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(body === undefined ? '' : JSON.stringify(body));
}
const fail = (res, code, error, extra = {}) => json(res, code, { error, ...extra });

function readBody(req) {
  return new Promise((resolve) => {
    let raw = '';
    req.setEncoding('utf8');
    req.on('data', (c) => { raw += c; });
    req.on('end', () => {
      if (!raw) return resolve({});
      try { resolve(JSON.parse(raw)); } catch { resolve(null); }
    });
    req.on('error', () => resolve(null));
  });
}

function sameHost(origin, host) {
  try {
    const o = new URL(origin);
    return o.host === new URL(`${o.protocol}//${host}`).host;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------- the routes
let state = start();

async function api(req, res, p, url) {
  const s = state;
  const method = req.method;
  if (method !== 'GET' && method !== 'HEAD') {
    if (req.headers['x-catalog'] !== '1') return fail(res, 403, 'A change needs the X-Catalog: 1 header, which the app sends. Reload the app and try again.');
    const origin = req.headers.origin;
    if (origin && !sameHost(origin, req.headers.host)) return fail(res, 403, 'This change came from another site, so it was refused. Open the catalog at its own address and try again.');
  }

  // the radio's own list, no session (routes/radio.js)
  if (p === '/radio' || p === '/radio/') {
    if (method !== 'GET') return fail(res, 404, 'That song is not on the radio.');
    const te = Date.now();
    const list = anchorAt(s, te);
    return json(res, 200, { on: list.length > 0, now: te, version: versionOf(list), songs: list, anchor: s.store.anchor, carry: s.store.carry });
  }
  if (p.startsWith('/radio/')) return 'pass';

  if (!s.signin) return fail(res, 401, 'Sign in to use the catalog.', { signin: true });
  const refuse = (what) => {
    if (s.refuse !== what) return false;
    s.refuse = '';
    fail(res, 400, 'The crate changed in the catalog while you were editing it. Look again and try once more.');
    return true;
  };
  const changed = (c) => {
    s.edits += 1;
    if (radioCrate(s) === c) anchorAt(s, Date.now());
  };

  if (p === '/crates' && method === 'GET') {
    return json(res, 200, s.crates.slice().sort((a, b) => a.name.localeCompare(b.name)).map((c) => ({ ...crateOut(s, c), songs: c.songIds.length, shared: false })));
  }
  if (p === '/crates' && method === 'POST') {
    const body = await readBody(req);
    const name = body && typeof body.name === 'string' ? body.name.normalize('NFC').replace(/\s+/g, ' ').trim() : '';
    if (!name) return fail(res, 400, 'Give the crate a name: {"name": "..."}.');
    if (s.crates.some((c) => c.name.toLowerCase() === name.toLowerCase())) return fail(res, 409, `There is already a crate called "${name}".`);
    const c = { id: s.nextCrate++, name, createdAt: Date.now(), songIds: [] };
    s.crates.push(c);
    changed(c);
    return json(res, 201, { ...crateOut(s, c), songs: 0 });
  }
  let m = /^\/crates\/([^/]+)(\/order|\/songs(?:\/([^/]+))?)?$/.exec(p);
  if (m) {
    const id = /^\d{1,9}$/.test(m[1]) ? Number(m[1]) : 0;
    const c = s.crates.find((x) => x.id === id);
    if (!c) return fail(res, 404, `There is no crate ${m[1]}.`);
    const out = () => ({ ...crateOut(s, c), songs: c.songIds.map((sid) => rowOf(s, songOf(s, sid))), share: null });
    if (!m[2] && method === 'GET') return json(res, 200, out());
    if (m[2] === '/order' && method === 'PUT') {
      const body = await readBody(req);
      if (!body) return fail(res, 400, 'The request body is not valid JSON.');
      const ids = body.songIds;
      const have = new Set(c.songIds);
      const ok = Array.isArray(ids) && ids.length === c.songIds.length && ids.every((x) => Number.isInteger(x) && have.has(x)) && new Set(ids).size === ids.length;
      if (!ok) return fail(res, 400, `Send every song in the crate once, in its new order: {"songIds": [...]} with all ${c.songIds.length} of them.`);
      if (refuse('order')) return undefined;
      c.songIds = ids.slice();
      changed(c);
      return json(res, 200, out());
    }
    if (m[2] === '/songs' && method === 'POST') {
      const body = await readBody(req);
      const songId = Number(body && body.songId);
      if (!Number.isInteger(songId) || songId <= 0) return fail(res, 400, 'Send the song to add as {"songId": <id>}.');
      if (!songOf(s, songId)) return fail(res, 404, `There is no song ${songId}.`);
      if (refuse('add')) return undefined;
      if (c.songIds.includes(songId)) return json(res, 200, { crateId: c.id, songId, added: false });
      c.songIds.push(songId);
      changed(c);
      return json(res, 201, { crateId: c.id, songId, added: true });
    }
    if (m[3] && method === 'DELETE') {
      const songId = /^\d{1,9}$/.test(m[3]) ? Number(m[3]) : 0;
      if (!c.songIds.includes(songId)) return fail(res, 404, `Song ${m[3]} is not in crate ${c.id}.`);
      if (refuse('remove')) return undefined;
      c.songIds = c.songIds.filter((x) => x !== songId);
      changed(c);
      return json(res, 204);
    }
  }
  if (p === '/search' && method === 'GET') {
    const q = (url.searchParams.get('q') || '').normalize('NFC').replace(/\s+/g, ' ').trim().toLowerCase();
    if (!q) return json(res, 200, { songs: [], files: [] });
    const songs = s.songs
      .filter((x) => x.title.toLowerCase().includes(q) || (x.credit && x.credit.toLowerCase().includes(q)))
      .map((x) => ({ x, rank: x.title.toLowerCase() === q ? 0 : x.title.toLowerCase().startsWith(q) ? 1 : 2 }))
      .sort((a, b) => a.rank - b.rank)
      .slice(0, 20)
      .map(({ x }) => rowOf(s, x));
    return json(res, 200, { songs, files: [] });
  }
  return fail(res, 404, `There is no API route ${method} /catalog/api${p}.`);
}

function status() {
  const s = state, list = anchorAt(s, Date.now());
  const st = { songs: list, anchor: s.store.anchor, carry: s.store.carry };
  const x = onAir(st, Date.now());
  const c = radioCrate(s);
  return {
    signin: s.signin, refuse: s.refuse, slow: s.slow, quick: s.quick,
    radio: {
      crate: c ? c.id : null,
      order: c ? c.songIds.slice() : [],
      playable: list.map((y) => y.id),
      anchor: s.store.anchor,
      carry: s.store.carry,
      onAir: x ? { id: x.song.id, startedAt: x.startedAt, endsAt: x.endsAt, offsetMs: x.offsetMs } : null,
    },
  };
}

function control(url, res) {
  const q = url.searchParams;
  if (q.has('reset')) state = start(q.get('quick') === '1');
  const s = state;
  if (q.has('signin')) s.signin = q.get('signin') !== '0';
  if (q.has('nocrate') && q.get('nocrate') !== '0') s.crates = s.crates.filter((c) => c !== radioCrate(s));
  if (q.has('preview')) { const x = songOf(s, Number(q.get('preview'))); if (x) x.preview = true; }
  if (q.has('refuse')) s.refuse = q.get('refuse');
  if (q.has('slow')) s.slow = Math.max(0, Number(q.get('slow')) || 0);
  if (q.has('quick')) s.quick = q.get('quick') !== '0';
  if (q.has('elsewhere')) {
    const [what, raw] = q.get('elsewhere').split(':');
    const c = radioCrate(s), id = Number(raw);
    if (c && songOf(s, id)) {
      if (what === 'add' && !c.songIds.includes(id)) c.songIds.push(id);
      if (what === 'remove') c.songIds = c.songIds.filter((x) => x !== id);
    }
  }
  // a change to the radio crate or its songs re-anchors at once, as the catalog's edits do
  anchorAt(s, Date.now());
  json(res, 200, status());
}

async function handle(req, res, next) {
  const url = new URL(req.url, 'http://localhost');
  const p = url.pathname;
  if (p === '/__radio-admin-mock/state') { control(url, res); return; }
  if (!p.startsWith('/catalog/api/') && p !== '/catalog/api') { next(); return; }
  if (state.slow) await new Promise((r) => setTimeout(r, state.slow));
  try {
    const r = await api(req, res, p.slice('/catalog/api'.length) || '/', url);
    if (r === 'pass') {
      // the radio's audio: RADIO_MOCK=1 answers it when it is on, else nothing does
      if (process.env.RADIO_MOCK === '1') next();
      else fail(res, 404, 'That song is not on the radio.');
    }
  } catch (err) {
    fail(res, 500, `The mock failed: ${err.message}`);
  }
}

export function radioAdminMock() {
  return {
    name: 'radio-admin-mock',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(handle);
      server.config.logger.info('radio admin mock: answering /catalog/api (see scripts/radio-admin-mock.js for /__radio-admin-mock/state)');
    },
  };
}
