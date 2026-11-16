// The embed's contents (embed.jsx mounts it): the faceplate, or with ?display only its display, switched on by itself
// as the page opens and off as it closes. The display alone has no keys, so while it waits for a tap (push pwr) a tap
// anywhere on it is the power key.
import { useEffect } from 'react';
import Radio from './Radio.jsx';
import { radio, useRadio } from './useRadio.js';

export default function EmbedPage({ display = false }) {
  const { status } = useRadio();
  useEffect(() => {
    radio.autoStart();
    return () => radio.powerOff();
  }, []);
  const waiting = display && (status === 'off' || status === 'blocked');
  return (
    <>
      <Radio context={display ? 'display' : 'embed'} />
      {waiting ? <button type="button" className="mr-tap" aria-label="power" onClick={() => radio.power()} /> : null}
    </>
  );
}
