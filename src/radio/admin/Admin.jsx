// The radio admin (Max, 11/15/26: "a radio admin page ... that lets the user view the live queue and add to/edit queue
// ... drag to reorder queue"; in a maxOS window, signed in through the catalog). The song on air, then the queue in play
// order with each song's Eastern start time and length; drag a row by its handle (or arrow keys on the handle), play a
// song next, take one out (with undo), or add one from the catalog's search. An edit shows at once, saves behind it, and
// takes effect when the song on air ends (Max: "your order, edits take effect when the song on air ends"); nothing here
// plays, pauses, skips or seeks. Under the song on air, the mic: Max talks over the radio, live (Mic.jsx). All of it
// lowercase, like the rest of maxradio.
//
// state.js holds the state and talks to the catalog; queue.js works out the queue; mic.js runs the mic; this lays it out.

import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useOS, EASE } from '../../os/store';
import { Icon, Disc } from '../../os/icons';
import { createAdmin } from './state.js';
import { CATALOG_URL, search } from './api.js';
import { liveQueue, clock, span, eastern, count, low } from './queue.js';
import Mic from './Mic.jsx';
import './admin.css';

// ---------------------------------------------------------------- drawn icons (24 px lines, like the desktop's)
const GLYPHS = {
  grip: '<circle cx="9" cy="6.5" r="1.45" fill="currentColor" stroke="none"/><circle cx="15" cy="6.5" r="1.45" fill="currentColor" stroke="none"/><circle cx="9" cy="12" r="1.45" fill="currentColor" stroke="none"/><circle cx="15" cy="12" r="1.45" fill="currentColor" stroke="none"/><circle cx="9" cy="17.5" r="1.45" fill="currentColor" stroke="none"/><circle cx="15" cy="17.5" r="1.45" fill="currentColor" stroke="none"/>',
  next: '<path d="M6.5 5h11"/><path d="M12 19.5V9.5"/><path d="m7.6 13.6 4.4-4.4 4.4 4.4"/>',
  remove: '<circle cx="12" cy="12" r="8.2"/><path d="M8.6 12h6.8"/>',
  add: '<path d="M12 5.5v13M5.5 12h13"/>',
  check: '<path d="m5.5 12.6 4.1 4.1 8.9-9.4"/>',
  undo: '<path d="M9.4 14.6 4.8 10l4.6-4.6"/><path d="M4.8 10h9.7a4.75 4.75 0 0 1 0 9.5H12"/>',
  alert: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.6v5.3"/><path d="M12 16.3v.3"/>',
  note: '<path d="M9.5 17.4V6.2l9-1.9v11.1"/><circle cx="7.2" cy="17.4" r="2.3"/><circle cx="16.2" cy="15.4" r="2.3"/>',
  loop: '<path d="M17.5 8.5A6.6 6.6 0 0 0 5.6 10"/><path d="m17.8 4.6-.3 3.9-3.9-.3"/><path d="M6.5 15.5A6.6 6.6 0 0 0 18.4 14"/><path d="m6.2 19.4.3-3.9 3.9.3"/>',
};
function Ic({ name }) {
  return <svg viewBox="0 0 24 24" className="ic" aria-hidden="true" dangerouslySetInnerHTML={{ __html: GLYPHS[name] }} />;
}

/** A song's record, small, in its colours (the catalog's look); dashed for a song with no preview yet. */
function Rec({ bg, fg, big = false, spin = false }) {
  const cls = `ra-rec${big ? ' big' : ''}${spin ? ' spin' : ''}${bg ? '' : ' none'}`;
  return <span className={cls} style={bg ? { '--rb': bg, '--rf': fg } : undefined} aria-hidden="true"><i /></span>;
}

const titleOf = (r) => low((r.row && r.row.title) || (r.song && r.song.title)) || 'untitled';
const creditOf = (r) => low((r.row && r.row.credit) || (r.song && r.song.credit));
const lengthOf = (r) => (r.song ? r.song.durationMs : r.row && Number(r.row.duration) > 0 ? Math.round(Number(r.row.duration) * 1000) : 0);

