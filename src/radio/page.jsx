// The radio on its own at maxharris.io/radio/ (REL pops it out here): React and the radio only, none of the desktop,
// its board or its router, so it loads quickly and plays on while the listener is elsewhere. It tunes in by itself;
// when the browser will not start sound without a tap, the display says PUSH PWR.
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import RadioPage from './RadioPage.jsx';

createRoot(document.getElementById('radio-root')).render(
  <StrictMode>
    <RadioPage />
  </StrictMode>,
);
