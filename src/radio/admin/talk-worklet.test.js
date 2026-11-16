// The mic's audio-thread parts (npm test): the device's rate down (or up) to the catalog's 24 kHz with nothing folding
// back, the 16-bit little-endian conversion, and the 250 ms chunks with a level every 50 ms.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Resampler, toS16LE, Chunker, RATE } from './talk-worklet.js';

const sine = (rate, hz, seconds, amp = 0.5) => Float32Array.from({ length: Math.round(rate * seconds) }, (_, i) => amp * Math.sin((2 * Math.PI * hz * i) / rate));
const rms = (a, from = 0, to = a.length) => { let s = 0; for (let i = from; i < to; i++) s += a[i] * a[i]; return Math.sqrt(s / (to - from)); };
const db = (x) => 20 * Math.log10(x);

/** Everything a resampler makes from input fed in slices of the given sizes (cycling). */
function run(rs, input, sizes = [128]) {
  const out = [];
  for (let i = 0, k = 0; i < input.length; k++) {
    const n = Math.min(sizes[k % sizes.length], input.length - i);
    const m = rs.push(input.subarray(i, i + n));
    for (let j = 0; j < m; j++) out.push(rs.out[j]);
    i += n;
  }
  return Float32Array.from(out);
}
/** Crossings of zero upward per second: the frequency of a clean tone. */
function freq(a, rate) {
  let n = 0, first = -1, last = -1;
  for (let i = 1; i < a.length; i++) {
    if (a[i - 1] < 0 && a[i] >= 0) { n++; if (first < 0) first = i; last = i; }
  }
  return ((n - 1) * rate) / (last - first);
}

test('48 kHz to 24 kHz: speech-band tones keep their pitch and level, half as many samples', () => {
  for (const hz of [200, 1000, 5000]) {
    const input = sine(48000, hz, 2);
    const out = run(new Resampler(48000, 24000), input);
    assert.ok(Math.abs(out.length - input.length / 2) <= 32, `length ${out.length}`);
    const body = out.subarray(2000, out.length - 2000);
    assert.ok(Math.abs(db(rms(body) / rms(input))) < 0.2, `${hz} Hz level ${db(rms(body) / rms(input)).toFixed(2)} dB`);
    assert.ok(Math.abs(freq(body, 24000) - hz) < hz * 0.002, `${hz} Hz came out at ${freq(body, 24000)}`);
  }
});

test('48 kHz to 24 kHz: what is above 12 kHz is taken out, not folded down', () => {
  for (const hz of [13000, 15000, 20000]) {
    const out = run(new Resampler(48000, 24000), sine(48000, hz, 1));
    const level = db(rms(out.subarray(1000, out.length - 1000)) / (0.5 / Math.SQRT2));
    assert.ok(level < -55, `${hz} Hz leaks at ${level.toFixed(1)} dB`);
  }
});

test('44.1 kHz to 24 kHz: an uneven step keeps the tone clean, and the count follows the rates', () => {
  const input = sine(44100, 1000, 3);
  const out = run(new Resampler(44100, 24000), input, [128, 100, 37, 512]);
  assert.ok(Math.abs(out.length - (input.length * 24000) / 44100) <= 32, `length ${out.length}`);
  const body = out.subarray(2000, out.length - 2000);
  assert.ok(Math.abs(db(rms(body) / rms(input))) < 0.2);
  assert.ok(Math.abs(freq(body, 24000) - 1000) < 2);
  // what is left after taking out the 1 kHz tone is the error: well below the tone
  let err = 0;
  const w = (2 * Math.PI * 1000) / 24000;
  // fit the phase from the first crossing, then compare
  let k0 = 1;
  while (!(body[k0 - 1] < 0 && body[k0] >= 0)) k0++;
  const phase = -w * (k0 - 1 + body[k0 - 1] / (body[k0 - 1] - body[k0]));
  for (let i = 0; i < 4800; i++) err += (body[i] - 0.5 * Math.sin(w * i + phase)) ** 2;
  assert.ok(db(Math.sqrt(err / 4800) / (0.5 / Math.SQRT2)) < -40, 'error under -40 dB');
  const high = run(new Resampler(44100, 24000), sine(44100, 15000, 1));
  assert.ok(db(rms(high.subarray(1000, high.length - 1000)) / (0.5 / Math.SQRT2)) < -45);
});

