import { useRef } from 'react';
import { owner, work } from '../data/site';
import { useOS, APPS, APP } from './store';
import { Icon, Disc } from './icons';
import { ThemeButton } from './shell';
import { useClock } from './useClock';

// Below 760px the desktop becomes a home screen; apps open as full-height sheets.
export default function Phone() {
  const { state, actions, sceneRef } = useOS();
  const sheet = Object.values(state.wins).some((w) => !w.closing) || undefined;
  const clock = useClock();
  const lastTap = useRef(0);
  const disc = (e) => e.currentTarget.querySelector('.disc');
  const onTap = (e) => {
    if (e.target.closest('button,a')) return;
    const now = Date.now();
    if (now - lastTap.current < 350) { if (sceneRef.current) sceneRef.current.poke(e.clientX, e.clientY); lastTap.current = 0; } else lastTap.current = now;
  };
  return (
    <div id="phone" inert={sheet}>
      <header className="p-status">
        <span className="p-time">{clock.short}</span>
        <div className="p-acts">
          <button type="button" className="g" aria-label="search" onClick={actions.openSpot}><Icon name="search" /></button>
          <ThemeButton className="g" />
        </div>
      </header>
      <div className="p-home" onPointerUp={onTap}>
        <section className="p-hello glass">
          <p className="eyebrow">hello, i&apos;m</p>
          <h1>{owner.name}</h1>
          <p className="role" style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}><span className="tag">{owner.title}</span><span>{owner.blurb}</span></p>
          <div className="row">
            <button type="button" className="btn acc g" onClick={(e) => actions.openApp('about', e.currentTarget)}><Icon name="about" />about max</button>
            <button type="button" className="btn g" onClick={(e) => actions.openApp('mail', e.currentTarget)}><Icon name="mail" />say hi</button>
          </div>
        </section>
        <nav className="p-grid" aria-label="apps">
          {APPS.map((a) => (
            <button key={a.id} type="button" className="p-app g" onClick={(e) => actions.openApp(a.id, disc(e))}>
              <Disc tint={a.id} glyph={a.glyph} /><span className="lbl">{a.label}</span>
            </button>
          ))}
        </nav>
        <section className="p-work glass" aria-label="work">
          <h2>work · {work.length} projects</h2>
          {work.map((p) => (
            <button key={p.key} type="button" className="p-row g" onClick={(e) => actions.open('project', { key: p.key }, disc(e))}>
              <Disc tint={p.key} glyph={p.icon} />
              <span><b>{p.title}</b><small>{p.tagline}</small></span>
            </button>
          ))}
        </section>
        <p className="p-foot">double-tap the sky, or the lake</p>
      </div>
      <nav className="p-dock glass" aria-label="dock">
        {['work', 'about', 'mail', 'terminal'].map((id) => (
          <button key={id} type="button" className="dk g" aria-label={APP[id].label} onClick={(e) => actions.openApp(id, disc(e))}>
            <Disc tint={id} glyph={APP[id].glyph} />
          </button>
        ))}
      </nav>
    </div>
  );
}
