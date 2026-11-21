// rider-app/src/screens/admin/BusinessMapView.web.js   (the installed web app / PWA)
// The same page in a sandboxed iframe: scripts run inside it, but it cannot reach the app, its storage or its session.
import React, { useMemo } from 'react';
import { buildMapHtml } from '../../admin/mapHtml';

export default function BusinessMapView({ points, height = 440 }) {
  const html = useMemo(() => buildMapHtml(points), [points]);
  return React.createElement('iframe', { title: 'Map of registered businesses', 'data-testid': 'map-view', srcDoc: html, sandbox: 'allow-scripts allow-popups allow-popups-to-escape-sandbox',
    style: { width: '100%', height, border: '1px solid #e7e4db', borderRadius: 12, marginBottom: 12 } });
}
