// The radio admin's mic, sending (mic.js does the fetches and says how each went; uplink.test.js): the worklet's 250 ms
// chunks POSTed to the catalog's talk, at most four at a time, each numbered (seq from 0) the first time it goes, so the
// numbers the catalog sees run without a gap. A chunk that got no answer goes again from the front, a moment later, with
// its number. Chunks waiting behind a slow connection give way, oldest first, past 2 s: a live voice late is worse than a
// word missed. Pure: no fetch, no clock of its own.

export const IN_FLIGHT = 4;
export const WAITING = 8; // chunks: 2 s of voice
export const AGAIN_MS = 250; // a chunk that got no answer goes again after this
export const LOST_MS = 5000; // nothing taken for this long: the catalog has ended the talk (it does after 4 s without audio)

export class Uplink {
  /** now: when the talk started (Date.now() ms). */
  constructor(now = 0) {
    this.queue = []; // {pcm, seq (-1 until sent), tries, after}
    this.inFlight = 0;
    this.seq = 0;
    this.lastOk = now;
    this.dropped = 0;
    this.end = ''; // 'gone' (410: the talk ended) or 'refused' (the catalog will not take it): nothing more goes
  }

  /** A chunk from the worklet (an ArrayBuffer of s16le PCM). */
  push(pcm) {
    this.queue.push({ pcm, seq: -1, tries: 0, after: 0 });
    while (this.queue.length > WAITING) {
      const i = this.queue.findIndex((c) => c.seq < 0); // never one already numbered: its number must still arrive
      if (i < 0) break;
      this.queue.splice(i, 1);
      this.dropped += 1;
    }
  }

  /** The chunk to send now, or null (four in flight, nothing waiting, the first one waiting to go again, or the end). */
  next(now) {
    if (this.end || this.inFlight >= IN_FLIGHT || !this.queue.length || this.queue[0].after > now) return null;
    const c = this.queue.shift();
    if (c.seq < 0) c.seq = this.seq++;
    this.inFlight += 1;
    return c;
  }

  /** How a send went: 'ok', 'retry' (no answer, or the catalog was busy), 'gone' (410) or 'refused' (any other no). */
  done(c, outcome, now) {
    this.inFlight = Math.max(0, this.inFlight - 1);
    if (outcome === 'ok') {
      this.lastOk = Math.max(this.lastOk, now);
      return;
    }
    if (outcome === 'retry') {
      if (this.end) return;
      c.tries += 1;
      c.after = now + AGAIN_MS;
      // back in front of everything not yet sent, after any lower number already waiting to go again
      let i = 0;
      while (i < this.queue.length && this.queue[i].seq >= 0 && this.queue[i].seq < c.seq) i++;
      this.queue.splice(i, 0, c);
      return;
    }
    if (!this.end) this.end = outcome === 'gone' ? 'gone' : 'refused';
  }

  /** Nothing has been taken for LOST_MS: the talk is over on the catalog's side. */
  lost(now) {
    return now - this.lastOk > LOST_MS;
  }
}
