// rider-app/src/screens/business/LipaLaterScreens.js
// SMART BIZNA Lipa Later (journey E). The rider app's Lipa Later RULES are reused (balance, Full/Partial, due dates, ageing buckets), but the data
// lives in the business's OWN server tables and routes (/business/lipa-later/...). A payment taken offline waits in the queue and is sent when there
// is a connection. Ageing and balances are worked out on the phone.
// A Lipa Later sale is a receivable, not income; only the money the customer pays counts, on the day it is received.
import AgeingReport from './AgeingReport';
import RejectedPaymentsNotice from '../../components/RejectedPaymentsNotice';
import { groupAgeing } from '../../utils/ageingGroups';
import React, { useState } from 'react';
import { Alert, View, Text } from 'react-native';
import { Screen, BackLink, Title, Sub, Card, Row, Field, Btn, Tabs, Badge, Banner, Section, Empty, Hint, Pager, s, C } from './BizUI';
import { paginate } from '../../utils/businessLists';
import { useBizData, useBusinessProfile } from '../../hooks/useBusiness';
import store, { BusinessRuleError } from '../../offline/businessRepository';
import { kes, fmtDate, fmtDateTime, BADGE, AGEING_ORDER, lipaBanner } from '../../utils/businessFormat';
import { PAYMENT_TABS, isAmountLocked, defaultAmount, amountHint, amountToSave, validatePayment } from '../../utils/lipaPaymentRules';

const say = (e) => (e instanceof BusinessRuleError ? e.message : 'Something went wrong. Please try again.');

export function LipaLaterCustomersScreen({ navigation }) {
  const [q, setQ] = useState(''), [page, setPage] = useState(1);
  const { profile } = useBusinessProfile();
  const { data } = useBizData(async () => store.lipaCustomers());
  const all = data || [];
  const term = q.trim().toLowerCase();
  const list = all.filter((c) => !term || c.sale.customer_name.toLowerCase().includes(term) || c.sale.customer_phone.replace(/\D/g, '').includes(term.replace(/\D/g, '') || '§'));
  const banner = lipaBanner(all);
  const pg = paginate(list, page);                  // PAGING: 20 customers a page, back to page 1 on a new search
  return (
    <Screen>
      <BackLink onPress={() => navigation.navigate('BusinessHome')} />
      <Title>Lipa Later Customers Report</Title>
      <Sub>Customers who still owe. Lipa Later is not income until the customer pays.</Sub>
      <RejectedPaymentsNotice />
      {banner ? <Banner tone="red" text={banner} /> : null}
      <Btn label="📊 View Payment Ageing Report" kind="dark" onPress={() => navigation.navigate('LipaLaterAgeing')} />
      <Field placeholder="Search by name or phone" value={q} onChangeText={(v) => { setQ(v); setPage(1); }} />
      <Pager {...pg} onChange={setPage} />
      {pg.rows.map((c, i) => {
        const b = BADGE[c.bucket];
        return (
          <Card key={c.sale.client_id}>
            <Text style={{ fontWeight: '800', color: C.ink, fontSize: 15 }}>{pg.from + i}. {c.sale.customer_name}</Text>
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
      <Pager {...pg} onChange={setPage} />
    </Screen>
  );
}

export function RecordLipaPaymentScreen({ navigation, route }) {
  const { saleClientId } = route.params || {};
  const { data: c } = useBizData(async () => (await store.lipaCustomers({ includeSettled: true })).find((x) => x.sale.client_id === saleClientId) || null, [saleClientId], { pollMs: 0 });
  const [type, setType] = useState('full'), [typed, setTyped] = useState(''), [notes, setNotes] = useState(''), [busy, setBusy] = useState(false);
  if (!c) return <Screen><BackLink label="← Back" onPress={() => navigation.goBack()} /><Empty>Customer not found.</Empty></Screen>;
  // THE PAYMENT RULES (utils/lipaPaymentRules.js): Full is pre-selected, the box shows the whole balance greyed out and cannot be edited; Partial is blank, editable and below the balance.
  const locked = isAmountLocked(type), check = validatePayment(type, typed, c.balance);
  const shown = locked ? defaultAmount('full', c.balance) : typed;
  const save = async () => {
    if (!check.ok) return;
    setBusy(true);
    try {
      const r = await store.recordLipaPayment({ saleClientId, type, amount: amountToSave(type, typed, c.balance), notes });
      Alert.alert('Payment recorded', r.balance > 0 ? `${c.sale.customer_name} still owes ${kes(r.balance)}.` : `${c.sale.customer_name} is fully settled.`);
      navigation.navigate('LipaLaterCustomers');
    } catch (e) { Alert.alert('Record Payment', say(e)); } finally { setBusy(false); }
  };
  return (
    <Screen>
      <BackLink label="← Back" onPress={() => navigation.goBack()} />
      <Title>Record Payment</Title>
      <Card><Text style={{ fontWeight: '800', color: C.ink }}>{c.sale.customer_name}</Text><Row k="Still owing" v={kes(c.balance)} bold color={C.red} /></Card>
      <Tabs tabs={PAYMENT_TABS} value={type} onChange={(t) => { setType(t); setTyped(''); }} />
      <Field label="Amount received (KSh)" value={shown} onChangeText={(v) => setTyped(v.replace(/[^0-9.]/g, ''))} keyboardType="decimal-pad" testID="pay-amount"
        editable={!locked} selectTextOnFocus={!locked} error={check.message} hint={amountHint(type, c.balance)} style={locked ? { backgroundColor: '#eceae4', color: '#7a7f8a' } : undefined} />
      <Field label="Notes (optional)" value={notes} onChangeText={setNotes} maxLength={200} />
      <Btn label="Record Payment" onPress={save} disabled={busy || !check.ok} />
      <Hint>The payment counts as income today.</Hint>
    </Screen>
  );
}

export function LipaLaterAgeingScreen({ navigation }) {
  const { data } = useBizData(async () => store.lipaCustomers());
  const groups = groupAgeing(data || [], 'sale');
  return <AgeingReport title="Ageing Report" backLabel="← Back to Customers" onBack={() => navigation.navigate('LipaLaterCustomers')} groups={groups}
    who="Customers" whoPlural="Customers" itemLabel="Sales" empty="No customers owe you right now." />;
}
