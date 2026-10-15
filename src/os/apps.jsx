import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { owner, work, personal, concepts, findWork } from '../data/site';

const building = personal.filter((p) => p.status === 'building');
const live = personal.filter((p) => p.status === 'live');
const retired = personal.filter((p) => p.status === 'retired');
import { useOS, MOD, EASE, TRASH0, host } from './store';
import { Icon, Disc } from './icons';
import { SCENES } from './board';
import { PROMPT, runCommand, complete, historyStep, subscribe } from './terminal';

const Out = ({ href, children, className = 'lnk g' }) => (
  <a className={className} href={href} target="_blank" rel="noopener noreferrer">{children}<Icon name="out" /></a>
);

// ---------- about ----------
export function About() {
  const { actions, phone } = useOS();
  return (
    <div className="about">
      <p className="eyebrow">hello, i&apos;m</p>
      <h1 className="name">{owner.name}</h1>
      <p className="role"><span className="tag">{owner.title}</span><span>{owner.blurb}</span></p>
      <ul className="about-l">{owner.about.map((l) => <li key={l}><span>{l}</span></li>)}</ul>
      <div className="row">
        <button type="button" className="btn acc g" onClick={(e) => actions.openApp('work', e.currentTarget)}><Icon name="work" />open the work folder</button>
        <button type="button" className="btn g" onClick={(e) => actions.openApp('mail', e.currentTarget)}><Icon name="mail" />say hi</button>
      </div>
      <div className="row">
        <Out href={owner.github}><Icon name="code" />github</Out>
        <Out href={owner.linkedin}><Icon name="card" />linkedin</Out>
      </div>
      <p className="tipline">
        {phone
          ? 'every icon on the home screen opens something. the circuit board behind it is drawn live; try scenes.'
          : <>windows arrange themselves, up to six at once. drag one by the bar under it to move it around. <kbd>{MOD}K</kbd> finds anything.</>}
      </p>
    </div>
  );
}

// ---------- files: work + personal ----------
function Seg({ win }) {
  const { actions } = useOS();
  return (
    <div className="seg">
      {['work', 'personal'].map((t) => (
        <button key={t} type="button" aria-current={win.opts.tab === t} onClick={() => actions.setOpts('files', { tab: t }, true)}>{t}</button>
      ))}
    </div>
  );
}

function PCard({ p, label }) {
  const { theme } = useOS();
  return (
    <article className="pcard" id={`pc-${p.key}`}>
      {p.image
        ? <span className="pimg"><img src={p.image.thumb} alt="" loading="lazy" /></span>
        : (
          <span className="pimg pimg-icon" aria-hidden="true">
            {p.appIcon ? <img className="appicon" src={theme === 'dark' ? p.appIcon.dark : p.appIcon.light} alt="" /> : <Disc tint={p.key} glyph={p.icon || 'personal'} />}
          </span>
        )}
      <div className="ptxt">
        <h4>{p.title}</h4>
        {p.tags && <ul className="chips">{p.tags.map((t) => <li key={t}>{t}</li>)}</ul>}
        <p>{p.description}</p>
        {p.link ? <Out href={p.link}>{label}</Out> : p.status === 'retired' && <span className="plain"><Icon name="lock" />no longer online</span>}
      </div>
    </article>
  );
}

