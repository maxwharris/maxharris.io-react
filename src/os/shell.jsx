import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { work, personal, concepts } from '../data/site';
import { useOS, APPS, APP, MOD, clamp, titleOf, kindVisual, appKind } from './store';
import { useClock } from './useClock';
import { Icon, Disc } from './icons';
import { SCENES } from './board';
import { Swatch } from './apps';

export function ThemeButton({ className = 'mb g' }) {
  const { actions, theme } = useOS();
  const dark = theme === 'dark';
  return (
    <button type="button" className={`${className} theme-btn`} aria-label={dark ? 'switch to light glass' : 'switch to dark glass'} onClick={actions.toggleTheme}>
      <Icon name={dark ? 'sun' : 'moon'} />
    </button>
  );
}

// ---------- menus ----------
function useMenus() {
  const { state, actions, themeName } = useOS();
  const dockDisc = (id) => document.querySelector(`#dock [data-app="${id}"] .disc`);
  return {
    logo: () => [
      { t: 'about maxOS', f: () => actions.open('sys', {}, document.querySelector('.mb-logo .ic')) },
      { t: 'home view', f: () => actions.openHome() },
      '-',
      { t: 'restart', f: actions.restart },
    ],
    go: () => APPS.map((a) => ({ t: a.label, f: () => actions.openApp(a.id, dockDisc(a.id)) })),
    view: () => [
      { label: 'scene' },
      ...SCENES.map((n) => ({ t: n, ck: state.scene === n, f: () => actions.setScene(n) })),
      '-',
      { t: themeName() === 'dark' ? 'light glass' : 'dark glass', f: actions.toggleTheme },
      { t: state.imm > 0.01 ? 'reset immersion' : 'full immersion', f: () => actions.setImm(state.imm > 0.01 ? 0 : 1) },
    ],
    help: () => [
      { t: 'search', k: MOD + 'K', f: actions.openSpot },
      { t: 'keyboard shortcuts', f: () => actions.open('sys') },
    ],
  };
}

export function MenuPopup() {
  const { state, actions } = useOS();
  const ref = useRef(null);
  const m = state.menu;
  useLayoutEffect(() => {
    const el = ref.current;
    if (!m || !el) return;
    const r = el.getBoundingClientRect();
    el.style.left = clamp(m.x, 8, window.innerWidth - r.width - 8) + 'px';
    el.style.top = clamp(m.y, 8, window.innerHeight - r.height - 8) + 'px';
    el.style.visibility = '';
    const f = el.querySelector('.mi');
    if (f) f.focus({ preventScroll: true });
  }, [m]);
  if (!m) return null;
  const onKey = (e) => {
    const items = [...ref.current.querySelectorAll('.mi')], i = items.indexOf(document.activeElement);
    if (e.key === 'ArrowDown') { e.preventDefault(); items[(i + 1) % items.length].focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); items[(i - 1 + items.length) % items.length].focus(); }
    else if (e.key === 'Tab') actions.closeMenu();
  };
  return (
    <div id="menu" ref={ref} className="glass" role="menu" style={{ left: m.x, top: m.y, visibility: 'hidden' }} onKeyDown={onKey}>
      {m.items.map((it, i) => {
        if (it === '-') return <hr key={i} />;
        if (it.label) return <div key={i} className="mlabel">{it.label}</div>;
        return (
          <button key={i} type="button" role="menuitem" className="mi" onClick={() => { actions.closeMenu(true); if (it.f) it.f(); }}>
            <span className="ck">{it.ck ? '✓' : ''}</span><span>{it.t}</span>{it.k && <kbd>{it.k}</kbd>}
          </button>
        );
      })}
    </div>
  );
}