/** The station's clock, on the second (the catalog's time, as state.js measures it). */
function useTick(admin) {
  const [t, setT] = useState(() => admin.now());
  useEffect(() => {
    let id = 0;
    const tick = () => {
      const n = admin.now();
      setT(n);
      id = setTimeout(tick, 1002 - (n % 1000));
    };
    id = setTimeout(tick, 1002 - (admin.now() % 1000));
    return () => clearTimeout(id);
  }, [admin]);
  return t;
}

export default function Admin({ win }) {
  const { reduced } = useOS();
  const [admin] = useState(createAdmin);
  const snap = useSyncExternalStore(admin.subscribe, admin.get, admin.get);
  const now = useTick(admin);
  useEffect(() => {
    admin.start();
    return () => admin.stop();
  }, [admin]);
  useEffect(() => { admin.pause(!!win.min); }, [admin, win.min]);

  const m = snap.model;
  const view = m && snap.phase === 'ready' ? liveQueue(m.order.map((id) => m.rows[id]), m.state, now) : null;

  if (snap.phase === 'signedout') {
    return (
      <div className="ra">
        <Head sub="signed out" />
        <Gate icon={<Icon name="lock" />} title="sign in to edit the radio">
          <p>the queue lives in the catalog. sign in there (it opens in a new tab), then come back here.</p>
          <div className="row">
            <a className="btn acc g" href={CATALOG_URL} target="_blank" rel="noopener noreferrer"><Icon name="out" />sign in</a>
            <button type="button" className="btn g" onClick={admin.retry}>try again</button>
          </div>
        </Gate>
      </div>
    );
  }
  if (snap.phase === 'nocrate') {
    return (
      <div className="ra">
        <Head sub="no radio crate" />
        <Gate icon={<Icon name="radio" />} title="no radio crate yet">
          <p>the radio plays the catalog crate called radio. make it here, then add songs from the catalog.</p>
          {snap.error && <p className="ra-gerr" role="alert">{snap.error}</p>}
          <div className="row">
            <button type="button" className="btn acc g" disabled={snap.making} onClick={admin.makeCrate}><Ic name="add" />{snap.making ? 'making it' : 'make the radio crate'}</button>
          </div>
        </Gate>
      </div>
    );
  }
  if (snap.phase === 'error') {
    return (
      <div className="ra">
        <Head sub="offline" />
        <Gate icon={<Ic name="alert" />} title="could not reach the catalog">
          <p>it tries again every 10 seconds.</p>
          <div className="row"><button type="button" className="btn g" onClick={admin.retry}>try again</button></div>
        </Gate>
      </div>
    );
  }
  if (!view) {
    return (
      <div className="ra" aria-busy="true">
        <Head sub="loading" />
        <div className="ra-skel" aria-hidden="true"><i /><i /><i /><i /></div>
      </div>
    );
  }

  const state = snap.saving ? ['busy', 'saving'] : snap.stale ? ['off', 'offline'] : view.onAir ? ['on', 'live'] : ['off', 'off air'];
  const sub = !m.order.length ? 'empty' : view.songs ? `${count(view.songs, 'song')} · ${span(view.ms)} loop` : 'nothing can play yet';
  const items = view.rows.map((r) => ({
    id: r.id,
    title: titleOf(r),
    credit: creditOf(r),
    len: lengthOf(r),
    at: r.startsAt,
    playable: !!r.song,
    pending: m.pending.has(r.id),
    bg: r.song ? r.song.look.bg : '',
    fg: r.song ? r.song.look.fg : '',
  }));
  const plays = view.rows.filter((r) => r.song);
  const round = plays.length ? plays[plays.length - 1].endsAt : view.onAir ? view.onAir.endsAt : null;

  return (
    <div className="ra">
      <Head sub={sub} state={state} />
      {snap.error && (
        <div className="ra-err" role="alert">
          <Ic name="alert" /><p>{snap.error}</p>
          <button type="button" className="ra-x g" aria-label="dismiss" onClick={admin.dismiss}><Icon name="close" /></button>
        </div>
      )}
      <OnAir air={view.onAir} now={now} empty={!m.order.length} />
      <Mic />
      <Find admin={admin} has={m.order} />
      <section className="ra-up" aria-labelledby="ra-up-h">
        <div className="ra-h">
          <h3 id="ra-up-h">up next</h3>
          {items.length > 0 && <span>{count(items.length, 'song')}{view.waiting ? ` · ${view.waiting} without a preview` : ''}</span>}
        </div>
        {items.length ? (
          <Queue items={items} admin={admin} reduced={reduced} />
        ) : (
          <p className="ra-none">{m.order.length ? 'only the song on air. it plays round and round.' : 'nothing yet. add songs from the catalog above.'}</p>
        )}
        {items.length > 0 && round && view.onAir && (
          <p className="ra-round"><Ic name="loop" />then round again from {titleOf(view.onAir)}, {eastern(round)}</p>
        )}
      </section>
      {snap.undo && (
        <div className="ra-undo" role="status" onPointerEnter={() => admin.holdUndo(true)} onPointerLeave={() => admin.holdUndo(false)} onFocus={() => admin.holdUndo(true)} onBlur={() => admin.holdUndo(false)}>
          <span>removed <b>{snap.undo.title}</b></span>
          <button type="button" className="btn g" onClick={admin.undo}><Ic name="undo" />undo</button>
        </div>
      )}
      <p id="ra-hint" className="vh">drag to move it, or use the up and down arrow keys. it plays in its new place once the song on air ends.</p>
      <p className="vh" aria-live="polite">{snap.notice}</p>
    </div>
  );
}

