// The page's audio session on iPhone and iPad (navigator.audioSession, Safari 16.4 on; session.test.js). Two parts of
// the radio want one, and WebKit gives a page one type at a time:
// - the radio admin's mic while it is live (admin/mic.js) needs 'play-and-record': WebKit holds a page set to
//   'playback' to that category, and the microphone would not start under it (or would stop when a radio here powers
//   on mid-talk);
// - a radio whose music may play through Web Audio (engine.js, the mix) needs 'playback' or 'play-and-record': iOS
//   stops an AudioContext when Safari goes to the background or the phone locks unless the page's type is one of those
//   two (WebKit, AudioContext::shouldOverrideBackgroundPlaybackRestriction), where an <audio> would have played on.
// So the mic outranks the radio ('play-and-record' keeps the music playing as well), and with neither the type goes back
// to 'auto', the page's own. Only types this module set are ever undone. Elsewhere (computers, Android) it does nothing.

const want = { mic: false, radio: false };
let ours = false; // the type in force is one this module set

function ios() {
  try {
    const ua = navigator.userAgent || '';
    return /iP(hone|ad|od)/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  } catch { return false; }
}

/**
 * One part says what it wants: {mic: true|false} and/or {radio: true|false}. Returns the type in force afterwards, or ''
 * where there is no audio session to set (not iOS, or a Safari before 16.4).
 */
export function audioSession(patch) {
  Object.assign(want, patch);
  let s = null;
  try { s = typeof navigator !== 'undefined' && ios() ? navigator.audioSession : null; } catch { s = null; }
  if (!s) return '';
  const type = want.mic ? 'play-and-record' : want.radio ? 'playback' : ours ? 'auto' : null;
  try {
    if (type && s.type !== type) s.type = type;
    if (type) ours = type !== 'auto';
  } catch { /* left as it was */ }
  try { return String(s.type || ''); } catch { return ''; }
}
