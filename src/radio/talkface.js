// What the faceplate shows while Max is on the mic (the talk-over, engine.js: the snapshot's talking): option A from the
// lead's demo (11/16/26, "ta, like a traffic announcement"). On a real RDS car radio ta lights up when a traffic
// announcement cuts in and turns the music down; here it stays dark until Max talks, then is lit, boxed and blinking,
// and the display says max live, with max is on the mic scrolling under it. Its look is in talkface.css.
//
// Radio.jsx passes what it would show otherwise and draws what comes back, so another option is a change to this file
// and its CSS alone: B (the red IR window under illum lit as an on-air lamp, live printed beside it) would leave the
// lines as they are and return a cls that lights .mr-ir (the printed word is one more span by it in Radio.jsx); C (the
// display hands over) would return view 'text', big 'max live' and rt 'on the mic  999.9 fm'.

export const TALK_TEXT = { main: 'max live', rt: 'max is on the mic', sr: 'max is live on the mic' };

const DARK = Object.freeze({ on: false, box: false, blink: false });
const LIVE = Object.freeze({ on: true, box: true, blink: true });

/**
 * talking: a talk sounds on this radio (and it is powered). shown: {view, main, big, rt, sr}, what the faceplate shows
 * otherwise (view: 'station', 'text', 'clock' or 'off'; main, big, rt: the three dot lines; sr: the screen reader's line).
 * Returns the same five to show, plus ta ({on, box, blink}: the indicator) and cls (a class for the radio, '' for none).
 */
export function talkFace(talking, shown) {
  if (!talking) return { ...shown, ta: DARK, cls: '' };
  // the main line in every view: the station's and the clock's top line, and the big dots in the song's view
  return { ...shown, main: TALK_TEXT.main, big: TALK_TEXT.main, rt: TALK_TEXT.rt, sr: TALK_TEXT.sr, ta: LIVE, cls: 'mr-talk' };
}
