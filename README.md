# maxharris.io

Max Harris's personal site. The home page is **maxOS**: a small desktop in the browser, with glass
windows floating over a world drawn live on a canvas: a meadow by default, or one of five circuit boards.

```bash
npm install
npm run dev        # http://localhost:5173 (proxies /api and /socket.io to the server on :3001)
npm run build
npm test           # the radio's station clock, helpers and display (node --test)
RADIO_MOCK=1 npm run dev   # the radio against four local test songs instead of the catalog
```

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
| `src/radio/` | maxradio, reached by typing `radio`: the station clock (`schedule.js`, every listener works out the same song and offset), the engine (`engine.js`, no React), its hook (`useRadio.js`), the catalog's record (`record/ascii.js` and `peaks.js`, a copy to keep in step; `record/dots.js` draws it in dots) and the faceplate, the single-DIN unit Max picked (`Radio.jsx` and `radio.css`; `display.js` draws its dot-matrix display, `vfd.js` holds its 5x7 font, 7-segment digits and scrolling). Everything it writes is lowercase. It plays the catalog's radio crate live from `/catalog/api/radio`; `scripts/radio-mock.js` stands in for it with `RADIO_MOCK=1` |
| `radio/index.html` | the radio on its own at `/radio/` (REL pops it out): a second page in the build that loads only React and the radio |
| `src/pages/SharePage.jsx`, `src/etf.jsx` | `/share` and `/etf`, loaded only when visited. `/share` is switched off for now (`SHARE_ON` in `src/App.jsx` and `server/index.js`) |
| `server/` | express API: contact form (`/api/contact`), share board, analytics |

Deploy with `deployp` from this folder (see `../CLAUDE.md` and `deploy.sh`).
