import { useEffect, useState } from 'react';

// the menubar and phone status bar clock, refreshed every 10 seconds
export function useClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 10000); return () => clearInterval(t); }, []);
  const time = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }).toLowerCase();
  const day = now.toLocaleDateString('en-US', { weekday: 'short' }).toLowerCase();
  return { full: `${day} ${time}`, short: time.replace(/\s?[ap]m$/, '') };
}
