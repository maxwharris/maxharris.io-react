// The display's pure parts (npm test): the 5x7 font and its lowercase, the scrolling line, the 7-segment cells, and the
// catalog's record turned into dots.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GLYPH, ILLUM, illumColor, lineView, segCells, textCols, vfdText, HOLD_MS, COLS_PER_S, GAP_COLS, PAGE_MS } from './vfd.js';
import { ILLUMS, DISPLAY_MODES } from './engine.js';
import { drawRings } from './record/ascii.js';
import { DOTS, dotAlpha, dotGrid, dotLevels, snowLevels } from './record/dots.js';

test('the font writes lowercase, and only lowercase', () => {
  for (const ch of 'abcdefghijklmnopqrstuvwxyz0123456789 .,:;-()\'"&/!?+·*#%_=<>@$') assert.ok(GLYPH[ch], `a glyph for ${ch}`);
  for (const ch of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') assert.equal(GLYPH[ch], undefined);
  for (const cols of Object.values(GLYPH)) {
    assert.equal(cols.length, 5);
    for (const m of cols) assert.ok(m >= 0 && m < 128);
  }
  // 'l' is a stem with a foot: the middle column runs top to bottom
  assert.equal(GLYPH.l[2], 0b1111111);
  assert.deepEqual(GLYPH[' '], [0, 0, 0, 0, 0]);
});

test('whatever it is given, the display writes it lowercase', () => {
  assert.equal(vfdText('MAXradio'), 'maxradio');
  assert.equal(vfdText('Fly Low (Guest)'), 'fly low (guest)');
  assert.equal(vfdText('VOL 24'), 'vol 24');
  assert.equal(vfdText('Café Señor'), 'cafe senor');
  assert.equal(vfdText('don’t stop — “now”…'), 'don\'t stop - "now"...');
  assert.equal(vfdText('straße'), 'strasse');
  assert.equal(vfdText('東京'), '??');
  assert.equal(vfdText(null), '');
  assert.equal(vfdText('a\tb\nc'), 'a b c');
});

test('a character is five columns and a space', () => {
  assert.equal(textCols('').length, 0);
  assert.equal(textCols('a').length, 5);
  assert.equal(textCols('maxradio').length, 8 * 6 - 1);
  assert.deepEqual(textCols('§'), GLYPH['?']); // never drawn blank
});

test('a line that fits sits still; a long one rests, scrolls and comes round', () => {
  const short = textCols('maxradio'), n = 60;
  assert.deepEqual(lineView(short, n, 99999).slice(0, short.length), short);
  assert.ok(lineView(short, n, 99999).slice(short.length).every((m) => m === 0));

  const long = textCols('a long song title that runs on (a friend)'), w = 40;
  assert.deepEqual(lineView(long, w, 0), long.slice(0, w));
  assert.deepEqual(lineView(long, w, HOLD_MS - 1), long.slice(0, w));
  const step = Math.floor(((HOLD_MS + 1000 - HOLD_MS) / 1000) * COLS_PER_S); // one second in
  assert.deepEqual(lineView(long, w, HOLD_MS + 1000), long.slice(step, step + w));
  // after the text and its gap it is back where it began
  const loop = long.length + GAP_COLS, msBack = HOLD_MS + Math.ceil((loop / COLS_PER_S) * 1000);
  assert.deepEqual(lineView(long, w, msBack).slice(0, 5), long.slice(0, 5));
});

test('with reduced motion a long line turns over a page of whole characters', () => {
  const text = 'abcdefghijklmnopqrstuvwxyz', cols = textCols(text), n = 47; // seven characters and most of an eighth
  const page1 = lineView(cols, n, 0, true), page2 = lineView(cols, n, PAGE_MS, true);
  assert.deepEqual(page1, cols.slice(0, 47));
  assert.deepEqual(page2, cols.slice(48, 95)); // starts on 'i', a character boundary
  const pages = Math.ceil((cols.length + 1) / 48);
  assert.deepEqual(lineView(cols, n, PAGE_MS * pages, true), page1);
});

test('7-segment cells: right-aligned, a point after its digit, a colon for the clock', () => {
  const f = segCells('999.9', 4);
  assert.deepEqual(f.cells.map((c) => c.dp), [false, false, true, false]);
  assert.equal(f.cells[0].segs, 'abcdfg');
  assert.equal(f.colon, false);
  const s = segCells('87.5', 4);
  assert.equal(s.cells[0].segs, '');
  assert.equal(s.cells[2].dp, true);
  const c = segCells('1:22', 4);
  assert.equal(c.colon, true);
  assert.deepEqual(c.cells.map((x) => x.segs), ['', 'bc', 'abdeg', 'abdeg']);
  assert.ok(segCells('', 4).cells.every((x) => x.segs === '' && !x.dp));
});

test('every illumination the engine steps through has a colour, blue first; DISP has the three views', () => {
  assert.equal(ILLUMS[0], 'blue');
  for (const name of ILLUMS) assert.equal(illumColor(name), ILLUM[name]);
  assert.equal(illumColor('nonsense'), ILLUM.blue);
  assert.deepEqual(DISPLAY_MODES, ['station', 'text', 'clock']);
});

test('the catalog\'s record as 40 by 40 dots', () => {
  const grid = dotGrid(240, 240);
  assert.equal(grid.g.C, DOTS);
  assert.equal(grid.g.R, DOTS);
  assert.equal(grid.p, 6);
  assert.equal(dotGrid(0, 100), null);
  // a wider box keeps square dots, 40 across its height
  const wide = dotGrid(300, 120);
  assert.equal(wide.g.R, DOTS);
  assert.equal(wide.g.C, 100);

  const { g } = grid, s = Float32Array.from({ length: 200 }, (_, i) => (i % 20) / 20);
  const layers = drawRings(g, s, 0.4, { started: true, arm: true, level: 0.6, pulse: 0.8, ripples: [] });
  const levels = dotLevels(g.C, g.R, layers);
  assert.equal(levels.length, DOTS * DOTS);
  // each dot reads its own cell: the same as reading the two layers row by row
  const rows = { lit: layers.lit.split('\n'), base: layers.base.split('\n') };
  for (const [r, c] of [[0, 0], [20, 20], [5, 33], [39, 39], [12, 7]]) {
    assert.equal(levels[r * g.C + c], Math.fround(dotAlpha(rows.lit[r][c], rows.base[r][c])));
  }
  // the corners are outside the record: empty
  assert.equal(levels[0], Math.fround(0.06));
  // played grooves, the needle and the arm are lit; some of the record is not yet played
  assert.ok(levels.some((v) => v >= 0.6));
  assert.ok(levels.some((v) => v > 0.06 && v < 0.6));
});

test('dot brightness follows the catalog\'s ramp', () => {
  assert.equal(dotAlpha(' ', ' '), 0.06);
  assert.equal(dotAlpha(' ', '@'), 0.5);
  assert.equal(dotAlpha('@', ' '), 1);
  assert.ok(dotAlpha(' ', '.') < dotAlpha(' ', '#'));
  assert.ok(dotAlpha('.', ' ') > dotAlpha(' ', '@')); // anything played outshines anything not
  let x = 7;
  const rnd = () => { x = (x * 1103515245 + 12345) % 2147483648; return x / 2147483648; };
  const snow = snowLevels(4000, rnd);
  assert.ok(snow.every((v) => v >= Math.fround(0.06) && v <= Math.fround(0.5)));
  const lit = snow.filter((v) => v > 0.07).length / snow.length;
  assert.ok(lit > 0.2 && lit < 0.5, `about a third of the static lit (${lit})`);
});
