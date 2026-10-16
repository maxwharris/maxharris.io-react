// Hand-drawn 24px line icons and the glossy round "disc" app icons.

const GLYPHS = {
  work: '<rect x="3" y="7" width="18" height="13" rx="2.5"/><path d="M9 7V5.6c0-.9.7-1.6 1.6-1.6h2.8c.9 0 1.6.7 1.6 1.6V7M3 12.5h18"/>',
  personal: '<path d="M4 11.2 12 4.5l8 6.7"/><path d="M6.2 9.6v9.9h11.6V9.6"/><path d="M10 19.5v-5h4v5"/>',
  about: '<circle cx="12" cy="8.6" r="3.6"/><path d="M5 19.8c.9-3.5 3.7-5.4 7-5.4s6.1 1.9 7 5.4"/>',
  mail: '<rect x="3" y="5.5" width="18" height="13" rx="2.5"/><path d="m4 7.5 8 6 8-6"/>',
  terminal: '<rect x="3" y="4.5" width="18" height="15" rx="2.5"/><path d="m7.5 9.5 3 2.5-3 2.5M12.5 15h4"/>',
  trash: '<path d="M4.5 7h15M9.5 7V5h5v2M6.5 7l1 12.5h9l1-12.5"/><path d="M10 10.5v6M14 10.5v6"/>',
  trashFull: '<path d="M4.5 9.5h15M6.5 9.5l1 10h9l1-10"/><path d="M7.6 9.5c-.6-2.7 1.2-4.7 3.4-4.2.9-1.6 3.4-1.6 4.1.3 1.7-.1 2.6 1.7 1.9 3.9"/>',
  scenes: '<circle cx="16.5" cy="7.5" r="2.5"/><path d="m3 19 6-8.5 4.2 5.2 2.6-3.2L21 19z"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.8V5M12 19v2.2M2.8 12H5M19 12h2.2M5.5 5.5 7 7M17 17l1.5 1.5M5.5 18.5 7 17M17 7l1.5-1.5"/>',
  moon: '<path d="M19.5 14.6A7.6 7.6 0 0 1 9.4 4.5a7.6 7.6 0 1 0 10.1 10.1z"/>',
  close: '<path d="M7 7l10 10M17 7 7 17"/>',
  min: '<path d="M6 12h12"/>',
  zoom: '<path d="M14 4h6v6M10 20H4v-6M20 4l-6 6M4 20l6-6"/>',
  unzoom: '<path d="M19 10h-5V5M5 14h5v5M14 10l6-6M10 14l-6 6"/>',
  back: '<path d="m14.5 5.5-6.5 6.5 6.5 6.5"/>',
  next: '<path d="m9.5 5.5 6.5 6.5-6.5 6.5"/>',
  out: '<path d="M7 17 17 7M8.5 7H17v8.5"/>',
  file: '<path d="M6.5 3.5H14l3.5 3.5v13.5h-11z"/><path d="M14 3.5V7h3.5"/>',
  folder: '<path d="M3 7v10.5c0 .8.7 1.5 1.5 1.5h15c.8 0 1.5-.7 1.5-1.5V9c0-.8-.7-1.5-1.5-1.5h-8.3L9.3 5H4.5C3.7 5 3 5.7 3 6.5z"/>',
  bulb: '<path d="M9 17.5h6M10 21h4M12 3a6 6 0 0 0-3.6 10.8c.7.5 1.1 1.3 1.1 2.2h5c0-.9.4-1.7 1.1-2.2A6 6 0 0 0 12 3z"/>',
  code: '<path d="m8 8-4 4 4 4M16 8l4 4-4 4M13.5 5l-3 14"/>',
  card: '<rect x="3.5" y="5" width="17" height="14" rx="2.5"/><circle cx="9" cy="10.5" r="2"/><path d="M5.8 16c.5-1.6 1.6-2.5 3.2-2.5s2.7.9 3.2 2.5M14.5 10h3M14.5 13.5h3"/>',
  send: '<path d="M20.5 3.5 10 14M20.5 3.5 14 20.5l-4-6.5-6.5-4z"/>',
  lock: '<rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/>',
  home: '<circle cx="7" cy="7" r="2"/><circle cx="17" cy="7" r="2"/><circle cx="7" cy="17" r="2"/><circle cx="17" cy="17" r="2"/>',
  chart: '<path d="M4 4v16h16"/><path d="M8.5 16v-4.5M12.5 16V8M16.5 16V9.5"/>',
  cart: '<path d="M3 4.5h2.4l2.1 10h10.4l2.1-7.5H6.3"/><circle cx="9" cy="19" r="1.3"/><circle cx="16.5" cy="19" r="1.3"/>',
  phone: '<rect x="7" y="2.8" width="10" height="18.4" rx="2.6"/><path d="M10.6 18h2.8"/>',
  eye: '<path d="M2.5 12S6 5.8 12 5.8 21.5 12 21.5 12 18 18.2 12 18.2 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.9"/>',
  map: '<path d="M9 4.8 3.5 6.8v12.4l5.5-2 6 2 5.5-2V4.8l-5.5 2z"/><path d="M9 4.8v12.4M15 6.8v12.4"/>',
  plug: '<path d="M9 3v4.5M15 3v4.5M6.5 7.5h11v3a5.5 5.5 0 0 1-11 0zM12 16v5"/>',
  chat: '<path d="M20 11.5c0 4-3.6 7-8 7-1.2 0-2.3-.2-3.3-.6L4 19.5l1.3-3.6A6.6 6.6 0 0 1 4 11.5c0-4 3.6-7 8-7s8 3 8 7z"/>',
  globe: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.4 2.4 3.4 5.4 3.4 8.5s-1 6.1-3.4 8.5c-2.4-2.4-3.4-5.4-3.4-8.5s1-6.1 3.4-8.5z"/>',
  box: '<path d="M12 3 20 7.5v9L12 21l-8-4.5v-9z"/><path d="M4 7.5 12 12l8-4.5M12 12v9"/>',
  mark: '<path d="M3 17.5 9 9l3.6 4.8L15 11l6 6.5"/><path d="M3 20.5h18"/><circle cx="16.5" cy="5.5" r="1.8"/>',
  wave: '<path d="M3 12h1.5M6 9v6M9 5.5v13M12 8v8M15 3.5v17M18 7.5v9M21 12h-1.5"/>',
};

