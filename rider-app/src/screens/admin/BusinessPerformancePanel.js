// rider-app/src/screens/admin/BusinessPerformancePanel.js
// Admin app: the "Business Performance" tab under a business card (Businesses and Users). READ ONLY. Daily, monthly, quarterly, half-yearly and yearly
// performance with trends, and advice prompts the Administrator can use to advise the owner. The figures come from the server (same money formula as
// the Owner's reports); this file only draws them. The console page shows the same data (admin-console/src/components/BusinessPerformance.jsx).
import React, { useEffect, useState } from 'react';
import { View, Text } from 'react-native';
import { Card, Tabs, Hint, Section, Banner, errText, C } from './AdminUI';
import { getBusinessPerformance } from '../../admin/adminApi';

const VIEWS = [{ key: 'daily', label: 'Daily' }, { key: 'monthly', label: 'Monthly' }, { key: 'quarterly', label: 'Quarterly' }, { key: 'half_yearly', label: 'Half-yearly' }, { key: 'yearly', label: 'Yearly' }];
const kes = (n) => `KSh ${Math.round(Number(n) || 0).toLocaleString()}`;
const pct = (v) => (v === null || v === undefined ? '—' : `${v > 0 ? '▲' : v < 0 ? '▼' : '■'} ${Math.abs(v).toFixed(0)}%`);
const tone = (v) => (v === null || v === undefined || Math.abs(v) < 2 ? C.soft : v > 0 ? C.green : C.red);
const LEVEL = { red: 'red', amber: 'amber', info: 'green' };

function Bars({ series }) {
  const max = Math.max(1, ...series.map((r) => Math.max(r.income, r.expenses + r.purchases, Math.abs(r.net_profit))));
  return (
    <View>
      {series.slice().reverse().map((r) => (
        <View key={r.label} style={{ marginBottom: 8 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={{ fontWeight: '700', color: C.ink, fontSize: 12.5 }}>{r.label}{r.complete ? '' : ' (so far)'}</Text>
            <Text style={{ fontWeight: '700', fontSize: 12.5, color: r.net_profit < 0 ? C.red : C.green }}>{kes(r.net_profit)}  <Text style={{ color: tone(r.net_profit_change_pct) }}>{pct(r.net_profit_change_pct)}</Text></Text>
          </View>
          <View style={{ height: 8, backgroundColor: '#efede6', borderRadius: 4, marginTop: 3, overflow: 'hidden' }}>
            <View style={{ width: `${Math.round((r.income / max) * 100)}%`, height: 8, backgroundColor: C.green }} />
          </View>
          <Text style={{ fontSize: 11, color: C.soft, marginTop: 2 }}>Income {kes(r.income)} · Purchases {kes(r.purchases)} · Expenses {kes(r.expenses)} · {r.sales_count} sale{r.sales_count === 1 ? '' : 's'}</Text>
        </View>
      ))}
    </View>
  );
}

export default function BusinessPerformancePanel({ businessId }) {
  const [view, setView] = useState('monthly');
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  useEffect(() => {
    let live = true; setData(null); setErr(null);
    getBusinessPerformance(businessId, view).then((d) => live && setData(d)).catch((e) => live && setErr(errText(e, 'Could not load the performance.')));
    return () => { live = false; };
  }, [businessId, view]);
  const h = data && data.headline;
  return (
    <View style={{ marginTop: 8 }}>
      <Tabs value={view} onChange={setView} tabs={VIEWS} />
      {err ? <Banner tone="red" text={err} /> : null}
      {!data && !err ? <Hint>Loading…</Hint> : null}
      {data ? (
        <>
          <Card>
            <Text style={{ fontWeight: '800', color: C.ink }}>{h.label}{h.complete ? '' : ' (so far)'}</Text>
            <Text style={{ fontSize: 22, fontWeight: '800', color: h.net_profit < 0 ? C.red : C.green }}>{kes(h.net_profit)}</Text>
            <Hint>Net profit · {h.previous_label ? <Text style={{ color: tone(h.net_profit_change_pct) }}>{pct(h.net_profit_change_pct)} on {h.previous_label}</Text> : 'no earlier period'}</Hint>
            <Hint>Income {kes(h.income)} ({pct(h.income_change_pct)}) · Purchases {kes(h.purchases)} · Expenses {kes(h.expenses)}</Hint>
          </Card>
          <Section>Advice for the Administrator</Section>
          {data.advice.map((a) => <Banner key={a.code} tone={LEVEL[a.level] || 'green'} text={a.text} />)}
          <Section>Trend</Section>
          <Card><Bars series={data.series} /></Card>
          <Section>Lipa Later</Section>
          <Card>
            <Hint>Customers owe {kes(data.lipa_later.customers_owe)} ({data.lipa_later.customers_count}) · {kes(data.lipa_later.customers_overdue)} is over 60 days overdue</Hint>
            <Hint>The business owes suppliers {kes(data.lipa_later.business_owes)} ({data.lipa_later.suppliers_count})</Hint>
          </Card>
          {data.selected.cost_breakdown.length ? (
            <>
              <Section>Where the money went in {data.selected.label}</Section>
              <Card>{data.selected.cost_breakdown.map((c) => <Hint key={c.label}>{c.label} · {kes(c.amount)} · {c.percent}%</Hint>)}</Card>
            </>
          ) : null}
          {data.selected.by_person.length ? (
            <>
              <Section>By person in {data.selected.label}</Section>
              <Card>{data.selected.by_person.map((p) => <Hint key={p.user_id}>{p.full_name || 'Person'} · {kes(p.income)} from {p.sales_count} sale{p.sales_count === 1 ? '' : 's'}</Hint>)}</Card>
            </>
          ) : null}
        </>
      ) : null}
    </View>
  );
}
