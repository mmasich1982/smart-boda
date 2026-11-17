// rider-app/src/screens/business/CorrectVoidScreens.js
// SMART BIZNA correct or void a record (journey M). Inside the 24-hour window the person who recorded it, or the Owner, can correct the amount (and payment
// method) or void it with a reason. The change is applied on the phone at once and QUEUED (record_correction / record_void) and sent when there is a
// connection. A voided record stays in the list struck through and is left out of every total.
import React, { useState } from 'react';
import { Alert, View, Text, TouchableOpacity } from 'react-native';
import { Screen, BackLink, Title, Sub, Card, Row, Field, Btn, Section, Tabs, Empty, Hint, s, C } from './BizUI';
import { useBizData } from '../../hooks/useBusiness';
import store, { BusinessRuleError, VOID_REASONS } from '../../offline/businessRepository';
import { kes, KIND_LABEL, methodLabel } from '../../utils/businessFormat';

const say = (e) => (e instanceof BusinessRuleError ? e.message : 'Something went wrong. Please try again.');
const findRec = async (id) => { const d = await store.getData(); return [...d.sales, ...d.purchases, ...d.expenses].find((r) => r.client_id === id) || null; };

export function CorrectRecordScreen({ navigation, route }) {
  const { clientId, back } = route.params || {};
  const { data: rec } = useBizData(() => findRec(clientId), [clientId], { pollMs: 0 });
  const [amount, setAmount] = useState(null), [details, setDetails] = useState(null), [pm, setPm] = useState(null), [busy, setBusy] = useState(false);
  const leave = () => navigation.navigate(back || 'BusinessHome');
  if (!rec) return <Screen><BackLink label="← Cancel" onPress={leave} /><Empty>Record not found.</Empty></Screen>;
  const isExpense = rec.kind === 'EXPENSE';
  const lipa = (rec.kind === 'SALE' || rec.kind === 'PURCHASE') && rec.payment_method === 'LIPA_LATER';
  // An ordinary sale or purchase never offers Lipa Later (it needs the customer's / supplier's details); a Lipa Later one keeps its method.
  const methods = lipa ? ['LIPA_LATER'] : ['CASH', 'MPESA', 'CARD'];
  const amt = amount === null ? String(rec.total) : amount;
  const save = async () => {
    setBusy(true);
    try {
      await store.correctRecord(clientId, { amount: parseFloat(amt), ...(isExpense ? { details: details === null ? rec.details : details } : { paymentMethod: pm || rec.payment_method }) });
      leave();
    } catch (e) { Alert.alert('Correct', say(e)); } finally { setBusy(false); }
  };
  return (
    <Screen>
      <BackLink label="← Cancel" onPress={leave} />
      <Title>Correct this record</Title>
      <Sub>{KIND_LABEL[rec.kind]}.</Sub>
      {isExpense ? <Field label="Expense details" value={details === null ? rec.details : details} onChangeText={setDetails} maxLength={120} /> : null}
      <Field label="Amount (KSh)" value={amt} onChangeText={(v) => setAmount(v.replace(/[^0-9.]/g, ''))} keyboardType="decimal-pad" />
      {!isExpense ? (<><Text style={s.label}>Payment method</Text><Tabs tabs={methods.map((m) => ({ key: m, label: methodLabel(m) }))} value={pm || rec.payment_method} onChange={lipa ? () => {} : setPm} />
        {lipa ? <Hint>A Lipa Later record cannot be switched to another method. Void it and record it again if needed.</Hint> : null}</>) : null}
      <Btn label="Save Correction →" onPress={save} disabled={busy || !(parseFloat(amt) > 0)} />
    </Screen>
  );
}

export function VoidRecordScreen({ navigation, route }) {
  const { clientId, back } = route.params || {};
  const { data: rec } = useBizData(() => findRec(clientId), [clientId], { pollMs: 0 });
  const [reason, setReason] = useState(VOID_REASONS[0]), [busy, setBusy] = useState(false);
  const leave = () => navigation.navigate(back || 'BusinessHome');
  if (!rec) return <Screen><BackLink label="← Cancel" onPress={leave} /><Empty>Record not found.</Empty></Screen>;
  const confirm = async () => {
    setBusy(true);
    try { await store.voidRecord(clientId, reason); leave(); } catch (e) { Alert.alert('Void', say(e)); } finally { setBusy(false); }
  };
  return (
    <Screen>
      <BackLink label="← Cancel" onPress={leave} />
      <Title>Void this record?</Title>
      <Sub>A voided record stays in the list struck through, and is left out of every total and statement.</Sub>
      <Card><Row k="Amount" v={kes(rec.total)} bold /></Card>
      <Text style={s.label}>Reason</Text>
      <View style={{ marginBottom: 12 }}>
        {VOID_REASONS.map((r) => (
          <TouchableOpacity key={r} onPress={() => setReason(r)} accessibilityRole="radio" accessibilityState={{ selected: reason === r }}
            style={[s.card, { marginBottom: 6, borderColor: reason === r ? C.red : C.line }]}><Text style={{ color: C.ink, fontWeight: reason === r ? '800' : '400' }}>{reason === r ? '● ' : '○ '}{r}</Text></TouchableOpacity>
        ))}
      </View>
      <Btn label="Void Record" kind="danger" onPress={confirm} disabled={busy} />
    </Screen>
  );
}
