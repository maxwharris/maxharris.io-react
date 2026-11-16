// The radio admin's state, without React (Admin.jsx renders the snapshot through useSyncExternalStore and calls the
// methods): the radio crate and the radio's public state, read from the catalog when the window opens and every 10 s
// while it is open, and Max's edits, shown at once and saved in order behind them. An edit the catalog refuses is rolled
// back to what the catalog has, with a plain line saying so.
//
// An edit is shown as the catalog will make it: the crate's new order (the song on air first, so nothing cuts it) and the
// radio re-anchored the way the catalog re-anchors it (queue.js), so the times are right before the catalog answers. The
// window drops its version once the catalog has answered for every edit and a read after them has come back.

import * as api from './api.js';
import { calibrate, normalizeSongs } from '../format.js';
import { follow, liveQueue, savedOrder, placeAfter, moveBy, sameIds, low } from './queue.js';

export const POLL_MS = 10000;
export const UNDO_MS = 6000;
const NONE = new Set();

// After a saved edit the radios in this browser (the desktop's, a pop-out page) read the queue again at once over their
// shared channel (engine.js, heard), so Max hears his edit without waiting for their next read; other listeners pick it
// up at theirs. One channel a page, made when first needed.
let chan = null;
function nudgeRadios() {
  try {
    if (!chan && typeof BroadcastChannel === 'function') {
      chan = new BroadcastChannel('maxradio');
      if (typeof chan.unref === 'function') chan.unref(); // under node (the tests) an open channel would hold the run open
    }
    if (chan) chan.postMessage({ type: 'queue', id: 'admin', at: Date.now() });
  } catch { /* no channel: the radios read the queue on their own soon enough */ }
}

const anchorOf = (a) => (a && Number.isFinite(Number(a.at)) && a.songId != null ? { at: Number(a.at), songId: a.songId } : null);
const carryOf = (c) => (c && c.songId != null && Number.isFinite(Number(c.startedAt)) && Number.isFinite(Number(c.endsAt))
  ? { songId: c.songId, startedAt: Number(c.startedAt), endsAt: Number(c.endsAt) }
  : null);

/**
 * What the window knows of the catalog: the crate's order and its song rows by id, the radio's {songs, anchor, carry} as
 * every listener reads it (format.js, normalizeSongs), and the songs on their way in (added here, not yet read back).
 */
function modelOf(crate, radio) {
  const list = Array.isArray(crate && crate.songs) ? crate.songs.filter((s) => s && s.id != null) : [];
  const rows = {};
  for (const s of list) rows[s.id] = s;
  return {
    order: list.map((s) => s.id),
    rows,
    state: {
      songs: radio && radio.on ? normalizeSongs(radio.songs) : [],
      anchor: anchorOf(radio && radio.anchor),
      carry: carryOf(radio && radio.carry),
    },
    pending: NONE,
  };
}

