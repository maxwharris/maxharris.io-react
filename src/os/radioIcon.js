// maxradio's icon (Max, 11/15/26: "add a radio icon to the website desktop screen as well as a shortcut to the main in
// site radio"), on the desktop (shell.jsx) and the phone's home grid (Phone.jsx). The radio is primed inside the click,
// as typing radio does (terminal.js), so the browser lets it play; then its window opens, which switches it on. Clicked
// while the radio is open, it comes back on (say another tab had taken it).
import { prime, tuneIn } from '../radio/engine.js';

export function openRadio(state, actions, origin) {
  prime();
  const w = state.wins.radio;
  actions.open('radio', {}, origin);
  if (w && !w.closing) tuneIn();
}
