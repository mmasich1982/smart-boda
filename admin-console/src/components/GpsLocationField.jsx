// admin-console/src/components/GpsLocationField.jsx
// BUSINESS LOCATION, captured automatically. Replaces the County > Sub-county > Ward pickers on Register a Business (and on the edit panel).
//   * On open it asks the browser for the position at once (the Administrator only has to allow it), takes the best fix within ~15 seconds and shows it.
//   * "Capture again" repeats it; "Type or paste the position" is the way out when the Administrator is not at the business (an office computer) or location is
//     refused: lat, lng, or a Google Maps link, both read by utils/gps.js.
//   * Warns (never blocks) when the fix is weak or outside Kenya.
// value / onChange use { latitude, longitude, accuracy, source }, all null until captured; source is 'gps' or 'manual'.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { captureBest, browserGeo, parseCoordinates, accuracyInfo, geoErrorText, inKenya, formatCoords, mapsUrl, validPosition } from '../utils/gps';

export const EMPTY_GPS = { latitude: null, longitude: null, accuracy: null, source: null };
export const hasGps = (v) => !!v && v.latitude != null && v.longitude != null && validPosition(v.latitude, v.longitude);

export default function GpsLocationField({ value, onChange, error, auto = true, adapter }) {
  const v = value || EMPTY_GPS;
  const [state, setState] = useState('idle');        // idle | capturing | done | error
  const [problem, setProblem] = useState(null);
  const [typing, setTyping] = useState(false);
  const [text, setText] = useState('');
  const [typedErr, setTypedErr] = useState(null);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  const capture = useCallback(async () => {
    setState('capturing'); setProblem(null);
    try {
      const fix = await captureBest(adapter || browserGeo());
      if (!alive.current) return;
      onChange({ latitude: fix.latitude, longitude: fix.longitude, accuracy: fix.accuracy, source: 'gps' });
      setState('done'); setTyping(false);
    } catch (e) {
      if (!alive.current) return;
      setState('error'); setProblem((e && e.message) || geoErrorText());
    }
  }, [onChange, adapter]);

  useEffect(() => { if (auto && !hasGps(v)) capture(); }, []);   // eslint-disable-line react-hooks/exhaustive-deps  (once, when the form opens)

  function useTyped() {
    const p = parseCoordinates(text);
    if (!p) { setTypedErr('Type the latitude and longitude like -1.2864, 36.8172, or paste a Google Maps link to the shop.'); return; }
    setTypedErr(null); onChange({ latitude: p.latitude, longitude: p.longitude, accuracy: null, source: 'manual' }); setState('done'); setTyping(false);
  }

  const have = hasGps(v);
  const acc = have ? accuracyInfo(v.source === 'manual' ? null : v.accuracy) : null;
  const tone = { good: '#1b5e20', fair: '#8a5a00', poor: '#b71c1c', unknown: '#37474f' };
  return (
    <div data-testid="gps-field" style={{ marginBottom: 12 }}>
      <div style={{ fontWeight: 600, fontSize: 13 }}>Business location (GPS) <span style={{ color: '#d32f2f' }}>*</span></div>
      <div className="muted" style={{ fontSize: 12.5, marginBottom: 6 }}>Best done while standing at the business: the position is taken from this device. No county, sub-county or ward is needed.</div>

      {state === 'capturing' && <div role="status" data-testid="gps-capturing">📡 Finding the position… allow location if the browser asks.</div>}
      {have && state !== 'capturing' && (
        <div role="status" data-testid="gps-result" style={{ background: '#e8f5e9', border: '1px solid #43a047', borderRadius: 6, padding: 8 }}>
          <div>📍 <b data-testid="gps-coords">{formatCoords(v.latitude, v.longitude)}</b> · <a href={mapsUrl(v.latitude, v.longitude)} target="_blank" rel="noopener noreferrer">Check on the map</a></div>
          <div style={{ color: tone[acc.level], fontSize: 13 }} data-testid="gps-accuracy">{acc.text}</div>
          {!inKenya(v.latitude, v.longitude) && <div role="alert" data-testid="gps-outside" style={{ color: '#b71c1c', fontSize: 13 }}>⚠️ This position is outside Kenya. Check it is right (latitude first, then longitude) or capture again.</div>}
        </div>
      )}
      {state === 'error' && <div role="alert" data-testid="gps-problem" style={{ background: '#ffebee', border: '1px solid #d32f2f', color: '#b71c1c', borderRadius: 6, padding: 8 }}>{problem}</div>}
      {error && <div role="alert" style={{ color: '#d32f2f', fontSize: 12 }}>⚠️ {error}</div>}

      <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
        <button type="button" className="secondary" onClick={capture} disabled={state === 'capturing'}>{have ? '📍 Capture again' : '📍 Capture my location'}</button>
        <button type="button" className="secondary" onClick={() => setTyping(!typing)}>{typing ? 'Hide' : 'Type or paste the position'}</button>
      </div>
      {typing && (
        <div style={{ marginTop: 8 }}>
          <input aria-label="Position or Google Maps link" placeholder="-1.2864, 36.8172  or a Google Maps link" value={text} onChange={(e) => setText(e.target.value)} style={{ width: '100%', padding: 8 }} />
          {typedErr && <div role="alert" style={{ color: '#d32f2f', fontSize: 12 }}>{typedErr}</div>}
          <button type="button" className="primary" style={{ marginTop: 6 }} onClick={useTyped}>Use this position</button>
        </div>
      )}
    </div>
  );
}
