// admin-console/src/components/BusinessMapFrame.jsx
// Draws the Businesses Map page (utils/mapHtml.js) in a sandboxed iframe: scripts may run inside it, but it has no access to the console, its cookies or its storage.
import React, { useMemo } from 'react';
import { buildMapHtml } from '../utils/mapHtml';

export default function BusinessMapFrame({ points, height = 560 }) {
  const html = useMemo(() => buildMapHtml(points), [points]);
  return <iframe title="Map of registered businesses" data-testid="map-frame" srcDoc={html} sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox" style={{ width: '100%', height, border: '1px solid var(--line)', borderRadius: 10 }} />;
}
