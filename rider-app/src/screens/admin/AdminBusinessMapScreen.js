// rider-app/src/screens/admin/AdminBusinessMapScreen.js
// ADMIN APP > Manage Businesses > Businesses Map. Same data and same server route as the console (GET /admin/businesses/map): every business with a GPS
// position as a dot coloured by status, with a short list underneath of the ones registered before GPS capture (add their position from Businesses and Users >
// Type and location).
import React, { useEffect, useState } from 'react';
import { View, Text } from 'react-native';
import { AdminScreen, Card, Hint, Tabs, SearchBox, StatRow, StatTile, Banner, Section, errText, C } from './AdminUI';
import BusinessMapView from './BusinessMapView';
import { getBusinessesMap } from '../../admin/adminApi';
import { STATUS_COLOR, STATUS_LABEL } from '../../admin/mapHtml';

const toMenu = (navigation) => ({ back: '← Manage Businesses', onBack: () => navigation.navigate('AdminMenu', { menuKey: 'businesses' }) });

export function BusinessesMapScreen({ navigation }) {
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [d, setD] = useState(null);
  const [problem, setProblem] = useState(null);
  useEffect(() => {
    let alive = true; setProblem(null);
    const t = setTimeout(() => {                                   // wait for the typing to stop
      getBusinessesMap({ q: q || undefined, status: status || undefined }).then((r) => alive && setD(r)).catch((e) => alive && setProblem(errText(e, 'Could not load the map.')));
    }, q ? 400 : 0);
    return () => { alive = false; clearTimeout(t); };
  }, [q, status]);
  const pins = (d && d.items) || [];
  return (
    <AdminScreen navigation={navigation} title="Businesses Map" sub="Every registered business with a GPS position. Tap a dot for the business and a link to Google Maps." {...toMenu(navigation)}>
      {problem ? <Banner tone="red" text={problem} /> : null}
      <StatRow>
        <StatTile label="On the map" value={d ? d.located : '—'} tone={C.green} />
        <StatTile label="Without a position" value={d ? d.not_located : '—'} tone={d && d.not_located ? C.amber : undefined} />
      </StatRow>
      <SearchBox value={q} onChange={setQ} placeholder="Search business, person or phone…" />
      <Tabs value={status} onChange={setStatus} tabs={[{ key: '', label: 'All' }, { key: 'pending_setup', label: 'Pending' }, { key: 'activated', label: 'Activated' }, { key: 'inactive', label: 'Switched off' }]} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 8 }}>
        {Object.keys(STATUS_LABEL).map((k) => <Text key={k} style={{ fontSize: 12.5, color: C.soft }}>● <Text style={{ color: STATUS_COLOR[k] }}>{STATUS_LABEL[k]}</Text></Text>)}
      </View>
      {d && pins.length ? <BusinessMapView points={pins} /> : d ? <Card><Text testID="map-empty" style={{ color: C.soft }}>No business with a GPS position matches.</Text></Card> : <Hint>Loading the map…</Hint>}
      {d && d.pins_truncated ? <Hint>Only the first 5,000 positions are drawn. Narrow the search to see the rest.</Hint> : null}
      {d && (d.missing || []).length ? (
        <View testID="map-missing">
          <Section>Without a GPS position ({d.not_located})</Section>
          <Hint>Registered before GPS capture. Open Businesses and Users, then Type and location, to add the position.</Hint>
          {d.missing.map((b) => (
            <Card key={b.id}>
              <Text style={{ fontWeight: '800', color: C.ink }}>{b.business_name}</Text>
              <Hint>{[b.business_type, b.owner_name ? `Owner ${b.owner_name}` : null, b.place].filter(Boolean).join(' · ')}</Hint>
            </Card>
          ))}
          {d.missing_truncated ? <Hint>Only the first 500 are listed. Narrow the search to see the rest.</Hint> : null}
        </View>
      ) : null}
    </AdminScreen>
  );
}
