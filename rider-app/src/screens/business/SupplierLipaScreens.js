// rider-app/src/screens/business/SupplierLipaScreens.js
// SMART BIZNA Lipa Later for SUPPLIERS (prototype v48): what the business OWES. The same rules as the customer screens, the other way round:
//   Lipa Later Details (opened from Record Purchase when Lipa Later is chosen) -> Lipa Later Suppliers Report -> Record Payment -> Ageing Report.
// A Lipa Later purchase is OWED, not a cost, until the supplier is paid; each payment made is the cost (see businessReportUtils.js). Saved on the phone
// first and queued for the business's own server routes (/business/lipa-later/supplier-payments). Everything here needs the Purchases permission.
// Back links: from the Home tile the report goes back to Home; after saving a Lipa Later purchase it goes back to Business Purchases.
import React, { useState } from 'react';
import { Alert, View, Text } from 'react-native';
import { Screen, BackLink, Title, Sub, Card, Row, Field, Btn, Tabs, Badge, Banner, Empty, Hint, s, C } from './BizUI';
import { useBizData } from '../../hooks/useBusiness';
import store, { BusinessRuleError } from '../../offline/businessRepository';
import { kes, fmtDate, BADGE, AGEING_ORDER, supplierBanner, defaultDueDate } from '../../utils/businessFormat';

const say = (e) => (e instanceof BusinessRuleError ? e.message : 'Something went wrong. Please try again.');
const PAGE = 20;
const backTarget = (route) => (route.params && route.params.back) || 'BusinessHome';
const backLabel = (target) => (target === 'BusinessPurchases' ? '← Purchases' : '← Home');

// ------------------------------------------------------------------------------------------ Lipa Later Details
export function SupplierLipaDetailsScreen({ navigation, route }) {
  const { amount = 0, expr = '' } = route.params || {};
  const [name, setName] = useState(''), [phone, setPhone] = useState(''), [amt, setAmt] = useState(amount ? String(amount) : ''), [due, setDue] = useState(defaultDueDate());
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      await store.recordPurchase({ items: [{ label: (expr || '').replace(/ =$/, '').slice(0, 60) || 'Purchase', amount: parseFloat(amt) }], paymentMethod: 'LIPA_LATER',
        supplierName: name, supplierPhone: phone, dueDate: due });
      navigation.navigate('SupplierLipaReport', { back: 'BusinessPurchases' });               // Save opens the Lipa Later Suppliers Report
    } catch (e) { Alert.alert('Lipa Later Details', say(e)); } finally { setBusy(false); }
  };
  return (
    <Screen>
      <BackLink label="← Back" onPress={() => navigation.goBack()} />
      <Title>Lipa Later Details</Title>
      <Sub>Record who you owe and when it's due.</Sub>
      <Hint style={{ marginBottom: 10 }}>Record who you owe and when it's due, so it shows on your Lipa Later Suppliers Report and you never miss a payment.</Hint>
      <Field label="Supplier Name" value={name} onChangeText={setName} maxLength={80} placeholder="e.g. Wholesale Distributors" />
      <Field label="Supplier Mobile Number" value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="e.g. 0712 345 678" />
      <Field label="Amount to be Paid Later (KSh)" value={amt} onChangeText={(v) => setAmt(v.replace(/[^0-9.]/g, ''))} keyboardType="decimal-pad" placeholder="0" />
      <Field label="Payment Due Date (YYYY-MM-DD)" value={due} onChangeText={setDue} autoCapitalize="none" hint="Must be after today. Lipa Later is for future payment, not today." />
      <Btn label="Save →" onPress={save} disabled={busy} />
    </Screen>
  );
}

