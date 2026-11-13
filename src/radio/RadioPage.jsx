// The pop-out page's contents (page.jsx mounts it): the radio, tuned in as the page opens, and a way back.
import Radio from './Radio.jsx';
import { useRadioSession } from './useRadio.js';
import './page.css';

export default function RadioPage() {
  useRadioSession();
  return (
    <main className="mr-pagebox">
      <Radio context="page" />
      <a className="mr-home" href="/">maxharris.io</a>
    </main>
  );
}
