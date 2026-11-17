// The radio admin's mic: Max live over the radio (Max, 11/15/26: "broadcast input radio-admin panel to all radio viewers
// live ... so the user can talk over the radio like announcer"; he picked "works everywhere": listeners hear him a few
// seconds late, in every browser). No React: Mic.jsx draws it.
//
// Going live: the microphone (echo cancellation, noise suppression and automatic gain on), an AudioWorklet that makes it
// 24 kHz mono 16-bit chunks of 250 ms and a level (talk-worklet.js), and the catalog's talk routes (api.js): POST
// /radio/talk starts a talk, each chunk goes to /radio/talk/:id/audio in order, at most four at a time (uplink.js), and
// DELETE ends it. The sending follows the worklet's messages, not a timer, so a tab in the background keeps sending. A 410
// means the catalog ended the talk (another tab took over, 30 minutes, or 4 s without audio); if the window closes while
// live, the talk ends with it (and the catalog would end it by itself 4 s later anyway). Going live never hangs with the
// mic open: a start the catalog has not answered in 10 s is off air ('could not reach the catalog'), and a tap on the
// round button while going live stops at once (tap()); a talk the catalog starts after that is ended as it answers.
//
// The radios in this browser hear about it on the one-radio channel, 'maxradio' ({type: 'talking', id: 'admin', talkId,
// on, at}): they dip the music and never play this talk themselves, so Max does not hear himself a few seconds late. It is
// said as the talk starts, every 2 s while it lasts (and at once to a radio switched on meanwhile), and as it ends.

import { startTalk, sendAudio, endTalk } from './api.js';
import { Uplink } from './uplink.js';
import { low } from './queue.js';
import { audioSession } from '../session.js';

const WORKLET = new URL('./talk-worklet.js', import.meta.url);
const SAY_EVERY = 8; // chunks: the radios here hear 'talking' again every 2 s
const LONGEST_MS = 30 * 60 * 1000; // the catalog ends a talk after 30 minutes
const START_MS = 10000; // the catalog not answering a start this long: off air, the mic let go

/** The device's name as the card shows it: lowercase, without the browser's "Default - ". */
const nameOf = (label) => low(String(label || '').replace(/^default\s*-\s*/i, '').trim());
/** The meter's 0..1 from the worklet's RMS level: -50 dB and below is nothing, -8 dB and up (loud speech) is full. */
export const meterOf = (rms) => {
  const d = 20 * Math.log10(Math.max(rms, 1e-6));
  return Math.min(1, Math.max(0, (d + 50) / 42));
};

/** A getUserMedia refusal as the card's state. */
function micRefused(err) {
  const name = err && err.name;
  if (name === 'NotAllowedError' || name === 'SecurityError' || name === 'PermissionDeniedError') return { phase: 'blocked' };
  if (name === 'NotFoundError' || name === 'OverconstrainedError' || name === 'DevicesNotFoundError') return { phase: 'nomic' };
  if (name === 'NotReadableError' || name === 'TrackStartError' || name === 'AbortError') return { phase: 'busy' };
  return { phase: 'offair', why: 'the mic would not start in this browser.' };
}
/** The catalog's no to starting a talk, as a plain line (no answer in time is the browser's AbortError). */
function startRefused(err) {
  if (!err || err.status === 0 || err.name === 'AbortError') return 'could not reach the catalog.';
  if (err.signin) return 'sign in to the catalog again, then try again.';
  if (err.status >= 500) return 'the catalog could not start the talk just now.';
  return `the catalog did not start it: ${low(err.message).replace(/[.\s]+$/, '')}.`;
}
const liveOf = (data) => {
  const l = data && data.live;
  return l && typeof l.id === 'string' ? { id: l.id, since: Number(l.since) || 0 } : { id: '', since: 0 };
};

/**
 * The mic's state, for useSyncExternalStore: {phase, device, since, why, elsewhere}.
 *   phase: 'ready'; 'asking' (for the mic); 'starting' (the talk); 'live'; 'blocked' (the mic refused), 'nomic', 'busy'
 *   (another app has it), 'nosupport'; 'elsewhere' (a talk is live in another tab or device: elsewhere {id, since});
 *   'offair' (the connection dropped or the catalog said no: why, a plain line).
 *   device: the microphone's name once known; since: when this talk went live (Date.now() ms).
 */