// ------------------------------------------------------------------------------------------ Lipa Later Suppliers Report
export function SupplierLipaReportScreen({ navigation, route }) {
  const back = backTarget(route);
  const [q, setQ] = useState(''), [page, setPage] = useState(1);
  const { data } = useBizData(async () => store.supplierLipaList());
  const all = data || [];
  const term = q.trim().toLowerCase();
  const digits = term.replace(/\D/g, '');
  const list = all.filter((c) => !term || c.purchase.supplier_name.toLowerCase().includes(term) || (digits && c.purchase.supplier_phone.replace(/\D/g, '').includes(digits)));
  const banner = supplierBanner(all);
  return (
    <Screen>
      <BackLink label={backLabel(back)} onPress={() => navigation.navigate(back)} />
      <Title>Lipa Later Suppliers Report</Title>
      <Sub>Suppliers that you still owe. Record a payment when you pay.</Sub>
      {banner ? <Banner tone="amber" text={`⚠️ ${banner}`} /> : null}
      <Btn label="📊 View Payment Ageing Report" kind="dark" onPress={() => navigation.navigate('SupplierLipaAgeing', { back })} />
      <Field placeholder="🔍 Search by supplier name or mobile number…" value={q} onChangeText={(v) => { setQ(v); setPage(1); }} />
      {list.slice(0, page * PAGE).map((c, i) => (
        <Card key={c.purchase.client_id}>
          <Text style={{ fontWeight: '800', color: C.ink, fontSize: 15 }}>{i + 1}. {c.purchase.supplier_name}</Text>
          <Hint>{c.purchase.supplier_phone} · purchased {fmtDate(c.purchase.trading_at)} · due {fmtDate(c.purchase.due_date)}</Hint>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}><Badge {...BADGE[c.bucket]} />{c.days_overdue > 0 ? <Badge text={`${c.days_overdue} day${c.days_overdue === 1 ? '' : 's'} overdue`} tone="red" /> : null}</View>
          <Row k="Original Amount" v={kes(c.purchase.total)} /><Row k="Paid so far" v={kes(c.paid)} /><Row k="Still owing" v={kes(c.balance)} bold color={C.red} />
          {c.payments.length ? <Hint>Payment History: {c.payments.map((p) => `${kes(p.amount)} (${fmtDate(p.trading_at)})`).join(', ')}</Hint> : null}
          <Btn small label="💳 Record Payment" onPress={() => navigation.navigate('RecordSupplierPayment', { purchaseClientId: c.purchase.client_id, back })} style={{ marginTop: 8 }} />
        </Card>
      ))}
      {!list.length ? <Empty>{term ? 'No supplier matches your search.' : 'You do not owe any supplier right now.'}</Empty> : null}
      {list.length > page * PAGE ? <Btn label="Next →" kind="ghost" onPress={() => setPage(page + 1)} /> : null}
    </Screen>
  );
}