export function Files({ win }) {
  const { actions, reduced } = useOS();
  const ref = useRef(null);
  const flash = win.opts.flash;
  const animN = win.anim && win.anim.n;
  useEffect(() => {
    if (!flash || win.opts.tab !== 'personal') return undefined;
    const t = setTimeout(() => {
      const c = ref.current && ref.current.querySelector(`#pc-${flash}`);
      if (c) { c.scrollIntoView({ block: 'center', behavior: reduced() ? 'auto' : 'smooth' }); c.classList.remove('flash'); void c.offsetWidth; c.classList.add('flash'); }
      actions.setOpts('files', { flash: '' });
    }, 350);
    return () => clearTimeout(t);
  }, [flash, win.opts.tab, animN, reduced, actions]);

  if (win.opts.tab !== 'personal') {
    return (
      <div ref={ref}>
        <header className="wh"><Disc tint="work" glyph="work" /><div><h2>work</h2><p className="sub">{work.length} projects · pick one</p></div><span className="sp" /><Seg win={win} /></header>
        <div className="tiles">
          {work.map((p) => (
            <button key={p.key} type="button" className="tile g" onClick={(e) => actions.open('project', { key: p.key }, e.currentTarget.querySelector('.timg'))}>
              <span className="timg"><img src={p.images[0].thumb} alt="" loading="lazy" /></span>
              <span className="tt">{p.title}</span>
              <span className="ts">{p.tagline}</span>
            </button>
          ))}
        </div>
      </div>
    );
  }
  return (
    <div ref={ref}>
      <header className="wh"><Disc tint="personal" glyph="personal" /><div><h2>personal</h2><p className="sub">{building.length ? `${building.length} in progress · ` : ''}{live.length} live · {retired.length} retired · {concepts.length} concepts</p></div><span className="sp" /><Seg win={win} /></header>
      {building.length > 0 && <section className="fsec"><h3 className="fh">in progress</h3><div className="pgrid">{building.map((p) => <PCard key={p.key} p={p} label={host(p.link)} />)}</div></section>}
      <section className="fsec"><h3 className="fh">live</h3><div className="pgrid">{live.map((p) => <PCard key={p.key} p={p} label={host(p.link)} />)}</div></section>
      {retired.length > 0 && <section className="fsec"><h3 className="fh">retired</h3><div className="pgrid">{retired.map((p) => <PCard key={p.key} p={p} />)}</div></section>}
      <section className="fsec"><h3 className="fh">concept</h3><div className="pgrid">{concepts.map((p) => <PCard key={p.key} p={p} label="github" />)}</div></section>
    </div>
  );
}
export function FilesOrn({ win }) {
  const { actions } = useOS();
  return [['work', 'work'], ['personal', 'personal']].map(([t, g]) => (
    <button key={t} type="button" className="g" aria-current={win.opts.tab === t} aria-label={t} onClick={() => actions.setOpts('files', { tab: t }, true)}>
      <Icon name={g} /><span className="tip">{t}</span>
    </button>
  ));
}

// ---------- project ----------
export function Project({ win }) {
  const { actions, reduced } = useOS();
  const p = findWork(win.opts.key) || work[0];
  const [shot, setShot] = useState(0);
  const main = useRef(null);
  const i = work.indexOf(p), n = work.length, prev = work[(i - 1 + n) % n], next = work[(i + 1) % n];
  const pick = (k) => {
    setShot(k);
    if (!reduced() && main.current) main.current.animate([{ opacity: 0.3, transform: 'scale(1.02)' }, { opacity: 1, transform: 'none' }], { duration: 320, easing: EASE });
  };
  return (
    <>
      <article className="proj">
        <div className="proj-media">
          <figure className="shot"><img ref={main} src={p.images[shot].src} alt={`screenshot of ${p.title}`} /></figure>
          {p.images.length > 1 && (
            <div className="gal" role="group" aria-label="screenshots">
              {p.images.map((im, k) => (
                <button key={im.src} type="button" aria-current={k === shot} aria-label={`screenshot ${k + 1} of ${p.images.length}`} onClick={() => pick(k)}>
                  <img src={im.thumb} alt="" loading="lazy" />
                </button>
              ))}
            </div>
          )}
          <div className="stats">{p.stats.map(([v, l]) => <div className="stat" key={l}><b>{v}</b><span>{l}</span></div>)}</div>
          <p className="meta"><span className="eyebrow">role</span><span>{p.role}</span></p>
          <h3 className="eyebrow mt">stack</h3>
          <ul className="chips">{p.stack.map((t) => <li key={t}>{t}</li>)}</ul>
        </div>
        <div className="proj-text">
          <p className="eyebrow">work · {i + 1} of {n}</p>
          <h2>{p.title}</h2>
          <p className="tagline">{p.tagline}</p>
          <div className="row">
            {p.link ? <Out href={p.link} className="btn acc g">{p.linkLabel}</Out> : <span className="plain"><Icon name="lock" />{p.linkLabel}</span>}
          </div>
          <p className="desc">{p.description}</p>
          <h3>highlights</h3>
          <ul className="hl">{p.highlights.map((h) => <li key={h}><span>{h}</span></li>)}</ul>
        </div>
      </article>
      <nav className="pnav" aria-label="more work">
        <button type="button" className="btn g" onClick={() => actions.open('project', { key: prev.key })}><Icon name="back" /><span>{prev.title}</span></button>
        <button type="button" className="btn g" onClick={() => actions.open('project', { key: next.key })}><span>{next.title}</span><Icon name="next" /></button>
      </nav>
    </>
  );
}
export function ProjectOrn({ win }) {
  const { actions } = useOS();
  return work.map((p) => (
    <button key={p.key} type="button" className="g" aria-current={win.opts.key === p.key} aria-label={p.title} onClick={() => actions.open('project', { key: p.key })}>
      <Icon name={p.icon} /><span className="tip">{p.title}</span>
    </button>
  ));
}

