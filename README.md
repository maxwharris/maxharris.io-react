# maxharris.io

Max Harris's personal site. The home page is **maxOS**: a small desktop in the browser, with glass
windows floating over a world drawn live on a canvas: a meadow by default, or one of five circuit boards.

```bash
npm install
npm run dev        # http://localhost:5173 (proxies /api and /socket.io to the server on :3001)
npm run build
npm test           # the radio's station clock, helpers, display and talk-over (node --test)
RADIO_MOCK=1 npm run dev   # the radio against five local test songs instead of the catalog
RADIO_ADMIN_MOCK=1 npm run dev   # the radio admin against a catalog kept in memory (crates, search, reorder, the radio's list)
RADIO_MOCK=1 RADIO_ADMIN_MOCK=1 npm run dev   # both: the radio plays the admin's queue (long test tones), and the mic goes out live
```

The talk-over in the dev mocks (`scripts/talk-mock.js`) encodes what the mic sends into a live MP3 with a real
ffmpeg, so it needs `ffmpeg` on the PATH. `/__radio-mock/state?talk=on` puts a test voice on the air as if Max were
live from another device (the admin's go live then offers take over); `talk=off` ends whatever talk is live.

## Where things live

| path | what |
|---|---|
| `src/data/site.js` | everything the site says: owner, work projects, personal projects, concepts. Set `hidden: true` on a work project to take it off the site. |
| `public/images/work`, `public/images/personal` | project screenshots as WebP, each with a `-thumb` |
| `src/os/OS.jsx` | the desktop: state, actions, deep links (`/work/<key>`, `/work`, `/personal`, `/about`, `/contact`, `/terminal`), keyboard, easter eggs |
| `src/os/store.js` | the window manager: up to six windows arrange themselves in columns (one tall or two stacked) and never overlap; what does not fit waits in the dock |
| `src/os/Window.jsx` | window chrome, drag to reorder (fling down to put away), open/close/minimize/zoom animations |
| `src/os/apps.jsx` | what each window shows (about, work and personal folders, project, mail, trash, scenes, terminal) |
| `src/os/shell.jsx` | menubar, desktop icons, dock, crown, home view, spotlight, menus, toast, screensaver, boot |
| `src/os/Phone.jsx` | the home screen used on phones and upright tablets |
| `src/os/board.js` | the world behind the windows: its scenes (`SCENES`, the meadow first and default) and the circuit board in five looks (neon, classic, ink, relief, gold), generated, routed and animated on a canvas; no React |
| `src/os/meadow.js` | the meadow: a rolling green hill under a deep blue sky with drifting cumulus, original artwork drawn on the same canvas (sky, clouds and hills painted once into layers; each frame drifts the clouds and their shadows, follows the pointer a little, and plays a gust, birds or a burst of sun); no image files, no React |
| `src/os/terminal.js` | the terminal's commands |
| `src/radio/` | maxradio, reached by typing `radio` or from its icon: the station clock (`schedule.js`, the queue in Max's order from the catalog's anchor, so every listener works out the same song and offset; and the announcer drops in `public/radio/drops`, over every other song, the two recordings taking turns), the engine (`engine.js`, no React), its hook (`useRadio.js`), the catalog's record (`record/ascii.js` and `peaks.js`, a copy to keep in step; `record/dots.js` draws it in dots) and the faceplate, the single-DIN unit Max picked (`Radio.jsx` and `radio.css`; `display.js` draws its dot-matrix display, `vfd.js` holds its 5x7 font, 7-segment digits and scrolling). Everything it writes is lowercase. It plays the catalog's radio crate live from `/catalog/api/radio`; `scripts/radio-mock.js` stands in for it with `RADIO_MOCK=1`. The talk-over: when Max goes live in the radio admin, every radio follows the catalog's word (`/catalog/api/radio/events`) and plays his live MP3 (`/catalog/api/radio/talk/<id>/stream.mp3`) on an element of its own, a few seconds behind him; the music dips to half under it (on iPhone and iPad, where Safari keeps an element's volume, through Web Audio: the engine's mix, with a playback audio session so it plays on locked, and the catalog's bucket answering with CORS; muted, and back in place, where that cannot be done), a drop due meanwhile is left out, his last words play out after he stops (the stream's end), a dropped stream is asked for again while he talks, and his own browser dips without playing him back (`talk.js` decides, tested in `talk.test.js`; `engine.test.js` runs the engine's talk-over against a stand-in browser, `engine.mix.test.js` and `engine.nomix.test.js` its iPhone mix and the fallback). The faceplate's look while he talks is option B from the demo, Max's pick (`talkface.js` and `talkface.css`): the red IR window under illum lights up as an on-air lamp, with live printed beside it |
| `src/radio/admin/` | the radio admin, Max's window for the radio's queue, opened by typing `radio admin` (not in help): the song on air, then the queue in play order with Eastern start times; drag a row by its handle (or arrow keys on it), play a song next, take one out (with undo), add one from the catalog's search. It reads and edits the radio crate through the catalog's session routes, signed in at maxharris.io/catalog (same origin, so the catalog's cookie goes with every request), and an edit takes effect when the song on air ends. `queue.js` works out the queue and the order an edit saves (tested in `queue.test.js`), `state.js` holds the state and the saves, `Admin.jsx` lays it out (loaded the first time the window opens). Under the song on air, the mic card (option 1 from the demo, `Mic.jsx` and `mic.css`): go live and talk over the radio. `mic.js` takes the microphone (echo cancellation, noise suppression and auto gain on), `talk-worklet.js` (an AudioWorklet) makes it 24 kHz mono 16-bit chunks of 250 ms and a level, and `uplink.js` posts them to the catalog's talk, at most four at a time (going live gives up after 10 s without an answer, and a tap while going live stops: `mic.test.js`); the radios in the same browser are told on the `maxradio` channel, so they dip and never play Max back. `scripts/radio-admin-mock.js` stands in for the catalog with `RADIO_ADMIN_MOCK=1` |
| `radio/index.html` | the radio on its own at `/radio/` (REL pops it out): a second page in the build that loads only React and the radio |
| `radio/embed/index.html` | the radio for a stream at `/radio/embed/` (below): a third page, React and the radio only, on a transparent background |
| `src/os/radioIcon.js` | the radio's icon on the desktop and the phone's home grid: tunes in inside the click, then opens the radio window |
| `src/pages/SharePage.jsx`, `src/etf.jsx` | `/share` and `/etf`, loaded only when visited. `/share` is switched off for now (`SHARE_ON` in `src/App.jsx` and `server/index.js`) |
| `server/` | express API: contact form (`/api/contact`), share board, analytics |

## maxradio on twitch

`https://maxharris.io/radio/embed/` is the radio for a stream: add it to OBS as a **Browser** source. The page is
transparent, it switches on by itself and joins whatever is on air, and it has no link back to the site and no REL.
It never takes the radio from a tab you have open, and no tab takes it from the stream.

| URL | shows | OBS width x height |
|---|---|---|
| `https://maxharris.io/radio/embed/` | the whole faceplate, with its shadow | 1092 x 326 (or 728 x 218) |
| `https://maxharris.io/radio/embed/?display` | only the dot-matrix display: the record, the text lines and the meter | 856 x 261 (or 642 x 196) |

Either one fills whatever size the source is; those sizes fit it with no empty edge. Add `volume=0..100` for the
radio's own knob (80 by default) and `illum=` one of `blue aqua green amber red white` for the light, for example
`https://maxharris.io/radio/embed/?display&illum=amber&volume=100`.

The embed plays the talk-over too: when you go live in the radio admin, it plays your voice over the music like any
radio. If you also talk into your stream mic, viewers would hear you twice (once live, once from the radio a few
seconds later): add `talk=0` to leave the talk-over out of the embed, for example
`https://maxharris.io/radio/embed/?display&talk=0`.

In the source's properties:

- turn **Control audio via OBS** on: the radio becomes its own source in the audio mixer, where you set its level, and
  it plays into the stream rather than out of your speakers (to hear it too, set its Audio Monitoring to Monitor and
  Output in Advanced Audio Properties);
- turn **Shutdown source when not visible** off, and **Refresh browser when scene becomes active** off, so it keeps
  playing when you switch scenes;
- leave the custom CSS as OBS fills it in.

To press its keys (pwr, disp, illum, the knob), right-click the source and pick **Interact**. If a browser ever shows
push pwr on it, pressing pwr there tunes in (the display alone has no keys: click anywhere on it).

Deploy with `deployp` from this folder (see `../CLAUDE.md` and `deploy.sh`).
