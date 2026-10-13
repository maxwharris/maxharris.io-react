import { useLayoutEffect, useRef, useState } from 'react';
import { useOS, titleOf, clamp, EASE } from './store';
import { Icon } from './icons';
import { BODIES, ORNAMENTS } from './registry';

const AUTOFOCUS = { mail: 'input', terminal: 'input' };
const appOf = (kind) => (kind === 'files' ? 'work' : kind);
// after a window goes away, focus the next window in front, or else the dock button that brings it back
function refocus(fallback) {
  const n = document.querySelector('.os .win.is-focus:not([hidden]) .pane') || document.querySelector(fallback) || document.querySelector('#dock .dk');
  if (n) n.focus({ preventScroll: true });
}
const rectOf = (o) => (o && o.width ? o : null);
const place = (el, w) => {
  el.style.left = Math.round(w.x) + 'px';
  el.style.top = Math.round(w.y) + 'px';
  el.style.width = Math.round(w.w) + 'px';
  el.style.height = Math.round(w.h) + 'px';
};

function grow(el, pane, origin, phone, reduced) {
  const extras = el.querySelectorAll('.bar,.orn');
  if (reduced) { pane.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 160 }); return; }
  const o = rectOf(origin);
  if (!o) {
    pane.animate([{ opacity: 0, transform: 'translateY(14px) scale(.95)' }, { opacity: 1, transform: 'none' }], { duration: 420, easing: EASE });
  } else {
    const r = el.getBoundingClientRect();
    const sc = Math.max(0.04, Math.min(o.width / r.width, o.height / r.height));
    const dx = o.left + o.width / 2 - (r.left + r.width / 2), dy = o.top + o.height / 2 - (r.top + r.height / 2);
    pane.animate(
      [
        { transform: `translate(${dx}px,${dy}px) scale(${sc})`, opacity: 0, borderRadius: '50%' },
        { opacity: 1, offset: 0.22 },
        { transform: 'none', opacity: 1, borderRadius: phone ? '26px 26px 0 0' : '30px' },
      ],
      { duration: 560, easing: EASE },
    );
  }
  extras.forEach((n) => n.animate([{ opacity: 0 }, { opacity: 0, offset: 0.5 }, { opacity: 1 }], { duration: 640 }));
}

