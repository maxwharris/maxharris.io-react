// The radio admin's mic card: option 1 from the lead's demo (11/16/26, "a mic card under the song on air"). Ready, a
// round mic button with go live, the microphone's name and a line on the delay and headphones; live, a red stop button,
// on the mic with the time on, and the level. Also asking for the mic, going live (the button already a stop, pulsing:
// a tap stays off air), the mic refused (and how to allow it), a talk live in another tab (take over), and off air with a
// plain line. mic.js does the work; this lays it out (mic.css).
//
// Admin.jsx only places <Mic />, so the demo's option 2 (a mic button in the window's header) or 3 (hold to talk) is a
// change to this file and its CSS.

import { memo, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createMic } from './mic.js';
import { clock, eastern } from './queue.js';
import { TALK_LAG_S } from '../talk.js';
import './mic.css';

// drawn icons, 24 px lines like the window's own
const MIC = (
  <>
    <path d="M12 3.4a3.1 3.1 0 0 0-3.1 3.1v5.2a3.1 3.1 0 0 0 6.2 0V6.5A3.1 3.1 0 0 0 12 3.4z" />
    <path d="M6.2 11.2a5.8 5.8 0 0 0 11.6 0" />
    <path d="M12 17v3.6M9.2 20.6h5.6" />
  </>
);
const STOP = <rect x="7" y="7" width="10" height="10" rx="2.2" />;
const BARS = 13;

// how late listeners hear him (talk.js, TALK_LAG_S: measured in Chrome), so he can time talking over a song's end
const READY = `talk over the radio. everyone hears you about ${TALK_LAG_S} s later; wear headphones so the music stays out of your mic.`;
/** Each state's heading, line and what the round button says it does. */
const COPY = {
  ready: { h: 'go live', p: READY, act: 'go live: talk over the radio' },
  asking: { h: 'asking for the mic', p: 'say yes when your browser asks to use the microphone.', act: 'asking for the mic' },
  starting: { h: 'going live', p: READY, act: 'cancel: stay off air' },
  live: { h: "you're live", p: '', act: 'stop: go off air' },
  blocked: { h: 'the mic is blocked', p: 'allow the microphone for this site in your browser (the icon by the address, or its site settings), then tap the mic to try again.', act: 'try again' },
  nomic: { h: 'no microphone found', p: 'plug one in or pick one in your sound settings, then tap the mic to try again.', act: 'try again' },
  busy: { h: 'the mic is busy', p: 'another app is using it. close that, then tap the mic to try again.', act: 'try again' },
  nosupport: { h: 'no mic in this browser', p: 'this browser cannot send a microphone from here. try a current chrome, safari or firefox.', act: 'try again' },
  elsewhere: { h: 'take over', p: "you're on the mic in another tab or on another device. take over to go live here; that one goes off air.", act: 'take over: go live here' },
  offair: { h: 'off air', p: '', act: 'go live again' },
};
/** What the screen reader hears as the card changes. */
const SAY = {
  live: "you're live.",
  blocked: 'the mic is blocked.',
  nomic: 'no microphone found.',
  busy: 'the mic is busy.',
  nosupport: 'this browser cannot send a microphone.',
  elsewhere: "you're on the mic somewhere else. take over to go live here.",
};

/** The time now, on the second, while `on`. */
function useNow(on) {
  const [t, setT] = useState(() => Date.now());
  useEffect(() => {
    if (!on) return undefined;
    const id = setInterval(() => setT(Date.now()), 1000);
    return () => clearInterval(id);
  }, [on]);
  return t;
}

/** The mic's level as bars: the newest on the right, 20 a second, straight from the worklet (no re-render). */
function Meter({ mic }) {
  const ref = useRef(null);
  useEffect(() => {
    const bars = ref.current ? [...ref.current.children] : [];
    const seen = bars.map(() => 0);
    return mic.onLevel((v) => {
      seen.shift();
      seen.push(v);
      bars.forEach((b, i) => { b.style.height = `${(3 + seen[i] * 15).toFixed(1)}px`; });
    });
  }, [mic]);
  return <span className="ra-mic-m" ref={ref} aria-hidden="true">{Array.from({ length: BARS }, (_, i) => <b key={i} />)}</span>;
}

function Mic() {
  const [mic] = useState(createMic);
  const s = useSyncExternalStore(mic.subscribe, mic.get, mic.get);
  useEffect(() => {
    mic.open();
    return () => mic.close();
  }, [mic]);
  // the round button stops from the moment the talk is being started (mic.js, tap): a catalog slow to answer is never a trap
  const live = s.phase === 'live', asking = s.phase === 'asking', stops = live || s.phase === 'starting';
  const now = useNow(live);
  const c = COPY[s.phase] || COPY.ready;

  let eye;
  if (live) eye = <><span className="ra-onmic"><i />on the mic</span><span className="ra-clock">{clock(Math.max(0, now - s.since))}</span></>;
  else if (s.phase === 'elsewhere') eye = <><span className="ra-live"><i />live elsewhere</span><span>{s.elsewhere && s.elsewhere.since ? `since ${eastern(s.elsewhere.since)}` : ''}</span></>;
  else eye = <><span>mic</span><span>{s.device}</span></>;
  const line = s.phase === 'offair' ? `${s.why} tap the mic to go live again.` : c.p;
  const said = s.phase === 'offair' ? `off air. ${s.why}` : SAY[s.phase] || '';

  return (
    <section className={`ra-mic ${s.phase}`} aria-label="mic">
      <button type="button" className="ra-mic-b" aria-label={c.act} aria-disabled={asking || undefined} onClick={mic.tap}>
        <svg viewBox="0 0 24 24" aria-hidden="true">{stops ? STOP : MIC}</svg>
      </button>
      <div className="ra-mic-t">
        <p className="ra-eye">{eye}</p>
        <h3>{c.h}</h3>
        {live ? <Meter mic={mic} /> : <p className="ra-cr">{line}</p>}
        {s.phase === 'elsewhere' && (
          <div className="row"><button type="button" className="btn g" onClick={mic.cancel}>not now</button></div>
        )}
      </div>
      <p className="vh" aria-live="polite">{said}</p>
    </section>
  );
}

export default memo(Mic);
