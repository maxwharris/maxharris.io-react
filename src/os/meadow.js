// The meadow, the world behind the windows by default: a rolling green hill under a deep blue sky, lit from the upper
// left, with soft cumulus drifting across. Original artwork, drawn like the boards: the sky, every cloud and the hills are
// painted once into offscreen layers (each cloud stacked from soft puffs and shaded by how much of it lies toward the
// sun, the grass shaded per pixel at a low resolution in perspective, then given a crisp crest and blades); a frame only
// places them and adds what moves. The clouds drift, their shadows cross the grass, the layers shift a little with the
// pointer, and on cue there is a gust, a passing bird or a burst of sun. Seeded, so the same sky comes back. No React;
// board.js runs it on its canvas.

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rng = (s) => () => (s = (s * 16807) % 2147483647) / 2147483647;
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const canvasOf = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h)); return c; };

// grass from deep shade to the sunlit crest; the pale blue the far hills sink into
const GRASS = [[16, 58, 22], [28, 90, 28], [54, 130, 36], [100, 174, 50], [152, 208, 76], [200, 232, 122]];
const HAZE = [192, 223, 246];

// seeded value noise, summed over a few octaves; 0..1
function makeNoise(seed) {
  const r = rng(seed), P = new Uint8Array(512), V = new Float32Array(256), p = [];
  for (let i = 0; i < 256; i++) { p.push(i); V[i] = r(); }
  for (let i = 255; i > 0; i--) { const j = Math.floor(r() * (i + 1)), t = p[i]; p[i] = p[j]; p[j] = t; }
  for (let i = 0; i < 512; i++) P[i] = p[i & 255];
  const n = (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y), u = x - xi, v = y - yi, su = u * u * (3 - 2 * u), sv = v * v * (3 - 2 * v);
    const i0 = P[xi & 255], i1 = P[(xi + 1) & 255], j0 = yi & 255, j1 = (yi + 1) & 255;
    const a = V[P[i0 + j0]], b = V[P[i1 + j0]], c = V[P[i0 + j1]], d = V[P[i1 + j1]];
    return a + (b - a) * su + (c - a) * sv + (a - b - c + d) * su * sv;
  };
  return (x, y, oct) => {
    let s = 0, amp = 1, f = 1, norm = 0;
    for (let k = 0; k < oct; k++) { s += n(x * f + k * 17.31, y * f - k * 9.17) * amp; norm += amp; amp *= 0.5; f *= 2.03; }
    return s / norm;
  };
}

// a run of cubic Bezier segments: a y for every css px column from xa (n of them), and the same curve as a path
function sample(segs, xa, n) {
  const ys = new Float32Array(n).fill(NaN);
  for (const [p0, p1, p2, p3] of segs) {
    let qx = 0, qy = 0;
    for (let k = 0; k <= 900; k++) {
      const t = k / 900, m = 1 - t, a = m * m * m, b = 3 * m * m * t, c = 3 * m * t * t, d = t * t * t;
      const x = a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0], y = a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1];
      if (k) for (let i = Math.max(0, Math.ceil(qx - xa)); i <= Math.min(n - 1, Math.floor(x - xa)); i++) ys[i] = qy + (y - qy) * ((i + xa - qx) / (x - qx || 1));
      qx = x; qy = y;
    }
  }
  let last = NaN;
  for (let i = 0; i < n; i++) { if (Number.isNaN(ys[i])) ys[i] = last; else last = ys[i]; }
  for (let i = n - 1; i >= 0; i--) { if (Number.isNaN(ys[i])) ys[i] = last; else last = ys[i]; }
  return ys;
}
function pathOf(segs, bottom) {
  const p = new Path2D(), s0 = segs[0][0], e = segs[segs.length - 1][3];
  p.moveTo(s0[0], s0[1]);
  for (const [, a, b, c] of segs) p.bezierCurveTo(a[0], a[1], b[0], b[1], c[0], c[1]);
  if (bottom != null) { p.lineTo(e[0], bottom); p.lineTo(s0[0], bottom); p.closePath(); }
  return p;
}

// a soft white ball, solid to `core` of its radius and fading beyond, `peak` at its thickest: a cloud's shade and the high
// wisps are stamped from it
function puffOf(size, core, peak) {
  const cv = canvasOf(size, size), c = cv.getContext('2d'), R = size / 2, g = c.createRadialGradient(R, R, 0, R, R, R);
  for (let i = 0; i <= 8; i++) { const r = i / 8; g.addColorStop(r, `rgba(255,255,255,${(peak * (1 - smooth(core, 1, r))).toFixed(3)})`); }
  c.fillStyle = g;
  c.fillRect(0, 0, size, size);
  return cv;
}

