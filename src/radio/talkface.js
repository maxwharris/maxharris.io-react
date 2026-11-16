// What the faceplate shows while Max is on the mic (the talk-over, engine.js: the snapshot's talking): option B from the
// lead's demo, Max's pick (11/16/26). The red IR window under illum lights up as an on-air lamp, with live printed beside
// it (under it where the radio is folded). The display keeps the song, ta stays the RDS indicator it always was, and the
// screen reader's line says he is on. The lamp's look is in talkface.css; the printed word is in Radio.jsx and radio.css.
//
// Radio.jsx passes what it would show otherwise and draws what comes back, so another look is a change to this file and
// its CSS: the demo's A (ta lit, boxed and blinking like a traffic announcement, the display saying max live) or C (the
// display hands over: view 'text', big 'max live', rt 'on the mic  999.9 fm').

export const TALK_TEXT = { sr: 'max is live on the mic' };

/**
 * talking: a talk sounds on this radio (and it is powered). shown: {view, main, big, rt, sr}, what the faceplate shows
 * otherwise (view: 'station', 'text', 'clock' or 'off'; main, big, rt: the three dot lines; sr: the screen reader's line).
 * Returns the same five to show, plus cls: a class for the radio ('mr-onair' lights the lamp, '' for none).
 */
export function talkFace(talking, shown) {
  if (!talking) return { ...shown, cls: '' };
  return { ...shown, sr: TALK_TEXT.sr, cls: 'mr-onair' };
}