export function MenuBar() {
  const { state, actions } = useOS();
  const menus = useMenus();
  const clock = useClock();
  const open = (e, id) => {
    const b = e.currentTarget;
    if (state.menu && state.menu.trigger === id) { actions.closeMenu(); return; }
    const r = b.getBoundingClientRect();
    actions.openMenu(menus[id](), r.left, r.bottom + 6, id);
  };
  const hover = (e, id) => {
    if (state.menu && state.menu.trigger && state.menu.trigger !== id && ['logo', 'go', 'view', 'help'].includes(state.menu.trigger)) open(e, id);
  };
  const trig = (id, cls, children) => (
    <button type="button" className={cls} data-menu={id} aria-haspopup="menu" aria-expanded={!!state.menu && state.menu.trigger === id} onClick={(e) => open(e, id)} onPointerEnter={(e) => hover(e, id)}>
      {children}
    </button>
  );
  return (
    <header id="menubar" className="glass">
      {trig('logo', 'mb mb-logo g', <><Icon name="mark" />maxOS</>)}
      {trig('go', 'mb g', 'go')}
      {trig('view', 'mb g', 'view')}
      {trig('help', 'mb g', 'help')}
      <div className="mb-r">
        <button type="button" className="mb g" id="mb-search" aria-label="search" onClick={actions.openSpot}><Icon name="search" /><kbd>{MOD}K</kbd></button>
        <ThemeButton />
        <span className="clock">{clock.full}</span>
      </div>
    </header>
  );
}

// ---------- desktop icons ----------
const DESK = [['work', 'work', 'work', 'work'], ['personal', 'personal', 'personal', 'personal'], ['about', 'about', 'about', 'about.txt'], ['terminal', 'terminal', 'terminal', 'terminal'], ['mail', 'mail', 'mail', 'say hi']];
export function Desk({ inert }) {
  const { state, actions } = useOS();
  return (
    <nav id="desk" aria-label="desktop" inert={inert}>
      {DESK.map(([id, t, g, l]) => (
        <button key={id} type="button" className="dicon g" onClick={(e) => actions.openApp(id, e.currentTarget.querySelector('.disc'))}>
          <Disc tint={t} glyph={g} /><span className="lbl">{l}</span>
        </button>
      ))}
      {state.secrets && (
        <button type="button" className="dicon g new" onClick={(e) => actions.open('secrets', {}, e.currentTarget.querySelector('.disc'))}>
          <Disc tint="sys" glyph="file" /><span className="lbl">secrets.txt</span>
        </button>
      )}
    </nav>
  );
}

// ---------- dock ----------
export function Dock() {
  const { state, actions } = useOS();
  const running = (id) => {
    const [k, o] = appKind(id), w = state.wins[k];
    return !!w && !w.closing && !w.min && (!o.tab || w.opts.tab === o.tab);
  };
  const mins = Object.values(state.wins).filter((w) => w.min && !w.closing);
  const btn = (a) => (
    <button key={a.id} type="button" className={`dk g${running(a.id) ? ' on' : ''}`} data-app={a.id} aria-label={a.label} onClick={(e) => actions.openApp(a.id, e.currentTarget.querySelector('.disc'))}>
      <Disc tint={a.id} glyph={a.id === 'trash' && state.trash.length ? 'trashFull' : a.glyph} />
      <span className="tip">{a.label}</span><i className="run" />
    </button>
  );
  return (
    <nav id="dock" className={`glass${mins.length ? ' has-min' : ''}`} aria-label="dock">
      {APPS.filter((a) => a.id !== 'trash').map(btn)}
      <span className="dock-sep" />
      <div id="dock-min">
        {mins.map((w) => {
          const [t, g] = kindVisual(w), title = titleOf(w);
          return (
            <button key={w.kind} type="button" className="dk g new" data-restore={w.kind} aria-label={`restore ${title}`} onClick={(e) => actions.open(w.kind, {}, e.currentTarget.querySelector('.disc'))}>
              <Disc tint={t} glyph={g} /><span className="tip">{title}</span>
            </button>
          );
        })}
      </div>
      <span className="dock-sep sep2" />
      {btn(APP.trash)}
    </nav>
  );
}