// ------------------------------------------------------------------------------------------ Record Payment (to a supplier)
export function RecordSupplierPaymentScreen({ navigation, route }) {
  const { purchaseClientId } = route.params || {};
  const back = backTarget(route);
  const { data: c } = useBizData(async () => (await store.supplierLipaList({ includeSettled: true })).find((x) => x.purchase.client_id === purchaseClientId) || null, [purchaseClientId], { pollMs: 0 });
  const [type, setType] = useState('full'), [amount, setAmount] = useState(null), [notes, setNotes] = useState(''), [busy, setBusy] = useState(false);
  if (!c) return <Screen><BackLink label="← Back" onPress={() => navigation.goBack()} /><Empty>Payment not found.</Empty></Screen>;
  const amt = amount === null ? String(c.balance) : amount;
  const save = async () => {
    setBusy(true);
    try {
      const r = await store.recordSupplierPayment({ purchaseClientId, type, amount: parseFloat(amt), notes });
      Alert.alert('Payment recorded', r.balance > 0 ? `You still owe ${c.purchase.supplier_name} ${kes(r.balance)}.` : `${c.purchase.supplier_name} is fully paid.`);
      navigation.navigate('SupplierLipaReport', { back });
    } catch (e) { Alert.alert('Record Payment', say(e)); } finally { setBusy(false); }
  };
  return (
    <Screen>
      <BackLink label="← Back" onPress={() => navigation.goBack()} />
      <Title>Record Payment</Title>
      <Sub>Full settlement or a partial payment toward the balance you owe.</Sub>
      <Card>
        <Text style={{ fontWeight: '800', color: C.ink }}>{c.purchase.supplier_name}</Text>
        <Hint>Original: {kes(c.purchase.total)}{c.paid > 0 ? ` · Already paid: ${kes(c.paid)}` : ''}</Hint>
        <Row k="Still owing" v={kes(c.balance)} bold color={C.red} />
      </Card>
      <Text style={s.label}>Payment Type</Text>
      <Tabs tabs={[{ key: 'full', label: 'Full Payment (complete settlement)' }, { key: 'partial', label: 'Partial Payment' }]} value={type}
        onChange={(t) => { setType(t); setAmount(t === 'full' ? String(c.balance) : ''); }} />
      <Hint style={{ marginBottom: 8 }}>{type === 'full' ? `Full must be at least ${kes(c.balance)}.` : `Partial must be less than ${kes(c.balance)}.`}</Hint>
      <Field label="Amount Paid (KSh)" value={amt} onChangeText={(v) => setAmount(v.replace(/[^0-9.]/g, ''))} keyboardType="decimal-pad" placeholder="0" />
      <Field label="Notes (optional)" value={notes} onChangeText={setNotes} maxLength={200} placeholder="e.g. Paid via M-Pesa, balance next week…" />
      <Btn label="Record Payment →" onPress={save} disabled={busy || !(parseFloat(amt) > 0) || c.balance <= 0} />
      <Hint>The payment counts as a purchase cost today.</Hint>
    </Screen>
  );
}

// ------------------------------------------------------------------------------------------ Lipa Later Ageing Report (suppliers)
export function SupplierLipaAgeingScreen({ navigation, route }) {
  const back = backTarget(route);
  const [q, setQ] = useState('');
  const { data } = useBizData(async () => store.supplierLipaList());
  const rows = data || [];
  const term = q.trim().toLowerCase(), digits = term.replace(/\D/g, '');
  const shown = rows.filter((r) => !term || r.purchase.supplier_name.toLowerCase().includes(term) || (digits && r.purchase.supplier_phone.replace(/\D/g, '').includes(digits)));
  const sum = (items) => items.reduce((x, r) => x + Math.round(r.balance * 100), 0) / 100;
  const critical60 = rows.filter((r) => r.days_overdue > 60);
  return (
    <Screen>
      <BackLink label="← Back to Suppliers" onPress={() => navigation.navigate('SupplierLipaReport', { back })} />
      <Title>Lipa Later Ageing Report</Title>
      <Sub>Payment ageing analysis for your Lipa Later suppliers.</Sub>
      {critical60.length ? <Banner tone="red" text={`⚠️ ${critical60.length} critically overdue (60+ days): ${kes(sum(critical60))} owed. Immediate payment recommended.`} /> : null}
      <Card><Row k="Total Outstanding" v={kes(sum(rows))} bold color={C.red} /><Row k="Pending Suppliers" v={String(rows.length)} bold /></Card>
      <Field placeholder="🔍 Search by supplier name or mobile…" value={q} onChangeText={setQ} />
      {AGEING_ORDER.map(([key, label]) => {
        const items = shown.filter((r) => r.bucket === key);
        return (
          <Card key={key}>
            <Row k={`${label} (${items.length} supplier${items.length === 1 ? '' : 's'})`} v={kes(sum(items))} bold />
            {items.map((r) => <Hint key={r.purchase.client_id}>{r.purchase.supplier_name} · due {fmtDate(r.purchase.due_date)} · owe {kes(r.balance)}</Hint>)}
          </Card>
        );
      })}
      {!rows.length ? <Empty>✅ No pending Lipa Later balances. All suppliers fully paid!</Empty> : null}
    </Screen>
  );
}
