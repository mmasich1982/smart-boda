// admin-console/src/components/BusinessMapFrame.jsx
// The Businesses Map, drawn with Leaflet + OpenStreetMap directly in the page (npm package "leaflet", bundled by Vite).
// Why not an iframe: tile requests from a srcDoc / sandboxed iframe go out without a Referer, and OpenStreetMap's tile servers then answer
// "Access blocked - app is not following the tile usage policy". In the page itself the browser sends the console's address as Referer.
// Business names come from users, so popups are built with textContent, never as HTML.
import React, { useEffect, useMemo, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { validPosition } from '../utils/gps';
import { STATUS_COLOR, STATUS_LABEL } from '../utils/mapHtml';

function line(parent, label, value) {
  if (value == null || value === '') return;
  const d = document.createElement('div'), b = document.createElement('b');
  b.textContent = `${label} `; d.appendChild(b); d.appendChild(document.createTextNode(String(value))); parent.appendChild(d);
}

function popupFor(p, ll) {
  const box = document.createElement('div'), h = document.createElement('div');
  h.style.fontWeight = '800'; h.style.fontSize = '14px'; h.textContent = p.business_name; box.appendChild(h);
  line(box, 'Type:', p.business_type); line(box, 'Status:', STATUS_LABEL[p.status] || p.status); line(box, 'Owner:', p.owner_name); line(box, 'People:', p.users);
  if (p.location_accuracy_m != null) line(box, 'Accuracy:', `about ${Math.round(p.location_accuracy_m)} m`);
  line(box, 'Position:', p.location_source === 'manual' ? 'typed in' : 'GPS');
  const a = document.createElement('a');
  a.href = `https://www.google.com/maps?q=${ll[0]},${ll[1]}`; a.target = '_blank'; a.rel = 'noopener noreferrer'; a.textContent = 'Open in Google Maps';
  box.appendChild(a);
  return box;
}

export default function BusinessMapFrame({ points, height = 560 }) {
  const el = useRef(null), map = useRef(null), layer = useRef(null);
  const pins = useMemo(() => (points || []).filter((p) => validPosition(p.latitude, p.longitude)), [points]);

  useEffect(() => {
    const m = L.map(el.current, { zoomControl: true }).setView([0.0236, 37.9062], 6);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors',
    }).addTo(m);
    const lg = L.control({ position: 'bottomright' });
    lg.onAdd = () => {
      const d = L.DomUtil.create('div', 'legend');
      d.style.cssText = 'background:#fff;padding:6px 9px;border-radius:8px;box-shadow:0 1px 4px rgba(0,0,0,.3);font-size:13px';
      Object.keys(STATUS_LABEL).forEach((k) => {
        const r = document.createElement('div'), s = document.createElement('span');
        s.style.cssText = `display:inline-block;width:10px;height:10px;border-radius:50%;margin-right:5px;background:${STATUS_COLOR[k]}`;
        r.appendChild(s); r.appendChild(document.createTextNode(STATUS_LABEL[k])); d.appendChild(r);
      });
      return d;
    };
    lg.addTo(m);
    layer.current = L.layerGroup().addTo(m); map.current = m;
    return () => { m.remove(); map.current = null; layer.current = null; };
  }, []);

  useEffect(() => {
    if (!map.current || !layer.current) return;
    layer.current.clearLayers();
    const bounds = [];
    pins.forEach((p) => {
      const ll = [Number(p.latitude), Number(p.longitude)]; bounds.push(ll);
      L.circleMarker(ll, { radius: 9, color: '#fff', weight: 2, fillColor: STATUS_COLOR[p.status] || '#555', fillOpacity: 0.95 }).addTo(layer.current).bindPopup(popupFor(p, ll));
    });
    if (bounds.length === 1) map.current.setView(bounds[0], 16);
    else if (bounds.length > 1) map.current.fitBounds(bounds, { padding: [30, 30], maxZoom: 16 });
  }, [pins]);

  return <div ref={el} data-testid="map-frame" role="region" aria-label="Map of registered businesses" style={{ width: '100%', height, border: '1px solid var(--line)', borderRadius: 10, zIndex: 0 }} />;
}
