// The radio admin's window body (window kind 'radioadmin', opened by typing radio admin in the terminal): Max's editor
// for the radio's queue, signed in through the catalog. This part is in the desktop's bundle; the editor (Admin.jsx, its
// styles and helpers) loads the first time the window opens. A load that fails is tried once more, and after that the
// window says so in the desktop's own styles.
import { Component, lazy, Suspense } from 'react';
import { Disc } from '../../os/icons';

const load = () => import('./Admin.jsx');
const Admin = lazy(() => load().catch(() => load()));

function Head({ sub }) {
  return (
    <header className="wh">
      <Disc tint="radio" glyph="queue" />
      <div><h2>radio admin</h2><p className="sub">{sub}</p></div>
    </header>
  );
}

class Boundary extends Component {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <>
        <Head sub="did not load" />
        <p role="alert" style={{ margin: 0, padding: '4px 26px 24px', font: '500 13px/1.6 var(--mono)', color: 'var(--ink-2)' }}>
          the radio admin could not load. reload the page to try again.
        </p>
      </>
    );
  }
}

export function RadioAdminApp({ win }) {
  return (
    <Boundary>
      <Suspense fallback={<Head sub="loading" />}>
        <Admin win={win} />
      </Suspense>
    </Boundary>
  );
}
