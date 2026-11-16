// The radio admin's saves (state.js) against a catalog kept in memory: an edit made straight after another, before the
// catalog has answered for the first, still leaves the catalog with the order the window shows. npm test runs it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { follow, liveQueue } from './queue.js';
import { createAdmin } from './state.js';

// state.js only touches the page in start() and stop()
globalThis.window ??= { addEventListener() {}, removeEventListener() {} };
globalThis.document ??= { addEventListener() {}, removeEventListener() {}, hidden: false };

/**
 * The catalog's routes the admin calls, over one crate (7, the radio's) whose songs all play, a minute each, with
 * `onAirId` a second into its minute. Every change re-anchors the radio as the catalog does (queue.js follow).
 */
function catalog(order, onAirId) {
  const c = { order: order.slice(), state: null };
  const list = () => c.order.map((id) => ({ id, durationMs: 60000 }));
  c.state = { songs: list(), anchor: { at: Date.now() - 1000, songId: onAirId }, carry: null };
  const changed = () => { c.state = follow(c.state, list(), Date.now()); };
  const crate = () => ({ id: 7, name: 'radio', radio: true, songs: c.order.map((id) => ({ id, title: `song ${id}` })) });
  globalThis.fetch = async (url, init = {}) => {
    const method = init.method || 'GET', body = init.body ? JSON.parse(init.body) : null;
    const reply = (status, data) => ({ status, ok: status < 400, json: async () => data });
    const path = url.replace('/catalog/api', '');
    if (path === '/crates') return reply(200, [{ id: 7, name: 'radio', radio: true, songs: c.order.length }]);
    if (path === '/crates/7') return reply(200, crate());
    if (path === '/radio') return reply(200, { on: true, now: Date.now(), songs: c.state.songs, anchor: c.state.anchor, carry: c.state.carry });
    const m = /^\/crates\/7\/songs\/(\d+)$/.exec(path);
    if (m && method === 'DELETE') { c.order = c.order.filter((x) => x !== Number(m[1])); changed(); return reply(204, null); }
    if (path === '/crates/7/songs' && method === 'POST') { if (!c.order.includes(body.songId)) c.order.push(body.songId); changed(); return reply(201, {}); }
    if (path === '/crates/7/order' && method === 'PUT') { c.order = body.songIds.slice(); changed(); return reply(200, crate()); }
    return reply(404, { error: `no route ${method} ${path}` });
  };
  return c;
}
/** What plays after the song on air, as the catalog has it. */
const upNext = (c) => liveQueue(c.order.map((id) => ({ id })), c.state, Date.now()).rows.map((r) => r.id);
/** Every save answered, and the read after them back. */
async function saved(admin) {
  do await new Promise((r) => setTimeout(r, 5)); while (admin.get().saving);
  await new Promise((r) => setTimeout(r, 5));
}

test('undo straight after a remove puts the song back where it was, in the catalog too', async () => {
  const cat = catalog([1, 2, 3, 4, 5, 6], 4);
  const admin = createAdmin();
  await admin.retry();
  assert.deepEqual(upNext(cat), [5, 6, 1, 2, 3]);
  admin.remove(3);
  admin.undo(); // the DELETE is still on its way
  await saved(admin);
  assert.deepEqual(upNext(cat), [5, 6, 1, 2, 3]);
  assert.deepEqual(admin.get().model.order, cat.order);
  admin.stop();
});

test('an add straight after a remove goes to the end of the queue, in the catalog too', async () => {
  const cat = catalog([1, 2, 3, 4, 5, 6], 4);
  const admin = createAdmin();
  await admin.retry();
  admin.remove(6);
  admin.remove(1);
  admin.add({ id: 9, title: 'song 9' });
  await saved(admin);
  assert.deepEqual(upNext(cat), [5, 2, 3, 9]);
  assert.deepEqual(admin.get().model.order, cat.order);
  admin.stop();
});
