// maxradio's faceplate: direction C, the single-DIN unit Max picked from the design demo (11/13/26: "i think i like C
// the best"). A brushed silver frame with a black gloss band; a blue vacuum fluorescent display that holds the catalog's
// record as a 40 by 40 dot graphic in the song's colours (Max: "lets also reutilize the dynamic graphic ... does not need
// to be interactive"), the 7-segment 999.9 fm, maxradio in 5x7 dots and the song scrolling under it, and an L/R meter up
// its right edge; a chrome volume knob with a lit ring; rel (pop out), pwr, disp, illum, an IR window and six presets on
// the band. Everything it writes is lowercase (Max: "in maxradio, keep all lowercase"). There is no play, pause, skip,
// seek, previous or next anywhere, on purpose.
//
// The engine (engine.js) and its hook (useRadio.js) decide everything: this lays out what they say and passes the taps
// back, and display.js draws the canvases. Inside, 1em is 1 mm of a real head unit (178 by 50 mm, one DIN; 124 by 80,
// folded, where it is narrow), scaled to fit where it lives. context: 'window' (the desktop's window, under a header like
// the other windows'), 'phone' (the phone's sheet), 'page' (the pop-out tab at /radio/, centred and scaled to fit).

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { radio, useDial, useRadio, useStationClock, useVolumeKnob } from './useRadio.js';
import { titleLine } from './format.js';
import { Display } from './display.js';
import { illumColor, segCells, vfdText } from './vfd.js';
import './radio.css';

const POWERED = new Set(['tuning', 'on', 'blocked', 'offair']);
const PRESETS = [1, 2, 3, 4, 5, 6];
const PINS = Array.from({ length: 10 }, (_, i) => i); // the chassis connector, seen when the faceplate is off
const SAY_MS = 1500;
const ATTACH_MS = 650;
const SR = { off: 'radio off', tuning: 'tuning', blocked: 'press power to listen', offair: 'no signal', released: 'playing in another tab' };
// the desktop's radio disc (os/icons.jsx TINT.radio, and its radio glyph), drawn here so the pop-out page carries none
// of the desktop's code
const DISC = { '--t1': '#8f9af6', '--t2': '#161b45' };

const reducedNow = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
function useReducedMotion() {
  const [reduced, setReduced] = useState(reducedNow);
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!mq || !mq.addEventListener) return undefined;
    const fn = () => setReduced(mq.matches);
    mq.addEventListener('change', fn);
    return () => mq.removeEventListener('change', fn);
  }, []);
  return reduced;
}

// ---------------------------------------------------------------- 7-segment digits
// Each cell a skewed digit (segments as lines in a 10 x 16 box) with its point; a colon cell between them for a clock.
const G7 = { a: [2.4, 1, 7.6, 1], b: [9, 2.4, 9, 7.1], c: [9, 8.9, 9, 13.6], d: [2.4, 15, 7.6, 15], e: [1, 8.9, 1, 13.6], f: [1, 2.4, 1, 7.1], g: [2.4, 8, 7.6, 8] };
function segLayout(pattern) {
  const cells = [];
  let x = 0, n = 0;
  for (const ch of pattern) {
    if (ch === ':') { cells.push({ colon: true, x: x + 1.2 }); x += 3.8; }
    else { cells.push({ colon: false, x: x + 2.3, i: n++ }); x += 12.4; }
  }
  return { cells, n, w: x + 1.6 };
}
const LAYOUTS = { 8888: segLayout('8888'), '88:88': segLayout('88:88') };

/** pattern: '8888' (the frequency) or '88:88' (a clock); text right-aligned in its cells (vfd.js segCells). */
function Seg({ pattern, text, className }) {
  const L = LAYOUTS[pattern];
  const { cells, colon } = segCells(text, L.n);
  return (
    <svg className={`mr-seg ${className}`} viewBox={`-0.6 -0.9 ${L.w.toFixed(2)} 17.8`} preserveAspectRatio="none" strokeWidth="1.75" aria-hidden="true">
      {L.cells.map((c) => (c.colon ? (
        <g key="colon" transform={`translate(${c.x.toFixed(2)},0)`}>
          <circle className={colon ? 'mr-col on' : 'mr-col'} cx="0.9" cy="5.4" r="0.95" />
          <circle className={colon ? 'mr-col on' : 'mr-col'} cx="0.2" cy="10.6" r="0.95" />
        </g>
      ) : (
        <g key={c.i} transform={`translate(${c.x.toFixed(2)},0) skewX(-8)`}>
          {Object.entries(G7).map(([k, [x1, y1, x2, y2]]) => (
            <line key={k} className={cells[c.i].segs.includes(k) ? 'on' : undefined} x1={x1} y1={y1} x2={x2} y2={y2} />
          ))}
          <circle className={cells[c.i].dp ? 'on' : undefined} cx="10.4" cy="15" r="0.95" />
        </g>
      )))}
    </svg>
  );
}

