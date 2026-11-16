// maxradio's talk-over, the pure parts (no DOM; talk.test.js). Max goes live in the radio admin (admin/mic.js) and every
// radio hears him about 5 s later (TALK_LAG_S), over the music (Max, 11/15/26: "broadcast input radio-admin panel to all
// radio viewers live ... so the user can talk over the radio like announcer"). The catalog says when a talk is on (GET
// /catalog/api/radio's talk field, and the events stream /catalog/api/radio/events) and streams it as a live MP3
// (/catalog/api/radio/talk/:id/stream.mp3); engine.js plays it on an element of its own and dips the music under it.
// This decides what a radio plays and how far the music dips.

/**
 * How far behind Max a listener hears him, in seconds, as the mic card tells him (admin/Mic.jsx): Chrome holds a live MP3
 * until it has about 32 KB, 4.1 s at the catalog's 64 kbps, on top of the mic's 250 ms chunks and the catalog's 0.4 s
 * from a chunk's post to its stream (the catalog's docs/app.md: 4.7 s from post to playback in Chrome; 4.5 s from going
 * live to the first sound, measured with the dev mocks, which add no 0.4 s).
 */
export const TALK_LAG_S = 5;

/** The music's share of the knob while a talk sounds (Max was told "about a third"): down in 250 ms, up in 450 ms after. */
export const TALK_SHARE = 1 / 3;
/** And under an announcer drop. */
export const DROP_SHARE = 0.4;
/** How long the word of this browser's radio admin that it is live holds without being said again (it says so every 2 s). */
export const OWN_MS = 6000;
/** At most this many of this browser's own talks are remembered (never played back here). */
const OWN_KEEP = 8;

const ID = /^[A-Za-z0-9_-]{8,64}$/; // the catalog's ids are 22 url-safe characters; the id goes into a path

/** The catalog's talk state as far as a radio can use it: {on: false}, or {on: true, id, since}. Anything else is off. */
export function normalizeTalk(x) {
  if (!x || x.on !== true || typeof x.id !== 'string' || !ID.test(x.id)) return { on: false };
  const since = Number(x.since);
  return { on: true, id: x.id, since: Number.isFinite(since) ? since : 0 };
}

/** Whether two words about the talk say the same thing. */
export const sameTalk = (a, b) => !!a && !!b && a.on === b.on && (!a.on || (a.id === b.id && a.since === b.since));

/** Nothing heard yet from this browser's radio admin. */
export const NO_OWN = Object.freeze({ live: null, at: 0, ids: Object.freeze([]) });

/**
 * This browser's radio admin said one of its talks is on or off ('talking' on the 'maxradio' channel). own: {live (the
 * talk it is sending now, or null), at (when it last said so, Date.now() ms), ids (every talk it said was its own)}.
 * Returns the new one. An off keeps the id, so a catalog that says it is on a moment longer still never plays it here.
 */
export function heardOwn(own, id, on, now) {
  if (typeof id !== 'string' || !id) return own;
  const ids = own.ids.includes(id) ? own.ids : [...own.ids.slice(1 - OWN_KEEP), id];
  if (on) return { live: id, at: now, ids };
  return own.live === id ? { live: null, at: 0, ids } : { ...own, ids };
}

/**
 * What a radio does about the talk: {play: the talk to play (its id) or null, echo: this browser's radio admin is live
 * (the music dips, and nothing plays: Max never hears himself a few seconds late)}.
 *   enabled: the radio is on and takes talk-over (not the embed with ?talk=0);
 *   talk: the catalog's word (normalizeTalk); own: heardOwn's; now: Date.now().
 */
export function talkPlan({ enabled, talk, own = NO_OWN, now }) {
  if (!enabled) return { play: null, echo: false };
  const echo = !!own.live && now - own.at < OWN_MS;
  const play = talk && talk.on && !own.ids.includes(talk.id) ? talk.id : null;
  return { play, echo };
}

/**
 * Whether the talk a radio is playing (voice: {id, down}) plays on to the end of its stream once it is no longer to be
 * played: only after the catalog has said no talk is on. His last words are still in the listener's player then (Chrome
 * holds about 4.5 s of a live MP3 before it starts), and the stream ends right after them. Not with the radio off, while
 * this browser's radio admin is live (nothing of Max plays here then), for this browser's own talk, or while the element
 * waits to try again (it holds nothing). A talk coming on meanwhile is talkPlan's play, and replaces it.
 */
export function playsOut({ enabled, talk, own = NO_OWN, echo = false, voice }) {
  return !!enabled && !echo && !!voice && !voice.down && !(talk && talk.on) && !own.ids.includes(voice.id);
}

/** The music's share of the knob: a third while Max talks (drops wait meanwhile), DROP_SHARE under a drop, else all. */
export const musicShare = ({ talking, drop }) => (talking ? TALK_SHARE : drop ? DROP_SHARE : 1);

/**
 * The talk's element failed (an error, its stream ended, a stall): it asks for the stream again this long after each
 * failure in a row, the last wait repeating, for as long as the catalog says that talk is on, so a phone moving between
 * cells or a dropped connection gets Max back once the network is. Sounding steadily for a while starts the count again
 * (engine.js). At most one request every 30 s, far inside the catalog's limits for a listener.
 */
export const TALK_RETRY_MS = [1000, 3000, 8000, 15000, 30000];
/** How long the element waits to ask again after failure number tries in a row (from 0); -1: that talk is not on. */
export const voiceRetryMs = ({ tries, talk, id }) =>
  !!talk && talk.on === true && talk.id === id ? TALK_RETRY_MS[Math.min(Math.max(0, Math.floor(tries) || 0), TALK_RETRY_MS.length - 1)] : -1;

/** Whose word about the talk is taken: the events stream's always; a queue read's only while that stream is not live. */
export const takesTalk = (source, eventsLive) => source === 'events' || !eventsLive;
