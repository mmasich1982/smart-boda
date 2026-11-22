// admin-console/src/utils/mapHtml.js
// BUSINESSES MAP: one self-contained web page (Leaflet + OpenStreetMap) that draws every business as a coloured dot. It is shown inside a sandboxed
// <iframe srcDoc>, so it needs no npm package and cannot touch the console. The Admin App draws the same page (rider-app/src/admin/mapHtml.js).
// Business names come from users, so they are NEVER put into the page as HTML: the data is JSON (with "<" escaped) and the popup is built with textContent.
import { validPosition } from './gps';
export const LEAFLET_JS = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.js';
export const LEAFLET_CSS = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.css';
// Map tiles. The default is the free OpenStreetMap server, but OSM's volunteer servers block apps that send no Referer, and this page runs in a
// sandboxed frame / WebView that sends none ("Access blocked - tile usage policy"). So set a tile provider with an API key in the environment:
//   MapTiler: https://api.maptiler.com/maps/streets-v2/256/{z}/{x}/{y}.png?key=YOUR_KEY   (attribution: &copy; MapTiler &copy; OpenStreetMap contributors)
// Do not restrict that key by HTTP referrer (this page sends none); limit it by quota instead.
export const TILE_URL = import.meta.env.VITE_MAP_TILE_URL || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
export const TILE_ATTRIBUTION = import.meta.env.VITE_MAP_TILE_ATTRIBUTION || '&copy; OpenStreetMap contributors';
export const STATUS_COLOR = { activated: '#1e9e6f', pending_setup: '#c98a12', inactive: '#7a7f8a' };
export const STATUS_LABEL = { activated: 'Activated', pending_setup: 'Pending setup', inactive: 'Switched off' };

const safeJson = (v) => JSON.stringify(v).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');

/** points: [{id, business_name, business_type, status, owner_name, users, latitude, longitude, location_accuracy_m, location_source, location_captured_at}] */
export function buildMapHtml(points, { height = '100%' } = {}) {
  const pts = (points || []).filter((p) => validPosition(p.latitude, p.longitude));
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="${LEAFLET_CSS}"><style>html,body,#map{height:${height};margin:0}body{font:13px system-ui,sans-serif}
.leaflet-popup-content{line-height:1.45}.legend{background:#fff;padding:6px 9px;border-radius:8px;box-shadow:0 1px 4px rgba(0,0,0,.3)}.dot{display:inline-block;width:10px;height:10px;border-radius:50%;margin-right:5px}
#msg{position:absolute;z-index:999;top:8px;left:50px;right:8px;background:#fff3cd;padding:6px 10px;border-radius:8px;display:none}</style></head>
<body><div id="map"></div><div id="msg">The map could not load. Check the internet connection.</div>
<script type="application/json" id="pts">${safeJson(pts)}</script>
<script type="application/json" id="cfg">${safeJson({ colors: STATUS_COLOR, labels: STATUS_LABEL, tileUrl: TILE_URL, attribution: TILE_ATTRIBUTION })}</script>
<script src="${LEAFLET_JS}"></script>
<script>
(function(){
  var pts = JSON.parse(document.getElementById('pts').textContent), cfg = JSON.parse(document.getElementById('cfg').textContent);
  if (!window.L) { document.getElementById('msg').style.display = 'block'; return; }
  var map = L.map('map', { zoomControl: true }).setView([0.0236, 37.9062], 6);
  L.tileLayer(cfg.tileUrl, { maxZoom: 19, attribution: cfg.attribution }).addTo(map);
  function line(parent, label, value) { if (value == null || value === '') return; var d = document.createElement('div'); var b = document.createElement('b'); b.textContent = label + ' '; d.appendChild(b); d.appendChild(document.createTextNode(String(value))); parent.appendChild(d); }
  var bounds = [];
  pts.forEach(function (p) {
    var ll = [Number(p.latitude), Number(p.longitude)]; bounds.push(ll);
    var m = L.circleMarker(ll, { radius: 9, color: '#fff', weight: 2, fillColor: cfg.colors[p.status] || '#555', fillOpacity: 0.95 }).addTo(map);
    var box = document.createElement('div');
    var h = document.createElement('div'); h.style.fontWeight = '800'; h.style.fontSize = '14px'; h.textContent = p.business_name; box.appendChild(h);
    line(box, 'Type:', p.business_type); line(box, 'Status:', cfg.labels[p.status] || p.status); line(box, 'Owner:', p.owner_name); line(box, 'People:', p.users);
    if (p.location_accuracy_m != null) line(box, 'Accuracy:', 'about ' + Math.round(p.location_accuracy_m) + ' m'); line(box, 'Position:', p.location_source === 'manual' ? 'typed in' : 'GPS');
    var a = document.createElement('a'); a.href = 'https://www.google.com/maps?q=' + ll[0] + ',' + ll[1]; a.target = '_blank'; a.rel = 'noopener noreferrer'; a.textContent = 'Open in Google Maps'; box.appendChild(a);
    m.bindPopup(box);
  });
  if (bounds.length === 1) map.setView(bounds[0], 16); else if (bounds.length > 1) map.fitBounds(bounds, { padding: [30, 30], maxZoom: 16 });
  var lg = L.control({ position: 'bottomright' }); lg.onAdd = function () { var d = L.DomUtil.create('div', 'legend'); Object.keys(cfg.labels).forEach(function (k) { var r = document.createElement('div'); var s = document.createElement('span'); s.className = 'dot'; s.style.background = cfg.colors[k]; r.appendChild(s); r.appendChild(document.createTextNode(cfg.labels[k])); d.appendChild(r); }); return d; }; lg.addTo(map);
})();
</script></body></html>`;
}
