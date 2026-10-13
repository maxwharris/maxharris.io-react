// The world behind the windows: a circuit board, generated and drawn live on a canvas. Chips,
// passives and connectors are placed first, then buses of traces are routed out of their pins on
// a grid with 45-degree bends, ending in vias. The board itself is drawn once into an offscreen
// layer; each frame only adds what moves: signals running along the traces, and the traces under
// the pointer lighting up like a probe touched them. Seeded, so the same board comes back.

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rng = (s) => () => (s = (s * 16807) % 2147483647) / 2147483647;

export const SCENES = ['neon', 'classic', 'ink', 'relief', 'gold'];
// which glass suits each board when the visitor has not picked one
export const SCENE_DARK = { neon: true, classic: true, ink: false, relief: false, gold: false };

const LOOKS = {
  neon: {
    bg: ['#020708', '#041114', '#020607'], fiber: 0,
    pour: 'rgba(18,110,108,.2)', clear: '#03090b',
    trace: 'rgba(38,214,200,.62)', traceGlow: 'rgba(60,255,240,.10)', traceW: 1.5,
    pad: '#3ff2e2', padDark: '#0a2a2b', via: '#7ffcf2', hole: '#020607',
    chip: '#06161a', chipEdge: 'rgba(63,242,226,.75)', chipMark: 'rgba(63,242,226,.5)',
    silk: 'rgba(110,255,240,.42)', finger: '#3ff2e2',
    signal: [150, 255, 246], probe: 'rgba(170,255,248,.95)', flash: [150, 255, 246],
  },
  classic: {
    bg: ['#1d6236', '#18552f', '#134726'], fiber: 0.05,
    pour: 'rgba(52,140,80,.35)', clear: '#185530',
    trace: 'rgba(58,150,88,.95)', traceGlow: null, traceW: 2.2,
    pad: '#d7dad3', padDark: '#8c918a', via: '#cfd3cc', hole: '#0c2415',
    chip: '#15181a', chipEdge: '#2a2f33', chipMark: '#9aa0a5',
    silk: 'rgba(246,246,240,.92)', finger: '#d9b65a',
    signal: [226, 255, 196], probe: 'rgba(230,255,214,.95)', flash: [236, 255, 214],
  },
  ink: {
    bg: ['#fbfbf9', '#f7f7f4', '#f2f2ee'], fiber: 0,
    pour: null, clear: '#f8f8f5', hollow: true,
    trace: '#161616', traceGlow: null, traceW: 1.7,
    pad: '#161616', padDark: '#161616', via: '#161616', hole: '#f8f8f5',
    chip: '#161616', chipEdge: '#161616', chipMark: '#f8f8f5',
    silk: 'rgba(20,20,20,.65)', finger: '#161616',
    signal: [255, 77, 46], probe: '#ff4d2e', flash: [255, 77, 46],
  },
  relief: {
    bg: ['#f2f2f0', '#ebebe8', '#e3e3df'], fiber: 0, emboss: true,
    pour: null, clear: '#ebebe8',
    trace: '#ededea', traceGlow: null, traceW: 3.2,
    pad: '#efefec', padDark: '#d9d9d5', via: '#efefec', hole: '#dcdcd8',
    chip: '#e6e6e2', chipEdge: '#d2d2ce', chipMark: '#bdbdb8',
    silk: 'rgba(150,150,145,.7)', finger: '#efefec',
    signal: [70, 150, 255], probe: 'rgba(60,140,255,.85)', flash: [70, 150, 255],
  },
  gold: {
    bg: ['#f3f4ef', '#ecede6', '#e3e5dc'], fiber: 0,
    pour: 'rgba(214,216,206,.55)', clear: '#eceee7',
    trace: 'rgba(196,199,186,.95)', traceGlow: null, traceW: 2.2,
    pad: '#e2bf55', padDark: '#b88d2c', via: '#d6b04a', hole: '#a3a593',
    chip: '#2a2c2e', chipEdge: '#c9cbbe', chipMark: '#8e9184',
    silk: 'rgba(120,124,110,.75)', finger: '#e0bb4f',
    signal: [255, 196, 64], probe: 'rgba(214,160,40,.95)', flash: [255, 205, 90],
  },
};

