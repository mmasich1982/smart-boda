// rider-app/src/screens/business/OwnerReportsScreens.js
// SMART BIZNA Owner-only reports (journeys H, I, J). Every figure is worked out ON THE PHONE by businessReportUtils.js from the saved records and the
// Owner's team snapshot, so they work offline and always agree with each other (one formula). The screens are also guarded by the navigator and the
// server answers 403 to a Sales/Service Person.
import React, { useState } from 'react';
import { View, Text } from 'react-native';
import { Screen, BackLink, Title, Sub, Card, Row, Section, Tabs, ProfitHero, ShareBar, Btn, Empty, Hint, Pager, s, C } from './BizUI';
import { paginate } from '../../utils/businessLists';
import { useBizData } from '../../hooks/useBusiness';
import store from '../../offline/businessRepository';
import { RecordRow } from './RecordParts';
import * as R from '../../offline/businessReportUtils';
import { kes, PERF_TABS, FIN_TABS, histRange, rangeLabel, fmtDateTime } from '../../utils/businessFormat';

const METHOD_COLOR = { CASH: C.green, MPESA: C.orange, CARD: '#8b5cf6', LIPA_LATER: C.amber };
const STALE_MS = 10 * 60 * 1000;

/** "as at <time>": a small notice when the team snapshot is older than the last sync (the Chama stale-copy pattern). */
function StaleNotice({ meta }) {
  if (!meta || !meta.lastPullAt || Date.now() - meta.lastPullAt < STALE_MS) return null;
  return <Hint style={{ marginBottom: 8 }}>Team figures as at {fmtDateTime(meta.lastPullAt)}. They update when this phone syncs.</Hint>;
}

const CostBreakdown = ({ rows }) => (
  <Card>
    <Text style={s.label}>Cost Breakdown</Text>
    {rows.length ? rows.map((r) => <Row key={r.label} k={`${r.label} · ${r.percent}%`} v={kes(r.amount)} />) : <Empty>No costs in this period.</Empty>}
  </Card>
);
const ByPerson = ({ rows }) => (
  <Card>
    <Text style={s.label}>By Sales/Service Person</Text>
    {rows.map((p) => (
      <View key={p.user_id} style={{ paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: C.line }}>
        <Text style={{ fontWeight: '700', color: C.ink }}>{p.full_name || 'Unknown'} <Text style={{ color: C.soft, fontWeight: '400' }}>({p.role === 'OWNER' ? 'Owner' : 'Sales/Service'})</Text></Text>
        <Hint>Income {kes(p.income)} · {p.sales_count} sale{p.sales_count === 1 ? '' : 's'}/service{p.sales_count === 1 ? '' : 's'} · Costs recorded {kes(p.costs)}</Hint>
      </View>
    ))}
  </Card>
);

// ------------------------------------------------------------------------------------------ My Daily Trade Summary (journey H)
export function DailyTradeSummaryScreen({ navigation }) {
  const { data } = useBizData(async () => {
    const [a, z] = R.periodBounds('today');
    return { t: await store.report(a, z), meta: (await store.getData()).meta };
  });
  if (!data) return <Screen><BackLink onPress={() => navigation.navigate('BusinessHome')} /><Hint>Loading…</Hint></Screen>;
  const { t } = data;
  return (
    <Screen>
      <BackLink onPress={() => navigation.navigate('BusinessHome')} />
      <Title>My Daily Trade Summary</Title>
      <StaleNotice meta={data.meta} />
      <ProfitHero title="Today's Net Profit" totals={t} kes={kes} />
      <Section>By Payment Method</Section>
      <Card>
        <Hint>Money received from customers today, by how they paid. Lipa Later is only what customers paid back; money still owed is not counted.</Hint>
        <ShareBar parts={t.by_payment_method.map((m) => ({ key: m.method, percent: m.percent, color: METHOD_COLOR[m.method] }))} />
        {t.by_payment_method.map((m) => (
          <View key={m.method} style={s.kv}>
            <Text style={[s.k, { color: METHOD_COLOR[m.method], fontWeight: '800' }]}>{m.label}</Text>
            <Text style={s.v}>{m.count} {m.method === 'LIPA_LATER' ? (m.count === 1 ? 'repayment' : 'repayments') : (m.count === 1 ? 'sale' : 'sales')} · {kes(m.amount)} · {m.percent}%</Text>
          </View>
        ))}
        <Row k="Total received" v={kes(t.total_received)} bold />
      </Card>
      <CostBreakdown rows={t.cost_breakdown} />
      <ByPerson rows={t.by_person} />
    </Screen>
  );
}

