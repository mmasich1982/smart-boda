// admin-console/src/utils/mapHtml.js
// BUSINESSES MAP shared settings. The map page itself is public/business-map.html (Leaflet + OpenStreetMap), shown by components/BusinessMapFrame.jsx
// in a sandboxed iframe that is loaded by URL so the browser sends a Referer with the tile requests (OpenStreetMap blocks tile requests without one).
// The Admin App still draws its own copy of the page (rider-app/src/admin/mapHtml.js).
export const STATUS_COLOR = { activated: '#1e9e6f', pending_setup: '#c98a12', inactive: '#7a7f8a' };
export const STATUS_LABEL = { activated: 'Activated', pending_setup: 'Pending setup', inactive: 'Switched off' };