const Ind = ({ on, box, children }) => <span className={`mr-ind${box ? ' box' : ''}${on ? ' on' : ''}`}>{children}</span>;

const PWR_ICON = <svg className="mr-ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.6v7.6" /><path d="M6.7 7a7.4 7.4 0 1 0 10.6 0" /></svg>;
const REL_ICON = <svg className="mr-ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5.2 5.4 13h13.2z" /><path d="M5.4 17.6h13.2" /></svg>;
const BACK_ICON = <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 12H6.5M11 6.5 5.5 12l5.5 5.5" /></svg>;

export default function Radio({ context = 'window' }) {
  const s = useRadio();
  const clock = useStationClock();
  const freq = useDial(s.status);
  const knob = useVolumeKnob();
  const reduced = useReducedMotion();
  const [said, setSaid] = useState(null); // DISP and ILLUM say what they picked: {text, after (the engine's flash then)}
  const [attach, setAttach] = useState(false); // bring it back: the faceplate clicks into place
  const [boot, setBoot] = useState(true); // no transitions while it first draws
  const rad = useRef(null), mainCv = useRef(null), bigCv = useRef(null), rtCv = useRef(null), recCv = useRef(null), meter = useRef(null);
  const display = useRef(null);

  const status = s.status, on = status === 'on', pw = POWERED.has(status);
  // what the display shows: the station (999.9 and maxradio), the song in big dots, or the clock in the big digits
  const view = !pw ? 'off' : s.disp === 'text' || s.disp === 'clock' ? s.disp : 'station';
  // a moment on the display (display.js puts it where it fits whole): what DISP or ILLUM picked, the engine's (vol 24,
  // no station), or rel opening the tab while this one plays on
  const local = said && (!s.flash || s.flash === said.after) ? said.text : '';
  const flash = pw ? local || (s.flash ? s.flash.text : '') || (on && s.popping ? 'opening tab' : '') : '';
  const title = s.song ? titleLine(s.song) : '';
  let main = '', rt = '';
  if (status === 'tuning') { main = 'tuning'; rt = `seek ${freq}`; }
  else if (status === 'blocked') { main = 'push pwr'; rt = 'push pwr to tune in'; }
  else if (status === 'offair') { main = 'no signal'; rt = s.reason === 'unreachable' ? 'searching for 999.9 fm' : 'maxradio is off air'; }
  else if (on) {
    main = view === 'text' ? title : 'maxradio';
    rt = view === 'text' ? '999.9 fm  maxradio' : title;
  }
  const big = on ? title : main;
  const texts = { main: vfdText(main), big: vfdText(big), rt: vfdText(rt), flash: vfdText(flash) };
  const lit = illumColor(s.illum);
  const ampm = (clock.ampm || '').toLowerCase(), tz = (clock.tz || 'et').toLowerCase();
  const sr = on && s.song ? `now playing ${title.toLowerCase()}, maxradio 999.9 fm` : SR[status] || '';

  useLayoutEffect(() => {
    const d = new Display({ root: rad.current, main: mainCv.current, big: bigCv.current, rt: rtCv.current, rec: recCv.current, meter: meter.current });
    display.current = d;
    return () => { d.destroy(); display.current = null; };
  }, []);
  useLayoutEffect(() => {
    if (display.current) {
      display.current.set({ status, pw, view, texts, blink: status === 'blocked', lit, song: on ? s.song : null, volume: s.volume, reduced });
    }
  });
  useEffect(() => {
    const t = setTimeout(() => setBoot(false), 400);
    return () => clearTimeout(t);
  }, []);
  useEffect(() => {
    if (!said) return undefined;
    const t = setTimeout(() => setSaid(null), SAY_MS);
    return () => clearTimeout(t);
  }, [said]);
  useEffect(() => {
    if (!attach) return undefined;
    const t = setTimeout(() => setAttach(false), ATTACH_MS);
    return () => clearTimeout(t);
  }, [attach]);

  // DISP and ILLUM work while the radio is on, as on the real thing, and say what they picked
  const onDisp = () => {
    if (!pw) return;
    radio.cycleDisplay();
    setSaid({ text: radio.getSnapshot().disp, after: radio.getSnapshot().flash });
  };
  const onIllum = () => {
    if (!pw) return;
    radio.cycleIllum();
    setSaid({ text: `illum ${radio.getSnapshot().illum}`, after: radio.getSnapshot().flash });
  };
  const bringBack = () => {
    radio.power();
    setAttach(true);
  };
  const page = context === 'page';

  return (
    <div className={`mr mr-${context}`}>
      {context === 'window' ? (
        <header className="wh mr-wh">
          <span className="disc" style={DISC}>
            <svg viewBox="0 0 24 24" className="ic" aria-hidden="true">
              <rect x="3" y="8.5" width="18" height="11.5" rx="2.5" /><path d="M6.5 8.5 17 4" /><circle cx="15.6" cy="14.25" r="2.7" /><path d="M6.6 12h4.6M6.6 14.25h4.6M6.6 16.5h4.6" />
            </svg>
          </span>
          <div><h2>radio</h2><p className="sub">999.9 fm · maxradio · live</p></div>
        </header>
      ) : null}
      <div className="mr-host">
        <div
          ref={rad}
          className={`mr-rad${boot ? ' mr-boot' : ''}${attach ? ' mr-attach' : ''}`}
          role="group"
          aria-label="maxradio 999.9 fm"
          data-state={status}
          data-view={view}
          data-pw={pw ? '' : undefined}
          data-illum={s.illum}
          style={{ '--illum': lit, '--rbg': on && s.song ? s.song.look.bg : undefined }}
        >
          <div className="mr-face">
            <div className="mr-band" />
            <span className="mr-print mr-p-mos" aria-hidden="true">mosfet 50w×4</span>
            <span className="mr-logo" aria-hidden="true">max<i>radio</i></span>
            <span className="mr-print mr-p-rds" aria-hidden="true">rds · mp3/wma</span>
            <button type="button" className="mr-key mr-k-rel" disabled={page}
              aria-label={page ? 'release: the radio is in its own tab' : 'release: open the radio in its own tab'}
              title={page ? undefined : 'open the radio in its own tab'} onClick={() => radio.popOut()}>
              {REL_ICON}<span className="mr-lg">rel</span>
            </button>
            <div className="mr-knob" {...knob.props} style={{ '--ang': `${knob.turn}deg` }}>
              <i className="mr-k-ring" /><i className="mr-k-halo" /><i className="mr-k-cap"><i className="mr-k-rot"><i className="mr-k-dot" /></i></i>
            </div>
            <span className="mr-print mr-p-vol" aria-hidden="true">volume</span>
            <button type="button" className="mr-key mr-round mr-k-pwr" aria-label="power" aria-pressed={pw} onClick={() => radio.power()}>{PWR_ICON}</button>
            <button type="button" className="mr-key mr-k-disp" aria-label={`display: ${s.disp}`} onClick={onDisp}><span className="mr-lg">disp</span></button>
            <button type="button" className="mr-key mr-k-illum" aria-label={`illumination: ${s.illum}`} onClick={onIllum}><span className="mr-lg">illum</span></button>
            <span className="mr-ir" aria-hidden="true" />
            <span className="mr-print mr-p-model" aria-hidden="true">mx-999r</span>
            <div className="mr-presets" role="group" aria-label="presets">
              {PRESETS.map((n) => (
                <button key={n} type="button" className="mr-key mr-k-pre" aria-label={n === 1 ? 'preset 1, maxradio' : `preset ${n}, empty`} onClick={() => radio.preset(n)}>
                  <span className="mr-lg">{n}</span>{n === 1 ? <span className="mr-pre-dot" /> : null}
                </button>
              ))}
            </div>

            <div className="mr-vfd" aria-hidden="true">
              <div className="mr-rec"><canvas ref={recCv} /></div>
              <div className="mr-d-top">
                <Ind on={pw} box>fm1</Ind><Ind on={pw}>p1</Ind><Ind on={on}>st</Ind><Ind on={on}>rds</Ind><Ind on={on}>ta</Ind>
                <Ind on={on && s.volume < 0.6}>loud</Ind>
                <span className="mr-sp" />
                <Seg pattern="88:88" text={clock.time} className="mr-s-clk" />
                <span className="mr-ap"><Ind on>{ampm}</Ind><Ind on>{tz}</Ind></span>
              </div>
              <div className="mr-d-mid">
                <Seg pattern="8888" text={pw ? freq : ''} className="mr-s-freq" />
                <Seg pattern="88:88" text={clock.time} className="mr-s-cbig" />
                <span className="mr-u2"><span className="mr-u2f"><b>fm</b><b>mhz</b></span><span className="mr-u2c"><b>{ampm}</b><b>{tz}</b></span></span>
                <div className="mr-dm mr-m-main"><canvas ref={mainCv} /></div>
                <div className="mr-dm mr-m-big"><canvas ref={bigCv} /></div>
              </div>
              <div className="mr-dm mr-d-rt"><canvas ref={rtCv} /></div>
              <div className="mr-meter" ref={meter}><i className="mr-mc"><b /></i><i className="mr-mc"><b /></i></div>
              <i className="mr-dglass" />
            </div>
          </div>

          <div className="mr-chassis">
            <div className="mr-cav" aria-hidden="true">
              <span className="mr-hook mr-hook-l" /><span className="mr-hook mr-hook-r" />
              <span className="mr-conn">{PINS.map((i) => <i key={i} />)}</span>
              <span className="mr-sec" />
              <span className="mr-engr">mx-999</span>
            </div>
            <div className="mr-away">
              <p>playing in another tab<small>maxradio plays in one place at a time</small></p>
              <button type="button" className="mr-bring" onClick={bringBack}>{BACK_ICON}bring it back</button>
            </div>
          </div>
        </div>
      </div>
      <p className="mr-sr" aria-live="polite">{sr}</p>
    </div>
  );
}
