// rider-app/src/screens/business/BusinessHomeScreen.js
// SMART BIZNA HOME (journey C). Only Sales Today stays of the old information. What shows depends on the saved role and the Administrator's two tile
// permissions, so it is correct offline and changes by itself at the next sync.
//   Tile order (prototype v48): New Sale/Service; Business Purchases | Business Expenses; Lipa Later Customers Report | Lipa Later Suppliers Report;
//   then, for the Owner only, My Business Financial Performance as the LAST tile; then the Owner list: My Daily Trade Summary, My Business Financial
//   History and Statements.
//   Owner               : everything above, Sales Today for the whole business and Yesterday's total
//   Sales/Service Person: Sales Today (own), New Sale/Service, Lipa Later Customers Report, and Business Purchases / Business Expenses / Lipa Later Suppliers
//                         Report only when the Administrator allowed Purchases (Expenses for the Expenses tile)
import React, { useCallback } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Screen, Title, Sub, Card, Banner, Hint, Btn, Section, s, C } from './BizUI';
import { useBusinessProfile, useBizData, useMyBusinesses } from '../../hooks/useBusiness';
import store from '../../offline/businessRepository';
import { performLogout } from '../../offline/logout';   // PERSISTENT SESSION: explicit Logout is the only way back to Sign-In
import { confirmAction } from '../../utils/confirmDialog';
import { businessHomeTiles } from '../../utils/userTypeRouting';
import { periodBounds } from '../../offline/businessReportUtils';
import { kes } from '../../utils/businessFormat';

