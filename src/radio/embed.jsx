// maxradio for Max's Twitch stream at maxharris.io/radio/embed/, an OBS browser source (Max, 11/15/26: "i would like to
// make an embedable version of the radio so i can add to my twitch stream"; he picked both, set in the address): the
// faceplate filling a transparent page, or with ?display only its dot-matrix display; ?volume=0..100 and ?illum=<colour>
// set the knob and the light, and ?talk=0 leaves Max's talk-over out (his stream mic already carries his voice). No way
// back to the site and no REL. It switches on by itself (OBS plays without a tap; a browser that will not says push pwr),
// and it stays out of the one-radio channel and the lock screen (engine.js embed).
// React and the radio only, like the pop-out. How to add it to OBS: README.md, "maxradio on twitch".
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import EmbedPage from './EmbedPage.jsx';
import { embed, ILLUMS } from './engine.js';
import { embedOptions } from './format.js';
import './embed.css';

const opts = embedOptions(window.location.search, ILLUMS);
embed(opts);

createRoot(document.getElementById('radio-root')).render(
  <StrictMode>
    <EmbedPage display={opts.display} />
  </StrictMode>,
);