// ---------- mail (posts to the site's own /api/contact) ----------
export function Mail({ win }) {
  const { actions, reduced, phone } = useOS();
  const form = useRef(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const sent = win.opts.sent;

  const submit = async (e) => {
    e.preventDefault();
    const f = form.current, d = new FormData(f);
    const name = String(d.get('name')).trim(), email = String(d.get('email')).trim(), message = String(d.get('message')).trim();
    const bad = !name ? ['name', 'add your name'] : !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? ['email', 'that email looks off'] : !message ? ['message', 'write a message first'] : null;
    setErr(bad ? bad[1] : '');
    if (bad) { f.elements[bad[0]].focus(); return; }
    setBusy(true);
    try {
      const res = await fetch('/api/contact', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, email, message }) });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(res.status === 429 ? 'too many messages from here for now. try email instead.' : j.error ? j.error.toLowerCase() : 'that did not send.');
      }
    } catch (x) {
      setBusy(false);
      setErr(`${x.message && !/fetch/i.test(x.message) ? x.message : "couldn't reach the server."} you can email ${owner.email} directly.`);
      return;
    }
    const done = () => { setBusy(false); actions.setOpts('mail', { sent: name }); };
    const pane = f.closest('.pane'), btn = f.querySelector('[type=submit]');
    if (reduced() || phone || !pane || !btn) { done(); return; }
    const pr = pane.getBoundingClientRect(), br = btn.getBoundingClientRect();
    const pl = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    pl.setAttribute('viewBox', '0 0 24 24');
    pl.setAttribute('class', 'ic plane');
    pl.innerHTML = '<path d="M20.5 3.5 10 14M20.5 3.5 14 20.5l-4-6.5-6.5-4z"/>';
    pl.style.left = br.left - pr.left + 12 + 'px';
    pl.style.top = br.top - pr.top + 2 + 'px';
    pane.appendChild(pl);
    f.animate([{ opacity: 1 }, { opacity: 0, transform: 'translateY(-10px)' }], { duration: 380, fill: 'forwards' });
    pl.animate(
      [{ transform: 'none' }, { transform: 'translate(-40px,24px) rotate(-14deg) scale(1.15)', offset: 0.25 }, { transform: `translate(${pr.width}px,${-pr.height}px) rotate(20deg) scale(.6)`, opacity: 0 }],
      { duration: 950, easing: 'cubic-bezier(.5,0,.6,1)' },
    ).onfinish = () => { pl.remove(); done(); };
  };

  if (sent) {
    return (
      <div className="sent" role="status">
        <Disc tint="mail" glyph="send" />
        <h3>sent.</h3>
        <p>thanks, {sent}. it&apos;s in max&apos;s inbox now, and he usually writes back within a day or two.</p>
        <button type="button" className="btn g" autoFocus onClick={() => actions.setOpts('mail', { sent: '' })}>write another</button>
      </div>
    );
  }
  return (
    <>
      <header className="wh"><Disc tint="mail" glyph="mail" /><div><h2>say hi</h2><p className="sub">a note to max</p></div></header>
      <form className="mailf" ref={form} noValidate onSubmit={submit}>
        <div className="fld"><label htmlFor="mf-n">name</label><input id="mf-n" name="name" autoComplete="name" required /></div>
        <div className="fld"><label htmlFor="mf-e">email</label><input id="mf-e" name="email" type="email" autoComplete="email" required /></div>
        <div className="fld"><label htmlFor="mf-m">message</label><textarea id="mf-m" name="message" required /></div>
        <p className="err" aria-live="polite">{err}</p>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <a className="lnk" href={`mailto:${owner.email}`}>{owner.email}</a>
          <button className="btn acc g" type="submit" disabled={busy}><Icon name="send" />{busy ? 'sending' : 'send'}</button>
        </div>
      </form>
    </>
  );
}

