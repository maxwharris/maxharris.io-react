import { createContext, useContext } from 'react';
import { work, findWork } from '../data/site';

// ---------- small helpers ----------
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export const host = (u) => String(u || '').replace(/^https?:\/\//, '').replace(/\/$/, '');
export const store = {
  get(k) { try { return window.localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { window.localStorage.setItem(k, v); } catch { /* private mode */ } },
};
export const MOD = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent) ? '⌘' : 'ctrl ';
export const EASE = 'cubic-bezier(.2,.9,.25,1)';

// ---------- apps and windows ----------
export const APPS = [
  { id: 'work', label: 'work', glyph: 'work' },
  { id: 'personal', label: 'personal', glyph: 'personal' },
  { id: 'about', label: 'about', glyph: 'about' },
  { id: 'mail', label: 'mail', glyph: 'mail' },
  { id: 'terminal', label: 'terminal', glyph: 'terminal' },
  { id: 'scenes', label: 'scenes', glyph: 'scenes' },
  { id: 'trash', label: 'trash', glyph: 'trash' },
];
export const APP = Object.fromEntries(APPS.map((a) => [a.id, a]));
// app id -> [window kind, opts]
export const appKind = (id) => ({ work: ['files', { tab: 'work' }], personal: ['files', { tab: 'personal' }] })[id] || [id, {}];

export const KINDS = {
  about: { w: 440, h: 600, title: () => 'about' },
  files: { w: 770, h: 610, orn: true, title: (o) => o.tab },
  project: { w: 920, h: 720, orn: true, title: (o) => (findWork(o.key) || work[0]).title },
  mail: { w: 470, h: 590, title: () => 'mail' },
  terminal: { w: 700, h: 480, title: () => 'terminal' },
  scenes: { w: 460, h: 500, title: () => 'scenes' },
  trash: { w: 480, h: 560, title: () => 'trash' },
  sys: { w: 430, h: 560, title: () => 'about maxOS' },
  secrets: { w: 440, h: 400, title: () => 'secrets.txt' },
};
export const titleOf = (win) => KINDS[win.kind].title(win.opts);

// the most used tools across the work folder, for neofetch
export const stackTop = (() => {
  const m = new Map();
  work.forEach((p) => p.stack.forEach((t) => m.set(t, (m.get(t) || 0) + 1)));
  return [...m].sort((a, b) => b[1] - a[1]);
})();

// what a window looks like in the dock: [tint, glyph]
export const kindVisual = (win) => {
  if (win.kind === 'files') return [win.opts.tab, win.opts.tab];
  if (win.kind === 'project') return [win.opts.key, (findWork(win.opts.key) || {}).icon];
  if (win.kind === 'sys') return ['sys', 'mark'];
  if (win.kind === 'secrets') return ['sys', 'file'];
  return [win.kind, (APP[win.kind] || {}).glyph];
};

export const TRASH0 = [
  ['folder', 'node_modules/', '1.2 tb, somehow'],
  ['file', 'final_FINAL_v3_actually-final.psd', 'do not open'],
  ['file', 'regex-that-worked-once.txt', 'nobody knows why'],
  ['file', 'jquery-1.4.2.min.js', 'sentimental value'],
  ['folder', 'side-project-47/', 'the domain still renews every year'],
  ['file', 'console.log("here")', 'x 214'],
  ['file', 'my-first-website.html', '<marquee> and proud'],
  ['file', 'todo.txt', 'last edited in 2019'],
];

// ---------- arrangement ----------
// Windows never overlap. Up to six sit in columns across the screen, in the order the visitor put
// them: a column holds one full-height window, or two stacked when room runs short. Big windows
// (a project, the work folder, about) are the last to be stacked. Columns narrow toward a minimum
// before anything moves to the dock, and parked windows come back by themselves when there is room.
// Zoom puts one window alone on the stage.
const GAP = 28; // between columns
const ROW_GAP = 60; // between stacked windows, leaving room for the top one's grab bar
const ORN = 48; // room on the left for a window's tab ornament
const MAX_SHOWN = 6;
const MIN_W = { about: 360, files: 460, project: 520, mail: 380, terminal: 420, scenes: 380, trash: 380, sys: 360, secrets: 360 };
const MIN_H = { about: 300, files: 320, project: 340, mail: 300, terminal: 220, scenes: 280, trash: 260, sys: 280, secrets: 200 };
const STAY_TALL = { project: 3, files: 2, about: 1 }; // reluctance to be stacked

export function stage() {
  return { x0: 12, y0: 58, x1: window.innerWidth - 124, y1: window.innerHeight - 142 };
}

// Group windows (in visitor order) into columns that fit the width, stacking pairs only as needed.
function plan(keys, wins, availW, availH) {
  const rowH = (availH - ROW_GAP) / 2;
  const minW = (k) => MIN_W[k] || 360;
  const orn = (k) => (wins[k].orn ? ORN : 0);
  const colMin = (col) => Math.max(...col.map(minW)) + Math.max(...col.map(orn));
  const width = (cols) => cols.reduce((n, c) => n + colMin(c), 0) + GAP * Math.max(0, cols.length - 1);
  const stackable = (k) => (MIN_H[k] || 260) <= rowH;
  let cols = keys.map((k) => [k]);
  while (width(cols) > availW) {
    let best = null;
    for (let i = 0; i < cols.length; i++) {
      for (let j = i + 1; j < cols.length; j++) {
        const a = cols[i], b = cols[j];
        if (a.length !== 1 || b.length !== 1 || !stackable(a[0]) || !stackable(b[0])) continue;
        const save = colMin(a) + colMin(b) + GAP - colMin([a[0], b[0]]);
        const score = save - 500 * ((STAY_TALL[a[0]] || 0) + (STAY_TALL[b[0]] || 0)) - 300 * (j - i - 1);
        if (!best || score > best.score) best = { i, j, score };
      }
    }
    if (!best) return null;
    const merged = [cols[best.i][0], cols[best.j][0]];
    cols = cols.filter((_, n) => n !== best.j);
    cols[best.i] = merged;
  }
  return cols;
}

export function arrange(s) {
  if (s.phone) return s;
  const area = stage(), availW = area.x1 - area.x0, availH = area.y1 - area.y0;
  const wins = { ...s.wins };
  // candidates: what is on screen plus what was parked for lack of room
  const cand = s.order.filter((k) => wins[k] && !wins[k].closing && (!wins[k].min || wins[k].parked));
  const solo = s.solo && cand.includes(s.solo) ? s.solo : null;
  let keep = [], cols = [];
  if (solo) { keep = [solo]; cols = [[solo]]; }
  else if (cand.length) {
    // the most recently used windows, newest first, until the next one would not fit
    const byRecent = [...cand].sort((a, b) => wins[b].z - wins[a].z);
    for (let n = 1; n <= Math.min(MAX_SHOWN, byRecent.length); n++) {
      const set = byRecent.slice(0, n), ordered = cand.filter((k) => set.includes(k));
      const c = plan(ordered, wins, availW, availH);
      if (!c) break;
      keep = ordered;
      cols = c;
    }
    if (!keep.length) { keep = [byRecent[0]]; cols = [[byRecent[0]]]; }
  }
  // column widths: preferred if they fit, otherwise shrink the extra above each minimum evenly
  const ornOf = (col) => Math.max(...col.map((k) => (wins[k].orn ? ORN : 0)));
  const pref = cols.map((col) => (solo ? availW - ornOf(col) : Math.max(...col.map((k) => KINDS[k].w))));
  const mins = cols.map((col, i) => Math.min(pref[i], Math.max(...col.map((k) => MIN_W[k] || 360))));
  const fixed = cols.reduce((n, col) => n + ornOf(col), 0) + GAP * Math.max(0, cols.length - 1);
  let widths = pref.slice();
  if (pref.reduce((a, b) => a + b, 0) + fixed > availW) {
    const room = Math.max(0, availW - fixed - mins.reduce((a, b) => a + b, 0));
    const extra = pref.reduce((n, p, i) => n + (p - mins[i]), 0) || 1;
    widths = pref.map((p, i) => mins[i] + ((p - mins[i]) * room) / extra);
  }
  const rowW = widths.reduce((a, b) => a + b, 0) + fixed;
  const rowH = (availH - ROW_GAP) / 2;
  let x = area.x0 + Math.max(0, (availW - rowW) / 2);
  cols.forEach((col, i) => {
    x += ornOf(col);
    const cw = widths[i];
    if (col.length === 1) {
      const k = col[0], h = solo ? availH : Math.min(KINDS[k].h, availH);
      wins[k] = { ...wins[k], x, y: area.y0 + Math.max(0, (availH - h) / 2 - 10), w: cw, h };
    } else {
      // two stacked: each keeps its own width within the column, so the row is not a rigid grid
      col.forEach((k, r) => {
        const w = Math.max(Math.min(MIN_W[k] || 360, cw), Math.min(KINDS[k].w, cw)), h = Math.min(KINDS[k].h, rowH);
        wins[k] = { ...wins[k], x: x + (cw - w) / 2, y: area.y0 + r * (rowH + ROW_GAP) + (r ? 0 : rowH - h), w, h };
      });
    }
    x += cw + GAP;
  });
  for (const k of keep) wins[k] = { ...wins[k], min: false, parked: false, zoomed: k === solo };
  // what did not fit waits in the dock
  for (const k of cand) {
    if (!keep.includes(k) && !wins[k].min) wins[k] = { ...wins[k], min: true, parked: true, zoomed: false };
  }
  // a parked window that fits again comes back with a little entrance
  let n = s.n;
  for (const k of keep) {
    if (s.wins[k].min && s.wins[k].parked) { n += 1; wins[k] = { ...wins[k], anim: { type: 'unpark', n } }; }
  }
  let top = s.top;
  if (!top || !keep.includes(top)) top = [...keep].sort((a, b) => wins[b].z - wins[a].z)[0] || null;
  return { ...s, wins, top, solo, n };
}

// ---------- reducer ----------
export function initialState() {
  const theme = store.get('mx-theme');
  const scene = store.get('mx-env');
  return {
    wins: {}, order: [], z: 30, top: null, n: 0, solo: null, phone: false,
    theme: theme === 'light' || theme === 'dark' ? theme : null,
    scene: ['day', 'dusk', 'night', 'snow'].includes(scene) ? scene : 'dusk',
    imm: 0, trash: TRASH0, secrets: false,
    overlay: null, homeTab: 'apps', menu: null, toast: null,
    watching: false, saver: false,
  };
}

function rawReducer(s, a) {
  switch (a.type) {
    case 'open': {
      const K = KINDS[a.kind];
      if (!K) return s;
      const ex = s.wins[a.kind];
      const z = s.z + 1, n = s.n + 1;
      // opening something new always leaves solo mode, so the new window can be seen
      const solo = s.solo === a.kind ? s.solo : null;
      if (ex && !ex.closing) {
        const changed = Object.keys(a.opts).some((k) => ex.opts[k] !== a.opts[k]);
        const type = ex.min ? 'restore' : changed ? 'swap' : 'bump';
        const win = { ...ex, opts: { ...ex.opts, ...a.opts }, min: false, parked: false, rest: false, z, anim: { type, n, origin: a.origin } };
        return { ...s, z, n, solo, top: a.kind, overlay: null, menu: null, wins: { ...s.wins, [a.kind]: win } };
      }
      const win = { kind: a.kind, opts: { ...a.opts }, orn: !!K.orn && !s.phone, w: K.w, h: K.h, x: 0, y: 0, z, min: false, parked: false, zoomed: false, rest: !!a.rest };
      win.anim = { type: a.rest ? 'rise' : 'grow', n, origin: a.origin, delay: a.delay };
      // a new window joins the row right after the one in use
      const order = s.order.filter((k) => k !== a.kind);
      const at = s.top ? order.indexOf(s.top) + 1 : order.length;
      order.splice(at > 0 ? at : order.length, 0, a.kind);
      return { ...s, z, n, solo, order, top: a.kind, overlay: null, menu: null, wins: { ...s.wins, [a.kind]: win } };
    }
    case 'focus': {
      const w = s.wins[a.kind];
      if (!w || w.min || w.closing) return s;
      if (s.top === a.kind && !w.rest) return s;
      const z = s.top === a.kind ? w.z : s.z + 1;
      return { ...s, z: Math.max(s.z, z), top: a.kind, wins: { ...s.wins, [a.kind]: { ...w, z, rest: false } } };
    }
    case 'close': {
      const w = s.wins[a.kind];
      if (!w || w.closing) return s;
      return { ...s, solo: s.solo === a.kind ? null : s.solo, top: s.top === a.kind ? null : s.top, wins: { ...s.wins, [a.kind]: { ...w, closing: true } } };
    }
    case 'remove': {
      if (!s.wins[a.kind] || !s.wins[a.kind].closing) return s;
      const wins = { ...s.wins };
      delete wins[a.kind];
      return { ...s, wins, order: s.order.filter((k) => k !== a.kind) };
    }
    case 'minimize': {
      const w = s.wins[a.kind];
      if (!w) return s;
      return { ...s, solo: s.solo === a.kind ? null : s.solo, top: s.top === a.kind ? null : s.top, wins: { ...s.wins, [a.kind]: { ...w, min: true, parked: false } } };
    }
    case 'zoom': {
      const w = s.wins[a.kind];
      if (!w || w.min) return s;
      return { ...s, solo: s.solo === a.kind ? null : a.kind, top: a.kind };
    }
    case 'reorder': {
      // move a window to a new place among the ones on screen
      const shown = s.order.filter((k) => s.wins[k] && !s.wins[k].min && !s.wins[k].closing);
      const from = shown.indexOf(a.kind);
      if (from < 0) return s;
      const to = clamp(a.index, 0, shown.length - 1);
      if (to === from) return s;
      shown.splice(from, 1);
      shown.splice(to, 0, a.kind);
      return { ...s, order: [...shown, ...s.order.filter((k) => !shown.includes(k))] };
    }
    case 'opts': {
      const w = s.wins[a.kind];
      if (!w) return s;
      const anim = a.swap ? { type: 'swap', n: s.n + 1 } : w.anim;
      return { ...s, n: s.n + 1, wins: { ...s.wins, [a.kind]: { ...w, opts: { ...w.opts, ...a.opts }, anim } } };
    }
    case 'layout':
      return { ...s, phone: !!a.phone };
    case 'reset':
      return { ...s, wins: {}, order: [], top: null, solo: null, overlay: null, menu: null };
    case 'set':
      return { ...s, ...a.patch };
    case 'toast':
      return { ...s, toast: { msg: a.msg, ms: a.ms || 2600, n: s.n + 1 }, n: s.n + 1 };
    default:
      return s;
  }
}

// actions that change which windows are on screen, or the screen itself, re-run the arrangement
const ARRANGES = new Set(['open', 'close', 'remove', 'minimize', 'zoom', 'reorder', 'layout', 'resize']);
export function reducer(s, a) {
  const next = rawReducer(s, a);
  return ARRANGES.has(a.type) && next !== s || a.type === 'resize' ? arrange(next) : next;
}

// ---------- context ----------
export const OSContext = createContext(null);
export const useOS = () => useContext(OSContext);
