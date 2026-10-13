// The world behind the windows: a mountain lake drawn live on a canvas. The near shore is plain
// nature (pines, water, fireflies, birds); the far range is drawn the way a terrain scan plots
// it, as stacked elevation ridgelines with a slow scan passing through them. Everything is
// seeded, so the same mountains come back on every visit.

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const C = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
const rng = (s) => () => (s = (s * 16807) % 2147483647) / 2147483647;
const mix = (a, b, k) => {
  const o = {};
  for (const f in a) o[f] = Array.isArray(a[f]) ? a[f].map((v, i) => v + (b[f][i] - v) * k) : a[f] + (b[f] - a[f]) * k;
  return o;
};

export const SCENES = ['day', 'dusk', 'night', 'snow'];

const RAW = {
  day: {
    s0: '#3f7fb8', s1: '#6ea8d6', s2: '#a9d0e8', s3: '#e4eff4',
    sunX: 0.2, sunY: 0.78, sunR: 22, sunA: 1, sunC: '#fffaf0', glowC: '#fff4d6', glowA: 0.45,
    moonX: 0.82, moonY: 0.8, moonA: 0, stars: 0, aurora: 0, auroraC: '#5dffb0', auroraC2: '#5ab8ff',
    scanB: '#9dbcd0', scanF: '#6f97ae', scanL: '#ffffff', scanA: 0.42,
    haze: '#e6f1f5', hazeA: 0.5, forest2: '#4b7568', forest: '#24463c', cap: 0,
    w0: '#6198b4', w1: '#244f68', refl: 0.42, cloudC: '#ffffff', cloudA: 0.8,
    snow: 0, spark: 0.55, fly: 0, flyC: '#fff1b0', birds: 1,
  },
  dusk: {
    s0: '#0d1b2e', s1: '#27435c', s2: '#a0717a', s3: '#f2a66c',
    sunX: 0.71, sunY: 0.44, sunR: 26, sunA: 1, sunC: '#ffdcaa', glowC: '#ff9d5a', glowA: 0.6,
    moonX: 0.82, moonY: 0.8, moonA: 0, stars: 0.35, aurora: 0, auroraC: '#5dffb0', auroraC2: '#5ab8ff',
    scanB: '#3a3f5c', scanF: '#171f30', scanL: '#ffc791', scanA: 0.5,
    haze: '#f2a66c', hazeA: 0.38, forest2: '#18232c', forest: '#080e13', cap: 0,
    w0: '#2c3d4e', w1: '#081119', refl: 0.6, cloudC: '#f2aa86', cloudA: 0.35,
    snow: 0, spark: 0.95, fly: 0.75, flyC: '#ffe9a8', birds: 1,
  },
  night: {
    s0: '#02060c', s1: '#06111f', s2: '#0d2236', s3: '#163650',
    sunX: 0.72, sunY: -0.3, sunR: 28, sunA: 0, sunC: '#ffdcaa', glowC: '#ff9d5a', glowA: 0,
    moonX: 0.8, moonY: 0.82, moonA: 1, stars: 1, aurora: 1, auroraC: '#5dffb0', auroraC2: '#5ab8ff',
    scanB: '#0e1c2e', scanF: '#050b13', scanL: '#6fe3ff', scanA: 0.42,
    haze: '#1d4660', hazeA: 0.3, forest2: '#08131b', forest: '#02070b', cap: 0,
    w0: '#0a1a29', w1: '#01050a', refl: 0.75, cloudC: '#1f3346', cloudA: 0.25,
    snow: 0, spark: 0.6, fly: 1, flyC: '#c8ff9e', birds: 0,
  },
  snow: {
    s0: '#71849a', s1: '#9aacbc', s2: '#c3cfd8', s3: '#e3e9ee',
    sunX: 0.3, sunY: 0.6, sunR: 26, sunA: 0.3, sunC: '#f8f6f0', glowC: '#ffffff', glowA: 0.3,
    moonX: 0.82, moonY: 0.8, moonA: 0, stars: 0, aurora: 0, auroraC: '#5dffb0', auroraC2: '#5ab8ff',
    scanB: '#c2ced8', scanF: '#97a9b8', scanL: '#ffffff', scanA: 0.75,
    haze: '#eef2f5', hazeA: 0.6, forest2: '#738897', forest: '#475b6a', cap: 1,
    w0: '#b0c0cb', w1: '#7a93a2', refl: 0.3, cloudC: '#eef2f4', cloudA: 0.85,
    snow: 1, spark: 0.15, fly: 0, flyC: '#ffffff', birds: 0,
  },
};
const PAL = {};
for (const k in RAW) {
  PAL[k] = {};
  for (const f in RAW[k]) PAL[k][f] = typeof RAW[k][f] === 'string' ? rgb(RAW[k][f]) : RAW[k][f];
}

