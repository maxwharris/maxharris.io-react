# maxharris.io

Max Harris's personal site. The home page is **maxOS**: a small desktop in the browser, with glass
windows floating over a mountain lake that is drawn live on a canvas.

```bash
npm install
npm run dev        # http://localhost:5173 (proxies /api and /socket.io to the server on :3001)
npm run build
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
| `src/os/scene.js` | the canvas world (day, dusk, night, snow); no React |
| `src/os/terminal.js` | the terminal's commands |
| `src/pages/SharePage.jsx`, `src/etf.jsx` | `/share` and `/etf`, loaded only when visited |
| `server/` | express API: contact form (`/api/contact`), share board, analytics |

Deploy with `deployp` from this folder (see `../CLAUDE.md` and `deploy.sh`).
