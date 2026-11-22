// admin-console/src/components/BusinessMapFrame.jsx
// Draws the Businesses Map page (public/business-map.html) in a sandboxed iframe: scripts may run inside it, but it has no access to the console, its cookies or its storage.
// The page is loaded from the console's own site by URL (NOT srcDoc). A srcDoc page has no URL of its own, so the browser sends no Referer with the map tiles
// and OpenStreetMap's tile servers answer "Access blocked - app is not following the tile usage policy". The pins reach the page with postMessage.
import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { validPosition } from '../utils/gps';
import { STATUS_COLOR, STATUS_LABEL } from '../utils/mapHtml';

export const MAP_PAGE = '/business-map.html';

export default function BusinessMapFrame({ points, height = 560 }) {
  const ref = useRef(null);
  const pins = useMemo(() => (points || []).filter((p) => validPosition(p.latitude, p.longitude)), [points]);
  const send = useCallback(() => {
    const win = ref.current && ref.current.contentWindow;
    // '*' is needed because a sandboxed page has an opaque origin; the message goes only to this iframe's own window.
    if (win) win.postMessage({ type: 'points', points: pins, cfg: { colors: STATUS_COLOR, labels: STATUS_LABEL } }, '*');
  }, [pins]);

  useEffect(() => { send(); }, [send]);
  useEffect(() => {
    const onMsg = (e) => { if (ref.current && e.source === ref.current.contentWindow && e.data && e.data.type === 'map-ready') send(); };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, [send]);

  return <iframe ref={ref} title="Map of registered businesses" data-testid="map-frame" src={MAP_PAGE} onLoad={send}
    sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox" style={{ width: '100%', height, border: '1px solid var(--line)', borderRadius: 10 }} />;
}