function Head({ sub, state }) {
  return (
    <header className="wh">
      <Disc tint="radio" glyph="queue" />
      <div><h2>radio admin</h2><p className="sub">{sub}</p></div>
      <span className="sp" />
      {state && <span className={`ra-pill ${state[0]}`}><i />{state[1]}</span>}
    </header>
  );
}

function Gate({ icon, title, children }) {
  return (
    <div className="ra-gate">
      <span className="ra-gi">{icon}</span>
      <h3>{title}</h3>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------- on air

function OnAir({ air, now, empty }) {
  if (!air) {
    return (
      <section className="ra-air off" aria-label="on air">
        <div className="ra-air-top">
          <Rec />
          <div className="ra-air-t">
            <p className="ra-eye"><span className="ra-live">off air</span><span className="ra-clock">{eastern(now, true)}</span></p>
            <h3>{empty ? 'the radio crate is empty' : 'nothing in the crate can play yet'}</h3>
            <p className="ra-cr">{empty ? 'add a song and it goes on air.' : 'a song plays once the catalog has made its preview.'}</p>
          </div>
        </div>
      </section>
    );
  }
  const len = air.endsAt - air.startsAt;
  const played = Math.min(len, Math.max(0, now - air.startsAt));
  const credit = creditOf(air);
  return (
    <section className="ra-air" aria-label="on air">
      <div className="ra-air-top">
        <Rec bg={air.song.look.bg} fg={air.song.look.fg} big spin />
        <div className="ra-air-t">
          <p className="ra-eye"><span className="ra-live"><i />on air</span><span className="ra-clock">{eastern(now, true)}</span></p>
          <h3>{titleOf(air)}</h3>
          {credit && <p className="ra-cr">{credit}</p>}
        </div>
      </div>
      <div
        key={air.startsAt}
        className="ra-bar"
        role="progressbar"
        aria-label="played"
        aria-valuemin={0}
        aria-valuemax={Math.round(len / 1000)}
        aria-valuenow={Math.round(played / 1000)}
        aria-valuetext={`${clock(played)} of ${clock(len)}`}
      >
        <i style={{ transform: `scaleX(${len > 0 ? played / len : 0})` }} />
      </div>
      <p className="ra-times"><span>{clock(played)}</span><span>{clock(len - played)} left</span></p>
    </section>
  );
}

// ---------------------------------------------------------------- add from the catalog

function Find({ admin, has }) {
  const [q, setQ] = useState('');
  const [res, setRes] = useState({ term: '', songs: [], state: 'idle' });
  const term = q.replace(/\s+/g, ' ').trim();
  useEffect(() => {
    if (!term) return undefined;
    const ctl = new AbortController();
    const t = setTimeout(() => {
      setRes((r) => ({ ...r, state: 'busy' }));
      search(term, ctl.signal).then(
        (d) => setRes({ term, songs: Array.isArray(d && d.songs) ? d.songs : [], state: 'done' }),
        (err) => {
          if (err && err.name === 'AbortError') return;
          setRes({ term, songs: [], state: 'error' });
          if (err && err.signin) admin.retry();
        },
      );
    }, 220);
    return () => {
      clearTimeout(t);
      ctl.abort();
    };
  }, [term, admin]);

  const inRadio = useMemo(() => new Set(has), [has]);
  const fresh = res.term === term;
  const songs = term ? res.songs : [];
  let note = '';
  if (term && !fresh && !songs.length) note = 'searching';
  else if (term && fresh && res.state === 'error') note = 'the search did not answer. try again.';
  else if (term && fresh && res.state === 'done' && !songs.length) note = `no songs match "${low(term)}"`;

  return (
    <div className="ra-find">
      <label className="ra-field">
        <Icon name="search" />
        <input
          type="search"
          value={q}
          placeholder="add from the catalog"
          aria-label="add from the catalog"
          autoComplete="off"
          spellCheck="false"
          enterKeyHint="search"
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Escape' && q) { e.stopPropagation(); setQ(''); } }}
        />
        {q && <button type="button" className="ra-x g" aria-label="clear the search" onClick={() => setQ('')}><Icon name="close" /></button>}
      </label>
      {term && (
        <div className={`ra-res${fresh ? '' : ' busy'}`}>
          {note && <p className="ra-note">{note}</p>}
          {songs.length > 0 && (
            <ul aria-label="songs in the catalog">
              {songs.map((s) => {
                const on = inRadio.has(s.id);
                const meta = [low(s.credit), Number(s.duration) > 0 ? clock(Number(s.duration) * 1000) : '', s.year || ''].filter(Boolean).join(' · ');
                return (
                  <li key={s.id} className="ra-hit">
                    <span className="ra-hi"><Ic name="note" /></span>
                    <span className="ra-t"><b>{low(s.title) || 'untitled'}</b>{meta && <small>{meta}</small>}</span>
                    {on ? (
                      <span className="ra-has"><Ic name="check" />on the radio</span>
                    ) : (
                      <button type="button" className="btn g ra-add" aria-label={`add ${low(s.title)} to the end of the queue`} onClick={() => admin.add(s)}><Ic name="add" />add</button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- the queue: drag, keys, play next, remove

const Row = memo(function Row({ id, title, credit, len, at, playable, pending, bg, fg, first, lifted, act }) {
  const when = pending ? 'adding' : playable ? eastern(at) : 'no preview yet';
  const meta = [credit, len ? clock(len) : ''].filter(Boolean).join(' · ');
  const cls = ['ra-row', !playable && 'dim', pending && 'wait', lifted && 'lift'].filter(Boolean).join(' ');
  return (
    <li className={cls} data-id={id}>
      <button type="button" className="ra-handle" aria-label={`move ${title}`} aria-describedby="ra-hint" onPointerDown={(e) => act.down(e, id)} onKeyDown={(e) => act.key(e, id)}>
        <Ic name="grip" />
      </button>
      <Rec bg={bg} fg={fg} />
      <span className="ra-t">
        <b>{title}</b>
        <small><span className="ra-at2">{when}{meta ? ' · ' : ''}</span>{meta}</small>
      </span>
      <span className={`ra-at${playable && !pending ? '' : ' tag'}`}>{when}</span>
      <button type="button" className="ra-ib ra-next g" disabled={first} aria-label={first ? `${title} plays next` : `play ${title} next`} title={first ? 'plays next' : 'play next'} onClick={() => act.next(id)}>
        <Ic name="next" />
      </button>
      <button type="button" className="ra-ib ra-remove g" aria-label={`take ${title} off the radio`} title="remove" onClick={() => act.remove(id)}>
        <Ic name="remove" />
      </button>
    </li>
  );
});

function Queue({ items, admin, reduced }) {
  const listRef = useRef(null);
  const slotRef = useRef(null);
  const itemsRef = useRef(items);
  const drag = useRef(null);
  const prev = useRef(new Map()); // each row's place at the last order, for the slide to the next
  const from = useRef(new Map()); // after a drop, each row slides on from where it was on screen
  const focus = useRef(null); // {id, part}: what gets focus once the new order is in
  const [lift, setLift] = useState(null); // {id, items}: the row being dragged; the list holds still meanwhile
  useLayoutEffect(() => { itemsRef.current = items; });
  const shown = lift ? lift.items : items;
  const orderKey = shown.map((x) => x.id).join(',');

  // A new order slides into place (each row from where it was), and focus follows the row that moved.
  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list || !orderKey) return;
    const at = new Map();
    for (const el of list.children) at.set(el.dataset.id, el.offsetTop);
    const was = prev.current, seen = from.current;
    if (!reduced() && was.size) {
      for (const el of list.children) {
        const id = el.dataset.id, b = at.get(id);
        const a = seen.has(id) ? seen.get(id) : was.get(id);
        if (a == null) el.animate([{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }], { duration: 320, easing: EASE });
        else if (Math.abs(a - b) > 0.5) el.animate([{ transform: `translateY(${a - b}px)` }, { transform: 'none' }], { duration: 320, easing: EASE });
      }
    }
    seen.clear();
    prev.current = at;
    const f = focus.current;
    focus.current = null;
    if (f) {
      const el = list.querySelector(`[data-id="${CSS.escape(String(f.id))}"] .ra-${f.part}`);
      if (el && !el.disabled && document.activeElement !== el) el.focus({ preventScroll: true });
    }
  }, [orderKey, reduced]);

  const act = useMemo(() => {
    // The dragged row follows the pointer; the rows between its place and where it would land slide aside by its
    // height, and the slot they open (in the accent) is where it goes. Places are read from the rows' middles as they
    // stood when the drag began, so nothing jitters as they slide.
    const position = () => {
      const d = drag.current, list = listRef.current;
      if (!d || !list) return;
      const top = list.getBoundingClientRect().top;
      d.dy = d.y - d.sy - (top - d.top0);
      d.el.style.transform = `translateY(${d.dy}px)`;
      const y = d.y - top;
      let to = 0;
      d.boxes.forEach((b, i) => { if (i !== d.index && y > (b.top + b.bottom) / 2) to += 1; });
      d.to = to;
      d.kids.forEach((kid, i) => {
        if (i === d.index) return;
        const shift = to > d.index && i > d.index && i <= to ? -d.h : to < d.index && i >= to && i < d.index ? d.h : 0;
        if (shift !== d.shift[i]) {
          d.shift[i] = shift;
          kid.style.transform = shift ? `translateY(${shift}px)` : '';
        }
      });
      const slot = slotRef.current;
      if (slot) slot.style.transform = `translateY(${to <= d.index ? d.boxes[to].top : d.boxes[to].bottom - d.h}px)`;
    };
    // near the top or bottom of the window, the list scrolls on its own, faster the closer the pointer
    const loop = () => {
      const d = drag.current;
      if (!d) return;
      const s = d.scroller;
      if (s && d.moved) {
        const r = s.getBoundingClientRect(), edge = Math.min(64, r.height / 4);
        let v = 0;
        if (d.y < r.top + edge) v = -(r.top + edge - d.y) / edge;
        else if (d.y > r.bottom - edge) v = (d.y - (r.bottom - edge)) / edge;
        if (v) {
          const was = s.scrollTop;
          s.scrollTop = was + Math.max(-1.6, Math.min(1.6, v)) * 15;
          if (s.scrollTop !== was) position();
        }
      }
      d.raf = requestAnimationFrame(loop);
    };
    const finish = (commit) => {
      const d = drag.current;
      if (!d) return;
      drag.current = null;
      cancelAnimationFrame(d.raf);
      d.handle.removeEventListener('pointermove', onMove);
      d.handle.removeEventListener('pointerup', onUp);
      d.handle.removeEventListener('pointercancel', onCancel);
      d.handle.removeEventListener('lostpointercapture', onCancel);
      window.removeEventListener('keydown', onEsc, true);
      try { d.handle.releasePointerCapture(d.pid); } catch { /* already released */ }
      const list = listRef.current, slot = slotRef.current;
      if (list) list.classList.remove('shifting');
      if (slot) slot.classList.remove('show');
      // where each row is on screen as it is let go
      const seen = d.kids.map((kid, i) => d.boxes[i].top + (i === d.index ? d.dy : d.shift[i]));
      let moved = false;
      if (commit && d.moved && d.to !== d.index) {
        const rest = d.items.filter((x) => x.id !== d.id);
        d.kids.forEach((kid, i) => from.current.set(kid.dataset.id, seen[i]));
        moved = admin.move(d.id, d.to > 0 ? rest[d.to - 1].id : null, d.to < rest.length ? rest[d.to].id : null);
        if (moved) focus.current = { id: d.id, part: 'handle' };
        else from.current.clear();
      }
      d.kids.forEach((kid, i) => {
        const off = seen[i] - d.boxes[i].top;
        kid.style.transform = '';
        if (!moved && off && !reduced()) kid.animate([{ transform: `translateY(${off}px)` }, { transform: 'none' }], { duration: 240, easing: EASE });
      });
      setLift(null);
    };
    const onMove = (e) => {
      const d = drag.current;
      if (!d || e.pointerId !== d.pid) return;
      d.y = e.clientY;
      if (!d.moved && Math.abs(d.y - d.sy) < 3) return;
      if (!d.moved) {
        d.moved = true;
        if (listRef.current) listRef.current.classList.add('shifting');
        if (slotRef.current) {
          slotRef.current.style.height = `${d.h}px`;
          slotRef.current.classList.add('show');
        }
      }
      position();
    };
    const onUp = (e) => { if (drag.current && e.pointerId === drag.current.pid) finish(true); };
    const onCancel = () => finish(false);
    const onEsc = (e) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      finish(false);
    };
    return {
      down(e, id) {
        if (drag.current || (e.pointerType === 'mouse' && e.button !== 0)) return;
        const handle = e.currentTarget, el = handle.closest('.ra-row'), list = listRef.current;
        if (!el || !list) return;
        e.preventDefault();
        const kids = [...list.children];
        // a slide still running from the last edit ends now, so the row follows the pointer from the start
        kids.forEach((kid) => kid.getAnimations().forEach((a) => a.finish()));
        const index = kids.indexOf(el);
        const boxes = kids.map((n) => ({ top: n.offsetTop, bottom: n.offsetTop + n.offsetHeight }));
        drag.current = {
          id, handle, el, index, to: index, kids, boxes, h: el.offsetHeight, shift: kids.map(() => 0), pid: e.pointerId, items: itemsRef.current,
          sy: e.clientY, y: e.clientY, dy: 0, top0: list.getBoundingClientRect().top, scroller: list.closest('.body'), raf: 0, moved: false,
        };
        const slot = slotRef.current;
        if (slot) {
          // the slot starts where the row is, without sliding there from the last drag
          slot.style.transition = 'none';
          slot.style.transform = `translateY(${boxes[index].top}px)`;
          void slot.offsetHeight;
          slot.style.transition = '';
        }
        try { handle.setPointerCapture(e.pointerId); } catch { /* not capturable */ }
        handle.addEventListener('pointermove', onMove);
        handle.addEventListener('pointerup', onUp);
        handle.addEventListener('pointercancel', onCancel);
        handle.addEventListener('lostpointercapture', onCancel);
        window.addEventListener('keydown', onEsc, true);
        setLift({ id, items: itemsRef.current });
        drag.current.raf = requestAnimationFrame(loop);
      },
      key(e, id) {
        const d = { ArrowUp: -1, ArrowDown: 1 }[e.key];
        if (!d || drag.current) return;
        e.preventDefault();
        if (admin.nudge(id, d)) focus.current = { id, part: 'handle' };
      },
      next(id) {
        if (admin.playNext(id)) focus.current = { id, part: 'handle' };
      },
      remove(id) {
        const list = itemsRef.current, i = list.findIndex((x) => x.id === id);
        const near = list[i + 1] || list[i - 1];
        if (admin.remove(id) && near) focus.current = { id: near.id, part: 'remove' };
      },
      cancel: () => finish(false),
    };
  }, [admin, reduced]);

  // a drag still going when the list goes away (the window closed under it) ends there, with nothing saved
  useEffect(() => () => act.cancel(), [act]);

  return (
    <div className={`ra-q${lift ? ' dragging' : ''}`}>
      <ol ref={listRef} className="ra-list">
        {shown.map((x, i) => (
          <Row key={x.id} {...x} first={i === 0} lifted={!!lift && lift.id === x.id} act={act} />
        ))}
      </ol>
      <div ref={slotRef} className="ra-slot" aria-hidden="true" />
    </div>
  );
}