// 8 directions, starting east and turning clockwise
const DX = [1, 1, 0, -1, -1, -1, 0, 1];
const DY = [0, 1, 1, 1, 0, -1, -1, -1];

const LABELS = ['DO NOT LICK', 'MADE IN NYC', 'maxOS 26 REV C', 'MAX HARRIS 2026', 'HELLO', 'NO USER SERVICEABLE PARTS', 'v26.10', '© maxharris.io'];

export function createScene(canvas, { reduced = () => false, env: env0 = 'neon' } = {}) {
  const ctx = canvas.getContext('2d', { alpha: false });
  let env = LOOKS[env0] ? env0 : 'neon';
  let W = 0, H = 0, dpr = 1, U = 1, g = 10;
  let board = null; // geometry, independent of the look
  let layer = null, prevLayer = null, fade0 = 0; // the drawn board, and the one it is fading from
  let cellTrace = null, cols = 0, rows = 0;
  const pulses = [], flashes = [];
  let px = -1, py = -1, probeOn = false, lastT = 0, lastDraw = 0, loopOn = false, raf = 0, t = 0, surgeUntil = 0;
  let maxDpr = 2, gap = 32, cost = 0, pace = 0, prevNow = 0, drawn = 0, dprWatch = null, resizeT = 0;

  // ---------- generation ----------
  function generate() {
    const r = rng(20261013);
    U = clamp(Math.min(W, H) / 900, 0.75, 1.3);
    g = Math.round(10 * U);
    cols = Math.ceil(W / g) + 2;
    rows = Math.ceil(H / g) + 2;
    const occ = new Uint8Array(cols * rows);
    cellTrace = new Int16Array(cols * rows).fill(-1);
    let filled = 0;
    const free = (c, rr) => c >= 0 && rr >= 0 && c < cols && rr < rows && !occ[rr * cols + c];
    const mark = (c, rr, v = 1) => {
      if (c < 0 || rr < 0 || c >= cols || rr >= rows) return;
      const i = rr * cols + c;
      if (occ[i] !== v) filled += v ? 1 : -1;
      occ[i] = v;
    };
    const X = (c) => c * g - g / 2, Y = (rr) => rr * g - g / 2;
    const rectFree = (c0, r0, w, h, m) => {
      for (let rr = r0 - m; rr < r0 + h + m; rr++) for (let c = c0 - m; c < c0 + w + m; c++) if (!free(c, rr)) return false;
      return true;
    };
    const markRect = (c0, r0, w, h, m) => { for (let rr = r0 - m; rr < r0 + h + m; rr++) for (let c = c0 - m; c < c0 + w + m; c++) mark(c, rr); };

    const b = { chips: [], passives: [], holes: [], texts: [], traces: [], vias: [], pads: [], zones: [], fingers: [], leds: [] };
    const starts = []; // bus starts: { cells: [[c,r]...], dir }

    // mounting holes in the corners (a phone's status bar sits where the top two would go)
    const narrow = W < 760;
    for (const [c, rr] of narrow ? [[4, rows - 5], [cols - 5, rows - 5]] : [[4, 6], [cols - 5, 6], [4, rows - 5], [cols - 5, rows - 5]]) {
      b.holes.push({ x: X(c), y: Y(rr), r: 2.2 * g });
      markRect(c - 3, rr - 3, 7, 7, 0);
    }
    // an edge connector along the left edge
    if (!narrow) {
      const n = Math.floor(rows * 0.34), r0 = Math.floor(rows * 0.3);
      for (let i = 0; i < n; i += 2) {
        b.fingers.push({ x: X(0) - g * 0.2, y: Y(r0 + i) - g * 0.35, w: g * 2.6, h: g * 0.7 + g * 0.6 });
        mark(0, r0 + i); mark(1, r0 + i); mark(2, r0 + i); mark(0, r0 + i + 1); mark(1, r0 + i + 1);
        starts.push({ cells: [[3, r0 + i]], dir: 0, len: 6 + Math.floor(r() * 30) });
      }
    }

    // chips: a big processor first, then a mix of quad packages, ball grids and two-row packages
    const area = cols * rows;
    const want = Math.round(area / 1400);
    const kinds = ['qfp', 'qfp', 'bga', 'soic', 'soic', 'qfp'];
    let made = 0, tries = 0, uN = 1;
    const place = (kind, size, at) => {
      const w = kind === 'soic' ? size[0] : size, h = kind === 'soic' ? size[1] : size;
      for (let k = 0; k < (at ? 1 : 30); k++) {
        const c0 = at ? at[0] : 6 + Math.floor(r() * (cols - w - 12)), r0 = at ? at[1] : 7 + Math.floor(r() * (rows - h - 14));
        if (!rectFree(c0, r0, w, h, 4)) continue;
        markRect(c0, r0, w, h, 2);
        const chip = { kind, c0, r0, w, h, x: X(c0) - g / 2, y: Y(r0) - g / 2, pw: w * g, ph: h * g, label: `U${uN++}` };
        b.chips.push(chip);
        // pins become buses leaving each side
        const side = (cells, dir) => {
          let i = 0;
          while (i < cells.length) {
            const n = 2 + Math.floor(r() * 6), grp = cells.slice(i, i + n);
            if (r() < 0.8) starts.push({ cells: grp, dir, len: 12 + Math.floor(r() * 70) });
            i += n + Math.floor(r() * 2);
          }
        };
        if (kind === 'qfp' || kind === 'bga') {
          const top = [], bot = [], lft = [], rgt = [];
          for (let c = c0 + 1; c < c0 + w - 1; c++) { top.push([c, r0 - 3]); bot.push([c, r0 + h + 2]); }
          for (let rr = r0 + 1; rr < r0 + h - 1; rr++) { lft.push([c0 - 3, rr]); rgt.push([c0 + w + 2, rr]); }
          side(top, 6); side(bot, 2); side(lft, 4); side(rgt, 0);
        } else {
          const top = [], bot = [];
          for (let c = c0; c < c0 + w; c++) { top.push([c, r0 - 3]); bot.push([c, r0 + h + 2]); }
          side(top, 6); side(bot, 2);
        }
        return chip;
      }
      return null;
    };
    const hero = place('bga', 16, [Math.max(8, Math.floor(cols * 0.06)), Math.max(8, rows - 26)]) || place('qfp', 16);
    if (hero) hero.label = 'maxOS';
    while (made < want && tries < want * 6) {
      tries += 1;
      const kind = kinds[Math.floor(r() * kinds.length)];
      const size = kind === 'soic' ? [5 + Math.floor(r() * 6), 3] : 7 + Math.floor(r() * 7);
      if (place(kind, size)) made += 1;
    }

    // passives (resistors, capacitors) and a few LEDs
    const nPass = Math.round(area / 520);
    let rN = 1, cN = 1, lN = 1;
    for (let i = 0, k = 0; i < nPass && k < nPass * 5; k++) {
      const horiz = r() < 0.5, c0 = 4 + Math.floor(r() * (cols - 8)), r0 = 4 + Math.floor(r() * (rows - 8));
      const w = horiz ? 3 : 1, h = horiz ? 1 : 3;
      if (!rectFree(c0, r0, w, h, 2)) continue;
      markRect(c0, r0, w, h, 1);
      const isLed = r() < 0.08;
      const label = isLed ? `LED${lN++}` : r() < 0.55 ? `R${rN++}` : `C${cN++}`;
      const p = { horiz, x: X(c0), y: Y(r0), label, led: isLed };
      (isLed ? b.leds : b.passives).push(p);
      i += 1;
      if (horiz) {
        if (r() < 0.75) starts.push({ cells: [[c0 - 2, r0]], dir: 4, len: 5 + Math.floor(r() * 30) });
        if (r() < 0.75) starts.push({ cells: [[c0 + 4, r0]], dir: 0, len: 5 + Math.floor(r() * 30) });
      } else {
        if (r() < 0.75) starts.push({ cells: [[c0, r0 - 2]], dir: 6, len: 5 + Math.floor(r() * 30) });
        if (r() < 0.75) starts.push({ cells: [[c0, r0 + 4]], dir: 2, len: 5 + Math.floor(r() * 30) });
      }
    }

    // silkscreen notes
    for (let i = 0, k = 0; i < Math.max(3, Math.round(area / 5000)) && k < 80; k++) {
      const text = LABELS[i % LABELS.length], wc = Math.ceil((text.length * 0.62 * 1.1 * g) / g) + 1;
      const c0 = 5 + Math.floor(r() * (cols - wc - 10)), r0 = 5 + Math.floor(r() * (rows - 10));
      if (!rectFree(c0, r0, wc, 2, 1)) continue;
      markRect(c0, r0, wc, 2, 0);
      b.texts.push({ x: X(c0) - g / 2, y: Y(r0) + g * 0.35, text, size: 1.1 * g });
      i += 1;
    }

    // route buses: every trace in a bus follows one shared schedule of 45-degree turns
    const unlink = [];
    const route = (st, fromPin) => {
      const len = st.len, schedule = [];
      let d = st.dir, run = 0;
      for (let step = 0; step < len; step++) {
        run += 1;
        if (run > 3 && r() < 0.16) { d = (d + (r() < 0.5 ? 1 : 7)) % 8; run = 0; }
        schedule.push(d);
      }
      for (const [c0, r0] of st.cells) {
        if (!free(c0, r0)) continue;
        const cells = [[c0, r0]];
        mark(c0, r0);
        let c = c0, rr = r0;
        for (const dd of schedule) {
          const nc = c + DX[dd], nr = rr + DY[dd];
          if (!free(nc, nr)) break;
          if (dd % 2 === 1 && !free(c + DX[dd], rr) && !free(c, rr + DY[dd])) break; // would cross a diagonal
          c = nc; rr = nr;
          mark(c, rr);
          cells.push([c, rr]);
        }
        if (cells.length < (fromPin ? 3 : 6)) { unlink.push(cells); continue; }
        // simplify to corners
        const pts = [[X(cells[0][0]), Y(cells[0][1])]];
        for (let i = 1; i < cells.length - 1; i++) {
          const a = cells[i - 1], m = cells[i], z = cells[i + 1];
          if (m[0] - a[0] !== z[0] - m[0] || m[1] - a[1] !== z[1] - m[1]) pts.push([X(m[0]), Y(m[1])]);
        }
        const last = cells[cells.length - 1];
        pts.push([X(last[0]), Y(last[1])]);
        const id = b.traces.length;
        for (const [cc, r1] of cells) if (cc >= 0 && r1 >= 0 && cc < cols && r1 < rows) cellTrace[r1 * cols + cc] = id;
        let total = 0;
        const acc = [0];
        for (let i = 1; i < pts.length; i++) { total += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); acc.push(total); }
        b.traces.push({ pts, acc, total });
        b.vias.push({ x: pts[pts.length - 1][0], y: pts[pts.length - 1][1] });
        (fromPin ? b.pads : b.vias).push({ x: pts[0][0], y: pts[0][1] });
      }
    };
    for (const st of starts) route(st, true);
    // then fill the open board with free-running buses, the way real boards look between parts
    const target = cols * rows * 0.62;
    for (let k = 0; k < 5000 && filled < target; k++) {
      const c0 = 2 + Math.floor(r() * (cols - 4)), r0 = 2 + Math.floor(r() * (rows - 4));
      if (!rectFree(c0 - 1, r0 - 1, 3, 3, 0)) continue;
      const dir = Math.floor(r() * 4) * 2, pd = (dir + 2) % 8, n = 1 + Math.floor(r() * 7);
      const cells = [];
      for (let i = 0; i < n; i++) { const cc = c0 + DX[pd] * i, r1 = r0 + DY[pd] * i; if (!free(cc, r1)) break; cells.push([cc, r1]); }
      route({ cells, dir, len: 14 + Math.floor(r() * 80) }, false);
    }
    for (const cells of unlink) for (const [c, rr] of cells) mark(c, rr, 0);

    // copper pours: a few large 45-degree-cornered zones the traces are cut out of
    for (let i = 0; i < Math.round(area / 4000) + 3; i++) {
      const w = (14 + r() * 30) * g, h = (10 + r() * 22) * g, x = r() * (W - w), y = 40 + r() * (H - h - 40), k = Math.min(w, h) * 0.3;
      b.zones.push([[x + k, y], [x + w, y], [x + w, y + h - k], [x + w - k, y + h], [x, y + h], [x, y + k]]);
    }
    return b;
  }

  // ---------- drawing the board once ----------
  function paint(look) {
    const L = LOOKS[look], b = board;
    const cv = document.createElement('canvas');
    cv.width = Math.round(W * dpr);
    cv.height = Math.round(H * dpr);
    const c = cv.getContext('2d', { alpha: false });
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    const bg = c.createLinearGradient(0, 0, W * 0.4, H);
    bg.addColorStop(0, L.bg[0]); bg.addColorStop(0.55, L.bg[1]); bg.addColorStop(1, L.bg[2]);
    c.fillStyle = bg;
    c.fillRect(0, 0, W, H);
    if (L.fiber) {
      // the glass weave you can see through a solder mask
      const r = rng(7);
      c.strokeStyle = `rgba(0,0,0,${L.fiber})`;
      c.lineWidth = 1;
      c.beginPath();
      for (let y = 0; y < H; y += 6) { c.moveTo(0, y + r() * 2); c.lineTo(W, y + r() * 2); }
      c.stroke();
    }
    const path = (pts) => { c.beginPath(); c.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1]); };
    c.lineJoin = 'round';
    c.lineCap = 'round';
    // pours, with the traces knocked out of them
    if (L.pour) {
      c.fillStyle = L.pour;
      for (const z of b.zones) { path(z); c.closePath(); c.fill(); }
      c.strokeStyle = L.clear;
      c.lineWidth = L.traceW + g * 0.7;
      for (const tr of b.traces) { path(tr.pts); c.stroke(); }
    }
    // traces
    if (L.traceGlow) {
      c.strokeStyle = L.traceGlow;
      c.lineWidth = L.traceW + 5;
      for (const tr of b.traces) { path(tr.pts); c.stroke(); }
    }
    const tw = L.traceW * Math.max(0.8, U);
    if (L.emboss) {
      c.lineWidth = tw;
      c.save(); c.translate(1.3, 1.6); c.strokeStyle = 'rgba(0,0,0,.2)';
      for (const tr of b.traces) { path(tr.pts); c.stroke(); }
      c.restore();
      c.save(); c.translate(-1, -1.1); c.strokeStyle = 'rgba(255,255,255,.95)';
      for (const tr of b.traces) { path(tr.pts); c.stroke(); }
      c.restore();
    }
    c.strokeStyle = L.trace;
    c.lineWidth = tw;
    for (const tr of b.traces) { path(tr.pts); c.stroke(); }
    const dot = (x, y, rad, fill, hole) => {
      if (L.emboss) {
        c.fillStyle = 'rgba(0,0,0,.2)'; c.beginPath(); c.arc(x + 1.3, y + 1.6, rad, 0, 7); c.fill();
        c.fillStyle = 'rgba(255,255,255,.95)'; c.beginPath(); c.arc(x - 1, y - 1.1, rad, 0, 7); c.fill();
      }
      if (L.hollow) {
        c.fillStyle = L.hole; c.beginPath(); c.arc(x, y, rad, 0, 7); c.fill();
        c.strokeStyle = fill; c.lineWidth = tw; c.stroke();
        return;
      }
      c.fillStyle = fill; c.beginPath(); c.arc(x, y, rad, 0, 7); c.fill();
      if (hole) { c.fillStyle = L.hole; c.beginPath(); c.arc(x, y, hole, 0, 7); c.fill(); }
    };
    // pads where traces leave pins, vias where they end
    if (L.hollow || L.emboss) for (const p of b.pads) dot(p.x, p.y, g * 0.38, L.pad, 0);
    else { c.fillStyle = L.pad; for (const p of b.pads) c.fillRect(p.x - g * 0.32, p.y - g * 0.32, g * 0.64, g * 0.64); }
    for (const v of b.vias) dot(v.x, v.y, g * 0.42, L.via, L.emboss ? 0 : g * 0.17);
    // edge connector fingers
    for (const f of b.fingers) {
      c.fillStyle = L.finger;
      c.fillRect(f.x, f.y, f.w, f.h);
    }
    // mounting holes
    for (const h of b.holes) dot(h.x, h.y, h.r, L.pad, h.r * 0.62);
    // passives: two pads, a body, a label
    c.font = `600 ${Math.round(g * 0.95)}px "DM Mono", ui-monospace, monospace`;
    c.textBaseline = 'middle';
    for (const p of [...b.passives, ...b.leds]) {
      const [w, h] = p.horiz ? [3 * g, g] : [g, 3 * g];
      const x = p.x - g / 2, y = p.y - g / 2;
      c.fillStyle = L.pad;
      if (p.horiz) { c.fillRect(x, y + g * 0.1, g * 0.85, g * 0.8); c.fillRect(x + w - g * 0.85, y + g * 0.1, g * 0.85, g * 0.8); }
      else { c.fillRect(x + g * 0.1, y, g * 0.8, g * 0.85); c.fillRect(x + g * 0.1, y + h - g * 0.85, g * 0.8, g * 0.85); }
      c.strokeStyle = L.silk;
      c.lineWidth = 1;
      c.strokeRect(x - g * 0.25, y - g * 0.25, w + g * 0.5, h + g * 0.5);
      if (p.led) { c.beginPath(); c.moveTo(x + w / 2 - g * 0.3, y + h / 2); c.lineTo(x + w / 2 + g * 0.3, y + h / 2 - g * 0.3); c.lineTo(x + w / 2 + g * 0.3, y + h / 2 + g * 0.3); c.closePath(); c.stroke(); }
      c.fillStyle = L.silk;
      c.fillText(p.label, x + (p.horiz ? 0 : w + g * 0.5), y + (p.horiz ? -g * 0.95 : h / 2));
    }
    // chips
    for (const ch of b.chips) {
      const { x, y, pw, ph } = ch;
      // pins
      c.fillStyle = L.pad;
      if (ch.kind === 'soic') {
        for (let i = 0; i < ch.w; i++) {
          c.fillRect(x + i * g + g * 0.22, y - g * 1.5, g * 0.56, g * 1.35);
          c.fillRect(x + i * g + g * 0.22, y + ph + g * 0.15, g * 0.56, g * 1.35);
        }
      } else {
        for (let i = 1; i < ch.w - 1; i++) {
          c.fillRect(x + i * g + g * 0.25, y - g * 1.4, g * 0.5, g * 1.25);
          c.fillRect(x + i * g + g * 0.25, y + ph + g * 0.15, g * 0.5, g * 1.25);
        }
        for (let i = 1; i < ch.h - 1; i++) {
          c.fillRect(x - g * 1.4, y + i * g + g * 0.25, g * 1.25, g * 0.5);
          c.fillRect(x + pw + g * 0.15, y + i * g + g * 0.25, g * 1.25, g * 0.5);
        }
      }
      // body
      c.fillStyle = L.chip;
      c.fillRect(x, y, pw, ph);
      c.strokeStyle = L.chipEdge;
      c.lineWidth = 1.2;
      c.strokeRect(x + 0.5, y + 0.5, pw - 1, ph - 1);
      if (ch.kind === 'bga') {
        // ball grid, the way it looks before the chip goes on
        c.fillStyle = L.pad;
        const n = ch.w - 2;
        for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { c.beginPath(); c.arc(x + (i + 1.5) * g, y + (j + 1.5) * g, g * 0.26, 0, 7); c.fill(); }
        c.strokeStyle = L.chipMark;
        c.strokeRect(x + g * 0.6, y + g * 0.6, pw - g * 1.2, ph - g * 1.2);
      } else {
        c.fillStyle = L.chipMark;
        c.beginPath(); c.arc(x + g * 1.1, y + g * 1.1, g * 0.35, 0, 7); c.fill();
      }
      c.fillStyle = L.chipMark;
      c.font = `600 ${Math.round(g * (ch.label === 'maxOS' ? 1.6 : 1))}px "DM Mono", ui-monospace, monospace`;
      if (ch.kind !== 'bga') c.fillText(ch.label, x + g * 1.8, y + ph / 2);
      c.fillStyle = L.silk;
      c.font = `600 ${Math.round(g * (ch.label === 'maxOS' ? 1.3 : 0.95))}px "DM Mono", ui-monospace, monospace`;
      c.fillText(ch.label === 'maxOS' ? 'U1  maxOS 26 · REV C' : ch.label, x, y - g * 2.6);
    }
    // silkscreen notes
    c.fillStyle = L.silk;
    for (const tx of b.texts) { c.font = `600 ${Math.round(tx.size)}px "DM Mono", ui-monospace, monospace`; c.fillText(tx.text, tx.x, tx.y); }
    return cv;
  }

  function rebuild() {
    board = generate();
    layer = paint(env);
    prevLayer = null;
    pulses.length = 0;
  }

  function resize() {
    W = window.innerWidth;
    H = window.innerHeight;
    // never more than ~10 million backing pixels (a 5K display at 2x would be 14.7M)
    dpr = Math.min(window.devicePixelRatio || 1, maxDpr, Math.sqrt(10e6 / (W * H)));
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    rebuild();
    draw(performance.now());
  }
  const onResize = () => { clearTimeout(resizeT); resizeT = setTimeout(resize, 120); };

  // ---------- what moves ----------
  function at(tr, d) {
    const a = tr.acc;
    let i = 1;
    while (i < a.length - 1 && a[i] < d) i += 1;
    const seg = a[i] - a[i - 1] || 1, k = clamp((d - a[i - 1]) / seg, 0, 1);
    const p = tr.pts[i - 1], q = tr.pts[i];
    return [p[0] + (q[0] - p[0]) * k, p[1] + (q[1] - p[1]) * k];
  }
  // ambient signals drift slowly so they stay in the background; a double-click burst or a
  // surge passes its own, much faster speed
  const DRIFT = 0.15;
  function spawn(id, speed) {
    const tr = board.traces[id];
    if (!tr || tr.total < g * 4) return;
    pulses.push({ id, d: 0, v: speed || (140 + Math.random() * 180) * U * DRIFT, tail: (26 + Math.random() * 40) * U });
  }
  function traceNear(x, y, radius) {
    const ids = new Set(), rc = Math.ceil(radius / g), c0 = Math.round((x + g / 2) / g), r0 = Math.round((y + g / 2) / g);
    for (let rr = r0 - rc; rr <= r0 + rc; rr++) {
      for (let c = c0 - rc; c <= c0 + rc; c++) {
        if (c < 0 || rr < 0 || c >= cols || rr >= rows) continue;
        const id = cellTrace[rr * cols + c];
        if (id >= 0 && (c - c0) ** 2 + (rr - r0) ** 2 <= rc * rc) ids.add(id);
      }
    }
    return [...ids];
  }

  function draw(now) {
    const dt = Math.min(0.06, (now - lastT) / 1000 || 0);
    lastT = now;
    t = now / 1000;
    const L = LOOKS[env];
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.drawImage(layer, 0, 0);
    if (prevLayer) {
      const k = clamp((now - fade0) / 700, 0, 1);
      if (k >= 1) prevLayer = null;
      else { ctx.globalAlpha = 1 - k; ctx.drawImage(prevLayer, 0, 0); ctx.globalAlpha = 1; }
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const traces = board.traces;
    if (!traces.length) return;
    const surging = t < surgeUntil;

    // keep signals flowing
    if (!reduced()) {
      const target = Math.round((surging ? 0.6 : 0.09) * traces.length);
      for (let i = 0; pulses.length < target && i < 6; i++) spawn(Math.floor(Math.random() * traces.length), surging ? (300 + Math.random() * 300) * U : 0);
    }
    const [sr, sg, sb] = L.signal;
    ctx.lineCap = 'round';
    for (let i = pulses.length - 1; i >= 0; i--) {
      const p = pulses[i], tr = traces[p.id];
      p.d += p.v * dt;
      if (p.d - p.tail > tr.total) { pulses.splice(i, 1); const e = tr.pts[tr.pts.length - 1]; flashes.push({ x: e[0], y: e[1], t0: t }); continue; }
      const head = Math.min(p.d, tr.total), steps = 6;
      for (let s = 0; s < steps; s++) {
        const d0 = head - (p.tail * s) / steps, d1 = head - (p.tail * (s + 1)) / steps;
        if (d0 <= 0) break;
        const a = at(tr, Math.max(0, d1)), b = at(tr, d0);
        ctx.strokeStyle = `rgba(${sr},${sg},${sb},${((1 - s / steps) * 0.9).toFixed(3)})`;
        ctx.lineWidth = (L.traceW + 1.6) * Math.max(0.8, U);
        ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
      }
      const hp = at(tr, head);
      ctx.fillStyle = `rgba(${sr},${sg},${sb},.95)`;
      ctx.beginPath(); ctx.arc(hp[0], hp[1], (L.traceW + 1.4) * Math.max(0.8, U), 0, 7); ctx.fill();
    }
    // vias blink when a signal arrives
    const [fr, fg, fb] = L.flash;
    for (let i = flashes.length - 1; i >= 0; i--) {
      const f = flashes[i], age = t - f.t0;
      if (age > 0.6) { flashes.splice(i, 1); continue; }
      ctx.strokeStyle = `rgba(${fr},${fg},${fb},${(0.8 * (1 - age / 0.6)).toFixed(3)})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(f.x, f.y, g * (0.5 + age * 2.2), 0, 7); ctx.stroke();
    }
    // the probe: traces under the pointer light up
    if (probeOn && px >= 0) {
      ctx.strokeStyle = L.probe;
      ctx.lineWidth = (L.traceW + 0.8) * Math.max(0.8, U);
      ctx.lineJoin = 'round';
      for (const id of traceNear(px, py, 46 * U).slice(0, 14)) {
        const pts = traces[id].pts;
        ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
        ctx.stroke();
      }
    }
  }

  function frame(now) {
    if (!loopOn) return;
    raf = requestAnimationFrame(frame);
    const step = Math.min(100, now - (prevNow || now));
    prevNow = now;
    if (document.hidden) { pace = 0; return; }
    pace = pace ? pace * 0.97 + step * 0.03 : step;
    if (now - lastDraw < gap) return;
    lastDraw = now;
    const t0 = performance.now();
    draw(now);
    cost = cost ? cost * 0.9 + (performance.now() - t0) * 0.1 : performance.now() - t0;
    if (++drawn % 90 === 0 && (cost > 14 || pace > 26)) {
      if (dpr > 1) { maxDpr = 1; resize(); } else gap = Math.min(80, gap + 16);
      cost = 0;
      pace = 0;
    }
  }
  function kick(ms = 0) {
    // with reduced motion, animate briefly after an interaction, then hold still
    if (!reduced()) return;
    const end = performance.now() + ms;
    const tick = (now) => { draw(now); if (now < end || prevLayer) requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  }
  // moving the window to a screen with a different pixel density fires no resize event
  function watchDpr() {
    const mq = window.matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`);
    const onChange = () => { resize(); watchDpr(); };
    mq.addEventListener('change', onChange, { once: true });
    dprWatch = () => mq.removeEventListener('change', onChange);
  }

  return {
    start() {
      resize();
      window.addEventListener('resize', onResize);
      watchDpr();
      // the silkscreen font may arrive after the first paint
      if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { if (board) { layer = paint(env); draw(performance.now()); } });
      if (!reduced()) { loopOn = true; raf = requestAnimationFrame(frame); }
    },
    stop() {
      loopOn = false;
      cancelAnimationFrame(raf);
      clearTimeout(resizeT);
      window.removeEventListener('resize', onResize);
      if (dprWatch) dprWatch();
    },
    set(name) {
      if (!LOOKS[name] || name === env) return;
      env = name;
      prevLayer = reduced() ? null : layer;
      fade0 = performance.now();
      layer = paint(env);
      if (reduced()) draw(performance.now());
    },
    get env() { return env; },
    look(nx, ny) {
      px = (nx + 0.5) * W;
      py = (ny + 0.5) * H;
      probeOn = true;
      if (reduced()) kick(0);
    },
    poke(x, y) {
      for (const id of traceNear(x, y, 90 * U).slice(0, 18)) spawn(id, (260 + Math.random() * 220) * U);
      flashes.push({ x, y, t0: performance.now() / 1000 });
      kick(1500);
    },
    star() { for (let i = 0; i < 12; i++) spawn(Math.floor(Math.random() * board.traces.length)); kick(1200); },
    fireworks() { surgeUntil = performance.now() / 1000 + 4; },
    redraw() { draw(performance.now()); },
  };
}