const ROLE = { OWNER: 'Business Owner', SALES_PERSON: 'Sales/Service Person' };
const tileGrid = { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', marginTop: 4 };

/** A Home tile: two to a row. */
function Tile({ icon, label, onPress }) {
  return (
    <TouchableOpacity onPress={onPress} accessibilityRole="button" accessibilityLabel={label}
      style={{ width: '48.5%', backgroundColor: C.white, borderRadius: 14, borderWidth: 1, borderColor: C.line, paddingVertical: 16, paddingHorizontal: 10, alignItems: 'center', marginBottom: 10 }}>
      <Text style={{ fontSize: 22 }}>{icon}</Text>
      <Text style={{ fontSize: 13, fontWeight: '700', color: C.ink, textAlign: 'center', marginTop: 4 }}>{label}</Text>
    </TouchableOpacity>
  );
}

export default function BusinessHomeScreen({ navigation }) {
  const { profile, loaded } = useBusinessProfile();
  const { businesses } = useMyBusinesses();
  const multi = businesses.filter((b) => b.role === 'OWNER').length > 1;        // MULTIPLE BUSINESSES: the switcher only shows for an Owner of more than one
  const tiles = businessHomeTiles(profile);
  const { data } = useBizData(async () => {
    const p = await store.getProfile();
    if (!p) return null;
    const today = await store.homeToday();
    const [a, z] = periodBounds('yesterday');
    const owner = store.isOwner(p);
    const yesterday = owner ? await store.report(a, z) : null;
    return { today, yesterday };
  }, [profile && profile.role]);

  const go = useCallback((name, params) => navigation.navigate(name, params), [navigation]);
  const logout = useCallback(async () => {
    const yes = await confirmAction({ title: 'Logout', message: 'Are you sure you want to logout? Records waiting to sync are kept and sent later.', confirmText: 'Logout' });
    if (!yes) return;
    try { await performLogout(); } catch (e) { /* still leave */ }
  }, []);

  if (!loaded || !profile) return <Screen><Title>Smart Bizna</Title><Hint>Loading your business…</Hint></Screen>;

  if (tiles.locked) {                                  // the Administrator switched the account off: records already saved stay in the business history
    return (
      <Screen>
        <Title>Smart Bizna</Title>
        <Banner tone="red" text="This account has been switched off by the Administrator. Records you saved earlier will still be sent. Please contact your Business Owner or Smart Bizna support." />
        <Btn label="Logout" kind="dark" onPress={logout} />
      </Screen>
    );
  }

  const owner = profile.role === 'OWNER';
  return (
    <Screen>
      <Text style={s.hint}>Smart Bizna</Text>
      {multi && owner ? (
        <TouchableOpacity onPress={() => go('BusinessSwitcher')} accessibilityRole="button" accessibilityLabel={`${profile.business_name}. Switch business`}>
          <Title>{profile.business_name} ▾</Title>
        </TouchableOpacity>
      ) : <Title>{profile.business_name}</Title>}
      <Sub>{profile.business_type_name ? `${profile.business_type_name} · ` : ''}{ROLE[profile.role] || ''} · {profile.full_name}</Sub>

      <TouchableOpacity onPress={() => go('SalesHistory')} accessibilityRole="button" accessibilityLabel="Sales Today. Open Sales/Service History">
        <View style={[s.hero, { backgroundColor: C.asphalt }]}>
          <Text style={s.heroLabel}>{owner ? "Today's Sales/Service Total (whole business)" : "Today's Sales/Service Total (yours)"}</Text>
          <Text style={s.heroAmt}>{kes(data ? data.today.income : 0)}</Text>
          <Text style={s.heroSmall}>Sales Today · {data ? data.today.sales : 0} sale{data && data.today.sales === 1 ? '' : 's'}/service{data && data.today.sales === 1 ? '' : 's'} · tap for history</Text>
        </View>
      </TouchableOpacity>

      {tiles.yesterdayCard && data && data.yesterday ? (
        <Card onPress={() => go('DailyTradeSummary')}>
          <Text style={s.label}>Yesterday's Total</Text>
          <Text style={{ fontSize: 20, fontWeight: '800', color: data.yesterday.net_profit < 0 ? C.red : C.green }}>{kes(data.yesterday.net_profit)} Net Profit</Text>
          <Hint>Income {kes(data.yesterday.income)} · Purchases {kes(data.yesterday.purchases)} · Expenses {kes(data.yesterday.expenses)}</Hint>
        </Card>
      ) : null}

      <Btn label="＋ New Sale / Service" onPress={() => go('NewSale')} />
      <View style={tileGrid}>
        {tiles.purchases ? <Tile icon="🛒" label="Business Purchases" onPress={() => go('BusinessPurchases')} /> : null}
        {tiles.expenses ? <Tile icon="🧾" label="Business Expenses" onPress={() => go('BusinessExpenses')} /> : null}
        <Tile icon="🤝" label="Lipa Later Customers Report" onPress={() => go('LipaLaterCustomers')} />
        {tiles.supplierLipa ? <Tile icon="🏦" label="Lipa Later Suppliers Report" onPress={() => go('SupplierLipaReport', { back: 'BusinessHome' })} /> : null}
        {tiles.performance ? <Tile icon="📈" label="My Business Financial Performance" onPress={() => go('BusinessFinancialPerformance')} /> : null}
      </View>

      {owner ? (
        <>
          <Section>My Business</Section>
          <Card>
            {[['📊 My Daily Trade Summary', 'DailyTradeSummary'], ['📜 My Business Financial History and Statements', 'BusinessFinancialHistory'], ...(multi ? [['🏢 All my businesses', 'AllBusinesses']] : [])].map(([label, route]) => (
              <TouchableOpacity key={route} onPress={() => go(route)} style={{ paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.line }} accessibilityRole="button">
                <Text style={{ fontSize: 15, fontWeight: '700', color: C.ink }}>{label}</Text>
              </TouchableOpacity>
            ))}
          </Card>
        </>
      ) : null}
      <TouchableOpacity onPress={logout} style={{ paddingVertical: 14 }}><Text style={{ color: C.red, fontWeight: '700', textAlign: 'center' }}>🚪 Logout</Text></TouchableOpacity>
    </Screen>
  );
}