// ---------- the digital crown: turn for immersion, press for home ----------
export function Crown() {
  const { state, actions } = useOS();
  const [turning, setTurning] = useState(false);
  const drag = useRef(null);
  const tt = useRef(0);
  const btn = useRef(null);
  const pct = Math.round(state.imm * 100);
  const flash = () => { setTurning(true); clearTimeout(tt.current); tt.current = setTimeout(() => setTurning(false), 900); };
  useEffect(() => {
    // wheel needs a non-passive listener to stop the page from scrolling
    const b = btn.current;
    const onWheel = (e) => { e.preventDefault(); actions.setImm(clamp(actions.getImm() - e.deltaY / 900, 0, 1)); flash(); };
    b.addEventListener('wheel', onWheel, { passive: false });
    return () => b.removeEventListener('wheel', onWheel);
  }, [actions]);
  const onDown = (e) => { drag.current = { id: e.pointerId, y: e.clientY, v: state.imm, moved: false }; try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* ignore */ } };
  const onMove = (e) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const dy = e.clientY - d.y;
    if (Math.abs(dy) > 4) d.moved = true;
    if (d.moved) { actions.setImm(clamp(d.v - dy / 220, 0, 1)); flash(); }
  };
  const onUp = (e) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    drag.current = null;
    if (!d.moved && e.type === 'pointerup') actions.toggleHome();
  };
  const onKey = (e) => {
    const d = { ArrowUp: 0.05, ArrowRight: 0.05, ArrowDown: -0.05, ArrowLeft: -0.05, PageUp: 0.2, PageDown: -0.2 }[e.key];
    if (d) { e.preventDefault(); actions.setImm(clamp(state.imm + d, 0, 1)); flash(); }
    else if (e.key === 'Home') { e.preventDefault(); actions.setImm(0); }
    else if (e.key === 'End') { e.preventDefault(); actions.setImm(1); }
  };
  return (
    <div id="crown" className={turning ? 'turning' : ''}>
      <button
        ref={btn}
        id="crown-btn"
        type="button"
        role="slider"
        aria-label="digital crown. turn for immersion, press for home view"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        aria-valuetext={`immersion ${pct}%`}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onClick={(e) => { if (e.detail === 0) actions.toggleHome(); }}
        onKeyDown={onKey}
      >
        <svg className="ring" viewBox="0 0 70 70" aria-hidden="true">
          <circle className="r0" cx="35" cy="35" r="32" />
          <circle className="r1" cx="35" cy="35" r="32" strokeDasharray="201" strokeDashoffset={(201 * (1 - state.imm)).toFixed(1)} />
        </svg>
        <span className="rim" aria-hidden="true" style={{ transform: `rotate(${state.imm * 540}deg)` }} />
        <span className="face" aria-hidden="true" />
      </button>
      <span className="tip crown-tip">{turning ? `immersion ${pct}%` : 'turn: immersion · press: home'}</span>
    </div>
  );
}

// ---------- home view ----------
export function Home() {
  const { state } = useOS();
  if (state.overlay !== 'home') return null;
  return <HomeView />;
}