const TINT = {
  work: ['#f5c46b', '#d07f26'], personal: ['#a9d6b5', '#468763'], about: ['#9fd3f2', '#3374a8'], mail: ['#93e2d8', '#22827f'],
  terminal: ['#59616b', '#14171b'], scenes: ['#f4b073', '#1f4256'], trash: ['#f1f3f5', '#9aa6b0'],
  manager: ['#f3c062', '#b8721f'], storefront: ['#f4a493', '#b9504a'], simplemanager: ['#9ccdec', '#306c9a'], euno: ['#a9c1d2', '#284557'],
  admin: ['#b1d1a5', '#4d7750'], channels: ['#f1d684', '#b98a25'], chatebs: ['#9fdcd4', '#25807c'], ebspos: ['#c3ccd6', '#566373'],
  nems: ['#e2bf98', '#85603f'], ebsweb: ['#9ccdec', '#2f5f9c'], dahw: ['#c7a6f2', '#5b3a9c'], sys: ['#3a4752', '#0f161c'],
};

export function Icon({ name, className = '' }) {
  return (
    <svg viewBox="0 0 24 24" className={`ic ${className}`} aria-hidden="true" dangerouslySetInnerHTML={{ __html: GLYPHS[name] || GLYPHS.file }} />
  );
}

export function Disc({ tint, glyph }) {
  const t = TINT[tint] || TINT.sys;
  return (
    <span className={`disc${tint === 'trash' ? ' dk-g' : ''}`} style={{ '--t1': t[0], '--t2': t[1] }}>
      <Icon name={glyph} />
    </span>
  );
}
