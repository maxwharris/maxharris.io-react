// The radio admin's mic in the audio thread: an AudioWorklet module (mic.js loads it with new URL(..., import.meta.url),
// so the build copies it as it is: no imports). The microphone comes in at the device's rate (48 or 44.1 kHz as a rule)
// and goes out as the catalog takes it (POST /catalog/api/radio/talk/:id/audio): 24 kHz mono, signed 16-bit
// little-endian, 250 ms a chunk (12000 bytes), plus how loud every 50 ms was for the meter. The audio thread keeps
// running in a tab in the background, so these messages, not timers, drive the sending.
//
// The pure parts (the resampler, the 16-bit conversion, the chunker) are exported for talk-worklet.test.js; the processor
// registers itself only inside an AudioWorklet.

export const RATE = 24000; // the catalog's sampleRate
export const CHUNK_MS = 250; // and chunkMs
export const LEVEL_MS = 50;

const blackman = (x) => 0.42 + 0.5 * Math.cos(Math.PI * x) + 0.08 * Math.cos(2 * Math.PI * x); // x in [-1, 1]

/**
 * A streaming resampler: windowed-sinc interpolation (64 taps, Blackman, a table of 512 phases), low-passed below the
 * lower rate's half so nothing folds back from above 12 kHz. push() takes input as it comes and leaves in out what it
 * could make; the same input in any slices gives the same output. Equal rates pass through.
 */
export class Resampler {
  constructor(inRate, outRate, half = 32, phases = 512) {
    this.same = inRate === outRate;
    this.step = inRate / outRate; // input samples per output sample
    this.half = half;
    this.taps = 2 * half;
    this.phases = phases;
    this.out = new Float32Array(512);
    if (this.same) return;
    // the cut-off, as a share of the input's half rate: 85% of the lower rate's, where the window's slope ends near it
    const cut = 0.85 * Math.min(1, outRate / inRate);
    const K = new Float32Array((phases + 1) * this.taps);
    for (let p = 0; p <= phases; p++) {
      let sum = 0;
      for (let j = 0; j < this.taps; j++) {
        const d = p / phases + half - 1 - j; // the output's distance from tap j, in input samples
        const x = d * cut;
        const v = (x === 0 ? 1 : Math.sin(Math.PI * x) / (Math.PI * x)) * (Math.abs(d) < half ? blackman(d / half) : 0);
        K[p * this.taps + j] = v;
        sum += v;
      }
      for (let j = 0; j < this.taps; j++) K[p * this.taps + j] /= sum; // unity gain at every phase
    }
    this.K = K;
    this.buf = new Float32Array(4096);
    this.len = half - 1; // samples kept, from absolute index base: half - 1 zeros come before the first one
    this.base = -(half - 1);
    this.t = 0; // where the next output falls, in input samples (absolute)
  }

  /** Takes n input samples (all of input by default); returns how many output samples are now at the start of out. */
  push(input, n = input.length) {
    if (this.same) {
      if (this.out.length < n) this.out = new Float32Array(n * 2);
      this.out.set(n === input.length ? input : input.subarray(0, n));
      return n;
    }
    if (this.len + n > this.buf.length) {
      const b = new Float32Array((this.len + n) * 2);
      b.set(this.buf.subarray(0, this.len));
      this.buf = b;
    }
    this.buf.set(n === input.length ? input : input.subarray(0, n), this.len);
    this.len += n;
    const last = this.base + this.len - 1;
    const { K, buf, taps, half, phases } = this;
    let m = 0;
    for (;;) {
      const i = Math.floor(this.t);
      if (i + half > last) break; // the taps after it have not come in yet
      const k = Math.round((this.t - i) * phases) * taps, s0 = i - half + 1 - this.base;
      let acc = 0;
      for (let j = 0; j < taps; j++) acc += buf[s0 + j] * K[k + j];
      if (m === this.out.length) {
        const o = new Float32Array(m * 2);
        o.set(this.out);
        this.out = o;
      }
      this.out[m++] = acc;
      this.t += this.step;
    }
    // what no output needs any more goes
    const drop = Math.floor(this.t) - half + 1 - this.base;
    if (drop > 0) {
      buf.copyWithin(0, drop, this.len);
      this.len -= drop;
      this.base += drop;
    }
    return m;
  }
}