// ---------- trash ----------
export function Trash() {
  const { state, actions, reduced } = useOS();
  const list = useRef(null);
  const [emptying, setEmptying] = useState(false);
  const trash = state.trash;
  const empty = () => {
    setEmptying(true);
    const finish = () => {
      setEmptying(false);
      actions.setTrash([]);
      actions.toast('trash emptied. it was mostly node_modules.');
      const d = document.querySelector('#dock [data-app="trash"] .disc');
      if (d && !reduced()) d.animate([{ transform: 'rotate(0)' }, { transform: 'rotate(-16deg)' }, { transform: 'rotate(10deg)' }, { transform: 'rotate(0)' }], { duration: 520 });
    };
    if (reduced()) { finish(); return; }
    const items = [...list.current.querySelectorAll('li')];
    items.forEach((li, i) => li.animate(
      [{ transform: 'none', opacity: 1 }, { transform: `translate(${50 + ((i * 37) % 70)}px,${200 + i * 12}px) rotate(${((i * 53) % 70) - 35}deg) scale(.4)`, opacity: 0 }],
      { duration: 560, delay: i * 70, easing: 'cubic-bezier(.5,0,.8,.4)', fill: 'forwards' },
    ));
    setTimeout(finish, items.length * 70 + 600);
  };
  return (
    <>
      <header className="wh">
        <Disc tint="trash" glyph={trash.length ? 'trashFull' : 'trash'} />
        <div><h2>trash</h2><p className="sub">{trash.length} item{trash.length === 1 ? '' : 's'} · deleted, not forgotten</p></div>
        <span className="sp" />
        {trash.length > 0 && <button type="button" className="btn acc g" disabled={emptying} onClick={empty}><Icon name="trash" />empty</button>}
      </header>
      {trash.length ? (
        <>
          <ul className="tlist" ref={list}>
            {trash.map((t, i) => <li key={t[1] + i}><Icon name={t[0]} /><div><b>{t[1]}</b><small>{t[2]}</small></div></li>)}
          </ul>
          <div className="tfoot" />
        </>
      ) : (
        <div className="tempty"><Icon name="trash" /><p>empty. for now.</p><button type="button" className="btn g" onClick={() => actions.setTrash(TRASH0.slice())}>put the junk back</button></div>
      )}
    </>
  );
}

// ---------- scenes ----------
export function Swatch({ name }) {
  return (
    <span className={`sw sw-${name}`} aria-hidden="true">
      <svg viewBox="0 0 64 36" preserveAspectRatio="xMidYMid slice">
        <path d="M-2 9h16l6 6h14M-2 14h14l6 6h18l6-6h30M-2 19h12l6 6h40M30 2v8l6 6M36 2v6l6 6h24M48 30v8M54 26v12" />
        <rect x="22" y="22" width="14" height="10" rx="1" />
        <circle cx="34" cy="15" r="1.6" /><circle cx="66" cy="14" r="1.6" /><circle cx="10" cy="25" r="1.6" />
      </svg>
    </span>
  );
}
export function Scenes() {
  const { state, actions, phone } = useOS();
  const pct = Math.round(state.imm * 100);
  return (
    <>
      <header className="wh"><Disc tint="scenes" glyph="scenes" /><div><h2>scenes</h2><p className="sub">the world behind the windows</p></div></header>
      <div className="swg">
        {SCENES.map((n) => (
          <button key={n} type="button" className="swb" aria-pressed={state.scene === n} onClick={() => actions.setScene(n)}>
            <Swatch name={n} /><span>{n}</span>
          </button>
        ))}
      </div>
      <div className="imm">
        <label htmlFor="imm-r"><span>immersion</span><span className="imm-val">{pct}%</span></label>
        <input id="imm-r" className="imm-range" type="range" min="0" max="100" value={pct} onChange={(e) => actions.setImm(e.target.value / 100)} />
        {!phone && <p className="tipline">or turn the crown, bottom right. press it for the home view.</p>}
      </div>
    </>
  );
}

