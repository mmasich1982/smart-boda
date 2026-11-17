// rider-app/src/screens/business/LipaLaterScreens.js
// SMART BIZNA Lipa Later (journey E). The rider app's Lipa Later RULES are reused (balance, Full/Partial, due dates, ageing buckets), but the data
// lives in the business's OWN server tables and routes (/business/lipa-later/...). A payment taken offline waits in the queue and is sent when there
// is a connection. Ageing and balances are worked out on the phone.
// A Lipa Later sale is a receivable, not income; only the money the customer pays counts, on the day it is received.
import React, { useState } from 'react';
import { Alert, View, Text } from 'react-native';
import { Screen, BackLink, Title, Sub, Card, Row, Field, Btn, Tabs, Badge, Banner, Section, Empty, Hint, s, C } from './BizUI';
import { useBizData, useBusinessProfile } from '../../hooks/useBusiness';
import store, { BusinessRuleError } from '../../offline/businessRepository';
import { kes, fmtDate, fmtDateTime, BADGE, AGEING_ORDER, lipaBanner } from '../../utils/businessFormat';

const say = (e) => (e instanceof BusinessRuleError ? e.message : 'Something went wrong. Please try again.');
const PAGE = 20;

export function LipaLaterCustomersScreen({ navigation }) {
  const [q, setQ] = useState(''), [page, setPage] = useState(1);
  const { profile } = useBusinessProfile();
  const { data } = useBizData(async () => store.lipaCustomers());
  const all = data || [];
  const term = q.trim().toLowerCase();
  const list = all.filter((c) => !term || c.sale.customer_name.toLowerCase().includes(term) || c.sale.customer_phone.replace(/\D/g, '').includes(term.replace(/\D/g, '') || '§'));
  const banner = lipaBanner(all);
  return (
    <Screen>
      <BackLink onPress={() => navigation.navigate('BusinessHome')} />
      <Title>Lipa Later Customers Report</Title>
      <Sub>Customers who still owe. Lipa Later is not income until the customer pays.</Sub>
      {banner ? <Banner tone="red" text={banner} /> : null}
      <Btn label="📊 View Payment Ageing Report" kind="dark" onPress={() => navigation.navigate('LipaLaterAgeing')} />
      <Field placeholder="Search by name or phone" value={q} onChangeText={(v) => { setQ(v); setPage(1); }} />
      {list.slice(0, page * PAGE).map((c, i) => {
        const b = BADGE[c.bucket];
        return (
          <Card key={c.sale.client_id}>
            <Text style={{ fontWeight: '800', color: C.ink, fontSize: 15 }}>{i + 1}. {c.sale.customer_name}</Text>
            <Hint>{c.sale.customer_phone} · sold {fmtDate(c.sale.trading_at)} · due {fmtDate(c.sale.due_date)}</Hint>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}><Badge {...b} />{c.days_overdue > 0 ? <Badge text={`${c.days_overdue} day${c.days_overdue === 1 ? '' : 's'} overdue`} tone="red" /> : null}</View>
            <Row k="Original amount" v={kes(c.sale.total)} /><Row k="Paid so far" v={kes(c.paid)} /><Row k="Still owing" v={kes(c.balance)} bold color={C.red} />
            {c.payments.length ? <Hint>Payments: {c.payments.map((p) => `${kes(p.amount)} (${fmtDate(p.trading_at)})`).join(', ')}</Hint> : null}
            {profile && profile.role === 'OWNER' && c.sale.recorded_by ? <Hint>Sold by {c.sale.recorded_by.name}</Hint> : null}
            <Btn small label="💳 Record Payment" onPress={() => navigation.navigate('RecordLipaPayment', { saleClientId: c.sale.client_id })} style={{ marginTop: 8 }} />
          </Card>
        );
      })}
      {!list.length ? <Empty>{term ? 'No customer matches your search.' : 'No customers owe you right now.'}</Empty> : null}
      {list.length > page * PAGE ? <Btn label="Show more" kind="ghost" onPress={() => setPage(page + 1)} /> : null}
    </Screen>
  );
}

export function RecordLipaPaymentScreen({ navigation, route }) {
  const { saleClientId } = route.params || {};
  const { data: c } = useBizData(async () => (await store.lipaCustomers({ includeSettled: true })).find((x) => x.sale.client_id === saleClientId) || null, [saleClientId], { pollMs: 0 });
  const [type, setType] = useState('full'), [amount, setAmount] = useState(''), [notes, setNotes] = useState(''), [busy, setBusy] = useState(false);
  if (!c) return <Screen><BackLink label="← Back" onPress={() => navigation.goBack()} /><Empty>Customer not found.</Empty></Screen>;
  const save = async () => {
    setBusy(true);
    try {
      const r = await store.recordLipaPayment({ saleClientId, type, amount: parseFloat(amount), notes });
      Alert.alert('Payment recorded', r.balance > 0 ? `${c.sale.customer_name} still owes ${kes(r.balance)}.` : `${c.sale.customer_name} is fully settled.`);
      navigation.navigate('LipaLaterCustomers');
    } catch (e) { Alert.alert('Record Payment', say(e)); } finally { setBusy(false); }
  };
  return (
    <Screen>
      <BackLink label="← Back" onPress={() => navigation.goBack()} />
      <Title>Record Payment</Title>
      <Card><Text style={{ fontWeight: '800', color: C.ink }}>{c.sale.customer_name}</Text><Row k="Still owing" v={kes(c.balance)} bold color={C.red} /></Card>
      <Tabs tabs={[{ key: 'full', label: 'Full payment' }, { key: 'partial', label: 'Partial payment' }]} value={type} onChange={(t) => { setType(t); setAmount(t === 'full' ? String(c.balance) : ''); }} />
      <Hint style={{ marginBottom: 8 }}>{type === 'full' ? `Full must be at least ${kes(c.balance)}.` : `Partial must be less than ${kes(c.balance)}.`}</Hint>
      <Field label="Amount received (KSh)" value={amount} onChangeText={(v) => setAmount(v.replace(/[^0-9.]/g, ''))} keyboardType="decimal-pad" />
      <Field label="Notes (optional)" value={notes} onChangeText={setNotes} maxLength={200} />
      <Btn label="Record Payment" onPress={save} disabled={busy || !(parseFloat(amount) > 0) || c.balance <= 0} />
      <Hint>The payment counts as income today.</Hint>
    </Screen>
  );
}

export function LipaLaterAgeingScreen({ navigation }) {
  const { data } = useBizData(async () => store.lipaCustomers());
  const rows = data || [];
  return (
    <Screen>
      <BackLink label="← Back to Customers" onPress={() => navigation.navigate('LipaLaterCustomers')} />
      <Title>Payment Ageing Report</Title>
      {AGEING_ORDER.map(([key, label]) => {
        const items = rows.filter((r) => r.bucket === key);
        return (
          <Card key={key}>
            <Row k={`${label} (${items.length})`} v={kes(items.reduce((x, r) => x + Math.round(r.balance * 100), 0) / 100)} bold />
            {items.map((r) => <Hint key={r.sale.client_id}>{r.sale.customer_name} · due {fmtDate(r.sale.due_date)} · owes {kes(r.balance)}</Hint>)}
          </Card>
        );
      })}
      {!rows.length ? <Empty>No customers owe you right now.</Empty> : null}
    </Screen>
  );
}
