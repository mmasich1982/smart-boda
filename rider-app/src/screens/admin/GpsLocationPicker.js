// rider-app/src/screens/admin/GpsLocationPicker.js
// ADMIN APP: the business GPS position on Register a Business and on Type and location. Same behaviour as the console's GpsLocationField:
// it asks the phone for the position as soon as it opens (the Administrator allows location once), takes the best fix within about 15 seconds, shows it with
// its accuracy, and offers Capture again and "Type or paste the position" (latitude, longitude or a Google Maps link) when the Administrator is not at the
// business or location is refused. Warns, never blocks, on a weak fix or a position outside Kenya.
// value / onChange use { latitude, longitude, accuracy, source }; null until captured; source is 'gps' or 'manual'.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Linking, Text, View } from 'react-native';
import { Banner, Btn, Field, Hint, s, C } from './AdminUI';
import { captureBest, deviceGeo, parseCoordinates, accuracyInfo, geoErrorText, inKenya, formatCoords, mapsUrl, validPosition } from '../../admin/gpsLocation';

export const EMPTY_GPS = { latitude: null, longitude: null, accuracy: null, source: null };
export const hasGps = (v) => !!v && v.latitude != null && v.longitude != null && validPosition(v.latitude, v.longitude);
const TONE = { good: 'green', fair: 'amber', poor: 'red', unknown: 'soft' };

export default function GpsLocationPicker({ value, onChange, error, auto = true, adapter }) {
  const v = value || EMPTY_GPS;
  const [state, setState] = useState('idle');          // idle | capturing | done | error
  const [problem, setProblem] = useState(null);
  const [typing, setTyping] = useState(false);
  const [text, setText] = useState('');
  const [typedErr, setTypedErr] = useState(null);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  const capture = useCallback(async () => {
    setState('capturing'); setProblem(null);
    try {
      const fix = await captureBest(adapter || deviceGeo());
      if (!alive.current) return;
      onChange({ latitude: fix.latitude, longitude: fix.longitude, accuracy: fix.accuracy, source: 'gps' });
      setState('done'); setTyping(false);
    } catch (e) { if (!alive.current) return; setState('error'); setProblem((e && e.message) || geoErrorText()); }
  }, [onChange, adapter]);

  useEffect(() => { if (auto && !hasGps(v)) capture(); }, []);   // eslint-disable-line react-hooks/exhaustive-deps  (once, when the screen opens)

  function useTyped() {
    const p = parseCoordinates(text);
    if (!p) { setTypedErr('Type the latitude and longitude like -1.2864, 36.8172, or paste a Google Maps link to the shop.'); return; }
    setTypedErr(null); onChange({ latitude: p.latitude, longitude: p.longitude, accuracy: null, source: 'manual' }); setState('done'); setTyping(false);
  }

  const have = hasGps(v);
  const acc = have ? accuracyInfo(v.source === 'manual' ? null : v.accuracy) : null;
  return (
    <View testID="gps-field">
      <Text style={s.label}>Business location (GPS) *</Text>
      <Hint>Best done while standing at the business: the position is taken from this phone. No county, sub-county or ward is needed.</Hint>
      {state === 'capturing' ? <Banner tone="soft" text="📡 Finding the position… allow location if the phone asks." /> : null}
      {have && state !== 'capturing' ? (
        <View testID="gps-result">
          <Banner tone="green" text={`📍 ${formatCoords(v.latitude, v.longitude)}`} onPress={() => Linking.openURL(mapsUrl(v.latitude, v.longitude))} />
          <Banner tone={TONE[acc.level]} text={acc.text} />
          {!inKenya(v.latitude, v.longitude) ? <Banner tone="red" text="⚠️ This position is outside Kenya. Check it is right (latitude first, then longitude) or capture again." /> : null}
          <Hint>Tap the position to check it on the map.</Hint>
        </View>
      ) : null}
      {state === 'error' ? <Banner tone="red" text={problem} /> : null}
      {error ? <Text style={s.err}>{error}</Text> : null}
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 8, marginBottom: 8, flexWrap: 'wrap' }}>
        <Btn label={have ? '📍 Capture again' : '📍 Capture my location'} kind="dark" small disabled={state === 'capturing'} onPress={capture} />
        <Btn label={typing ? 'Hide' : 'Type or paste the position'} kind="ghost" small onPress={() => setTyping(!typing)} />
      </View>
      {typing ? (
        <View>
          <Field label="Position or Google Maps link" value={text} onChangeText={setText} autoCapitalize="none" placeholder="-1.2864, 36.8172" error={typedErr} />
          <Btn label="Use this position" small onPress={useTyped} />
        </View>
      ) : null}
    </View>
  );
}