function HomeView() {
  const { state, actions } = useOS();
  const ref = useRef(null);
  const prev = useRef(null);
  const t = state.homeTab;
  useEffect(() => {
    prev.current = document.activeElement;
    return () => {
      const p = prev.current;
      if (p && p.isConnected && p !== document.body) p.focus({ preventScroll: true });
    };
  }, []);
  useEffect(() => {
    const f = ref.current && ref.current.querySelector('.hicon');
    if (f) f.focus({ preventScroll: true });
  }, [t]);
  // opening something from home hands focus to that window instead
  const launch = (fn) => (e) => { prev.current = null; fn(e); };
  const d = (i) => ({ animationDelay: `${i * 22}ms` });
  const tabs = [['apps', 'home', 'apps'], ['work', 'work', 'work'], ['scenes', 'scenes', 'scenes']];
  let items;
  if (t === 'apps') {
    items = APPS.map((a, i) => (
      <button key={a.id} type="button" className="hicon g" style={d(i)} onClick={launch((e) => actions.openApp(a.id, e.currentTarget.querySelector('.disc')))}>
        <Disc tint={a.id} glyph={a.glyph} /><span className="hl2">{a.label}</span>
      </button>
    ));
  } else if (t === 'work') {
    items = work.map((p, i) => (
      <button key={p.key} type="button" className="hicon g" style={d(i)} onClick={launch((e) => actions.open('project', { key: p.key }, e.currentTarget.querySelector('.disc')))}>
        <Disc tint={p.key} glyph={p.icon} /><span className="hl2">{p.title}</span>
      </button>
    ));
  } else {
    items = SCENES.map((n, i) => (
      <button key={n} type="button" className="hicon g" style={d(i)} aria-pressed={state.scene === n} onClick={() => actions.setScene(n)}>
        <Swatch name={n} /><span className="hl2">{n}</span>
      </button>
    ));
  }
  return (
    <div id="home" role="dialog" aria-modal="true" aria-label="home view" ref={ref} onClick={(e) => { if (!e.target.closest('button')) actions.closeHome(); }}>
      <div className="home-in">
        <nav className="orn glass home-orn" aria-label="home tabs">
          {tabs.map(([id, g, l]) => (
            <button key={id} type="button" className="g" aria-current={t === id} aria-label={l} onClick={() => actions.set({ homeTab: id })}>
              <Icon name={g} /><span className="tip">{l}</span>
            </button>
          ))}
        </nav>
        <div className="home-grid">{items}</div>
      </div>
      <p className="home-hint">press the crown or esc to go back</p>
    </div>
  );
}

// ---------- spotlight ----------
export function Spotlight() {
  const { actions } = useOS();
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const input = useRef(null);
  const list = useRef(null);
  const prev = useRef(null);
  const index = useMemo(() => [
    ...work.map((p) => ({ t: p.title, s: p.tagline, kind: 'work', tint: p.key, g: p.icon, spec: 'proj:' + p.key, k: [p.title, p.key, p.tagline, p.stack.join(' ')].join(' ').toLowerCase() })),
    ...APPS.map((a) => ({ t: a.label, s: 'app', kind: 'app', tint: a.id, g: a.glyph, spec: 'app:' + a.id, k: a.label + ' ' + a.id })),
    ...personal.map((p) => ({ t: p.title, s: p.description, kind: 'personal', tint: 'personal', g: 'personal', spec: 'pers:' + p.key, k: (p.title + ' ' + p.key + ' ' + p.description).toLowerCase() })),
    ...concepts.map((p) => ({ t: p.title, s: p.description, kind: 'concept', tint: 'personal', g: 'bulb', spec: 'pers:' + p.key, k: (p.title + ' ' + p.key + ' ' + p.tags.join(' ') + ' ' + p.description).toLowerCase() })),
    ...SCENES.map((n) => ({ t: 'scene: ' + n, s: 'change the world behind the windows', kind: 'scene', tint: 'scenes', g: 'scenes', spec: 'scene:' + n, k: 'scene environment weather ' + n })),
    { t: 'switch light / dark', s: 'glass theme', kind: 'action', tint: 'sys', g: 'moon', spec: 'cmd:theme', k: 'theme light dark mode' },
    { t: 'home view', s: 'every app, round', kind: 'action', tint: 'sys', g: 'home', spec: 'cmd:home', k: 'home view launcher apps' },
    { t: 'about maxOS', s: 'shortcuts and credits', kind: 'action', tint: 'sys', g: 'mark', spec: 'cmd:sys', k: 'about maxos system shortcuts help keyboard' },
  ], []);
  const res = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return index.filter((x) => x.kind === 'work').slice(0, 5).concat(index.filter((x) => x.kind === 'app').slice(0, 3));
    return index
      .map((x) => { const t = x.t.toLowerCase(); return [t.startsWith(s) ? 3 : t.includes(s) ? 2 : x.k.includes(s) ? 1 : 0, x]; })
      .filter((r) => r[0]).sort((a, b) => b[0] - a[0]).slice(0, 8).map((r) => r[1]);
  }, [q, index]);
  const cur = clamp(sel, 0, Math.max(0, res.length - 1));

  useEffect(() => {
    prev.current = document.activeElement;
    if (input.current) input.current.focus();
    return () => {
      // put focus back where it was, unless a result just opened a window
      const p = prev.current;
      if (p && p.isConnected && p !== document.body) p.focus({ preventScroll: true });
    };
  }, []);
  useEffect(() => {
    const c = list.current && list.current.querySelector(`#so-${cur}`);
    if (c) c.scrollIntoView({ block: 'nearest' });
  }, [cur, res]);

  const go = (i) => {
    const r = res[i];
    if (!r) return;
    const d = list.current.querySelector(`#so-${i} .disc`);
    const rect = d ? d.getBoundingClientRect() : null;
    if (/^(app|proj|pers):|^cmd:(sys|secrets)$/.test(r.spec)) prev.current = null;
    actions.closeSpot();
    actions.openSpec(r.spec, rect);
  };
  const onKey = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSel(Math.min(res.length - 1, cur + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSel(Math.max(0, cur - 1)); }
    else if (e.key === 'Enter') { e.preventDefault(); go(cur); }
    else if (e.key === 'Tab') e.preventDefault();
  };
  return (
    <div id="spot" onPointerDown={(e) => { if (e.target.id === 'spot') actions.closeSpot(); }}>
      <div className="spot-box glass" role="dialog" aria-modal="true" aria-label="search">
        <div className="spot-in">
          <Icon name="search" />
          <input
            ref={input}
            role="combobox"
            aria-expanded="true"
            aria-controls="spot-list"
            aria-autocomplete="list"
            aria-activedescendant={res.length ? `so-${cur}` : undefined}
            placeholder="search projects, apps, scenes"
            autoComplete="off"
            spellCheck="false"
            value={q}
            onChange={(e) => { setQ(e.target.value); setSel(0); }}
            onKeyDown={onKey}
          />
          <kbd>esc</kbd>
        </div>
        <ul id="spot-list" role="listbox" aria-label="results" ref={list} tabIndex={-1}>
          {res.length ? res.map((r, i) => (
            <li key={r.spec} role="option" id={`so-${i}`} aria-selected={i === cur} onClick={() => go(i)} onPointerMove={() => i !== cur && setSel(i)}>
              <Disc tint={r.tint} glyph={r.g} />
              <span className="st"><b>{r.t}</b><small>{r.s}</small></span>
              <span className="kind">{r.kind}</span>
            </li>
          )) : <li className="empty">nothing by that name. try &quot;euno&quot;, &quot;react&quot; or &quot;neon&quot;.</li>}
        </ul>
        <div className="spot-foot">↑ ↓ move · enter opens · esc closes</div>
      </div>
    </div>
  );
}

