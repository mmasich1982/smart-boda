// rider-app/src/screens/business/RecordHistoryScreen.js
// SMART BIZNA Sales/Service History, Purchase History and Expense History: ONE screen, three routes (it follows Fuel Cost History: period tabs,
// a Total + Entries Logged card, one row per record). The Owner sees every record with who recorded it; a Sales/Service Person sees only their own.
import React, { useState } from 'react';
import { Screen, BackLink, Title, Sub, Card, Row, Tabs, Empty, Hint, Btn, Pager } from './BizUI';
import { RecordRow } from './RecordParts';
import DailyTotalRow from './DailyTotalRow';
import { useBizData, useBusinessProfile } from '../../hooks/useBusiness';
import store from '../../offline/businessRepository';
import { HIST_TABS, histRange, rangeLabel, kes } from '../../utils/businessFormat';
import { paginate } from '../../utils/businessLists';

const CFG = {
  SalesHistory: { kind: 'SALE', title: 'Sales/Service History', total: 'Total Sales/Services', back: 'BusinessHome', backLabel: '← Home', own: 'The sales/services you recorded.', all: 'Every sale/service of your business.' },
  PurchaseHistory: { kind: 'PURCHASE', title: 'Purchase History', total: 'Total Spent (paid)', back: 'BusinessPurchases', backLabel: '← Purchases', own: 'The purchases you recorded.', all: 'Every purchase of your business.' },
  ExpenseHistory: { kind: 'EXPENSE', title: 'Expense History', total: 'Total Spent', back: 'BusinessExpenses', backLabel: '← Expenses', own: 'The expenses you recorded.', all: 'Every expense of your business.' },
};

export default function RecordHistoryScreen({ navigation, route }) {
  const cfg = CFG[route.name] || CFG.SalesHistory;
  const [key, setKey] = useState('thisMonth');
  const [page, setPage] = useState(1);                // PAGING: 20 records a page; back to page 1 whenever the period changes; the totals cover the whole period, never just the page
  const { profile } = useBusinessProfile();
  const range = histRange(key);
  const { data } = useBizData(async () => {
    // AFTER THE END-OF-DAY CLOSE: the individual records of TODAY, then one daily total per earlier day. The Total card covers the whole period.
    const view = await store.historyView(cfg.kind, range);
    if (cfg.kind === 'PURCHASE') {          // a Lipa Later purchase shows what is still owed
      const owed = new Map((await store.supplierLipaList({ includeSettled: true })).map((x) => [x.purchase.client_id, { paid: x.paid, balance: x.balance }]));
      view.today.forEach((r) => { if (owed.has(r.client_id)) r._owed = owed.get(r.client_id); });
    }
    return { ...view, sum: await store.periodTotals(cfg.kind, range) };
  }, [key, cfg.kind]);
  const sum = data ? data.sum : { total: 0, count: 0 };
  const owner = !!profile && profile.role === 'OWNER';
  const items = data ? [...data.today.map((r) => ({ t: 'rec', r })), ...data.days.map((r) => ({ t: 'day', r }))] : [];     // today's records first, then the earlier days
  const pg = paginate(items, page);
  return (
    <Screen>
      <BackLink label={cfg.backLabel} onPress={() => navigation.navigate(cfg.back)} />
      <Title>{cfg.title}</Title>
      <Sub>{owner ? cfg.all : cfg.own}</Sub>
      <Tabs tabs={HIST_TABS} value={key} onChange={(k) => { setKey(k); setPage(1); }} />
      <Hint style={{ marginBottom: 8 }}>{rangeLabel(range)} · individual records are shown for today only; earlier days show one daily total.</Hint>
      <Card><Row k={cfg.total} v={kes(sum.total)} bold /><Row k="Entries Logged" v={String(sum.count)} /></Card>
      <Pager {...pg} onChange={setPage} />
      <Card>
        {items.length ? pg.rows.map((x) => (x.t === 'rec' ? <RecordRow key={x.r.client_id} rec={x.r} navigation={navigation} showWho={owner} back={route.name} /> : <DailyTotalRow key={x.r.day} row={x.r} />)) : <Empty>No records for this period.</Empty>}
      </Card>
      <Pager {...pg} onChange={setPage} />
      {cfg.kind === 'SALE' ? <Btn label="＋ New Sale / Service" onPress={() => navigation.navigate('NewSale')} /> : null}
    </Screen>
  );
}
