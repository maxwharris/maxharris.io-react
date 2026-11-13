// The pop-out page's contents (page.jsx mounts it): the radio, tuned in as the page opens, centred and scaled to the
// window, a small way back to the desktop, and the song on air in the tab's title.
import { useEffect } from 'react';
import Radio from './Radio.jsx';
import { titleLine } from './format.js';
import { useRadio, useRadioSession } from './useRadio.js';
import './page.css';

const TITLE = '999.9 maxradio';

export default function RadioPage() {
  useRadioSession();
  const { status, song } = useRadio();
  const playing = status === 'on' && song ? titleLine(song).toLowerCase() : '';
  useEffect(() => {
    document.title = playing ? `${playing} · ${TITLE}` : TITLE;
  }, [playing]);
  return (
    <main className="mr-pagebox">
      <Radio context="page" />
      <a className="mr-home" href="/">maxharris.io</a>
    </main>
  );
}
