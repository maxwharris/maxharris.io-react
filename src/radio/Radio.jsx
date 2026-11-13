// MAXradio's faceplate: an early-2000s car radio (Max, 11/13/26: "a small radio app that emulates a early 2000s car
// radio. show song name, '999.9fm MAXradio' and option to popout into its own tab") over the catalog's record.
//
// A FUNCTIONAL SKELETON. A designer is drawing the real look, and this file's markup and radio.css are what get
// replaced: everything the radio does lives in engine.js and useRadio.js, and this only lays out what they say and
// passes the taps back. Controls: power, volume, DISP, ILLUM, presets (1 is MAXradio, the only station) and REL (pop
// out). There is no play, pause, skip or seek, on purpose.
//
// context: 'window' (the desktop's window), 'page' (the pop-out at /radio/), 'phone' (the phone's sheet).

import { useRef } from 'react';
import { radio, useDisplay, useLevelMeter, useMarquee, useVolumeKnob } from './useRadio.js';
import Record from './record/Record.jsx';
import './radio.css';

const PRESETS = [1, 2, 3, 4, 5, 6];
const POWER = 'M12 3.8v7.4M7.3 6.6a7.2 7.2 0 1 0 9.4 0';
const OUT = 'M13.5 4.5h6v6M19.5 4.5l-8 8M10.5 5.5H6.2c-.9 0-1.7.8-1.7 1.7v10.6c0 .9.8 1.7 1.7 1.7h10.6c.9 0 1.7-.8 1.7-1.7v-4.3';
const Glyph = ({ d }) => <svg viewBox="0 0 24 24" className="mr-ic" aria-hidden="true"><path d={d} /></svg>;

export default function Radio({ context = 'window' }) {
  const d = useDisplay();
  const knob = useVolumeKnob();
  const meter = useRef(null);
  const line = useRef(null);
  const text = useRef(null);
  useLevelMeter(meter);
  const mq = useMarquee(line, text, d.main);
  const scroll = d.scrollable && mq.scroll;
  const powered = d.status !== 'off';
  return (
    <div className={`mr mr-${context}`} data-status={d.status} data-illum={d.illum} data-lit={d.lit ? '' : undefined}>
      <section className="mr-face" aria-label="MAXradio, 999.9 FM">
        <div className="mr-l">
          <button type="button" className="mr-btn mr-pwr" aria-pressed={powered} aria-label={powered ? 'power: on' : 'power: off'} onClick={radio.power}>
            <Glyph d={POWER} /><span>PWR</span>
          </button>
          <div className="mr-knob" {...knob.props} style={{ '--turn': `${knob.turn}deg` }}><i /></div>
          <span className="mr-cap" aria-hidden="true">VOL</span>
        </div>

        <div className="mr-lcd">
          <div className="mr-top">
            <b className="mr-freq">{d.freq}</b>
            {d.freq ? <span className="mr-fm">FM</span> : null}
            <span className="mr-ps">{d.station}</span>
            <span className="mr-clk" title="Eastern time">{d.clock.time}<small>{d.clock.ampm}</small></span>
          </div>
          <div className="mr-line" ref={line}>
            <span className={`mr-run${scroll ? ' scroll' : ''}${d.blink ? ' blink' : ''}`} style={scroll ? { '--secs': `${mq.seconds}s` } : undefined}>
              <span ref={text}>{d.main}</span>
            </span>
          </div>
          <div className="mr-bot">
            <span className="mr-ind" data-on={d.on ? '' : undefined}>ST</span>
            <span className="mr-ind" data-on={d.on ? '' : undefined}>P1</span>
            <span className="mr-sub">{d.sub}</span>
            <i className="mr-meter" ref={meter} aria-hidden="true" />
          </div>
          <p className="mr-sr" aria-live="polite">{d.sr}</p>
        </div>

        <div className="mr-r">
          <button type="button" className="mr-btn" aria-label={`display: ${d.disp}`} onClick={radio.cycleDisplay}>DISP</button>
          <button type="button" className="mr-btn" aria-label={`illumination: ${d.illum}`} onClick={radio.cycleIllum}>ILLUM</button>
          <button type="button" className="mr-btn mr-rel" disabled={context === 'page'}
            aria-label={context === 'page' ? 'release: the radio is in its own tab' : 'release: open the radio in its own tab'} onClick={radio.popOut}>
            <span>REL</span><Glyph d={OUT} />
          </button>
        </div>

        <div className="mr-presets" role="group" aria-label="presets">
          {PRESETS.map((n) => (
            <button key={n} type="button" className="mr-btn mr-pre" aria-label={n === 1 ? 'preset 1: MAXradio' : `preset ${n}: empty`}
              aria-current={n === 1 && d.on ? 'true' : undefined} onClick={() => radio.preset(n)}>{n}</button>
          ))}
        </div>
      </section>

      <div className="mr-well"><Record song={d.song} playing={d.on} /></div>
    </div>
  );
}