// ------------------------------------------------------------------------------------------ Yesterday's Net Profit (Home "Yesterday's Total" card)
export function YesterdayNetProfitScreen({ navigation }) {
  const { data } = useBizData(async () => {
    const [a, z] = R.periodBounds('yesterday');
    return { t: await store.report(a, z), meta: (await store.getData()).meta };
  });
  if (!data) return <Screen><BackLink onPress={() => navigation.navigate('BusinessHome')} /><Hint>Loading…</Hint></Screen>;
  const { t } = data;
  return (
    <Screen>
      <BackLink onPress={() => navigation.navigate('BusinessHome')} />
      <Title>Yesterday's Net Profit</Title>
      <Sub>Complete financial breakdown for yesterday</Sub>
      <StaleNotice meta={data.meta} />
      <ProfitHero title="Yesterday's Net Profit" totals={t} kes={kes} />
      <Section>By Payment Method</Section>
      <Card>
        <Hint>Money received from customers yesterday, by how they paid. Lipa Later is only what customers paid back.</Hint>
        <ShareBar parts={t.by_payment_method.map((m) => ({ key: m.method, percent: m.percent, color: METHOD_COLOR[m.method] }))} />
        {t.by_payment_method.map((m) => (
          <View key={m.method} style={s.kv}>
            <Text style={[s.k, { color: METHOD_COLOR[m.method], fontWeight: '800' }]}>{m.label}</Text>
            <Text style={s.v}>{m.count} · {kes(m.amount)} · {m.percent}%</Text>
          </View>
        ))}
        <Row k="Total received" v={kes(t.total_received)} bold />
      </Card>
      <CostBreakdown rows={t.cost_breakdown} />
      <ByPerson rows={t.by_person} />
    </Screen>
  );
}

// ------------------------------------------------------------------------------------------ My Business Financial Performance (journey I)
export function BusinessFinancialPerformanceScreen({ navigation }) {
  const [period, setPeriod] = useState('today');
  const { data } = useBizData(async () => { const [a, z] = R.periodBounds(period); return { t: await store.report(a, z), meta: (await store.getData()).meta }; }, [period]);
  return (
    <Screen>
      <BackLink onPress={() => navigation.navigate('BusinessHome')} />
      <Title>My Business Financial Performance</Title>
      <Sub>Your whole business: every Sales/Service Person and you.</Sub>
      <Tabs tabs={PERF_TABS} value={period} onChange={setPeriod} />
      {data ? (<><StaleNotice meta={data.meta} /><ProfitHero title="Net Profit" totals={data.t} kes={kes} /><CostBreakdown rows={data.t.cost_breakdown} />
        <Btn label="＋ Add Expense →" onPress={() => navigation.navigate('RecordExpense')} /></>) : <Hint>Loading…</Hint>}
    </Screen>
  );
}

// ------------------------------------------------------------------------------------------ My Business Financial History and Statements (journey J)
export function BusinessFinancialHistoryScreen({ navigation }) {
  const [key, setKey] = useState('thisMonth');
  const range = histRange(key);
  const { data } = useBizData(async () => ({ t: await store.report(range[0], range[1]), meta: (await store.getData()).meta }), [key]);
  return (
    <Screen>
      <BackLink onPress={() => navigation.navigate('BusinessHome')} />
      <Title>My Business Financial History and Statements</Title>
      <Tabs tabs={FIN_TABS} value={key} onChange={setKey} />
      <Hint style={{ marginBottom: 8 }}>{rangeLabel(range)}</Hint>
      {data ? (<>
        <StaleNotice meta={data.meta} />
        <ProfitHero title="Net Profit (Selected Range)" totals={data.t} kes={kes} />
        <CostBreakdown rows={data.t.cost_breakdown} /><ByPerson rows={data.t.by_person} />
        <Btn label="📜 View Transactions →" kind="dark" onPress={() => navigation.navigate('BusinessTransactions', { key })} />
        <Btn label="📄 Generate a Statement →" onPress={() => navigation.navigate('StatementSetup', { key })} />
        <Btn label="🗂️ Saved Statements and Requests" kind="ghost" onPress={() => navigation.navigate('StatementList')} />
      </>) : <Hint>Loading…</Hint>}
    </Screen>
  );
}

// ------------------------------------------------------------------------------------------ View Transactions
const FILTERS = [{ key: 'all', label: 'All' }, { key: 'SALE', label: 'Sales/Services' }, { key: 'PURCHASE', label: 'Purchases' }, { key: 'EXPENSE', label: 'Expenses' }];
export function BusinessTransactionsScreen({ navigation, route }) {
  const [key] = useState((route.params && route.params.key) || 'thisMonth');
  const [filter, setFilter] = useState('all');
  const [page, setPage] = useState(1);                       // 20 a page, on every tab (All, Sales/Services, Purchases, Expenses)
  const range = histRange(key);
  const { data } = useBizData(async () => (await store.transactions(range[0], range[1], filter)).map((r) => (r.record ? { ...r.record, _row: r } : { ...r, kind: r.type, _row: r })), [key, filter]);
  const pg = paginate(data || [], page);
  const changeFilter = (f) => { setFilter(f); setPage(1); };
  return (
    <Screen>
      <BackLink label="← Back" onPress={() => navigation.goBack()} />
      <Title>Transactions</Title>
      <Hint style={{ marginBottom: 8 }}>{rangeLabel(range)}</Hint>
      <Tabs tabs={FILTERS} value={filter} onChange={changeFilter} />
      <Pager {...pg} onChange={setPage} />
      <Card>
        {data && data.length ? pg.rows.map((r) => <RecordRow key={r.client_id + (r.kind || '')} rec={r} navigation={navigation} showWho transaction={r._row} back="BusinessTransactions" />) : <Empty>No transactions in this range.</Empty>}
      </Card>
      <Pager {...pg} onChange={setPage} />
    </Screen>
  );
}