// ---------- toast, screensaver, boot ----------
export function Toast() {
  const { state } = useOS();
  const [doneN, setDoneN] = useState(0);
  const t = state.toast;
  useEffect(() => {
    if (!t) return undefined;
    const tm = setTimeout(() => setDoneN(t.n), t.ms);
    return () => clearTimeout(tm);
  }, [t]);
  const show = !!t && t.n !== doneN;
  return <div id="toast" className={`glass${show ? ' show' : ''}`} role="status" aria-live="polite">{t ? t.msg : ''}</div>;
}

export function Saver() {
  const clock = useClock();
  return <div id="saver" aria-hidden="true"><b>{clock.short}</b><span>move to wake</span></div>;
}

export function Boot({ force = false }) {
  const { reduced } = useOS();
  const [on, setOn] = useState(() => {
    if (reduced()) return false;
    if (force) return true;
    try { return !window.sessionStorage.getItem('mx-booted'); } catch { return true; }
  });
  useEffect(() => {
    if (!on) return undefined;
    try { window.sessionStorage.setItem('mx-booted', '1'); } catch { /* private mode */ }
    const end = () => setOn(false);
    const t = setTimeout(end, 1150);
    window.addEventListener('keydown', end, { once: true });
    return () => { clearTimeout(t); window.removeEventListener('keydown', end); };
  }, [on]);
  if (!on) return null;
  return (
    <div id="boot" aria-hidden="true" onPointerDown={() => setOn(false)}>
      <div className="boot-in"><Icon name="mark" /><span>maxOS</span></div>
    </div>
  );
}

