// rider-app/src/screens/business/BusinessSwitcherScreens.js
// MULTIPLE BUSINESSES (Owner): the business switcher and ALL MY BUSINESSES.
//   Switcher        : every business the Owner holds, with its type; tap one to open it. Switched-off businesses are listed but cannot be opened; a business
//                     that has never loaded on this phone needs a connection once. Switching never waits for sync.
//   All my businesses: one card per business (Income, Purchases, Expenses, Net Profit, what customers owe / what the business owes) for Today, This week
//                     or This month, then "Total of all your businesses" (a plain sum). TOTALS ONLY: never a record, customer or supplier.
// DATA ISOLATION: opening a business starts a new business session, and the navigator rebuilds every screen for it.
import React, { useCallback, useEffect, useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { Screen, BackLink, Title, Sub, Card, Row, Tabs, Banner, Badge, Hint, Section, s, C } from './BizUI';
import { useMyBusinesses, useBizData } from '../../hooks/useBusiness';
import { registry, switchBusiness, ensureBusinessProfile } from '../../offline/businessRepository';
import { loadOverview } from '../../offline/businessOverview';
import { runBusinessSyncCycle } from '../../offline/businessSyncService';
import { isOnlineNow } from '../../offline/chamaConnectivity';
import { kes } from '../../utils/businessFormat';

const PERIODS = [{ key: 'today', label: 'Today' }, { key: 'week', label: 'This week' }, { key: 'month', label: 'This month' }];
const clock = (ms) => { try { return new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); } catch { return ''; } };

export function BusinessSwitcherScreen({ navigation }) {
  const { businesses, activeId, ready } = useMyBusinesses();
  const [online, setOnline] = useState(true);
  const [loadedBy, setLoadedBy] = useState({});
  const [busy, setBusy] = useState(null);
  useEffect(() => { isOnlineNow().then(setOnline).catch(() => {}); }, []);
  useEffect(() => {
    let on = true;
    (async () => {
      const out = {};
      for (const b of businesses) { try { out[b.business_id] = (await registry.status(b.business_id)).loaded; } catch { out[b.business_id] = false; } }
      if (on) setLoadedBy(out);
    })();
    return () => { on = false; };
  }, [businesses]);
  const owned = businesses.filter((b) => b.role === 'OWNER');

  // a business that is switched off, or has never loaded on this phone while there is no connection, is never opened (the button is disabled AND the action refuses)
  const blocked = (b) => b.active === false || (loadedBy[b.business_id] === false && !online && b.business_id !== activeId);
  const open = useCallback(async (b) => {
    if (blocked(b)) return;
    setBusy(b.business_id);
    try {
      if (b.business_id !== activeId) { await switchBusiness(b.business_id); runBusinessSyncCycle().catch(() => {}); }    // the navigator now rebuilds every screen for it
      else navigation.navigate('BusinessHome');
    } catch (e) { /* a switched-off or removed business simply stays closed */ } finally { setBusy(null); }
  }, [activeId, navigation, loadedBy, online]);   // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Screen>
      <BackLink onPress={() => navigation.navigate('BusinessHome')} />
      <Title>My Businesses</Title>
      <Sub>Choose the business you want to work in. Each business keeps its own sales, purchases, expenses, Lipa Later and reports.</Sub>
      {owned.length > 1 ? (
        <Card onPress={() => navigation.navigate('AllBusinesses')}>
          <Text style={{ fontSize: 16, fontWeight: '800', color: C.ink }}>🏢 All my businesses</Text>
          <Hint>Today, this week or this month for every business side by side, with a total.</Hint>
        </Card>
      ) : null}
      {!ready ? <Hint>Loading your businesses…</Hint> : null}
      {businesses.map((b) => {
        const off = b.active === false;
        const never = !off && blocked(b);
        const isOpen = b.business_id === activeId;
        return (
          <TouchableOpacity key={b.business_id} onPress={() => open(b)} disabled={off || never || busy === b.business_id} accessibilityRole="button"
            accessibilityLabel={`${b.business_name}${isOpen ? ', open now' : ''}${off ? ', switched off' : ''}`} style={{ opacity: off || never ? 0.55 : 1 }}>
            <Card style={isOpen ? { borderColor: C.orange, borderWidth: 2 } : undefined}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={{ fontSize: 16, fontWeight: '800', color: C.ink, flexShrink: 1 }}>{b.business_name}</Text>
                {isOpen ? <Badge text="Open now" tone="green" /> : null}
              </View>
              <Hint>{b.business_type_name || 'Business'}</Hint>
              {off ? <Hint style={{ color: C.red }}>Switched off by the Administrator</Hint> : null}
              {never ? <Hint>Connect once to open this business</Hint> : null}
            </Card>
          </TouchableOpacity>
        );
      })}
    </Screen>
  );
}