test('any slicing of the input gives the same output', () => {
  const input = Float32Array.from({ length: 30000 }, (_, i) => Math.sin(i / 7) * 0.4 + Math.sin(i / 3.1) * 0.2);
  const one = run(new Resampler(44100, 24000), input, [input.length]);
  const many = run(new Resampler(44100, 24000), input, [1, 2, 3, 128, 5, 1000, 64]);
  assert.equal(many.length, one.length);
  for (let i = 0; i < one.length; i++) assert.equal(many[i], one[i]);
});

test('equal rates pass through; a lower rate is raised', () => {
  const input = sine(24000, 440, 0.5);
  assert.deepEqual(run(new Resampler(24000, 24000), input), input);
  const up = run(new Resampler(16000, 24000), sine(16000, 1000, 2));
  assert.ok(Math.abs(up.length - 48000) <= 64);
  const body = up.subarray(2000, up.length - 2000);
  assert.ok(Math.abs(freq(body, 24000) - 1000) < 2);
  assert.ok(Math.abs(db(rms(body) / (0.5 / Math.SQRT2))) < 0.2);
});

test('16-bit little-endian: clamped, rounded, silence for NaN', () => {
  const buf = toS16LE(Float32Array.from([0, 1, -1, 0.5, -0.5, 1.5, -1.5, NaN, 1 / 32767, -0.25]));
  assert.equal(buf.byteLength, 20);
  const dv = new DataView(buf);
  const got = Array.from({ length: 10 }, (_, i) => dv.getInt16(i * 2, true));
  assert.deepEqual(got, [0, 32767, -32768, 16384, -16384, 32767, -32768, 0, 1, -8192]);
  // the low byte first
  assert.deepEqual([...new Uint8Array(buf, 2, 2)], [0xff, 0x7f]);
  assert.deepEqual([...new Uint8Array(buf, 4, 2)], [0x00, 0x80]);
  // only the first n
  assert.equal(toS16LE(Float32Array.from([0.1, 0.2, 0.3]), 2).byteLength, 4);
});

test('the chunker: 250 ms chunks of 12000 bytes at 24 kHz, and a level (RMS and peak) every 50 ms', () => {
  const sent = [];
  const c = new Chunker(48000, {}, (msg, transfer) => sent.push({ msg, transfer }));
  // one second of a stereo mic in 128-sample blocks (the audio thread's), the right channel silent
  const left = sine(48000, 300, 1, 0.8), right = new Float32Array(left.length);
  for (let i = 0; i < left.length; i += 128) c.push([left.subarray(i, i + 128), right.subarray(i, i + 128)]);
  const chunks = sent.filter((s) => s.msg.chunk), levels = sent.filter((s) => s.msg.level != null);
  assert.equal(RATE, 24000);
  assert.equal(chunks.length, 3, 'the fourth is still filling: the resampler holds a few samples back');
  for (const s of chunks) {
    assert.equal(s.msg.chunk.byteLength, 12000);
    assert.deepEqual(s.transfer, [s.msg.chunk], 'handed over, not copied');
  }
  assert.ok(levels.length >= 19 && levels.length <= 20, `${levels.length} levels`);
  // the two channels averaged: 0.8 on the left and nothing on the right is a 0.4 tone, whose RMS is 0.4 / sqrt(2)
  for (const s of levels.slice(1)) {
    assert.ok(Math.abs(s.msg.level - 0.4 / Math.SQRT2) < 0.01, `level ${s.msg.level}`);
    assert.ok(Math.abs(s.msg.peak - 0.4) < 0.01, `peak ${s.msg.peak}`);
  }
  // the PCM is the tone at the averaged level
  const dv = new DataView(chunks[1].msg.chunk);
  let peak = 0;
  for (let i = 0; i < 6000; i++) peak = Math.max(peak, Math.abs(dv.getInt16(i * 2, true)));
  assert.ok(Math.abs(peak / 32767 - 0.4) < 0.01, `peak ${peak / 32767}`);
  // a mono mic goes straight through; nothing for an empty block
  const mono = [];
  const m = new Chunker(24000, { chunkMs: 250 }, (msg) => mono.push(msg));
  m.push([]);
  m.push([new Float32Array(0)]);
  for (let i = 0; i < 6000; i += 128) m.push([new Float32Array(Math.min(128, 6000 - i)).fill(0.25)]);
  assert.equal(mono.filter((x) => x.chunk).length, 1);
});
