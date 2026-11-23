// rider-app/src/screens/business/SupplierLipaScreens.js
// SMART BIZNA Lipa Later for SUPPLIERS (prototype v48): what the business OWES. The same rules as the customer screens, the other way round:
//   Lipa Later Details (opened from Record Purchase when Lipa Later is chosen) -> Lipa Later Suppliers Report -> Record Payment -> Ageing Report.
// A Lipa Later purchase is OWED, not a cost, until the supplier is paid; each payment made is the cost (see businessReportUtils.js). Saved on the phone
// first and queued for the business's own server routes (/business/lipa-later/supplier-payments). Everything here needs the Purchases permission.
// Back links: from the Home tile the report goes back to Home; after saving a Lipa Later purchase it goes back to Business Purchases.
import AgeingReport from './AgeingReport';
import RejectedPaymentsNotice from '../../components/RejectedPaymentsNotice';
import { groupAgeing } from '../../utils/ageingGroups';
import BizDateField from './BizDateField';
import React, { useState } from 'react';
import { Alert, View, Text } from 'react-native';
import { Screen, BackLink, Title, Sub, Card, Row, Field, Btn, Tabs, Badge, Banner, Empty, Hint, Pager, s, C } from './BizUI';
import { paginate } from '../../utils/businessLists';
import { useBizData } from '../../hooks/useBusiness';
import store, { BusinessRuleError } from '../../offline/businessRepository';
import { kes, fmtDate, BADGE, AGEING_ORDER, supplierBanner, defaultDueDate } from '../../utils/businessFormat';
import { isAmountLocked, defaultAmount, amountHint, amountToSave, validatePayment } from '../../utils/lipaPaymentRules';

const say = (e) => (e instanceof BusinessRuleError ? e.message : 'Something went wrong. Please try again.');
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
      <BizDateField label="Payment Due Date" value={due} onChange={setDue} hint="Must be after today. Lipa Later is for future payment, not today." />
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
  const pg = paginate(list, page);                  // PAGING: 20 suppliers a page, back to page 1 on a new search
  return (
    <Screen>
      <BackLink label={backLabel(back)} onPress={() => navigation.navigate(back)} />
      <Title>Lipa Later Suppliers Report</Title>
      <Sub>Suppliers that you still owe. Record a payment when you pay.</Sub>
      <RejectedPaymentsNotice />
      {banner ? <Banner tone="amber" text={`⚠️ ${banner}`} /> : null}
      <Btn label="📊 View Payment Ageing Report" kind="dark" onPress={() => navigation.navigate('SupplierLipaAgeing', { back })} />
      <Field placeholder="🔍 Search by supplier name or mobile number…" value={q} onChangeText={(v) => { setQ(v); setPage(1); }} />
      <Pager {...pg} onChange={setPage} />
      {pg.rows.map((c, i) => (
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
      <Pager {...pg} onChange={setPage} />
    </Screen>
  );
}

// ------------------------------------------------------------------------------------------ Record Payment (to a supplier)
export function RecordSupplierPaymentScreen({ navigation, route }) {
  const { purchaseClientId } = route.params || {};
  const back = backTarget(route);
  const { data: c } = useBizData(async () => (await store.supplierLipaList({ includeSettled: true })).find((x) => x.purchase.client_id === purchaseClientId) || null, [purchaseClientId], { pollMs: 0 });
  const [type, setType] = useState('full'), [typed, setTyped] = useState(''), [notes, setNotes] = useState(''), [busy, setBusy] = useState(false);
  if (!c) return <Screen><BackLink label="← Back" onPress={() => navigation.goBack()} /><Empty>Payment not found.</Empty></Screen>;
  // THE PAYMENT RULES (utils/lipaPaymentRules.js): Full shows the whole balance greyed out and not editable; Partial is blank, editable and below the balance.
  const locked = isAmountLocked(type), check = validatePayment(type, typed, c.balance);
  const shown = locked ? defaultAmount('full', c.balance) : typed;
  const save = async () => {
    if (!check.ok) return;
    setBusy(true);
    try {
      const r = await store.recordSupplierPayment({ purchaseClientId, type, amount: amountToSave(type, typed, c.balance), notes });
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
        onChange={(t) => { setType(t); setTyped(''); }} />
      <Field label="Amount Paid (KSh)" value={shown} onChangeText={(v) => setTyped(v.replace(/[^0-9.]/g, ''))} keyboardType="decimal-pad" placeholder="0" testID="pay-amount"
        editable={!locked} selectTextOnFocus={!locked} error={check.message} hint={amountHint(type, c.balance)} style={locked ? { backgroundColor: '#eceae4', color: '#7a7f8a' } : undefined} />
      <Field label="Notes (optional)" value={notes} onChangeText={setNotes} maxLength={200} placeholder="e.g. Paid via M-Pesa, balance next week…" />
      <Btn label="Record Payment →" onPress={save} disabled={busy || !check.ok} />
      <Hint>The payment counts as a purchase cost today.</Hint>
    </Screen>
  );
}

// ------------------------------------------------------------------------------------------ Lipa Later Ageing Report (suppliers)
// Same layout as the customers' ageing report and the Smart Boda one (AgeingReport.js).
export function SupplierLipaAgeingScreen({ navigation, route }) {
  const back = backTarget(route);
  const { data } = useBizData(async () => store.supplierLipaList());
  const groups = groupAgeing(data || [], 'purchase');
  return <AgeingReport title="Ageing Report" backLabel="← Back to Suppliers" onBack={() => navigation.navigate('SupplierLipaReport', { back })} groups={groups}
    who="Suppliers" whoPlural="Suppliers" itemLabel="Purchases" empty="✅ No pending Lipa Later balances. All suppliers fully paid!" />;
}