export function createMic() {
  const listeners = new Set(), levelFns = new Set();
  let snap = { phase: 'ready', device: '', since: 0, why: '', elsewhere: null };
  const emit = (patch) => {
    snap = { ...snap, ...patch };
    for (const fn of listeners) fn();
  };
  let cur = null; // {ctx, stream, src, node, id, up, chunks, watch}: the talk going (or being set up)
  let run = 0; // bumps on every start and stop; a start that sees another number has been overtaken
  let chan = null;
  let opened = false;

  // ---------------------------------------------------------------- the radios in this browser
  function channel() {
    if (chan || typeof BroadcastChannel !== 'function') return chan;
    try {
      chan = new BroadcastChannel('maxradio');
      chan.onmessage = (e) => {
        const m = e.data;
        // a radio switched on here while live hears at once that this talk is ours, before it could play it back
        if (m && m.type === 'claim' && cur && cur.id && snap.phase === 'live') say(true, cur.id);
      };
    } catch { chan = null; }
    return chan;
  }
  function say(on, talkId) {
    if (!talkId) return;
    try {
      const c = channel();
      if (c) c.postMessage({ type: 'talking', id: 'admin', talkId, on, at: Date.now() });
    } catch { /* the channel closed */ }
  }

  // ---------------------------------------------------------------- the microphone's name
  async function devices() {
    const md = typeof navigator !== 'undefined' ? navigator.mediaDevices : null;
    if (!md || !md.enumerateDevices) return;
    try {
      const ins = (await md.enumerateDevices()).filter((d) => d.kind === 'audioinput');
      const d = ins.find((x) => x.deviceId === 'default') || ins[0];
      const name = nameOf(d && d.label); // empty until the mic has been allowed once
      if (name && !cur && name !== snap.device) emit({ device: name });
    } catch { /* no names to be had */ }
  }
  const onHide = () => { if (cur) stop(); }; // the page going away: off air now, not 4 s later

  // ---------------------------------------------------------------- going live
  function teardown(c) {
    if (cur === c) cur = null;
    clearInterval(c.watch);
    try {
      if (c.node) {
        c.node.port.onmessage = null;
        c.node.port.postMessage('stop');
        c.node.disconnect();
      }
    } catch { /* gone */ }
    try { if (c.src) c.src.disconnect(); } catch { /* gone */ }
    if (c.stream) for (const t of c.stream.getTracks()) { try { t.stop(); } catch { /* stopped */ } }
    if (c.ctx && c.ctx.state !== 'closed') c.ctx.close().catch(() => {});
    audioSession({ mic: false }); // iPhone, iPad: a radio here gets its playback session back (session.js)
    for (const fn of levelFns) fn(0);
  }
  /** Off air with a plain line: the talk ends (the catalog may have ended it already), and the radios here come back. */
  function lose(why) {
    const c = cur;
    if (!c) return;
    run += 1;
    teardown(c);
    if (c.id) {
      endTalk(c.id);
      say(false, c.id);
    }
    emit({ phase: 'offair', since: 0, why });
  }

  function send(c, item) {
    sendAudio(c.id, item.seq, item.pcm).then((r) => {
      if (cur !== c) return;
      c.up.done(item, r.outcome, Date.now());
      if (r.outcome === 'gone') {
        lose(Date.now() - snap.since >= LONGEST_MS - 30000
          ? 'a talk runs 30 minutes at most, so you went off air.'
          : 'the catalog ended your talk: another tab took over, or your voice stopped reaching it.');
      } else if (r.outcome === 'refused') {
        lose(r.status === 401 ? 'sign in to the catalog again, then try again.'
          : `the catalog stopped taking your voice${r.error ? `: ${low(r.error).replace(/[.\s]+$/, '')}` : ''}.`);
      } else pump(c);
    });
  }
  function pump(c) {
    for (let item = c.up.next(Date.now()); item && cur === c; item = c.up.next(Date.now())) send(c, item);
  }
  /** The worklet's messages drive everything while live: the meter, the chunks, the sending. */
  function heard(c, m) {
    if (cur !== c || !m) return;
    if (typeof m.level === 'number') {
      const v = meterOf(m.level);
      for (const fn of levelFns) fn(v);
    }
    if (m.chunk) {
      c.up.push(m.chunk);
      c.chunks += 1;
      if (c.chunks % SAY_EVERY === 0) say(true, c.id);
    }
    pump(c);
    if (cur === c && c.up.lost(Date.now())) lose('the connection dropped, so you went off air.');
  }

  /** Go live (call it inside the tap: the audio context starts there). takeOver ends a talk live elsewhere first. */
  async function start(takeOver = false) {
    if (cur || snap.phase === 'asking' || snap.phase === 'starting' || snap.phase === 'live') return;
    const my = ++run;
    const AC = typeof window !== 'undefined' ? window.AudioContext || window.webkitAudioContext : null;
    const md = typeof navigator !== 'undefined' ? navigator.mediaDevices : null;
    if (!AC || !md || !md.getUserMedia || typeof AudioWorkletNode !== 'function') { emit({ phase: 'nosupport', why: '' }); return; }
    const c = { ctx: null, stream: null, src: null, node: null, id: '', up: null, chunks: 0, watch: 0 };
    try {
      c.ctx = new AC();
      c.ctx.resume().catch(() => {});
    } catch {
      emit({ phase: 'nosupport', why: '' });
      return;
    }
    cur = c;
    // iPhone, iPad: capture needs a play-and-record session, which a radio here set to playback would otherwise hold off
    // (session.js); teardown hands it back
    audioSession({ mic: true });
    emit({ phase: 'asking', why: '', elsewhere: null });
    try {
      c.stream = await md.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false });
    } catch (err) {
      if (my !== run) return;
      teardown(c);
      emit({ why: '', ...micRefused(err) });
      return;
    }
    if (my !== run) { teardown(c); return; }
    const track = c.stream.getAudioTracks()[0];
    if (track) track.addEventListener('ended', () => { if (cur === c && c.id) lose('the microphone went away, so you went off air.'); });
    emit({ phase: 'starting', device: nameOf(track && track.label) || snap.device });
    try {
      await c.ctx.audioWorklet.addModule(WORKLET.href);
    } catch {
      if (my !== run) return;
      teardown(c);
      emit({ phase: 'offair', why: 'the mic would not start in this browser.' });
      return;
    }
    if (my !== run) { teardown(c); return; }
    let talk;
    // given up on after START_MS, unless stopped meanwhile: then a late answer still comes, and its talk is ended below
    const ctl = new AbortController();
    const late = setTimeout(() => { if (my === run) ctl.abort(); }, START_MS);
    try {
      talk = await startTalk(takeOver, ctl.signal);
    } catch (err) {
      if (my !== run) return;
      teardown(c);
      if (err && err.status === 409) emit({ phase: 'elsewhere', elsewhere: liveOf(err.data) });
      else emit({ phase: 'offair', why: startRefused(err) });
      return;
    } finally {
      clearTimeout(late);
    }
    if (!talk || typeof talk.id !== 'string' || !talk.id) {
      if (my === run) { teardown(c); emit({ phase: 'offair', why: 'the catalog gave no talk to send to.' }); }
      return;
    }
    if (my !== run) { endTalk(talk.id); teardown(c); return; } // stopped while it started
    c.id = talk.id;
    c.up = new Uplink(Date.now());
    try {
      c.src = c.ctx.createMediaStreamSource(c.stream);
      c.node = new AudioWorkletNode(c.ctx, 'talk-uplink', {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [1],
        processorOptions: { rate: Number(talk.sampleRate) || 24000, chunkMs: Number(talk.chunkMs) || 250 },
      });
      c.node.port.onmessage = (e) => heard(c, e.data);
      c.src.connect(c.node);
      c.node.connect(c.ctx.destination); // it writes nothing, so this is silence; a node nothing pulls may not run
    } catch {
      endTalk(c.id);
      teardown(c);
      emit({ phase: 'offair', why: 'the mic would not start in this browser.' });
      return;
    }
    if (c.ctx.state !== 'running') c.ctx.resume().catch(() => {});
    // not what sends (the worklet's messages do): a check once a second that the audio thread still runs at all
    c.watch = setInterval(() => {
      if (cur !== c) return;
      if (c.ctx.state === 'suspended') c.ctx.resume().catch(() => {});
      if (c.up.lost(Date.now())) lose('the connection dropped, so you went off air.');
    }, 1000);
    emit({ phase: 'live', since: Date.now(), why: '' });
    say(true, c.id);
  }

  /** Stop: off air now, the mic let go. */
  function stop() {
    run += 1;
    const c = cur;
    if (c) {
      teardown(c);
      if (c.id) {
        endTalk(c.id);
        say(false, c.id);
      }
    }
    emit({ phase: 'ready', since: 0, why: '', elsewhere: null });
  }

  return {
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    get: () => snap,
    /** The meter: fn(0..1) for every level the worklet sends (20 a second while live), and 0 when it stops. */
    onLevel(fn) {
      levelFns.add(fn);
      return () => levelFns.delete(fn);
    },
    /** The card is up: the channel, the mic's name, and off air if the page goes away. */
    open() {
      if (opened) return;
      opened = true;
      channel();
      devices();
      window.addEventListener('pagehide', onHide);
      if (navigator.mediaDevices && navigator.mediaDevices.addEventListener) navigator.mediaDevices.addEventListener('devicechange', devices);
    },
    /** The card is gone (the window closed): off air if live, and the channel closes. */
    close() {
      if (!opened) return;
      opened = false;
      if (cur) stop();
      window.removeEventListener('pagehide', onHide);
      if (navigator.mediaDevices && navigator.mediaDevices.removeEventListener) navigator.mediaDevices.removeEventListener('devicechange', devices);
      if (chan) {
        try { chan.close(); } catch { /* closed */ }
        chan = null;
      }
    },
    start,
    stop,
    /**
     * A tap on the round button (call it inside the tap): stop while going live or live; nothing while the browser asks
     * for the mic (its own prompt is the thing to answer); else go live, taking over from a talk live elsewhere.
     */
    tap() {
      const p = snap.phase;
      if (p === 'live' || p === 'starting') stop();
      else if (p !== 'asking') start(p === 'elsewhere');
    },
    /** Back to ready from a refusal or a talk live elsewhere. */
    cancel() {
      if (!cur) emit({ phase: 'ready', why: '', elsewhere: null });
    },
  };
}