// ---------- about maxOS + secrets ----------
export function Sys() {
  return (
    <div className="sys">
      <Icon name="mark" className="mark" />
      <h2>maxOS 26</h2>
      <p className="eyebrow">maxharris.io</p>
      <p>glass windows floating over a circuit board that is generated and drawn live: chips, buses and vias routed on a grid, with signals running through the traces. no stock photos, no video.</p>
      <div className="keys">
        <kbd>{MOD}K</kbd><span>search anything</span>
        <kbd>esc</kbd><span>close the front window</span>
        <kbd>drag</kbd><span>the bar under a window to rearrange. fling it down to put it away</span>
        <kbd>2x click</kbd><span>a grab bar to give that window the whole screen</span>
        <kbd>crown</kbd><span>turn to dim the world, press for home</span>
      </div>
      <p className="tipline">there are a few secrets. look around.</p>
    </div>
  );
}
const SECRETS = [
  '↑ ↑ ↓ ↓ ← → ← → b a',
  'double-click the board to send a signal.',
  'leave it alone for a minute.',
  "the terminal knows more than 'help' says. try vim.",
  'the board has a seed: the same traces every visit. hover one.',
];
export function Secrets() {
  return (
    <>
      <header className="wh"><Disc tint="sys" glyph="file" /><div><h2>secrets.txt</h2><p className="sub">you showed hidden files</p></div></header>
      <div className="secret">{SECRETS.map((l) => '- ' + l).join('\n')}</div>
    </>
  );
}

// ---------- terminal ----------
export function Terminal({ win }) {
  const os = useOS();
  const { shared, actions, phone } = os;
  const term = shared.term;
  const [, force] = useState(0);
  const termEl = useRef(null);
  const inp = useRef(null);
  const form = useRef(null);
  useEffect(() => subscribe(term, () => force((x) => x + 1)), [term]);
  useLayoutEffect(() => { if (termEl.current) termEl.current.scrollTop = termEl.current.scrollHeight; });
  const ctx = {
    term,
    get: os.get,
    actions,
    theme: os.themeName,
    reduced: os.reduced,
    origin: () => form.current,
    closeSelf: () => actions.close(win.kind),
    shake: () => {
      const pane = form.current && form.current.closest('.pane');
      if (pane && !os.reduced()) { pane.classList.remove('shake'); void pane.offsetWidth; pane.classList.add('shake'); }
    },
  };
  const run = (v) => runCommand(v, ctx);
  const onKey = (e) => {
    const el = e.currentTarget;
    if (e.key === 'Tab' && !e.shiftKey && el.value.trim()) { e.preventDefault(); el.value = complete(el.value, term); }
    else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); const v = historyStep(term, e.key === 'ArrowUp' ? -1 : 1); if (v !== null) el.value = v; }
    else if (e.key === 'l' && e.ctrlKey) { e.preventDefault(); run('clear'); }
  };
  return (
    <>
      <div className="term" ref={termEl} onClick={(e) => { if (!e.target.closest('a') && !String(window.getSelection())) inp.current.focus({ preventScroll: true }); }}>
        <div className="out" dangerouslySetInnerHTML={{ __html: term.lines.join('') }} />
        <p className="vh" aria-live="polite">{term.said || ''}</p>
        <form className="tin" ref={form} onSubmit={(e) => { e.preventDefault(); const v = inp.current.value; inp.current.value = ''; run(v); }}>
          <span dangerouslySetInnerHTML={{ __html: PROMPT }} />
          <input ref={inp} aria-label="terminal input" autoComplete="off" autoCapitalize="off" spellCheck="false" enterKeyHint="go" onKeyDown={onKey} />
        </form>
      </div>
      <div className="tchips">
        {['help', 'ls work', 'open euno', 'neofetch', 'scene night'].map((x) => (
          <button key={x} type="button" onClick={() => { run(x); if (!phone) inp.current.focus({ preventScroll: true }); }}>{x}</button>
        ))}
      </div>
    </>
  );
}