/** Samples (-1..1) as signed 16-bit little-endian PCM: clamped, rounded, NaN as silence. Returns an ArrayBuffer of n * 2 bytes. */
export function toS16LE(samples, n = samples.length) {
  const out = new ArrayBuffer(n * 2), dv = new DataView(out);
  for (let i = 0; i < n; i++) {
    const x = samples[i] > 1 ? 1 : samples[i] < -1 ? -1 : samples[i] || 0;
    dv.setInt16(i * 2, Math.round(x < 0 ? x * 32768 : x * 32767), true);
  }
  return out;
}

/**
 * The processor's work without the audio thread: blocks of the input's channels in; send({level, peak}) every levelMs
 * (the RMS level and the loudest sample, 0..1: a meter of the RMS moves with speech, where peaks sit near the top) and
 * send({chunk}, [chunk]) every chunkMs (an ArrayBuffer of rate * chunkMs / 1000 samples, s16le) out. Several channels are
 * averaged to one.
 */
export class Chunker {
  constructor(inRate, { rate = RATE, chunkMs = CHUNK_MS, levelMs = LEVEL_MS } = {}, send = () => {}) {
    this.rs = new Resampler(inRate, rate);
    this.size = Math.max(1, Math.round((rate * chunkMs) / 1000));
    this.chunk = new Float32Array(this.size);
    this.n = 0;
    this.levelEvery = Math.max(1, Math.round((inRate * levelMs) / 1000)); // counted on the input
    this.peak = 0;
    this.sum = 0; // of squares, for the RMS
    this.seen = 0;
    this.mono = new Float32Array(128);
    this.send = send;
  }

  push(channels) {
    const first = channels && channels[0];
    const len = first ? first.length : 0;
    if (!len) return;
    let mono = first;
    if (channels.length > 1) {
      if (this.mono.length < len) this.mono = new Float32Array(len);
      mono = this.mono;
      for (let i = 0; i < len; i++) {
        let s = 0;
        for (let c = 0; c < channels.length; c++) s += channels[c][i];
        mono[i] = s / channels.length;
      }
    }
    for (let i = 0; i < len; i++) {
      const x = mono[i], a = Math.abs(x);
      if (a > this.peak) this.peak = a;
      this.sum += x * x;
    }
    this.seen += len;
    if (this.seen >= this.levelEvery) {
      this.send({ level: Math.min(1, Math.sqrt(this.sum / this.seen)), peak: Math.min(1, this.peak) });
      this.peak = 0;
      this.sum = 0;
      this.seen = 0;
    }
    const m = this.rs.push(mono, len), out = this.rs.out;
    for (let i = 0; i < m; i++) {
      this.chunk[this.n++] = out[i];
      if (this.n === this.size) {
        const pcm = toS16LE(this.chunk, this.size);
        this.send({ chunk: pcm }, [pcm]);
        this.n = 0;
      }
    }
  }
}

// ---------------------------------------------------------------- the processor (inside an AudioWorklet only)
const Processor = typeof globalThis.AudioWorkletProcessor === 'function' ? globalThis.AudioWorkletProcessor : class {};

class TalkUplink extends Processor {
  constructor(options) {
    super();
    this.on = true;
    this.core = new Chunker(globalThis.sampleRate, (options && options.processorOptions) || {}, (msg, transfer) => this.port.postMessage(msg, transfer || []));
    this.port.onmessage = (e) => { if (e.data === 'stop') this.on = false; };
  }

  process(inputs) {
    if (!this.on) return false;
    const input = inputs[0];
    if (input && input.length) this.core.push(input);
    return true;
  }
}

if (typeof globalThis.registerProcessor === 'function') globalThis.registerProcessor('talk-uplink', TalkUplink);
