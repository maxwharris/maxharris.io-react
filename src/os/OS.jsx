import { useCallback, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState, useSyncExternalStore } from 'react';
import './os.css';
import { findWork } from '../data/site';
import { createScene, SCENES, SCENE_DARK } from './board';
import { OSContext, reducer, initialState, appKind, titleOf, store, clamp, IMM0 } from './store';
import { newTerm } from './terminal';
import Window from './Window';
import Phone from './Phone';
import { MenuBar, Desk, Dock, Crown, Home, Spotlight, MenuPopup, Toast, Saver, Boot } from './shell';

// phones, and touch tablets held upright, get the home screen instead of the desktop
const PHONE = '(max-width: 759px), (pointer: coarse) and (max-width: 900px)';
const reducedMQ = window.matchMedia('(prefers-reduced-motion: reduce)');
const reduced = () => reducedMQ.matches;
const KONAMI = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'];

function useMedia(query) {
  return useSyncExternalStore(
    (cb) => { const m = window.matchMedia(query); m.addEventListener('change', cb); return () => m.removeEventListener('change', cb); },
    () => window.matchMedia(query).matches,
  );
}

const pathFor = (w) => {
  if (w.kind === 'project') return `/work/${w.opts.key}`;
  if (w.kind === 'files') return w.opts.tab === 'personal' ? '/personal' : '/work';
  return { about: '/about', mail: '/contact', terminal: '/terminal' }[w.kind] || '/';
};
const toRect = (o) => {
  if (!o) return null;
  const r = o.getBoundingClientRect ? o.getBoundingClientRect() : o;
  return r && r.width ? { left: r.left, top: r.top, width: r.width, height: r.height } : null;
};

