// admin-console/src/utils/mapHtml.js
// BUSINESSES MAP shared settings (colours and labels). The map itself is drawn by components/BusinessMapFrame.jsx.
// The Admin App still draws its own copy of the page (rider-app/src/admin/mapHtml.js).
export const STATUS_COLOR = { activated: '#1e9e6f', pending_setup: '#c98a12', inactive: '#7a7f8a' };
export const STATUS_LABEL = { activated: 'Activated', pending_setup: 'Pending setup', inactive: 'Switched off' };
