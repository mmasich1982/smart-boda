// rider-app/src/hooks/useTimedMessage.js
// A short message that shows by itself and goes away by itself (the green "Sale/Service saved successfully" line under Save Sale/Service).
//   const { message, show, clear } = useTimedMessage(3000);   show('Saved') -> message === 'Saved' for 3 seconds, then null.
// Showing a new message while one is on screen starts the 3 seconds again (so two quick sales each get their full 3 seconds). The timer is cancelled when the
// screen closes, so nothing runs against a screen that is gone.
import { useCallback, useEffect, useRef, useState } from 'react';

export const SAVED_MESSAGE_MS = 3000;

export function useTimedMessage(ms = SAVED_MESSAGE_MS) {
  const [message, setMessage] = useState(null);
  const timer = useRef(null);
  const stop = () => { if (timer.current) { clearTimeout(timer.current); timer.current = null; } };
  const clear = useCallback(() => { stop(); setMessage(null); }, []);
  const show = useCallback((text) => {
    stop();
    setMessage(text);
    timer.current = setTimeout(() => { timer.current = null; setMessage(null); }, ms);
  }, [ms]);
  useEffect(() => stop, []);
  return { message, show, clear };
}

export default useTimedMessage;