export function createMeadow({ reduced = () => false } = {}) {
  let W = 0, H = 0, dpr = 1, U = 1, S = 1, V = 1, built = '';
  let base = 0, amp = 0, mx = 0, my = 0; // the near crest's height, how far the hill falls away from it, the most the near hill shifts
  let crest = null, cx0 = 0; // the near hill's crest: a y for every css px column from cx0
  let sky = null, far = null, hill = null, hillPath = null; // layers: { cv, x, y, w, h } in css px
  let puffB = null, ringCv = null, blobCv = null, raysCv = null;
  const clouds = [], shades = [], ripples = [], birds = [];
  const noise = makeNoise(20261115);
  let clock = 0, px = 0, py = 0, gx = 0, gy = 0; // seconds of drift; the pointer's pull now and wanted, -1..1
  let sunAt = -1, glow = null; // the burst of sun (fireworks); the reduced-motion answer to a double-click

  const crestAt = (x) => crest[clamp(Math.round(x - cx0), 0, crest.length - 1)];

  // ---------- the lay of the land ----------
  let mainSegs, ridgeSegs, rangeSegs;
  function geometry() {
    const a = W / H;
    // the crest sits a little lower on a tall phone; the hill rises less steeply across a narrow screen
    base = H * (0.56 + 0.05 * clamp((1.3 - a) / 0.85, 0, 1));
    amp = H * 0.18 * clamp(a / 1.4, 0.45, 1);
    const P = (u, k) => [u * W, base + k * amp];
    // the near hill: up from the lower left to a broad crest right of center, then away toward the right edge
    mainSegs = [[P(-0.08, 1), P(0.16, 0.8), P(0.4, 0), P(0.6, 0)], [P(0.6, 0), P(0.8, 0), P(0.95, 0.4), P(1.08, 0.58)]];
    // a ridge further back on the left, and low hills in the haze on the right
    ridgeSegs = [[P(-0.08, 0.3), P(0.02, 0.12), P(0.1, 0.08), P(0.19, 0.1)], [P(0.19, 0.1), P(0.3, 0.13), P(0.45, 0.5), P(0.62, 0.95)]];
    rangeSegs = [[P(0.48, 0.5), P(0.7, 0.24), P(0.8, 0.2), P(0.9, 0.22)], [P(0.9, 0.22), P(0.98, 0.24), P(1.03, 0.3), P(1.08, 0.32)]];
    cx0 = Math.floor(-0.08 * W) - 2;
    crest = sample(mainSegs, cx0, Math.ceil(1.16 * W) + 6);
  }

  // ---------- the sky ----------
  function paintSky() {
    const k = Math.min(dpr, 1), cv = canvasOf(W * k, H * k), c = cv.getContext('2d', { alpha: false });
    c.setTransform(k, 0, 0, k, 0, 0);
    const hz = base + 0.25 * amp;
    const g = c.createLinearGradient(0, 0, 0, hz);
    g.addColorStop(0, '#1747b6');
    g.addColorStop(0.24, '#205fd2');
    g.addColorStop(0.5, '#3a83e6');
    g.addColorStop(0.74, '#71aef0');
    g.addColorStop(0.9, '#a4cff6');
    g.addColorStop(1, '#c9e4fa');
    c.fillStyle = g;
    c.fillRect(0, 0, W, H);
    const big = Math.max(W, H);
    // the sun is off the top left: its light thins the blue there; the sky away from it runs deepest
    let r = c.createRadialGradient(W * 0.02, -H * 0.12, 0, W * 0.02, -H * 0.12, big * 0.8);
    r.addColorStop(0, 'rgba(236,248,255,.5)');
    r.addColorStop(0.2, 'rgba(200,232,255,.26)');
    r.addColorStop(0.55, 'rgba(170,215,255,.08)');
    r.addColorStop(1, 'rgba(170,215,255,0)');
    c.fillStyle = r;
    c.fillRect(0, 0, W, H);
    r = c.createRadialGradient(W * 1.05, -H * 0.15, 0, W * 1.05, -H * 0.15, big * 0.8);
    r.addColorStop(0, 'rgba(10,34,120,.3)');
    r.addColorStop(1, 'rgba(10,34,120,0)');
    c.fillStyle = r;
    c.fillRect(0, 0, W, H);
    // a few faint wisps of high cloud, too high to be seen to move
    const wisp = puffOf(64, 0, 1), q = rng(4242);
    for (let k = 0; k < 3; k++) {
      const cx = W * (0.12 + 0.76 * q()), cy = H * (0.05 + 0.18 * q()), len = Math.max(W, H) * (0.18 + 0.16 * q()), ang = -0.16 + 0.2 * q();
      for (let i = 0; i < 90; i++) {
        const t = i / 89, s = (14 + 30 * Math.sin(Math.PI * t)) * (0.4 + q()) * S;
        c.save();
        c.translate(cx + (t - 0.5) * len * Math.cos(ang), cy + (t - 0.5) * len * Math.sin(ang) + (Math.sin(t * 5 + k * 2) * 7 + (q() - 0.5) * 10) * S);
        c.rotate(ang + (q() - 0.5) * 0.35);
        c.scale(2.6, 0.75);
        c.globalAlpha = 0.012 + 0.024 * q();
        c.drawImage(wisp, -s, -s, s * 2, s * 2);
        c.restore();
      }
    }
    // a bright haze along the horizon
    const h = c.createLinearGradient(0, base - 0.16 * H, 0, base + 0.2 * amp);
    h.addColorStop(0, 'rgba(232,245,255,0)');
    h.addColorStop(1, 'rgba(232,245,255,.55)');
    c.fillStyle = h;
    c.fillRect(0, base - 0.16 * H, W, H);
    return { cv, x: 0, y: 0, w: W, h: H };
  }

  // ---------- clouds ----------
  // A cumulus: a long low body with one to three towers, small puffs along the top for the cauliflower edge, a flat base.
  // It is lit the way a cloud is: a point is in shade as far as there is cloud between it and the sun, up and to its
  // left, so the silhouette is laid over itself, shifted, once for the folds and once for the deep shade inside.
  function cloud(r, w, flat) {
    const h = w * (flat ? 0.17 + 0.08 * r() : 0.42 + 0.18 * r());
    const tw = [];
    for (let k = 0, n = flat ? 2 : 1 + Math.floor(r() * 2.6); k < n; k++) tw.push([0.22 + 0.56 * r(), 0.45 + 0.55 * r(), 0.1 + 0.12 * r()]);
    const top = (u) => {
      let t = 0.36 * Math.pow(Math.sin(Math.PI * clamp(u, 0, 1)), 0.75);
      for (const [c, a, s] of tw) t += a * 0.6 * Math.exp(-(((u - c) / s) ** 2));
      return Math.min(1, t) * h;
    };
    const puffs = [];
    for (let x = w * 0.04; x <= w * 0.96; x += w * 0.05 * (0.7 + 0.6 * r())) {
      const t = top(x / w), rad = clamp(t * 0.44, h * 0.13, h * 0.42) * (0.82 + 0.36 * r());
      puffs.push([x, h - t + rad, rad]);
      for (let y = h - t + rad * 2.1; y < h - rad * 0.3; y += rad * 0.95) puffs.push([x + (r() - 0.5) * rad, y, rad * (0.95 + 0.3 * r())]);
      if (t > h * 0.2) for (let k = 0, n = 2 + Math.floor(r() * 3); k < n; k++) {
        const a = -Math.PI * (0.1 + 0.8 * r());
        puffs.push([x + Math.cos(a) * rad * 0.78, h - t + rad + Math.sin(a) * rad * 0.78, rad * (0.26 + 0.24 * r())]);
      }
    }
    for (let x = w * 0.08; x <= w * 0.92; x += h * 0.16) puffs.push([x + (r() - 0.5) * h * 0.08, h - h * (0.06 + 0.07 * r()), h * (0.11 + 0.05 * r())]);
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity;
    for (const [x, y, rad] of puffs) { x0 = Math.min(x0, x - rad * 1.2); x1 = Math.max(x1, x + rad * 1.2); y0 = Math.min(y0, y - rad * 1.2); }
    x0 -= 2; x1 += 2; y0 -= 2;
    const y1 = h + 3, cw = x1 - x0, ch = y1 - y0, sh = h * (flat ? 0.75 : 1);
    const cv = canvasOf(cw * dpr, ch * dpr), c = cv.getContext('2d'), tmp = canvasOf(cv.width, cv.height), tc = tmp.getContext('2d');
    const world = (k) => k.setTransform(dpr, 0, 0, dpr, -x0 * dpr, -y0 * dpr);
    const stamp = (k, sprite, grow) => { for (const [x, y, rad] of puffs) k.drawImage(sprite, x - rad * grow, y - rad * grow, rad * 2 * grow, rad * 2 * grow); };
    world(c);
    // the body: each puff solid with a soft rim no wider than a few pixels, so a big cloud keeps a crisp edge
    for (const [x, y, rad] of puffs) {
      const core = 1 - clamp(0.2 * rad, 2.5, 10 * S) / rad, g = c.createRadialGradient(x, y, 0, x, y, rad);
      g.addColorStop(0, '#fff');
      g.addColorStop(Math.max(0, core), '#fff');
      for (const [t, a] of [[0.25, 0.84], [0.5, 0.5], [0.75, 0.16], [1, 0]]) g.addColorStop(Math.max(0, core + (1 - core) * t), `rgba(255,255,255,${a})`);
      c.fillStyle = g;
      c.beginPath();
      c.arc(x, y, rad, 0, 7);
      c.fill();
    }
    // the shade: the silhouette again, thinner and softer, tinted and moved down and right of itself
    for (const [off, color] of [[0.05, flat ? 'rgb(214,226,242)' : 'rgb(208,218,236)'], [0.2, flat ? 'rgba(176,196,226,.8)' : 'rgba(136,154,192,.88)']]) {
      tc.setTransform(1, 0, 0, 1, 0, 0);
      tc.globalCompositeOperation = 'source-over';
      tc.clearRect(0, 0, tmp.width, tmp.height);
      world(tc);
      stamp(tc, puffB, 1.12);
      tc.globalCompositeOperation = 'source-in';
      tc.fillStyle = color;
      tc.fillRect(x0, y0, cw, ch);
      c.globalCompositeOperation = 'source-atop';
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.drawImage(tmp, off * sh * 0.55 * dpr, off * sh * 0.85 * dpr);
      world(c);
    }
    // shade gathers toward the base; the sun warms the top left
    let g = c.createLinearGradient(0, h * 0.45, 0, h);
    g.addColorStop(0, 'rgba(108,128,166,0)');
    g.addColorStop(1, flat ? 'rgba(130,152,186,.3)' : 'rgba(104,124,164,.36)');
    c.fillStyle = g;
    c.fillRect(x0, y0, cw, ch);
    g = c.createRadialGradient(w * 0.2, 0, 0, w * 0.2, 0, w * 0.8);
    g.addColorStop(0, 'rgba(255,248,228,.3)');
    g.addColorStop(1, 'rgba(255,248,228,0)');
    c.fillStyle = g;
    c.fillRect(x0, y0, cw, ch);
    if (flat) { c.fillStyle = 'rgba(196,224,246,.34)'; c.fillRect(x0, y0, cw, ch); }
    // a flat, soft base
    c.globalCompositeOperation = 'destination-out';
    g = c.createLinearGradient(0, h - h * 0.15, 0, h + 1);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(0.6, 'rgba(0,0,0,.35)');
    g.addColorStop(1, 'rgba(0,0,0,1)');
    c.fillStyle = g;
    c.fillRect(x0 - 4, h - h * 0.15, cw + 8, y1 - h + h * 0.15 + 12);
    return { cv, sx: x0 - w / 2, sy: y0 - h, cw, ch, w, h };
  }

  function layoutClouds() {
    clouds.length = 0;
    const r = rng(7041), tall = W < H;
    // the shade's puff: thin and soft, so the shade deepens where the cloud is thick
    puffB = puffOf(128, 0.1, 0.5);
    // A layer drifts at one speed, so the gaps between its clouds hold; a cloud leaving one side comes back on the other
    // once it is out of sight, the layer's track running a margin past both edges.
    const layer = (list, depth, v) => {
      const m = Math.max(...list.map((c) => Math.max(-c.sx, c.sx + c.cw))) + mx * depth + 8, L = W + 2 * m;
      list.forEach((c, i) => clouds.push({ ...c, depth, v, m, x0: (i + c.at) * (L / list.length), kx: 0, kv: 0, wa: 0, wt: 0 }));
    };
    // high cumulus: a few, of different sizes, with open sky between them
    const nA = clamp(Math.round(W / 470), 2, 6), top = (tall ? 0.1 : 0.12) * H, bot = base - (tall ? 0.14 : 0.18) * H, high = [];
    for (let i = 0; i < nA; i++) {
      const c = cloud(r, S * (260 + 250 * r()) * [1.25, 0.72, 1][i % 3], false), f = [0.25, 0.85, 0.5][i % 3] + 0.25 * (r() - 0.5);
      high.push({ ...c, at: 0.38 + 0.24 * r(), y: top + c.h + Math.max(0, bot - top - c.h) * f });
    }
    layer(high, 0.25, 6.5 * V);
    // small, flat clouds low over the hills, further off and slower
    const nB = clamp(Math.round(W / 240), 3, 11), low = [];
    for (let i = 0; i < nB; i++) low.push({ ...cloud(r, S * (70 + 150 * r()), true), at: 0.2 + 0.6 * r(), y: base - (0.035 + 0.11 * r()) * H * (tall ? 0.8 : 1) });
    layer(low, 0.12, 2.8 * V);
    // far ones first
    clouds.sort((a, b) => a.depth - b.depth);
  }

  // ---------- grass ----------
  // Shaded per pixel at a low resolution (it is all soft light, and gets scaled up): brighter where the slope turns to
  // the sun, deeper toward the foreground, with patches laid out in perspective so they shrink and crowd toward the crest.
  function shadeGrass(ys, xa, x0, x1, y0, y1, o) {
    const q = clamp(720 / W, 0.34, 1), sw = Math.ceil((x1 - x0) * q), sh = Math.ceil((y1 - y0) * q);
    const cv = canvasOf(sw, sh), c = cv.getContext('2d'), img = c.createImageData(sw, sh), D = img.data;
    const tops = new Float32Array(sw), face = new Float32Array(sw), ux = new Float32Array(sw);
    const at = (x) => ys[clamp(Math.round(x - xa), 0, ys.length - 1)];
    for (let i = 0; i < sw; i++) {
      const x = x0 + (i + 0.5) / q;
      tops[i] = at(x);
      face[i] = clamp(-(at(x + 4) - at(x - 4)) / 8 * 3.4, -1, 1);
      ux[i] = x / W;
    }
    const n1 = GRASS.length - 1;
    for (let j = 0; j < sh; j++) {
      const y = y0 + (j + 0.5) / q;
      for (let i = 0; i < sw; i++) {
        const d = clamp((y - tops[i]) / (y1 - tops[i]), 0, 1), z = 1 / (d + 0.1), e = 1 - d;
        const n = noise((ux[i] - 0.5) * z * 2.6 + o.seed, z * 1.4, 3), m = noise((ux[i] - 0.5) * z * 9 - o.seed, z * 5, 2);
        let b = o.b0 + o.face * face[i] * e * Math.sqrt(e) - o.depth * Math.pow(d, 1.25) + o.patch * (n - 0.5) + 0.07 * (m - 0.5) * e
          + o.sheen * Math.pow(e, 12) - 0.09 * smooth(0.5, 1.15, ux[i]) + 0.05 * (1 - smooth(-0.1, 0.4, ux[i])) * e;
        b = clamp(b, 0, 1) * n1;
        const s = Math.min(n1 - 1, Math.floor(b)), f = b - s, A = GRASS[s], B = GRASS[s + 1];
        let R = A[0] + (B[0] - A[0]) * f, G = A[1] + (B[1] - A[1]) * f, Bl = A[2] + (B[2] - A[2]) * f;
        if (o.haze) { const hz = o.haze * (1 - 0.5 * d); R += (HAZE[0] - R) * hz; G += (HAZE[1] - G) * hz; Bl += (HAZE[2] - Bl) * hz; }
        const k = (j * sw + i) * 4;
        D[k] = R; D[k + 1] = G; D[k + 2] = Bl; D[k + 3] = 255;
      }
    }
    c.putImageData(img, 0, 0);
    return cv;
  }

  function paintFar() {
    const ex = Math.ceil(mx * 0.35) + 4, ey = Math.ceil(my * 0.35) + 4;
    const x0 = -ex, x1 = W + ex, y0 = Math.floor(base + 0.04 * amp - ey - 2), y1 = Math.ceil(base + 1.05 * amp + ey);
    const cv = canvasOf((x1 - x0) * dpr, (y1 - y0) * dpr), c = cv.getContext('2d');
    c.imageSmoothingQuality = 'high';
    const xa = Math.floor(-0.08 * W) - 2, n = Math.ceil(1.16 * W) + 6;
    // the low hills on the right, almost lost in the haze
    const range = sample(rangeSegs, xa, n);
    c.drawImage(shadeGrass(range, xa, x0, x1, y0, y1, { seed: 31, b0: 0.6, face: 0.08, depth: 0.15, patch: 0.1, sheen: 0, haze: 0.56 }), 0, 0, cv.width, cv.height);
    c.setTransform(dpr, 0, 0, dpr, -x0 * dpr, -y0 * dpr);
    c.globalCompositeOperation = 'destination-in';
    c.fill(pathOf(rangeSegs, y1 + 4));
    // the ridge on the left, nearer: on top of them
    c.globalCompositeOperation = 'source-over';
    const ridge = sample(ridgeSegs, xa, n), rcv = canvasOf(cv.width, cv.height), rc = rcv.getContext('2d');
    rc.imageSmoothingQuality = 'high';
    rc.drawImage(shadeGrass(ridge, xa, x0, x1, y0, y1, { seed: 57, b0: 0.56, face: 0.14, depth: 0.2, patch: 0.14, sheen: 0.06, haze: 0.42 }), 0, 0, cv.width, cv.height);
    rc.setTransform(dpr, 0, 0, dpr, -x0 * dpr, -y0 * dpr);
    rc.globalCompositeOperation = 'destination-in';
    rc.fill(pathOf(ridgeSegs, y1 + 4));
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.drawImage(rcv, 0, 0);
    return { cv, x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }

  function paintHill() {
    const x0 = -Math.ceil(mx) - 4, x1 = W + Math.ceil(mx) + 4, y0 = Math.floor(base - 8 * U - my - 4), y1 = Math.ceil(H + my + 4);
    const lw = x1 - x0, cv = canvasOf(lw * dpr, (y1 - y0) * dpr), c = cv.getContext('2d');
    c.imageSmoothingQuality = 'high';
    c.drawImage(shadeGrass(crest, cx0, x0, x1, y0, y1, { seed: 0, b0: 0.63, face: 0.2, depth: 0.42, patch: 0.22, sheen: 0.14, haze: 0 }), 0, 0, cv.width, cv.height);
    c.setTransform(dpr, 0, 0, dpr, -x0 * dpr, -y0 * dpr);
    const r = rng(5);
    // a hint of blades: tiny and crowded near the crest, longer in the foreground, leaning a little in the breeze; light
    // ones gather in the light patches and dark ones in the dark, so they read as the grass and not as specks on it
    // (on the context's own path: a Path2D of tens of thousands of shapes takes Chrome far longer to build)
    const want = Math.min(70000, Math.round((lw * (y1 - base)) / 16)), sets = [[], [], [], [], [], []];
    for (let i = 0; i < want; i++) {
      const x = x0 + r() * lw, cy = crestAt(x), d = Math.pow(r(), 1.5), y = cy + 2 + d * (y1 - cy), z = 1 / (d + 0.1);
      const n = noise((x / W - 0.5) * z * 2.6, z * 1.4, 3), light = r() < 0.15 + 0.7 * smooth(0.35, 0.65, n);
      const len = U * (1 + 9 * Math.pow(d, 1.5)) * (0.6 + 0.8 * r()), wd = U * (0.4 + 1.1 * d) * (0.7 + 0.6 * r()), lean = (0.16 + 0.3 * (r() - 0.5)) * len;
      sets[(light ? 0 : 3) + Math.floor(r() * 3)].push(x - wd / 2, y, x + lean, y - len, x + wd / 2, y);
    }
    const blades = (v, fill) => {
      c.beginPath();
      for (let k = 0; k < v.length; k += 6) { c.moveTo(v[k], v[k + 1]); c.lineTo(v[k + 2], v[k + 3]); c.lineTo(v[k + 4], v[k + 5]); }
      c.fillStyle = fill;
      c.fill();
    };
    sets.forEach((v, i) => blades(v, i < 3 ? `rgba(220,246,150,${[0.05, 0.09, 0.14][i]})` : `rgba(10,48,14,${[0.07, 0.12, 0.18][i - 3]})`));
    // the crisp crest
    hillPath = pathOf(mainSegs, y1 + 4);
    c.globalCompositeOperation = 'destination-in';
    c.fillStyle = '#000';
    c.fill(hillPath);
    c.globalCompositeOperation = 'source-over';
    // blades standing up along it, in the crest's own colors, so the edge is grass and not a line
    const tone = (x) => {
      const ux = x / W, fc = clamp(-(crestAt(x + 4) - crestAt(x - 4)) / 8 * 3.4, -1, 1);
      return clamp(0.63 + 0.2 * fc + 0.22 * (noise((ux - 0.5) * 26, 14, 3) - 0.5) + 0.14 - 0.09 * smooth(0.5, 1.15, ux) + 0.05 * (1 - smooth(-0.1, 0.4, ux)), 0, 1);
    };
    const tones = new Map();
    for (let x = x0; x < x1; x += 1.15) {
      const cy = crestAt(x), h = U * (0.8 + 2.6 * r() * r()), lean = (r() - 0.3) * 1.3 * U, b = Math.round(tone(x) * 14);
      if (!tones.has(b)) tones.set(b, []);
      tones.get(b).push(x - 0.55 * U, cy + 1.6, x + lean, cy - h, x + 0.55 * U, cy + 1.6);
    }
    for (const [b, v] of tones) {
      const t = (b / 14) * (GRASS.length - 1), s = Math.min(GRASS.length - 2, Math.floor(t)), f = t - s, A = GRASS[s], B = GRASS[s + 1];
      blades(v, `rgb(${Math.round(A[0] + (B[0] - A[0]) * f)},${Math.round(A[1] + (B[1] - A[1]) * f)},${Math.round(A[2] + (B[2] - A[2]) * f)})`);
    }
    // the sun grazing the crest
    c.globalCompositeOperation = 'source-atop';
    const g = c.createLinearGradient(0, 0, W, 0);
    g.addColorStop(0, 'rgba(238,255,176,.5)');
    g.addColorStop(0.5, 'rgba(238,255,176,.36)');
    g.addColorStop(0.8, 'rgba(238,255,176,0)');
    c.strokeStyle = g;
    const edge = pathOf(mainSegs);
    c.lineWidth = 2.6 * U;
    c.stroke(edge);
    c.globalAlpha = 0.3;
    c.lineWidth = 12 * U;
    c.stroke(edge);
    c.globalAlpha = 1;
    c.globalCompositeOperation = 'source-over';
    return { cv, x: x0, y: y0, w: lw, h: y1 - y0 };
  }

  // ---------- sprites for what moves ----------
  function sprites() {
    // the light a gust stirs up in the grass, as a ring
    ringCv = canvasOf(256, 256);
    let c = ringCv.getContext('2d'), g = c.createRadialGradient(128, 128, 0, 128, 128, 128);
    g.addColorStop(0, 'rgba(236,255,170,0)');
    g.addColorStop(0.58, 'rgba(236,255,170,0)');
    g.addColorStop(0.8, 'rgba(236,255,170,.9)');
    g.addColorStop(0.9, 'rgba(236,255,170,.3)');
    g.addColorStop(1, 'rgba(236,255,170,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, 256, 256);
    // a cloud's shadow on the grass
    blobCv = canvasOf(256, 256);
    c = blobCv.getContext('2d');
    g = c.createRadialGradient(128, 128, 0, 128, 128, 128);
    g.addColorStop(0, 'rgba(8,40,34,1)');
    g.addColorStop(0.45, 'rgba(8,40,34,.82)');
    g.addColorStop(0.75, 'rgba(8,40,34,.35)');
    g.addColorStop(1, 'rgba(8,40,34,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, 256, 256);
    // shafts of sun from off the top left, each a few nested wedges so it is brightest down its middle and soft at its
    // sides, drawn small so they come out softer still when scaled up
    const k = 1 / 3;
    raysCv = canvasOf(W * k, H * k);
    c = raysCv.getContext('2d');
    c.setTransform(k, 0, 0, k, 0, 0);
    const sx = W * 0.04, sy = -H * 0.1, R = Math.hypot(W, H) * 1.2, r = rng(99);
    g = c.createRadialGradient(sx, sy, 0, sx, sy, R);
    g.addColorStop(0, 'rgba(255,251,232,.8)');
    g.addColorStop(0.3, 'rgba(255,249,228,.34)');
    g.addColorStop(0.75, 'rgba(255,249,228,.06)');
    g.addColorStop(1, 'rgba(255,249,228,0)');
    c.fillStyle = g;
    for (let a = 0.02; a < 1.62; a += 0.08 + 0.1 * r()) {
      const wd = 0.006 + 0.016 * r(), strength = 0.35 + 0.65 * r();
      for (const grow of [1, 1.7, 2.6, 3.8]) {
        c.globalAlpha = strength * 0.3;
        c.beginPath();
        c.moveTo(sx, sy);
        c.lineTo(sx + Math.cos(a - wd * grow) * R, sy + Math.sin(a - wd * grow) * R);
        c.lineTo(sx + Math.cos(a + wd * grow) * R, sy + Math.sin(a + wd * grow) * R);
        c.closePath();
        c.fill();
      }
    }
  }

  function shadowsLayout() {
    shades.length = 0;
    const r = rng(311);
    for (const [d, w, a] of [[0.16, 0.26, 0.2], [0.45, 0.34, 0.2], [0.78, 0.46, 0.18]]) {
      const ww = W * w * (0.85 + 0.3 * r());
      shades.push({ d, w: ww, a, x0: r() * (W + 2 * ww), m: ww, v: V * (5 + 9 * d) });
    }
  }

  // ---------- build ----------
  function resize(w, h, k) {
    const key = `${w}x${h}x${k}`;
    if (key === built && sky) return;
    W = Math.max(2, w); H = Math.max(2, h); dpr = k;
    U = clamp(Math.min(W, H) / 900, 0.55, 1.6);
    // the clouds grow with the screen, but no faster than its height, so an ultrawide sky does not crowd
    S = clamp(Math.min(Math.sqrt(W * H) / 1150, H / 860), 0.66, 1.9);
    V = clamp(W / 1440, 0.5, 1.8);
    mx = W * 0.012; my = H * 0.01;
    geometry();
    sky = paintSky();
    layoutClouds();
    far = paintFar();
    hill = paintHill();
    sprites();
    shadowsLayout();
    ripples.length = 0;
    built = key;
  }
  // let go of the layers while a board is up; resize builds them again
  function drop() {
    sky = far = hill = null;
    clouds.length = 0;
    ringCv = blobCv = raysCv = puffB = null;
    ripples.length = 0;
    birds.length = 0;
    sunAt = -1;
    glow = null;
    built = '';
  }

  // ---------- each frame ----------
  const wrap = (v, L) => ((v % L) + L) % L;
  function cloudX(c) { return wrap(c.x0 + c.v * clock + c.kx, W + 2 * c.m) - c.m; }

  function drawBird(ctx, x, y, s, k) {
    // k: the wings' beat, 1 up to -1 down
    const tip = -k * 0.55 * s, arch = -0.3 * s - k * 0.14 * s;
    ctx.beginPath();
    ctx.moveTo(x - s, y + tip);
    ctx.quadraticCurveTo(x - 0.45 * s, y + arch, x, y + 0.06 * s);
    ctx.quadraticCurveTo(x + 0.45 * s, y + arch, x + s, y + tip);
    ctx.quadraticCurveTo(x + 0.42 * s, y + arch + 0.26 * s, x, y + 0.27 * s);
    ctx.quadraticCurveTo(x - 0.42 * s, y + arch + 0.26 * s, x - s, y + tip);
    ctx.fill();
  }

  function draw(ctx, now, dt) {
    if (!sky) return;
    const t = now / 1000, still = reduced();
    if (still) dt = 0;
    clock += dt;
    const ease = 1 - Math.exp(-dt / 0.5);
    px += (gx - px) * ease;
    py += (gy - py) * ease;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(sky.cv, 0, 0, W, H);
    // the burst of sun, behind the clouds
    let burst = 0;
    if (sunAt >= 0) {
      const age = t - sunAt;
      if (age > 6) sunAt = -1;
      else {
        burst = smooth(0, 0.8, age) * (1 - smooth(2.8, 6, age));
        ctx.save();
        ctx.translate(W * 0.04, -H * 0.1);
        ctx.rotate((age - 3) * 0.006);
        ctx.translate(-W * 0.04, H * 0.1);
        ctx.globalAlpha = burst * 0.9;
        ctx.drawImage(raysCv, 0, 0, W, H);
        ctx.restore();
      }
    }
    for (const c of clouds) {
      if (c.kv) { c.kx += c.kv * dt; c.kv *= Math.exp(-dt / 0.9); if (Math.abs(c.kv) < 0.05) c.kv = 0; }
      const x = cloudX(c) - px * mx * c.depth, y = c.y - py * my * c.depth;
      let sx = 1, sy = 1;
      if (c.wa) {
        const a = t - c.wt;
        if (a > 4) c.wa = 0;
        else { const e = c.wa * Math.exp(-a / 0.8) * Math.sin(a * 6.5); sx = 1 + e; sy = 1 - e * 0.7; }
      }
      ctx.drawImage(c.cv, x + c.sx * sx, y + c.sy * sy, c.cw * sx, c.ch * sy);
    }
    ctx.drawImage(far.cv, far.x - px * mx * 0.35, far.y - py * my * 0.35, far.w, far.h);
    // the near hill, then what crosses it: the clouds' shadows and the gusts
    const hx = -px * mx, hy = -py * my;
    ctx.drawImage(hill.cv, hill.x + hx, hill.y + hy, hill.w, hill.h);
    ctx.save();
    ctx.translate(hx, hy);
    ctx.clip(hillPath);
    for (const s of shades) {
      const x = wrap(s.x0 + s.v * clock, W + 2 * s.m) - s.m, cy = crestAt(x), y = cy + s.d * (H + my - cy), h = s.w * (0.14 + 0.24 * s.d);
      ctx.globalAlpha = s.a;
      ctx.drawImage(blobCv, x - s.w / 2, y - h / 2, s.w, h);
    }
    for (let i = ripples.length - 1; i >= 0; i--) {
      const rp = ripples[i], age = t - rp.t0;
      if (age > 2.6) { ripples.splice(i, 1); continue; }
      if (age < 0) continue;
      const k = age / 2.6, R = (0.05 + 0.95 * (1 - Math.pow(1 - k, 2.2))) * rp.R, sq = 0.2 + 0.32 * rp.d;
      ctx.globalAlpha = rp.a * Math.pow(1 - k, 1.4) * smooth(0, 0.06, k);
      ctx.drawImage(ringCv, rp.x - R, rp.y - R * sq, R * 2, R * 2 * sq);
    }
    ctx.restore();
    // birds
    if (birds.length) {
      ctx.fillStyle = 'rgba(26,36,52,.85)';
      for (let i = birds.length - 1; i >= 0; i--) {
        const b = birds[i], age = t - b.t0;
        if (age < 0) continue;
        let k;
        if (b.flock) {
          b.vy += (-26 * V - b.vy) * (1 - Math.exp(-dt / 1.3));
          b.x += b.vx * dt;
          b.y += b.vy * dt;
          k = Math.sin(b.ph + age * b.f);
        } else {
          b.x += b.vx * dt;
          b.y = b.y0 + Math.sin(age * 0.45 + b.ph) * 9 * U;
          const beat = (age + b.ph) % 5.2;
          k = beat < 1.3 ? Math.sin(beat * 7.2) : 0.2 + 0.05 * Math.sin(age * 1.4);
        }
        if ((b.vx > 0 ? b.x > W + 80 : b.x < -80) || b.y < -60 || age > 40) { birds.splice(i, 1); continue; }
        drawBird(ctx, b.x, b.y, b.s * smooth(0, 0.25, age), k);
      }
    }
    if (burst) {
      // the whole scene warms while the sun breaks through
      ctx.globalAlpha = burst * 0.5;
      ctx.globalCompositeOperation = 'soft-light';
      ctx.fillStyle = '#ffe2a6';
      ctx.fillRect(0, 0, W, H);
      ctx.globalCompositeOperation = 'source-over';
    }
    if (glow) {
      // with reduced motion a double-click only brightens the spot, then fades
      const age = t - glow.t0;
      if (age > 1.4) glow = null;
      else {
        const g = ctx.createRadialGradient(glow.x, glow.y, 0, glow.x, glow.y, 140 * U);
        g.addColorStop(0, 'rgba(255,255,236,.32)');
        g.addColorStop(1, 'rgba(255,255,236,0)');
        ctx.globalAlpha = 1 - smooth(0.3, 1.4, age);
        ctx.fillStyle = g;
        ctx.fillRect(glow.x - 140 * U, glow.y - 140 * U, 280 * U, 280 * U);
      }
    }
    ctx.globalAlpha = 1;
  }

  return {
    resize,
    drop,
    draw,
    // anything moving that wants a smoother frame rate than the drift
    busy: () => ripples.length > 0 || birds.length > 0 || sunAt >= 0 || Math.abs(gx - px) > 0.004 || Math.abs(gy - py) > 0.004 || clouds.some((c) => c.kv || c.wa),
    look(nx, ny) {
      if (reduced()) return;
      gx = clamp(nx * 2, -1, 1);
      gy = clamp(ny * 2, -1, 1);
    },
    poke(x, y) {
      if (!sky) return;
      const t = performance.now() / 1000;
      if (reduced()) { glow = { x, y, t0: t }; return; }
      // the gust meets the grass below where it was called, and runs out from there
      const hx = x + px * mx, cy = crestAt(hx), gyy = Math.max(y + py * my, cy + 0.08 * (H - cy)), d = clamp((gyy - cy) / (H - cy), 0, 1);
      const R = Math.max(W, H) * 0.6;
      ripples.push({ x: hx, y: gyy, d, t0: t, R, a: 0.36 }, { x: hx, y: gyy, d, t0: t + 0.3, R: R * 0.7, a: 0.2 });
      // and pushes the nearest clouds along
      const near = clouds.map((c) => [Math.hypot(cloudX(c) - x, c.y - c.h * 0.5 - y), c]).sort((a, b) => a[0] - b[0]).slice(0, 3);
      for (const [dist, c] of near) {
        const f = clamp(1 - dist / (0.7 * Math.max(W, H)), 0.2, 1);
        c.kv += Math.sign(cloudX(c) - x || 1) * f * 46 * S;
        c.wa = 0.03 * f;
        c.wt = t;
      }
    },
    // the screensaver: a pair of birds gliding slowly across
    star() {
      if (!sky || reduced()) return;
      const t = performance.now() / 1000, dir = Math.random() < 0.5 ? 1 : -1, y0 = H * (0.16 + Math.random() * 0.14), s = 18 * U, x = dir > 0 ? -40 : W + 40;
      birds.push({ x, y: y0, y0, vx: dir * (W + 80) / 20, s, t0: t, ph: Math.random() * 6 });
      birds.push({ x: x - dir * 64 * U, y: y0 + 24 * U, y0: y0 + 24 * U, vx: dir * (W + 80) / 20.5, s: s * 0.8, t0: t + 0.7, ph: Math.random() * 6 });
    },
    // the konami code and surge: the sun breaks through, a gust runs over the hill and a flock lifts off it
    fireworks() {
      if (!sky || reduced()) return;
      const t = performance.now() / 1000, r = Math.random;
      sunAt = t;
      for (let i = 0; i < 14; i++) {
        const x = W * (0.4 + 0.34 * r());
        birds.push({ flock: true, x, y: crestAt(x) + (8 + 40 * r()) * U, vx: (36 + 70 * r()) * V, vy: -(100 + 80 * r()) * V, s: (5 + 4.5 * r()) * U, t0: t + 0.4 + 1.1 * r(), ph: r() * 6, f: 10 + 5 * r() });
      }
      const x = W * 0.55, cy = crestAt(x);
      ripples.push({ x, y: cy + 0.25 * (H - cy), d: 0.25, t0: t + 0.2, R: Math.max(W, H) * 0.75, a: 0.4 }, { x, y: cy + 0.25 * (H - cy), d: 0.25, t0: t + 0.55, R: Math.max(W, H) * 0.55, a: 0.24 });
    },
  };
}