export default function OS() {
  const [state, dispatch] = useReducer(reducer, undefined, initialState);
  const phone = useMedia(PHONE);
  // the glass follows the board unless the visitor picked a theme
  const theme = state.theme || (SCENE_DARK[state.scene] ? 'dark' : 'light');
  const stateRef = useRef(state);
  const phoneRef = useRef(phone);
  useLayoutEffect(() => { stateRef.current = state; phoneRef.current = phone; });
  const canvas = useRef(null);
  const sceneRef = useRef(null);
  // the terminal's scrollback outlives its window
  const [shared] = useState(() => ({ term: newTerm() }));
  const get = useCallback(() => stateRef.current, []);
  const didInit = useRef(false);
  const lastAct = useRef(0);

  const themeName = useCallback(() => stateRef.current.theme || (SCENE_DARK[stateRef.current.scene] ? 'dark' : 'light'), []);

  const actions = useMemo(() => {
    const set = (patch) => dispatch({ type: 'set', patch });
    const a = {
      open: (kind, opts = {}, origin) => dispatch({ type: 'open', kind, opts, origin: toRect(origin), phone: phoneRef.current }),
      openApp: (id, origin) => { const [k, o] = appKind(id); a.open(k, o, origin); },
      openSpec(spec, origin) {
        const i = spec.indexOf(':'), t = spec.slice(0, i), v = spec.slice(i + 1);
        if (t === 'app') a.openApp(v, origin);
        else if (t === 'proj') a.open('project', { key: v }, origin);
        else if (t === 'pers') a.open('files', { tab: 'personal', flash: v }, origin);
        else if (t === 'scene') a.setScene(v);
        else if (t === 'cmd') ({ theme: a.toggleTheme, home: a.openHome, sys: () => a.open('sys', {}, origin), secrets: () => a.open('secrets', {}, origin) })[v]?.();
      },
      focus: (kind) => dispatch({ type: 'focus', kind }),
      close: (kind) => dispatch({ type: 'close', kind }),
      remove: (kind) => dispatch({ type: 'remove', kind }),
      minimize: (kind) => (phoneRef.current ? a.close(kind) : dispatch({ type: 'minimize', kind })),
      zoom: (kind) => { if (!phoneRef.current) dispatch({ type: 'zoom', kind }); },
      reorder: (kind, index) => dispatch({ type: 'reorder', kind, index }),
      setOpts: (kind, opts, swap) => dispatch({ type: 'opts', kind, opts, swap }),
      set,
      toast: (msg, ms) => dispatch({ type: 'toast', msg, ms }),
      setTheme(t) { store.set('mx-theme', t); set({ theme: t }); },
      toggleTheme() { const next = themeName() === 'dark' ? 'light' : 'dark'; a.setTheme(next); a.toast(`${next} glass`); },
      setScene(name, quiet) {
        if (!SCENES.includes(name)) return;
        store.set('mx-board', name);
        set({ scene: name });
        if (!quiet) a.toast(`scene: ${name}`);
      },
      setImm(v, quiet) {
        v = clamp(v, 0, 1);
        const was = stateRef.current.imm;
        set({ imm: v });
        if (v >= 0.99 && was < 0.99 && !quiet) a.toast('full immersion. turn the crown back to see the board.');
      },
      getImm: () => stateRef.current.imm,
      setTrash: (trash) => set({ trash }),
      openSpot: () => set({ overlay: 'spot', menu: null }),
      closeSpot: () => { if (stateRef.current.overlay === 'spot') set({ overlay: null }); },
      openHome: () => { if (!phoneRef.current) set({ overlay: 'home', menu: null }); },
      closeHome: () => { if (stateRef.current.overlay === 'home') set({ overlay: null }); },
      toggleHome: () => (stateRef.current.overlay === 'home' ? a.closeHome() : a.openHome()),
      openMenu: (items, x, y, trigger) => set({ menu: { items, x, y, trigger } }),
      closeMenu(refocus) {
        const m = stateRef.current.menu;
        if (!m) return;
        set({ menu: null });
        if (refocus && m.trigger) document.querySelector(`[data-menu="${m.trigger}"]`)?.focus();
      },
      showHidden() {
        if (stateRef.current.secrets) { a.toast('hidden files are already showing'); return; }
        set({ secrets: true });
        a.toast('a hidden file appeared on the desktop');
      },
      restart() {
        dispatch({ type: 'reset' });
        a.setImm(IMM0, true);
        a.setScene(stateRef.current.scene, true);
        set({ bootN: (stateRef.current.bootN || 0) + 1 });
        setTimeout(() => a.rest(), 250);
      },
      fireworks: () => sceneRef.current && sceneRef.current.fireworks(),
      // the opening layout: about, then the work folder beside it (the arranger places them)
      rest() {
        if (phoneRef.current) return;
        dispatch({ type: 'open', kind: 'about', opts: {}, rest: true, delay: 0.45 });
        dispatch({ type: 'open', kind: 'files', opts: { tab: 'work' }, rest: true, delay: 0.6 });
      },
    };
    return a;
  }, [themeName]);

  // ---------- the world ----------
  useEffect(() => {
    const s = createScene(canvas.current, { reduced, env: stateRef.current.scene });
    sceneRef.current = s;
    s.start();
    return () => { s.stop(); sceneRef.current = null; };
  }, []);
  useEffect(() => { if (sceneRef.current) sceneRef.current.set(state.scene); }, [state.scene]);
  useEffect(() => {
    const w = canvas.current, v = state.imm;
    w.style.filter = v > 0.005 ? `blur(${(v * 14).toFixed(1)}px) brightness(${(1 - v * 0.62).toFixed(3)}) saturate(${(1 - v * 0.35).toFixed(3)})` : '';
    w.style.transform = v > 0.005 ? 'scale(1.06)' : '';
  }, [state.imm]);

  // ---------- first load: lay out the desktop and follow deep links ----------
  useEffect(() => {
    if (didInit.current) return;
    didInit.current = true;
    const path = window.location.pathname.replace(/\/+$/, '') || '/';
    const hash = window.location.hash.slice(1);
    const m = path.match(/^\/work\/([\w-]+)$/);
    const a = actions;
    dispatch({ type: 'layout', phone: phoneRef.current });
    a.rest();
    if (m && findWork(m[1])) a.open('project', { key: m[1] });
    else if (path === '/work' || path === '/projects') (phoneRef.current ? a.openApp('work') : a.focus('files'));
    else if (path === '/personal') (phoneRef.current ? a.openApp('personal') : (a.setOpts('files', { tab: 'personal' }), a.focus('files')));
    else if (path === '/about' || hash === 'about') (phoneRef.current ? a.openApp('about') : a.focus('about'));
    else if (path === '/contact' || hash === 'contact') a.openApp('mail');
    else if (path === '/terminal') a.openApp('terminal');
    if (import.meta.env.VITE_DEMO) setTimeout(() => a.toast('five boards to try: open scenes in the dock, or right-click the board', 6000), 1600);
  }, [actions]);
  useEffect(() => {
    document.documentElement.classList.add('os-on');
    return () => document.documentElement.classList.remove('os-on');
  }, []);

  // switching between phone and desktop starts the layout over
  const lastPhone = useRef(phone);
  useEffect(() => {
    if (lastPhone.current === phone) return;
    lastPhone.current = phone;
    dispatch({ type: 'reset' });
    dispatch({ type: 'layout', phone });
    if (!phone) actions.rest();
  }, [phone, actions]);

  // keep the address bar and tab title on whatever window is in front
  useEffect(() => {
    const top = state.top && state.wins[state.top];
    const live = top && !top.rest && !top.closing && !top.min;
    const path = live ? pathFor(top) : '/';
    // a demo build lives at someone else's URL, so it leaves the address bar alone
    if (didInit.current && !import.meta.env.VITE_DEMO && (window.location.pathname !== path || window.location.hash)) {
      try { window.history.replaceState(window.history.state, '', path); } catch { /* a sandboxed preview cannot change its URL */ }
    }
    document.title = live ? `${titleOf(top)} · max harris` : 'max harris · developer+';
  }, [state.top, state.wins]);

  useEffect(() => {
    const onResize = () => dispatch({ type: 'resize' });
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // ---------- the gaze: a light that follows the pointer over glass, and a slight tilt ----------
  useEffect(() => {
    let ev = null, raf = 0, hoverPane = null;
    const gaze = () => {
      raf = 0;
      const e = ev;
      if (!e || e.pointerType === 'touch') return;
      const t = e.target;
      if (!(t instanceof Element)) return;
      const g = t.closest('.os .g');
      if (g) {
        const r = g.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
        g.style.setProperty('--gx', x + 'px');
        g.style.setProperty('--gy', y + 'px');
        const d = g.querySelector('.disc');
        if (d) { d.style.setProperty('--hx', ((x / r.width - 0.5) * 6).toFixed(1) + 'px'); d.style.setProperty('--hy', ((y / r.height - 0.5) * 6).toFixed(1) + 'px'); }
      }
      const w = t.closest('.win'), pane = w && !phoneRef.current ? w.querySelector('.pane') : null;
      if (hoverPane && hoverPane !== pane && !hoverPane.closest('.dragging,.tossing')) hoverPane.style.transform = '';
      hoverPane = pane;
      if (pane) {
        const r = w.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
        pane.style.setProperty('--gx', x + 'px');
        pane.style.setProperty('--gy', y + 'px');
        if (!reduced() && !w.classList.contains('dragging') && !w.classList.contains('tossing') && y <= r.height) {
          pane.style.transform = `perspective(2200px) rotateX(${(-(y / r.height - 0.5) * 1.6).toFixed(2)}deg) rotateY(${((x / r.width - 0.5) * 2).toFixed(2)}deg)`;
        }
      }
      if (!phoneRef.current && sceneRef.current) sceneRef.current.look(e.clientX / window.innerWidth - 0.5, e.clientY / window.innerHeight - 0.5);
    };
    const onMove = (e) => { ev = e; if (!raf) raf = requestAnimationFrame(gaze); };
    window.addEventListener('pointermove', onMove, { passive: true });
    return () => { window.removeEventListener('pointermove', onMove); cancelAnimationFrame(raf); };
  }, []);

  // ---------- keys, wake, screensaver, konami ----------
  useEffect(() => {
    let kpos = 0;
    lastAct.current = Date.now();
    const wake = () => {
      lastAct.current = Date.now();
      if (stateRef.current.saver) actions.set({ saver: false });
    };
    const konami = () => {
      if (reduced()) { actions.toast('30 extra lives. the surge is skipped: reduced motion is on.'); return; }
      actions.setImm(0, true);
      actions.fireworks();
      actions.toast('↑↑↓↓←→←→ba. power surge. the windows stepped back to watch.', 3400);
      actions.set({ watching: true });
      const done = () => {
        actions.set({ watching: false });
        clearTimeout(tm);
        window.removeEventListener('pointerdown', done, true);
        window.removeEventListener('keydown', done, true);
      };
      const tm = setTimeout(done, 7500);
      setTimeout(() => { window.addEventListener('pointerdown', done, true); window.addEventListener('keydown', done, true); }, 400);
    };
    const onKey = (e) => {
      wake();
      const k = e.key && e.key.length === 1 ? e.key.toLowerCase() : e.key;
      kpos = k === KONAMI[kpos] ? kpos + 1 : k === KONAMI[0] ? (kpos === 2 ? 2 : 1) : 0;
      if (kpos === KONAMI.length) { kpos = 0; konami(); }
      if ((e.metaKey || e.ctrlKey) && k === 'k') {
        e.preventDefault();
        if (stateRef.current.overlay === 'spot') actions.closeSpot(); else actions.openSpot();
        return;
      }
      if (e.key === 'Escape') {
        const s = stateRef.current;
        const el = e.target;
        if (el && el.matches && el.matches('input:not([type=range]),textarea') && el.value && !el.closest('#spot')) { el.blur(); return; }
        if (s.menu) { actions.closeMenu(true); return; }
        if (s.overlay === 'spot') { actions.closeSpot(); return; }
        if (s.overlay === 'home') { actions.closeHome(); return; }
        const top = s.top && s.wins[s.top];
        if (top && !top.min) { e.preventDefault(); actions.close(top.kind); }
      }
    };
    const onDown = (e) => {
      if (stateRef.current.menu && !e.target.closest('#menu,[data-menu]')) actions.closeMenu();
    };
    const acts = ['pointermove', 'pointerdown', 'wheel', 'touchstart'];
    window.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onDown);
    acts.forEach((n) => window.addEventListener(n, wake, { passive: true }));
    const idle = setInterval(() => {
      const s = stateRef.current;
      if (!s.saver && !phoneRef.current && Date.now() - lastAct.current > 60000 && !s.overlay && !s.menu) {
        actions.set({ saver: true });
        if (!reduced()) setTimeout(() => stateRef.current.saver && sceneRef.current && sceneRef.current.star(), 2500);
      }
    }, 3000);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onDown);
      acts.forEach((n) => window.removeEventListener(n, wake));
      clearInterval(idle);
    };
  }, [actions]);

  const onContextMenu = (e) => {
    if (phone || e.target.closest('.win,#menubar,#dock,#crown,#spot,#menu,#home,input,textarea,a')) return;
    e.preventDefault();
    const at = { left: e.clientX - 20, top: e.clientY - 20, width: 40, height: 40 };
    const next = SCENES[(SCENES.indexOf(state.scene) + 1) % SCENES.length];
    actions.openMenu([
      { label: 'desktop' },
      { t: 'next scene', f: () => actions.setScene(next) },
      { t: 'show hidden files', f: actions.showHidden },
      '-',
      { t: 'open terminal here', f: () => actions.openApp('terminal', at) },
      { t: 'new folder', f: () => actions.toast('folders are a social construct.') },
      '-',
      { t: 'about maxOS', f: () => actions.open('sys', {}, at) },
    ], e.clientX, e.clientY, 'desktop');
  };
  const ctx = { state, actions, phone, reduced, theme, themeName, sceneRef, shared, get };
  // while the home view or the fireworks are up, what they cover is out of reach
  const covered = state.overlay === 'home' || state.watching || undefined;
  const cls = ['os', state.overlay === 'home' && 'homing', state.watching && 'watching', state.saver && 'saver'].filter(Boolean).join(' ');
  return (
    <OSContext.Provider value={ctx}>
      <div className={cls} data-theme={theme} data-board={state.scene} onContextMenu={onContextMenu}>
        <canvas id="world" ref={canvas} aria-hidden="true" onDoubleClick={(e) => sceneRef.current && sceneRef.current.poke(e.clientX, e.clientY)} />
        <div id="veil" aria-hidden="true" />
        {!phone && <Desk inert={covered} />}
        <main id="wins" aria-label="windows" inert={covered}>
          {Object.values(state.wins).map((w) => <Window key={w.kind} win={w} focused={state.top === w.kind} />)}
        </main>
        {!phone && <MenuBar />}
        {!phone && <Dock />}
        {!phone && <Crown />}
        {phone && <Phone />}
        <Home />
        {state.overlay === 'spot' && <Spotlight />}
        <MenuPopup />
        <Toast />
        <Saver />
        <Boot key={state.bootN || 0} force={(state.bootN || 0) > 0} />
      </div>
    </OSContext.Provider>
  );
}
