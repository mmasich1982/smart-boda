// rider-app/src/screens/business/RecordHistoryScreen.js
// SMART BIZNA Sales/Service History, Purchase History and Expense History: ONE screen, three routes (it follows Fuel Cost History: period tabs,
// a Total + Entries Logged card, one row per record). The Owner sees every record with who recorded it; a Sales/Service Person sees only their own.
import React, { useState } from 'react';
import { Screen, BackLink, Title, Sub, Card, Row, Tabs, Empty, Hint, Btn } from './BizUI';
import { RecordRow, totalOf } from './RecordParts';
import { useBizData, useBusinessProfile } from '../../hooks/useBusiness';
import store from '../../offline/businessRepository';
import { HIST_TABS, histRange, rangeLabel, kes } from '../../utils/businessFormat';

const CFG = {
  SalesHistory: { kind: 'SALE', title: 'Sales/Service History', total: 'Total Sales/Services', back: 'BusinessHome', backLabel: '← Home', own: 'The sales/services you recorded.', all: 'Every sale/service of your business.' },
  PurchaseHistory: { kind: 'PURCHASE', title: 'Purchase History', total: 'Total Spent (paid)', back: 'BusinessPurchases', backLabel: '← Purchases', own: 'The purchases you recorded.', all: 'Every purchase of your business.' },
  ExpenseHistory: { kind: 'EXPENSE', title: 'Expense History', total: 'Total Spent', back: 'BusinessExpenses', backLabel: '← Expenses', own: 'The expenses you recorded.', all: 'Every expense of your business.' },
};

export default function RecordHistoryScreen({ navigation, route }) {
  const cfg = CFG[route.name] || CFG.SalesHistory;
  const [key, setKey] = useState('thisMonth');
  const { profile } = useBusinessProfile();
  const range = histRange(key);
  const { data } = useBizData(async () => {
    const list = await store.listRecords(cfg.kind, range);
    if (cfg.kind !== 'PURCHASE') return { list, sum: totalOf(list) };
    // Total Spent (paid): cash / M-Pesa / Card purchases plus what was paid to suppliers in the period. A Lipa Later purchase is owed, not a cost, until paid.
    const owed = new Map((await store.supplierLipaList({ includeSettled: true })).map((x) => [x.purchase.client_id, { paid: x.paid, balance: x.balance }]));
    list.forEach((r) => { if (owed.has(r.client_id)) r._owed = owed.get(r.client_id); });
    return { list, sum: await store.purchaseSpent(range) };
  }, [key, cfg.kind]);
  const sum = data ? data.sum : { total: 0, count: 0 };
  const owner = !!profile && profile.role === 'OWNER';
  return (
    <Screen>
      <BackLink label={cfg.backLabel} onPress={() => navigation.navigate(cfg.back)} />
      <Title>{cfg.title}</Title>
      <Sub>{owner ? cfg.all : cfg.own}</Sub>
      <Tabs tabs={HIST_TABS} value={key} onChange={setKey} />
      <Hint style={{ marginBottom: 8 }}>{rangeLabel(range)}</Hint>
      <Card><Row k={cfg.total} v={kes(sum.total)} bold /><Row k="Entries Logged" v={String(sum.count)} /></Card>
      <Card>
        {data && data.list.length ? data.list.map((r) => <RecordRow key={r.client_id} rec={r} navigation={navigation} showWho={owner} back={route.name} />) : <Empty>No records for this period.</Empty>}
      </Card>
      {cfg.kind === 'SALE' ? <Btn label="＋ New Sale / Service" onPress={() => navigation.navigate('NewSale')} /> : null}
    </Screen>
  );
}