// The far range: one heightfield, sliced front to back like a terrain scan.
const PEAKS = [
  // x (0..1 of width), z (0 back .. 1 front), height, x-width, z-width
  [0.69, 0.25, 1.0, 0.085, 0.42],
  [0.6, 0.45, 0.62, 0.06, 0.3],
  [0.8, 0.55, 0.55, 0.07, 0.3],
  [0.26, 0.3, 0.78, 0.09, 0.4],
  [0.36, 0.6, 0.45, 0.06, 0.28],
  [0.12, 0.7, 0.4, 0.07, 0.3],
  [0.47, 0.15, 0.5, 0.11, 0.35],
  [0.93, 0.35, 0.5, 0.08, 0.35],
];
const SLICES = 20;

export function createScene(canvas, { reduced = () => false, env: env0 = 'dusk' } = {}) {
  const ctx = canvas.getContext('2d', { alpha: false });
  const sky = document.createElement('canvas');
  const skyCtx = sky.getContext('2d', { alpha: false });
  let env = PAL[env0] ? env0 : 'dusk';
  let cur = PAL[env];
  let from = cur;
  let to = cur;
  let tx0 = 0;
  let W = 0, H = 0, dpr = 1, hz = 0, U = 1;
  let slices = [], back = [], front = [], stars = [], clouds = [], flakes = [], glints = [], flies = [];
  const sparks = [], rockets = [], streaks = [], ripples = [], flocks = [];
  let px = 0, py = 0, tpx = 0, tpy = 0, lastT = 0, lastDraw = 0, t = 0, loopOn = false, raf = 0, nextFlock = 6;
  // slow devices step down: first to 1x pixels, then to fewer frames. Judged on the real frame
  // interval as well as script time, since a huge canvas costs the compositor, not the script.
  let maxDpr = 2, gap = 32, cost = 0, pace = 0, prevNow = 0, drawn = 0, dprWatch = null;

  function tree(x, h, r) {
    return { x, h, w: h * (0.2 + r() * 0.08), tiers: 3 + Math.floor(r() * 3), lean: (r() - 0.5) * 0.06 };
  }

  function gen() {
    const r = rng(20261013);
    U = clamp(Math.min(H / 900, W / 900), 0.55, 1.25);
    hz = Math.round(H * (W < 760 ? 0.72 : 0.7));
    // terrain slices: baseline rises toward the back, amplitude grows toward the front
    slices = [];
    for (let i = 0; i < SLICES; i++) {
      const z = i / (SLICES - 1);
      const base = hz - (0.075 + (1 - z) * 0.26) * hz;
      const amp = (0.1 + z * 0.17) * hz;
      const pts = [];
      for (let x = -40; x <= W + 40; x += 5) {
        const f = x / W;
        let h = 0;
        for (const [px0, pz, ph, pw, pzw] of PEAKS) h += ph * Math.exp(-((Math.abs(f - px0) / pw) ** 1.25) - ((z - pz) / pzw) ** 2);
        h += 0.022 * Math.abs(Math.sin(x * 0.019 + i * 1.7)) + 0.012 * Math.sin(x * 0.07 + i * 0.6) + 0.04;
        pts.push([x, base - h * amp]);
      }
      slices.push({ pts, z, base });
    }
    // two rows of pines on the near shore, taller toward the edges so they frame the lake
    const prof = (f) => 0.42 + 1.25 * Math.exp(-(((f - 0.02) / 0.13) ** 2)) + 1.0 * Math.exp(-(((f - 0.98) / 0.11) ** 2)) + 0.3 * Math.exp(-(((f - 0.42) / 0.07) ** 2));
    back = [];
    front = [];
    for (let x = -30; x < W + 30; ) { const h = (26 + r() * 30) * U * prof(x / W); back.push(tree(x, h, r)); x += (5 + r() * 8) * U; }
    for (let x = -30; x < W + 30; ) { const h = (22 + r() * 52) * U * prof(x / W); front.push(tree(x, h, r)); x += (7 + r() * 12) * U; }
    stars = Array.from({ length: 160 }, () => [r() * W, r() * hz * 0.7, 0.4 + r() * 1.1, r() * 6.28, 0.6 + r() * 1.6]);
    clouds = Array.from({ length: 6 }, (_, i) => [r() * (W + 400) - 200, (0.08 + r() * 0.3) * hz, 0.7 + r() * 0.7, 3 + r() * 6, i]);
    flakes = Array.from({ length: W < 760 ? 90 : 170 }, () => [r() * W, r() * H, 0.6 + r() * 1.8, 14 + r() * 26, r() * 6.28]);
    glints = Array.from({ length: 70 }, () => [r(), r() * 2 - 1, 4 + r() * 14, r() * 6.28]);
    flies = Array.from({ length: W < 760 ? 22 : 38 }, () => [r() * W, hz - (0.02 + r() * 0.2) * hz, r() * 6.28, 0.4 + r() * 0.8, r() * 6.28]);
  }

  function resize() {
    W = window.innerWidth;
    H = window.innerHeight;
    // never more than ~10 million backing pixels (a 5K display at 2x would be 14.7M)
    dpr = Math.min(window.devicePixelRatio || 1, maxDpr, Math.sqrt(10e6 / (W * H)));
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    gen();
    draw(performance.now());
  }

  function pines(list, ox, col, capA) {
    ctx.fillStyle = col;
    ctx.beginPath();
    for (const b of list) {
      const x = b.x + ox, y0 = hz + 1, top = y0 - b.h, n = b.tiers;
      ctx.moveTo(x + b.lean * b.h, top);
      for (let k = 1; k <= n; k++) {
        const y = top + (b.h * 0.92 * k) / n, w = b.w * (0.35 + (0.65 * k) / n);
        ctx.lineTo(x + w, y);
        if (k < n) ctx.lineTo(x + w * 0.38, y - b.h * 0.04);
      }
      ctx.lineTo(x + b.w * 0.12, y0 - b.h * 0.08);
      ctx.lineTo(x + b.w * 0.12, y0);
      ctx.lineTo(x - b.w * 0.12, y0);
      ctx.lineTo(x - b.w * 0.12, y0 - b.h * 0.08);
      for (let k = n; k >= 1; k--) {
        const y = top + (b.h * 0.92 * k) / n, w = b.w * (0.35 + (0.65 * k) / n);
        if (k < n) ctx.lineTo(x - w * 0.38, y - b.h * 0.04);
        ctx.lineTo(x - w, y);
      }
      ctx.closePath();
    }
    ctx.fill();
    if (capA > 0.01) {
      ctx.fillStyle = `rgba(250,252,255,${(capA * 0.9).toFixed(3)})`;
      ctx.beginPath();
      for (const b of list) {
        const x = b.x + ox + b.lean * b.h, top = hz + 1 - b.h;
        ctx.moveTo(x, top);
        ctx.lineTo(x + b.w * 0.3, top + b.h * 0.2);
        ctx.lineTo(x - b.w * 0.3, top + b.h * 0.2);
        ctx.closePath();
      }
      ctx.fill();
    }
  }

  function terrain(p, ox, oy) {
    // scan position sweeps back to front every ~10s, then rests
    const cyc = (t % 11) / 7.5, scan = cyc <= 1 ? cyc * (SLICES + 4) - 2 : -99;
    ctx.lineJoin = 'round';
    for (let i = 0; i < slices.length; i++) {
      const s = slices[i], k = s.z;
      const fill = mix({ c: p.scanB }, { c: p.scanF }, k).c;
      ctx.beginPath();
      ctx.moveTo(s.pts[0][0] + ox * (0.4 + k * 0.6), hz + 2);
      for (const q of s.pts) ctx.lineTo(q[0] + ox * (0.4 + k * 0.6), q[1] + oy);
      ctx.lineTo(s.pts[s.pts.length - 1][0] + ox * (0.4 + k * 0.6), hz + 2);
      ctx.closePath();
      ctx.fillStyle = C(fill);
      ctx.fill();
      const boost = reduced() ? 0 : Math.exp(-(((i - scan) / 1.3) ** 2));
      const a = p.scanA * (0.18 + 0.82 * k) * (1 + boost * 1.8);
      ctx.strokeStyle = C(p.scanL, clamp(a, 0, 1));
      ctx.lineWidth = (0.8 + k * 0.7 + boost * 0.6) * Math.max(0.8, U);
      ctx.beginPath();
      for (let j = 0; j < s.pts.length; j++) {
        const q = s.pts[j];
        if (j) ctx.lineTo(q[0] + ox * (0.4 + k * 0.6), q[1] + oy);
        else ctx.moveTo(q[0] + ox * (0.4 + k * 0.6), q[1] + oy);
      }
      ctx.stroke();
    }
  }

  function aurora(p, ox) {
    if (p.aurora < 0.01) return;
    ctx.globalCompositeOperation = 'lighter';
    const step = 3 * U, wcol = Math.max(1, 1.4 * U), segs = 7;
    for (let x = -20; x < W + 20; x += step) {
      const hem = hz * (0.36 + 0.07 * Math.sin(x * 0.0042 + t * 0.12) + 0.035 * Math.sin(x * 0.011 - t * 0.21));
      const len = hz * (0.14 + 0.09 * Math.sin(x * 0.0065 + t * 0.27) + 0.04 * Math.sin(x * 0.023 - t * 0.5));
      const a = p.aurora * (0.2 + 0.8 * (0.5 + 0.5 * Math.sin(x * 0.017 + t * 0.6)) * (0.55 + 0.45 * Math.sin(x * 0.0021 - t * 0.09)));
      const xx = x + ox * 0.3;
      for (let k = 0; k < segs; k++) {
        const f = k / segs, y = hem - len * (k + 1) / segs;
        ctx.fillStyle = C(mix({ c: p.auroraC }, { c: p.auroraC2 }, f).c, clamp(a * (k === 0 ? 0.85 : 0.6 * (1 - f) ** 1.6), 0, 1));
        ctx.fillRect(xx, y, wcol, len / segs + 0.5);
      }
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  function fireflies(p, ox, dt) {
    if (p.fly < 0.01) return;
    const link = 70 * U;
    const pos = flies.map((f) => {
      if (!reduced()) { f[2] += dt * f[3] * 0.6; f[4] += dt * 2.2; }
      const x = f[0] + Math.sin(f[2]) * 28 * U + ox, y = f[1] + Math.sin(f[2] * 1.3 + 1) * 10 * U;
      return [x, y, 0.5 + 0.5 * Math.sin(f[4])];
    });
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineWidth = 0.8;
    for (let i = 0; i < pos.length; i++) {
      for (let j = i + 1; j < pos.length; j++) {
        const dx = pos[i][0] - pos[j][0], dy = pos[i][1] - pos[j][1], d = Math.hypot(dx, dy);
        if (d < link) {
          ctx.strokeStyle = C(p.flyC, (1 - d / link) * Math.min(pos[i][2], pos[j][2]) * 0.4 * p.fly);
          ctx.beginPath(); ctx.moveTo(pos[i][0], pos[i][1]); ctx.lineTo(pos[j][0], pos[j][1]); ctx.stroke();
        }
      }
    }
    for (const q of pos) {
      const a = p.fly * (0.25 + 0.75 * q[2]);
      ctx.fillStyle = C(p.flyC, a * 0.22);
      ctx.fillRect(q[0] - 3 * U, q[1] - 3 * U, 6 * U, 6 * U);
      ctx.fillStyle = C(p.flyC, a);
      ctx.fillRect(q[0] - 1, q[1] - 1, 2, 2);
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  function birds(p, dt) {
    if (p.birds < 0.01 && !flocks.length) return;
    if (!reduced() && p.birds > 0.5 && t > nextFlock) {
      nextFlock = t + 22 + Math.random() * 20;
      const dir = Math.random() < 0.5 ? 1 : -1, y = hz * (0.18 + Math.random() * 0.25);
      flocks.push({ x: dir > 0 ? -80 : W + 80, y, dir, v: (26 + Math.random() * 12) * U, n: 5 + Math.floor(Math.random() * 5), ph: Math.random() * 6 });
    }
    ctx.strokeStyle = C(p.forest, 0.85);
    ctx.lineWidth = 1.3 * U;
    for (let i = flocks.length - 1; i >= 0; i--) {
      const fl = flocks[i];
      fl.x += fl.dir * fl.v * dt;
      if (fl.x < -200 || fl.x > W + 200) { flocks.splice(i, 1); continue; }
      for (let k = 0; k < fl.n; k++) {
        const row = Math.ceil(k / 2), side = k % 2 ? 1 : -1;
        const bx = fl.x - fl.dir * row * 14 * U, by = fl.y + side * row * 7 * U + Math.sin(t * 0.7 + k) * 2;
        const flap = Math.sin(t * 9 + fl.ph + k) * 3 * U, s = 4.5 * U;
        ctx.beginPath();
        ctx.moveTo(bx - s, by - flap); ctx.quadraticCurveTo(bx - s * 0.4, by - s * 0.3, bx, by);
        ctx.quadraticCurveTo(bx + s * 0.4, by - s * 0.3, bx + s, by - flap);
        ctx.stroke();
      }
    }
  }

  function skyFx(dt) {
    ctx.globalCompositeOperation = 'lighter';
    for (let i = rockets.length - 1; i >= 0; i--) {
      const r = rockets[i];
      r.y += r.vy * dt; r.vy += 60 * dt;
      ctx.fillStyle = 'rgba(255,230,200,.9)'; ctx.fillRect(r.x, r.y, 1.6, 6);
      if (r.y <= r.ty || r.vy > -40) {
        rockets.splice(i, 1);
        for (let k = 0; k < 70; k++) {
          const a = (k / 70) * 6.283 + Math.random() * 0.1, sp = 40 + Math.random() * 110;
          sparks.push({ x: r.x, y: r.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 1.4 + Math.random() * 0.9, c: r.c });
        }
      }
    }
    for (let i = sparks.length - 1; i >= 0; i--) {
      const s = sparks[i];
      s.life -= dt;
      if (s.life <= 0) { sparks.splice(i, 1); continue; }
      s.vx *= 0.985; s.vy = s.vy * 0.985 + 38 * dt; s.x += s.vx * dt; s.y += s.vy * dt;
      ctx.fillStyle = `rgba(${s.c},${Math.min(1, s.life / 1.2).toFixed(3)})`; ctx.fillRect(s.x, s.y, 2, 2);
    }
    for (let i = streaks.length - 1; i >= 0; i--) {
      const s = streaks[i];
      s.life -= dt;
      if (s.life <= 0) { streaks.splice(i, 1); continue; }
      s.x += s.vx * dt; s.y += s.vy * dt;
      const g = ctx.createLinearGradient(s.x, s.y, s.x - s.vx * 0.18, s.y - s.vy * 0.18);
      g.addColorStop(0, `rgba(255,255,255,${Math.min(1, s.life * 1.5)})`); g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.strokeStyle = g; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(s.x - s.vx * 0.18, s.y - s.vy * 0.18); ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  function draw(now) {
    const dt = Math.min(0.06, (now - lastT) / 1000 || 0);
    lastT = now;
    t = now / 1000;
    if (tx0) {
      const k = clamp((now - tx0) / 2200, 0, 1), e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      cur = mix(from, to, e);
      if (k >= 1) { cur = to; tx0 = 0; }
    }
    px += (tpx - px) * 0.05;
    py += (tpy - py) * 0.05;
    const p = cur, oxS = -px * 8, oxT = -px * 16, oxB = -px * 24, oxF = -px * 34, oyS = -py * 6;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // sky
    let g = ctx.createLinearGradient(0, 0, 0, hz);
    g.addColorStop(0, C(p.s0)); g.addColorStop(0.45, C(p.s1)); g.addColorStop(0.8, C(p.s2)); g.addColorStop(1, C(p.s3));
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, hz + 2);
    if (p.stars > 0.01) {
      for (const s of stars) {
        ctx.fillStyle = `rgba(255,255,255,${(p.stars * (0.55 + 0.45 * Math.sin(t * s[4] + s[3]))).toFixed(3)})`;
        ctx.fillRect(s[0] + oxS * 0.3, s[1] + oyS, s[2], s[2]);
      }
    }
    aurora(p, oxS);

    // sun + moon
    const sx = p.sunX * W + oxS * 0.5, sy = hz - p.sunY * hz + oyS;
    if (p.glowA * p.sunA > 0.01) {
      g = ctx.createRadialGradient(sx, sy, 0, sx, sy, 320 * U);
      g.addColorStop(0, C(p.glowC, p.glowA * p.sunA)); g.addColorStop(1, C(p.glowC, 0));
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, hz);
    }
    if (p.sunA > 0.01) { ctx.fillStyle = C(p.sunC, p.sunA); ctx.beginPath(); ctx.arc(sx, sy, p.sunR * U, 0, 7); ctx.fill(); }
    const mx = p.moonX * W + oxS * 0.5, my = hz - p.moonY * hz + oyS;
    if (p.moonA > 0.01) {
      g = ctx.createRadialGradient(mx, my, 0, mx, my, 110 * U);
      g.addColorStop(0, `rgba(220,230,240,${0.26 * p.moonA})`); g.addColorStop(1, 'rgba(220,230,240,0)');
      ctx.fillStyle = g; ctx.fillRect(mx - 110 * U, my - 110 * U, 220 * U, 220 * U);
      ctx.fillStyle = `rgba(244,241,230,${p.moonA})`; ctx.beginPath(); ctx.arc(mx, my, 14 * U, 0, 7); ctx.fill();
      ctx.fillStyle = `rgba(160,165,170,${0.22 * p.moonA})`; ctx.beginPath();
      ctx.arc(mx - 4 * U, my - 3 * U, 3.5 * U, 0, 7); ctx.arc(mx + 5 * U, my + 4 * U, 2.5 * U, 0, 7); ctx.fill();
    }

    // clouds
    if (p.cloudA > 0.01) {
      for (const c of clouds) {
        if (!reduced()) { c[0] += c[3] * dt; if (c[0] > W + 260) c[0] = -260; }
        const cx = c[0] + oxS * 0.6, cy = c[1] + oyS, s = c[2] * U;
        for (const q of [[0, 0, 70], [-60, 8, 48], [58, 6, 54], [-112, 16, 30], [108, 14, 34]]) {
          const qx = cx + q[0] * s, qy = cy + q[1] * s, rr = q[2] * s;
          ctx.setTransform(dpr, 0, 0, dpr * 0.42, qx * dpr, qy * dpr);
          g = ctx.createRadialGradient(0, 0, 0, 0, 0, rr);
          g.addColorStop(0, C(p.cloudC, p.cloudA * 0.55)); g.addColorStop(1, C(p.cloudC, 0));
          ctx.fillStyle = g; ctx.fillRect(-rr, -rr, rr * 2, rr * 2);
        }
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    if (rockets.length || sparks.length || streaks.length) skyFx(dt);
    birds(p, dt);

    // the far range, as a terrain scan
    terrain(p, oxT, oyS * 0.3);
    g = ctx.createLinearGradient(0, hz - 70 * U, 0, hz);
    g.addColorStop(0, C(p.haze, 0)); g.addColorStop(1, C(p.haze, p.hazeA));
    ctx.fillStyle = g; ctx.fillRect(0, hz - 70 * U, W, 70 * U);

    // the near shore
    pines(back, oxB, C(p.forest2), p.cap * 0.7);
    g = ctx.createLinearGradient(0, hz - 30 * U, 0, hz);
    g.addColorStop(0, C(p.haze, 0)); g.addColorStop(1, C(p.haze, p.hazeA * 0.35));
    ctx.fillStyle = g; ctx.fillRect(0, hz - 30 * U, W, 30 * U);
    pines(front, oxF, C(p.forest), p.cap);
    fireflies(p, oxF * 0.6, dt);

    // the lake: a wobbling copy of everything above the shoreline
    const wh = H - hz;
    g = ctx.createLinearGradient(0, hz, 0, H);
    g.addColorStop(0, C(p.w0)); g.addColorStop(1, C(p.w1));
    ctx.fillStyle = g; ctx.fillRect(0, hz, W, wh);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const Hd = Math.round(hz * dpr), Wd = canvas.width, step = Math.max(2, Math.round(2 * dpr)), depth = canvas.height - Hd;
    // copy the land and sky once; reading the canvas into itself strip by strip is very slow
    if (sky.width !== Wd || sky.height !== Hd) { sky.width = Wd; sky.height = Hd; }
    skyCtx.drawImage(canvas, 0, 0, Wd, Hd, 0, 0, Wd, Hd);
    for (let y = 0; y < depth; y += step) {
      const sy0 = Hd - step - Math.floor(y * 1.12);
      if (sy0 < 0) break;
      const f = y / depth, yy = y / dpr, amp = (0.4 + f * 2.6) * dpr;
      ctx.globalAlpha = p.refl * (1 - Math.min(0.3, f * 0.5) * (0.5 + 0.5 * Math.sin(yy * 0.35 + t * 1.3) * Math.sin(yy * 0.09 - t * 0.5)));
      const dx = Math.sin(yy * 0.21 + t * 1.7) * amp + Math.sin(yy * 0.061 - t * 0.8) * amp * 0.6;
      ctx.drawImage(sky, 0, sy0, Wd, step, dx, Hd + y, Wd, step);
    }
    ctx.globalAlpha = 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    g = ctx.createLinearGradient(0, hz, 0, H);
    g.addColorStop(0, C(p.w1, 0)); g.addColorStop(1, C(p.w1, 0.6));
    ctx.fillStyle = g; ctx.fillRect(0, hz, W, wh);
    ctx.fillStyle = C(p.haze, 0.35 * p.hazeA + 0.1); ctx.fillRect(0, hz, W, 1);

    // light path on the water
    const useSun = p.sunA >= p.moonA, lx = useSun ? sx : mx, lc = useSun ? p.sunC : [244, 241, 230], li = p.spark * Math.max(p.sunA, p.moonA);
    if (li > 0.02) {
      for (const q of glints) {
        const y = hz + 3 + q[0] * q[0] * wh * 0.9, spread = 8 + q[0] * 110 * U, a = li * (0.5 + 0.5 * Math.sin(t * 2.3 + q[3])) * (1 - q[0] * 0.6);
        ctx.fillStyle = C(lc, a * 0.75);
        ctx.fillRect(lx + q[1] * spread - q[2] * 0.5, y, q[2] * (1 + q[0] * 2), 1.3);
      }
    }
    // a canoe, very slowly
    const fx = ((t * 6 + 380) % (W + 300)) - 150, fy = hz + wh * 0.26;
    ctx.fillStyle = C(p.forest);
    ctx.beginPath(); ctx.moveTo(fx, fy - 2 * U); ctx.quadraticCurveTo(fx + 15 * U, fy + 3 * U, fx + 30 * U, fy - 2 * U); ctx.closePath(); ctx.fill();
    ctx.fillRect(fx + 13 * U, fy - 7 * U, 3 * U, 5 * U);
    ctx.fillRect(fx + 13.5 * U, fy - 9.5 * U, 2 * U, 2 * U);
    ctx.fillStyle = C(p.haze, 0.25 * p.hazeA);
    for (let i = 1; i < 6; i++) ctx.fillRect(fx - i * 9 * U, fy + i * 1.5 * U, 7 * U, 1);

    // ripples
    for (let i = ripples.length - 1; i >= 0; i--) {
      const r = ripples[i], age = t - r[2];
      if (age > 3) { ripples.splice(i, 1); continue; }
      ctx.strokeStyle = `rgba(255,255,255,${(0.5 * (1 - age / 3)).toFixed(3)})`; ctx.lineWidth = 1.2;
      for (let k = 0; k < 3; k++) { const rr = Math.max(1, age * 60 - k * 16); ctx.beginPath(); ctx.ellipse(r[0], r[1], rr, rr * 0.22, 0, 0, 7); ctx.stroke(); }
    }
    // snow
    if (p.snow > 0.01) {
      ctx.fillStyle = `rgba(255,255,255,${(0.85 * p.snow).toFixed(3)})`;
      for (const f of flakes) {
        if (!reduced()) {
          f[1] += f[3] * dt; f[0] += Math.sin(t * 0.8 + f[4]) * 10 * dt;
          if (f[1] > H) f[1] = -4;
          if (f[0] > W) f[0] = 0;
          if (f[0] < 0) f[0] = W;
        }
        ctx.beginPath(); ctx.arc(f[0] + oxF * f[2] * 0.3, f[1], f[2], 0, 7); ctx.fill();
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
  // moving the window to a screen with a different pixel density fires no resize event
  function watchDpr() {
    const mq = window.matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`);
    const onChange = () => { resize(); watchDpr(); };
    mq.addEventListener('change', onChange, { once: true });
    dprWatch = () => mq.removeEventListener('change', onChange);
  }
  function kick(ms = 0) {
    // with reduced motion, animate briefly after an interaction, then hold still
    if (!reduced()) return;
    const end = performance.now() + ms;
    const tick = (now) => { draw(now); if (now < end || tx0) requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  }

  return {
    start() {
      resize();
      window.addEventListener('resize', resize);
      watchDpr();
      if (!reduced()) { loopOn = true; raf = requestAnimationFrame(frame); }
    },
    stop() {
      loopOn = false;
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      if (dprWatch) dprWatch();
    },
    set(name) {
      if (!PAL[name] || (name === env && !tx0)) return;
      env = name; from = cur; to = PAL[name]; tx0 = performance.now();
      if (reduced()) { cur = to; tx0 = 0; draw(performance.now()); }
    },
    get env() { return env; },
    get hz() { return hz; },
    look(nx, ny) { if (!reduced()) { tpx = nx; tpy = ny; } },
    poke(x, y) {
      // stamp with the clock, not the last frame: with reduced motion nothing has drawn for a while
      if (y > hz) { ripples.push([x, y, performance.now() / 1000]); kick(3100); }
      else { streaks.push({ x, y, vx: 520 + Math.random() * 200, vy: 190 + Math.random() * 80, life: 0.9 }); kick(1500); }
    },
    star() { streaks.push({ x: W * (0.1 + Math.random() * 0.4), y: hz * (0.08 + Math.random() * 0.3), vx: 560, vy: 210, life: 1 }); kick(1200); },
    fireworks() {
      const cols = ['255,196,120', '255,255,255', '140,220,255', '255,150,140', '190,255,200'];
      for (let i = 0; i < 9; i++) {
        setTimeout(() => rockets.push({ x: W * (0.15 + Math.random() * 0.7), y: hz, vy: -(300 + Math.random() * 120) * U, ty: hz * (0.18 + Math.random() * 0.3), c: cols[i % cols.length] }), i * 520 + Math.random() * 200);
      }
    },
    redraw() { draw(performance.now()); },
  };
}