function Card1({ c, source, onOpen }) {
  const inactive = c.active === false, unloaded = c.loaded === false;
  return (
    <Card onPress={inactive || unloaded ? undefined : () => onOpen(c)}>
      <Text style={{ fontSize: 16, fontWeight: '800', color: C.ink }}>{c.business_name}</Text>
      {inactive ? <Hint style={{ color: C.red }}>Switched off by the Administrator. Not included in the total.</Hint> : null}
      {unloaded && !inactive ? <Hint>Connect once to load this business. Not included in the total yet.</Hint> : null}
      {!inactive && !unloaded ? (
        <>
          <Row k="Income" v={kes(c.income)} />
          <Row k="Purchases" v={kes(c.purchases)} />
          <Row k="Expenses" v={kes(c.expenses)} />
          <Row k="Net Profit" v={kes(c.net_profit)} bold color={c.net_profit < 0 ? C.red : C.green} />
          <Row k="Customers owe you" v={kes(c.owed_to_business)} />
          <Row k="You owe suppliers" v={kes(c.owed_by_business)} />
          {source === 'phone' && c.asOf ? <Hint>As of {clock(c.asOf)} (from this phone)</Hint> : null}
        </>
      ) : null}
    </Card>
  );
}

export function AllBusinessesScreen({ navigation }) {
  const [period, setPeriod] = useState('today');
  const { data, loading } = useBizData(async () => {
    await ensureBusinessProfile();
    const client = require('../../api/businessClient');
    return loadOverview({ registry, fetchServer: client.businessOwnerOverview, online: await isOnlineNow().catch(() => false), period });
  }, [period], { pollMs: 0 });

  const openBusiness = useCallback(async (c) => {
    try { await switchBusiness(c.business_id); runBusinessSyncCycle().catch(() => {}); } catch { /* stays here */ }
  }, []);

  return (
    <Screen>
      <BackLink label="← My Businesses" onPress={() => navigation.navigate('BusinessSwitcher')} />
      <Title>All my businesses</Title>
      <Sub>Each business is worked out on its own. Tap a business to open it.</Sub>
      <Tabs tabs={PERIODS} value={period} onChange={setPeriod} />
      {loading && !data ? <Hint>Loading…</Hint> : null}
      {data ? (
        <>
          {data.source === 'phone' ? <Banner tone="amber" text="Please enable online in order to get the newest records." /> : null}
          {data.businesses.map((c) => <Card1 key={c.business_id} c={c} source={data.source} onOpen={openBusiness} />)}
          <Section>Total of all your businesses</Section>
          <Card>
            <Row k="Income" v={kes(data.total.income)} />
            <Row k="Purchases" v={kes(data.total.purchases)} />
            <Row k="Expenses" v={kes(data.total.expenses)} />
            <Row k="Net Profit" v={kes(data.total.net_profit)} bold color={data.total.net_profit < 0 ? C.red : C.green} />
            <Row k="Customers owe you" v={kes(data.total.owed_to_business)} />
            <Row k="You owe suppliers" v={kes(data.total.owed_by_business)} />
            <Hint>A plain sum of the businesses above that are switched on and loaded.</Hint>
          </Card>
        </>
      ) : null}
    </Screen>
  );
}