export default function Window({ win, focused }) {
  const { actions, phone, reduced, get } = useOS();
  const ref = useRef(null);
  const paneRef = useRef(null);
  const bodyRef = useRef(null);
  const [minDone, setMinDone] = useState(false);
  const kind = win.kind;
  const title = titleOf(win);
  const Body = BODIES[kind];
  const Orn = ORNAMENTS[kind];

  // Geometry is written straight to the element, and CSS transitions carry each window to its
  // new slot. A window being dragged keeps following the pointer until it is let go.
  const { x: wx, y: wy, w: ww, h: wh } = win;
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (phone) { el.style.left = el.style.top = el.style.width = el.style.height = ''; return; }
    if (el.classList.contains('dragging')) { el.style.width = Math.round(ww) + 'px'; el.style.height = Math.round(wh) + 'px'; return; }
    place(el, { x: wx, y: wy, w: ww, h: wh });
  }, [wx, wy, ww, wh, phone]);

  // One animation per action, keyed by the reducer's counter.
  useLayoutEffect(() => {
    const a = win.anim, el = ref.current, pane = paneRef.current;
    if (!a || !el || !pane) return undefined;
    if (a.type === 'unpark') {
      // back from the dock on its own: animate in, but leave focus where the visitor is
      grow(el, pane, null, phone, reduced());
    } else if (a.type === 'grow' || a.type === 'restore') {
      grow(el, pane, a.origin, phone, reduced());
      const sel = !phone && AUTOFOCUS[kind];
      const f = sel ? el.querySelector(sel) : null;
      (f || pane).focus({ preventScroll: true });
    } else if (a.type === 'rise') {
      el.classList.add('rise');
      pane.style.animationDelay = `${a.delay || 0}s`;
      el.querySelectorAll('.bar,.orn').forEach((n) => { n.style.animationDelay = `${(a.delay || 0) + 0.3}s`; });
      const t = setTimeout(() => el.classList.remove('rise'), 2200);
      return () => clearTimeout(t);
    } else if (a.type === 'bump') {
      if (!reduced()) pane.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.018)' }, { transform: 'scale(1)' }], { duration: 320, easing: 'ease-out' });
      pane.focus({ preventScroll: true });
    } else if (a.type === 'swap') {
      if (bodyRef.current) {
        bodyRef.current.scrollTop = 0;
        if (!reduced()) bodyRef.current.animate([{ opacity: 0.2, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }], { duration: 400, easing: EASE });
      }
    }
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [win.anim && win.anim.n]);

  // Close: play the exit, then let the reducer forget the window.
  useLayoutEffect(() => {
    if (!win.closing) return;
    const el = ref.current, pane = paneRef.current;
    const hadFocus = el && el.contains(document.activeElement);
    const bits = el.querySelectorAll('.bar,.orn');
    bits.forEach((n) => { n.style.opacity = 0; });
    const from = pane.style.transform || 'none';
    pane.style.transform = '';
    const kf = phone
      ? [{ transform: from, opacity: 1 }, { transform: 'translateY(100%)', opacity: 0 }]
      : [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'scale(.92) translateY(10px)' }];
    const anim = pane.animate(kf, { duration: reduced() ? 1 : phone ? 260 : 230, easing: 'ease-in', fill: 'forwards' });
    anim.onfinish = () => {
      actions.remove(kind);
      if (hadFocus) requestAnimationFrame(() => refocus(`#dock [data-app="${appOf(kind)}"]`));
    };
    // reopened before the exit finished: put it back
    return () => { anim.onfinish = null; anim.cancel(); bits.forEach((n) => { n.style.opacity = ''; }); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [win.closing]);

  // Minimize: fly into the dock slot, then hide.
  useLayoutEffect(() => {
    if (!win.min) { setMinDone(false); return; }
    const el = ref.current, pane = paneRef.current;
    el.classList.remove('dragging');
    const hadFocus = el.contains(document.activeElement);
    const handOff = () => { if (hadFocus) requestAnimationFrame(() => refocus(`#dock-min [data-restore="${kind}"]`)); };
    const slot = document.querySelector(`#dock-min [data-restore="${kind}"] .disc`);
    if (reduced() || !slot) { setMinDone(true); handOff(); return; }
    const o = slot.getBoundingClientRect(), r = el.getBoundingClientRect();
    const sc = Math.max(0.04, Math.min(o.width / r.width, o.height / r.height));
    pane.style.transform = '';
    el.querySelectorAll('.bar,.orn').forEach((n) => n.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 140, fill: 'forwards' }));
    const anim = pane.animate(
      [{ transform: 'none', opacity: 1 }, { transform: `translate(${o.left + o.width / 2 - (r.left + r.width / 2)}px,${o.top + o.height / 2 - (r.top + r.height / 2)}px) scale(${sc})`, opacity: 0.15, borderRadius: '50%' }],
      { duration: 440, easing: 'cubic-bezier(.55,0,.8,.3)', fill: 'forwards' },
    );
    anim.onfinish = () => {
      setMinDone(true);
      el.getAnimations({ subtree: true }).forEach((x) => x.cancel());
      handOff();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [win.min]);

  // ---- dragging reorders the row: the others slide aside, and a fast fling down parks it ----
  const tilt = (vx, vy) => {
    paneRef.current.style.transform = `perspective(1600px) rotateX(${clamp(-vy * 4, -7, 7).toFixed(2)}deg) rotateY(${clamp(vx * 4, -7, 7).toFixed(2)}deg) scale(1.012)`;
  };

  function drag(e, handle) {
    e.preventDefault();
    const el = ref.current;
    try { handle.setPointerCapture(e.pointerId); } catch { /* not capturable */ }
    const sx = e.clientX, sy = e.clientY;
    const ox = parseFloat(el.style.left) || win.x, oy = parseFloat(el.style.top) || win.y;
    const hist = [[performance.now(), sx, sy]];
    let moved = false, lastY = sy;
    el.classList.add('dragging');
    const vel = () => {
      const now = performance.now(), h = hist.filter((q) => now - q[0] < 90);
      if (h.length < 2) return { x: 0, y: 0 };
      const a = h[0], b = h[h.length - 1], dt = Math.max(8, b[0] - a[0]);
      return { x: (b[1] - a[1]) / dt, y: (b[2] - a[2]) / dt };
    };
    const mv = (ev) => {
      const dx = ev.clientX - sx, dy = ev.clientY - sy;
      if (!moved && Math.hypot(dx, dy) < 3) return;
      moved = true;
      const x = clamp(ox + dx, 8 - win.w / 2, window.innerWidth - win.w / 2 - 8);
      const y = clamp(oy + dy, 52, window.innerHeight - 160);
      el.style.left = Math.round(x) + 'px';
      el.style.top = Math.round(y) + 'px';
      hist.push([performance.now(), ev.clientX, ev.clientY]);
      if (hist.length > 12) hist.shift();
      lastY = ev.clientY;
      if (!reduced()) { const v = vel(); tilt(v.x, v.y); }
      // which place is the dragged window's center over? left to right, and top to bottom
      // within a column of two
      const s = get(), cx = x + win.w / 2, cy = y + win.h / 2;
      const others = s.order.filter((k) => k !== kind && s.wins[k] && !s.wins[k].min && !s.wins[k].closing);
      const index = others.filter((k) => {
        const o = s.wins[k], ox2 = o.x + o.w / 2, oy2 = o.y + o.h / 2;
        return Math.abs(ox2 - cx) < o.w / 2 ? oy2 < cy : ox2 < cx;
      }).length;
      actions.reorder(kind, index);
    };
    const up = () => {
      handle.removeEventListener('pointermove', mv);
      handle.removeEventListener('pointerup', up);
      handle.removeEventListener('pointercancel', up);
      const v = vel();
      el.classList.remove('dragging');
      paneRef.current.style.transform = '';
      if (moved && v.y > 0.8 && Math.abs(v.y) > Math.abs(v.x) * 1.5 && lastY - sy > 60) { actions.minimize(kind); return; }
      // glide into its slot
      const w = get().wins[kind];
      if (w) place(el, w);
    };
    handle.addEventListener('pointermove', mv);
    handle.addEventListener('pointerup', up);
    handle.addEventListener('pointercancel', up);
  }

  function swipe(e, head) {
    const pane = paneRef.current, sy = e.clientY;
    let dy = 0;
    try { head.setPointerCapture(e.pointerId); } catch { /* not capturable */ }
    const mv = (ev) => { dy = Math.max(0, ev.clientY - sy); pane.style.transform = `translateY(${dy}px)`; };
    const up = () => {
      head.removeEventListener('pointermove', mv);
      head.removeEventListener('pointerup', up);
      head.removeEventListener('pointercancel', up);
      if (dy > 110) actions.close(kind);
      else { pane.animate([{ transform: `translateY(${dy}px)` }, { transform: 'none' }], { duration: 200, easing: EASE }); pane.style.transform = ''; }
    };
    head.addEventListener('pointermove', mv);
    head.addEventListener('pointerup', up);
    head.addEventListener('pointercancel', up);
  }

  const onPointerDown = (e) => {
    actions.focus(kind);
    if (phone) {
      const head = e.target.closest('.ph-head');
      if (head && !e.target.closest('button')) swipe(e, head);
      return;
    }
    if (e.button !== 0) return;
    const grab = e.target.closest('.grab');
    const head = !grab && e.target.closest('.wh') && !e.target.closest('button,a,input,textarea,select,label,.seg');
    if (grab || head) drag(e, grab || head);
  };
  // arrow keys on the grab bar move the window one place earlier or later in the arrangement
  const onGrabKey = (e) => {
    const d = { ArrowLeft: -1, ArrowRight: 1 }[e.key];
    if (!d) return;
    e.preventDefault();
    const s = get(), shown = s.order.filter((k) => s.wins[k] && !s.wins[k].min && !s.wins[k].closing);
    actions.reorder(kind, shown.indexOf(kind) + d);
  };

  const cls = ['win', focused && 'is-focus'].filter(Boolean).join(' ');
  return (
    <section
      ref={ref}
      className={cls}
      role="dialog"
      aria-modal={phone || undefined}
      aria-label={title}
      data-kind={kind}
      hidden={win.min && minDone}
      style={{ zIndex: win.z }}
      onPointerDown={onPointerDown}
      onFocus={() => { if (!focused) actions.focus(kind); }}
    >
      <div ref={paneRef} className={`pane glass k-${kind}`} tabIndex={-1}>
        <div className="sheen" aria-hidden="true" />
        <div className="ph-head">
          <button className="ph-back" type="button" onClick={() => actions.close(kind)}>
            <Icon name="back" /><span>home</span>
          </button>
          <span className="ph-title">{title}</span>
          <span />
        </div>
        <div ref={bodyRef} className="body">
          <Body key={kind === 'project' ? win.opts.key : kind} win={win} />
        </div>
      </div>
      {Orn && !phone && (
        <nav className="orn glass" aria-label="tabs">
          <Orn win={win} />
        </nav>
      )}
      <div className="bar">
        <button className="wb g" type="button" aria-label={`close ${title}`} onClick={() => actions.close(kind)}><Icon name="close" /></button>
        <button className="grab" type="button" aria-label={`move ${title} left or right (arrow keys)`} title="drag to rearrange, fling down to put away, double-click to zoom" onKeyDown={onGrabKey} onDoubleClick={() => actions.zoom(kind)}><span /></button>
        <button className="wb g" type="button" aria-label={`minimize ${title}`} onClick={() => actions.minimize(kind)}><Icon name="min" /></button>
        <button className="wb g" type="button" aria-label={`${win.zoomed ? 'restore' : 'zoom'} ${title}`} onClick={() => actions.zoom(kind)}><Icon name={win.zoomed ? 'unzoom' : 'zoom'} /></button>
      </div>
    </section>
  );
}
