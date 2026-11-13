// What maxradio's display can show, with no DOM in it (display.js draws it, vfd.test.js checks it). Direction C, the
// single-DIN unit (Max, 11/13/26: "i think i like C the best"): a blue vacuum fluorescent display with a 5x7 dot-matrix
// font in the style of the HD44780 character modules of the time, 7-segment digits for the frequency and the clock,
// the colours ILLUM steps through, and the arithmetic of a line of dots that scrolls when it does not fit.
//
// Everything maxradio writes is lowercase (Max, 11/13/26: "in maxradio, keep all lowercase"): vfdText lowercases what
// it is given, and the font has no capitals at all.

/** The colours ILLUM steps through (engine.js ILLUMS names them, blue first). */
export const ILLUM = { blue: '#4d8dff', aqua: '#36ecd6', green: '#8af466', amber: '#ffb23e', red: '#ff5246', white: '#eaf2ff' };
export const illumColor = (name) => ILLUM[name] || ILLUM.blue;

/** An unlit dot or segment: the grid shows faintly through the glass. */
export const GHOST = 'rgba(150,180,210,.065)';

// ---------------------------------------------------------------- the 5x7 font
// A glyph is 7 rows from the top, each a 5-bit number written in base 32, the leftmost dot the high bit: 'e' is 01110.
const F57 = {
  ' ': '0000000',
  0: 'ehjlphe', 1: '4c4444e', 2: 'eh1248v', 3: 'v2421he', 4: '26aiv22', 5: 'vgu11he', 6: '68guhhe', 7: 'v124888', 8: 'ehhehhe', 9: 'ehhf12c',
  a: '00e1fhf', b: 'ggmphhu', c: '00egghe', d: '11djhhf', e: '00ehvge', f: '698s888', g: '0fhhf1e', h: 'ggmphhh', i: '40c444e',
  j: '20622ic', k: 'ggikoki', l: 'c44444e', m: '00qllhh', n: '00mphhh', o: '00ehhhe', p: '00uhugg', q: '00djf11', r: '00mpggg',
  s: '00ege1u', t: '88s8896', u: '00hhhjd', v: '00hhha4', w: '00hhlla', x: '00ha4ah', y: '00hhf1e', z: '00v248v',
  '.': '00000cc', ',': '0000c48', ':': '0cc0cc0', ';': '0cc0c48', '-': '000v000', '(': '2488842', ')': '8422248',
  '[': 'e88888e', ']': 'e22222e', '{': '2448442', '}': '8442448', "'": 'c480000', '"': 'aaa0000', '`': '8420000',
  '&': 'cik8lid', '/': '01248g0', '\\': '0g84210', '|': '4444444', '!': '4444404', '?': 'eh12404', '+': '044v440',
  '·': '00cc000', '*': '04lel40', '#': 'aavavaa', '%': 'op248j3', '_': '000000v', '=': '00v0v00', '>': '8421248',
  '<': '248g842', '@': 'ehnlnge', $: '4fke5u4', '~': '008l200', '^': '4ah0000',
};

/** Each glyph as its 5 columns, left to right; bit r of a column is the dot in row r from the top. */
export const GLYPH = {};
for (const [ch, rows] of Object.entries(F57)) {
  const bits = [...rows].map((c) => parseInt(c, 32));
  const cols = [];
  for (let c = 0; c < 5; c++) {
    let m = 0;
    for (let r = 0; r < 7; r++) if ((bits[r] >> (4 - c)) & 1) m |= 1 << r;
    cols.push(m);
  }
  GLYPH[ch] = cols;
}

// What a title may hold that the font draws another way.
const SWAP = {
  '‘': "'", '’': "'", '‚': "'", '′': "'", '“': '"', '”': '"', '„': '"', '″': '"', '«': '"', '»': '"',
  '‐': '-', '‑': '-', '–': '-', '—': '-', '−': '-', '…': '...', '•': '·', '×': 'x',
  'ß': 'ss', 'æ': 'ae', 'œ': 'oe', 'ø': 'o', 'ł': 'l', 'đ': 'd', 'ð': 'd', 'þ': 'th', 'ı': 'i',
};
const MARK = /[̀-ͯ]/;

/** Text as the display writes it: lowercase, accents dropped (é reads as e), anything the font lacks as '?'. */
export function vfdText(s) {
  let out = '';
  for (const ch of String(s ?? '').normalize('NFKD').toLowerCase()) {
    if (MARK.test(ch)) continue;
    const t = /\s/.test(ch) ? ' ' : SWAP[ch] ?? ch;
    for (const c of t) out += GLYPH[c] ? c : '?';
  }
  return out;
}

/** A line of text (vfdText's) as dot columns: 5 a character and one blank between characters. */
export function textCols(str) {
  const out = [];
  for (const ch of str) out.push(...(GLYPH[ch] || GLYPH['?']), 0);
  if (out.length) out.pop();
  return out;
}

// ---------------------------------------------------------------- a line that scrolls when it does not fit
export const HOLD_MS = 1100; // a long line rests this long before it moves
export const COLS_PER_S = 17; // then moves this many dot columns a second
export const GAP_COLS = 19; // and comes round again after three blank characters
export const PAGE_MS = 3000; // reduced motion: a page of whole characters at a time instead

/**
 * The n columns a line shows ms after its text appeared. Text that fits sits at the left; longer text rests, then runs
 * column by column and comes round again; with reduced motion it turns over a page of whole characters every 3 s.
 */
export function lineView(cols, n, ms, reduced = false) {
  const len = cols.length, view = new Array(Math.max(0, n)).fill(0);
  if (len <= n) {
    for (let c = 0; c < len; c++) view[c] = cols[c];
    return view;
  }
  if (reduced) {
    const step = Math.max(6, Math.floor((n + 1) / 6) * 6), pages = Math.ceil((len + 1) / step);
    const at = (Math.floor(Math.max(0, ms) / PAGE_MS) % pages) * step;
    for (let c = 0; c < Math.min(n, step); c++) view[c] = cols[at + c] || 0;
    return view;
  }
  const loop = len + GAP_COLS, off = Math.max(0, Math.floor(((ms - HOLD_MS) / 1000) * COLS_PER_S));
  for (let c = 0; c < n; c++) {
    const k = (off + c) % loop;
    view[c] = k < len ? cols[k] : 0;
  }
  return view;
}

// ---------------------------------------------------------------- 7-segment digits
/** Which segments light for each character (a top, then clockwise, g the middle). */
export const SEG7 = { ' ': '', 0: 'abcdef', 1: 'bc', 2: 'abdeg', 3: 'abcdg', 4: 'bcfg', 5: 'acdfg', 6: 'acdefg', 7: 'abc', 8: 'abcdefg', 9: 'abcdfg', '-': 'g', _: 'd' };

/**
 * A string for n digit cells, right-aligned: '.' lights the point of the digit before it and ':' the colon, so
 * "999.9" fills 4 cells and "1:22" is a blank, 1, 2, 2 with the colon. Returns {cells: [{segs, dp}], colon}.
 */
export function segCells(text, n) {
  const tok = [];
  let colon = false;
  for (const ch of String(text ?? '')) {
    const last = tok[tok.length - 1];
    if (ch === '.' && last && last.c !== ' ' && !last.dp) { last.dp = true; continue; }
    if (ch === ':') { colon = true; continue; }
    tok.push({ c: ch, dp: false });
  }
  const cells = tok.slice(-n);
  while (cells.length < n) cells.unshift({ c: ' ', dp: false });
  return { cells: cells.map((t) => ({ segs: SEG7[t.c] ?? '', dp: t.dp })), colon };
}