export function createAdmin() {
  const listeners = new Set();
  let snap = { phase: 'loading', model: null, crate: null, saving: false, stale: false, error: '', notice: '', undo: null, making: false };
  const emit = (patch) => {
    snap = { ...snap, ...patch };
    for (const fn of listeners) fn();
  };

  let cal = null; // the catalog's clock against this device's (format.js, calibrate)
  const now = () => Date.now() + (cal ? cal.offset : 0);

  let crateId = null;
  let server = null; // the model as the catalog last told it
  let mine = null; // the model with edits the catalog has not answered for yet
  let seq = 0, applied = 0; // reads started, and the newest one applied
  let settleFrom = 0; // a read at least this new, once every edit is saved, drops `mine`
  let running = false, paused = false, timer = 0, lastRead = 0;
  const tasks = [];
  let pumping = false;
  let undoRec = null, undoTimer = 0;
  let said = 0;

  const model = () => mine || server;
  const show = (patch = {}) => emit({ model: model(), ...patch });
  // the live region: the same words twice still count as news
  const say = (notice) => emit({ notice: notice + ((said += 1) % 2 ? '' : '​') });
  const nameOf = (m, id) => low((m.rows[id] && m.rows[id].title) || 'that song');

  // ---------------------------------------------------------------- reading the catalog

  async function read(again = false) {
    const my = ++seq;
    lastRead = Date.now();
    try {
      if (crateId == null) {
        const list = await api.listCrates();
        if (my < applied) return;
        const c = Array.isArray(list) ? list.find((x) => x && x.radio) : null;
        if (!c) {
          applied = my;
          server = null;
          mine = null;
          settleFrom = 0;
          emit({ phase: 'nocrate', model: null, crate: null, stale: false });
          return;
        }
        crateId = c.id;
      }
      const id = crateId;
      let t0 = 0, t1 = 0;
      const [crate, radio] = await Promise.all([
        api.getCrate(id),
        (async () => {
          t0 = Date.now();
          const r = await api.getRadio();
          t1 = Date.now();
          return r;
        })(),
      ]);
      if (my < applied || id !== crateId) return;
      if (!crate || !crate.radio) {
        // renamed, so no longer the radio's: look for the radio's crate again
        crateId = null;
        if (!again) await read(true);
        return;
      }
      applied = my;
      cal = calibrate(cal, Number(radio && radio.now), t0, t1);
      server = modelOf(crate, radio);
      if (mine && settleFrom && my >= settleFrom && !pumping && !tasks.length) {
        mine = null;
        settleFrom = 0;
      }
      show({ phase: 'ready', crate: { id: crate.id, name: crate.name }, stale: false });
    } catch (err) {
      if (my < applied) return;
      if (err && err.signin) { signedOut(); return; }
      if (err && err.status === 404 && crateId != null && !again) {
        // the crate is gone: look for the radio's crate again
        crateId = null;
        await read(true);
        return;
      }
      emit({ stale: true, phase: snap.phase === 'loading' ? 'error' : snap.phase });
    }
  }

  function signedOut() {
    mine = null;
    settleFrom = 0;
    tasks.length = 0;
    dropUndo();
    emit({ phase: 'signedout', model: null, saving: false, error: '', stale: false });
  }

  function arm() {
    clearTimeout(timer);
    if (running) timer = setTimeout(poll, POLL_MS);
  }
  async function poll() {
    if (!running) return;
    if (!paused && !document.hidden && snap.phase !== 'signedout' && !pumping) await read();
    arm();
  }
  // back to the page (a sign-in in the catalog's tab, say): look again
  function wake() {
    if (!running || paused || document.hidden) return;
    if (snap.phase === 'signedout' || Date.now() - lastRead > 3000) read();
  }

  // ---------------------------------------------------------------- edits

  /** The queue as the window shows it now: the model, the live queue, the up-next ids and the song on air. */
  function current() {
    const m = model();
    if (!m || snap.phase !== 'ready') return null;
    const v = liveQueue(m.order.map((id) => m.rows[id]), m.state, now());
    return { m, v, up: v.rows.map((r) => r.id), onAirId: v.onAir ? v.onAir.id : null };
  }

  /** Shows an edit at once: the crate's new order, and the radio as the catalog will re-anchor it now. */
  function apply(m, order, { row = null, song = null, pending = null } = {}) {
    const playable = new Map(m.state.songs.map((s) => [s.id, s]));
    if (song) playable.set(song.id, song);
    const list = order.filter((id) => playable.has(id)).map((id) => playable.get(id));
    mine = {
      order,
      rows: row ? { ...m.rows, [row.id]: row } : m.rows,
      state: follow(m.state, list, now()),
      pending: pending == null ? m.pending : new Set([...m.pending, pending]),
    };
    settleFrom = 0;
  }

  function setUp(c, up, notice) {
    if (sameIds(up, c.up)) return false;
    const order = savedOrder(c.onAirId, up, c.m.order);
    apply(c.m, order);
    enqueue({ kind: 'order', ids: order });
    show({ error: '' });
    say(notice);
    return true;
  }
  const placeText = (up, id) => `place ${up.indexOf(id) + 1} of ${up.length}`;

  // Saves run one at a time, in order; orders back to back collapse into the last (each is the whole order).
  function enqueue(task) {
    const last = tasks[tasks.length - 1];
    if (task.kind === 'order' && last && last.kind === 'order') last.ids = task.ids;
    else tasks.push(task);
    pump();
  }
  async function pump() {
    if (pumping) return;
    pumping = true;
    emit({ saving: true });
    let failed = null;
    while (tasks.length) {
      const t = tasks.shift();
      try {
        if (t.kind === 'order') await api.saveOrder(crateId, t.ids);
        else await t.run();
      } catch (err) {
        failed = err;
        tasks.length = 0;
      }
    }
    pumping = false;
    emit({ saving: false });
    if (failed) { refused(failed); return; }
    settleFrom = seq + 1;
    read();
    nudgeRadios();
  }

  // The catalog said no (or could not be reached): back to what it has, and a plain line saying why.
  function refused(err) {
    mine = null;
    settleFrom = 0;
    dropUndo();
    if (err && err.signin) { signedOut(); return; }
    let why;
    if (!err || err.status === 0) why = 'could not reach the catalog, so that edit may not have saved.';
    else if (err.status >= 500) why = 'the catalog could not save that edit. try again in a moment.';
    else why = `the catalog did not take that edit: ${low(err.message).replace(/[.\s]+$/, '')}.`;
    show({ error: `${why} the queue shows what the catalog has.` });
    say(why);
    read();
  }

  function setUndo(rec) {
    clearTimeout(undoTimer);
    undoRec = rec;
    emit({ undo: { id: rec.id, title: low(rec.row && rec.row.title) || 'that song' } });
    undoTimer = setTimeout(dropUndo, UNDO_MS);
  }
  function dropUndo() {
    clearTimeout(undoTimer);
    undoRec = null;
    if (snap.undo) emit({ undo: null });
  }

  return {
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    get: () => snap,
    /** The station's time: the catalog's clock as measured against this device's. */
    now,

    start() {
      if (running) return;
      running = true;
      window.addEventListener('focus', wake);
      document.addEventListener('visibilitychange', wake);
      read().finally(arm);
    },
    stop() {
      running = false;
      clearTimeout(timer);
      dropUndo();
      window.removeEventListener('focus', wake);
      document.removeEventListener('visibilitychange', wake);
    },
    /** Minimized: no reading until it is back. */
    pause(on) {
      paused = !!on;
      if (!paused) wake();
    },
    retry() {
      if (snap.phase === 'error' || snap.phase === 'signedout') emit({ phase: 'loading' });
      return read();
    },
    dismiss() { emit({ error: '' }); },

    /** Moves a song in up next to sit after `after` (null: first), or before `before` when `after` is gone. */
    move(id, after, before) {
      const c = current();
      if (!c || !c.up.includes(id)) return false;
      const up = placeAfter(c.up, id, after, before);
      return setUp(c, up, `moved ${nameOf(c.m, id)} to ${placeText(up, id)}`);
    },
    /** One place up (-1) or down (1): the arrow keys. */
    nudge(id, delta) {
      const c = current();
      if (!c || !c.up.includes(id)) return false;
      const up = moveBy(c.up, id, delta);
      return setUp(c, up, `${nameOf(c.m, id)}, ${placeText(up, id)}`);
    },
    playNext(id) {
      const c = current();
      if (!c || !c.up.includes(id)) return false;
      return setUp(c, [id, ...c.up.filter((x) => x !== id)], `${nameOf(c.m, id)} plays next`);
    },
    /** Takes a song out of the crate, with a few seconds to undo. Only from up next: the song on air plays on. */
    remove(id) {
      const c = current();
      const i = c ? c.up.indexOf(id) : -1;
      if (i < 0) return false;
      undoRec = null;
      const rec = {
        id,
        row: c.m.rows[id],
        song: c.m.state.songs.find((s) => s.id === id) || null,
        after: i > 0 ? c.up[i - 1] : null,
        before: i + 1 < c.up.length ? c.up[i + 1] : null,
      };
      // The order the catalog will have: the DELETE leaves the rest where they were (it plays the same, round from the song
      // on air). An undo or an add straight after compares its order against this one, and saves it when they differ.
      apply(c.m, c.m.order.filter((x) => x !== id));
      enqueue({ kind: 'op', run: () => api.removeSong(crateId, id) });
      setUndo(rec);
      show({ error: '' });
      say(`removed ${nameOf(c.m, id)}. undo at the bottom of the window`);
      return true;
    },
    /** Puts the song just removed back where it was. */
    undo() {
      const rec = undoRec;
      dropUndo();
      const c = current();
      if (!rec || !c || c.m.order.includes(rec.id)) return false;
      const crate = [...c.m.order, rec.id];
      const order = savedOrder(c.onAirId, placeAfter(c.up, rec.id, rec.after, rec.before), crate);
      apply(c.m, order, { row: rec.row, song: rec.song });
      enqueue({ kind: 'op', run: () => api.addSong(crateId, rec.id) });
      // the catalog adds it at the end of the crate; the order puts it back in its place
      if (!sameIds(order, crate)) enqueue({ kind: 'order', ids: order });
      show({ error: '' });
      say(`${nameOf(mine, rec.id)} is back in the queue`);
      return true;
    },
    /** Hovered or focused, the undo waits; let go, it gives a moment more. */
    holdUndo(on) {
      if (!undoRec) return;
      clearTimeout(undoTimer);
      if (!on) undoTimer = setTimeout(dropUndo, UNDO_MS / 2);
    },
    /** Adds a song from the catalog's search at the end of the queue (the last to play before the loop comes round). */
    add(song) {
      const c = current();
      if (!c || !song || song.id == null || c.m.order.includes(song.id)) return false;
      const crate = [...c.m.order, song.id];
      const order = savedOrder(c.onAirId, [...c.up, song.id], crate);
      apply(c.m, order, { row: song, pending: song.id });
      enqueue({ kind: 'op', run: () => api.addSong(crateId, song.id) });
      if (!sameIds(order, crate)) enqueue({ kind: 'order', ids: order });
      show({ error: '' });
      say(`added ${low(song.title) || 'that song'} at the end of the queue`);
      return true;
    },
    /** No crate is named radio: make one, which is the radio's at once. */
    async makeCrate() {
      if (snap.making) return;
      emit({ making: true, error: '' });
      try {
        const c = await api.makeRadioCrate();
        crateId = c && c.id != null ? c.id : null;
      } catch (err) {
        if (err && err.signin) { emit({ making: false }); signedOut(); return; }
        // 409: one was made meanwhile (in the catalog, say), and reading finds it
        if (!(err && err.status === 409)) {
          emit({ making: false, error: `could not make the radio crate: ${low(err && err.message).replace(/[.\s]+$/, '')}.` });
          return;
        }
        crateId = null;
      }
      await read();
      emit({ making: false });
    },
  };
}
