// rider-app/src/screens/business/RecordParts.js
// SMART BIZNA shared pieces for every list of records (Sales/Service History, Purchase History, Expense History and the Owner's Transactions):
// one row with its payment method, time, who recorded it (Owner only), Corrected / VOID / waiting-to-sync tags, and the Correct and Void actions that
// appear only while the 24-hour correction window is open for a record the person may change.
import React, { useEffect, useState } from 'react';
import { View, Text } from 'react-native';
import { Btn, Badge, Hint, s, C } from './BizUI';
import store from '../../offline/businessRepository';
import { kes, signedKes, fmtDateTime, recordTitle, recordTags, KIND_LABEL } from '../../utils/businessFormat';

export function RecordRow({ rec, navigation, showWho, transaction, back }) {
  const [canChange, setCanChange] = useState(false);
  const isPayment = transaction && (transaction.type === 'LIPA_PAYMENT' || transaction.type === 'SUPPLIER_PAYMENT');
  useEffect(() => { let live = true; if (!isPayment) store.canChange(rec).then((v) => live && setCanChange(v)); return () => { live = false; }; }, [rec.client_id, rec.status, rec.trading_at]);   // eslint-disable-line
  const voided = rec.status === 'voided';
  const when = transaction ? transaction.when : rec.trading_at;
  const who = transaction ? transaction.recorded_by : rec.recorded_by;
  const onCredit = (rec.kind === 'SALE' || rec.kind === 'PURCHASE') && rec.payment_method === 'LIPA_LATER';
  const sign = transaction ? transaction.sign : (onCredit ? 0 : rec.kind === 'SALE' ? 1 : -1);
  const amount = transaction ? transaction.amount : rec.total;
  const title = isPayment ? `${transaction.type === 'SUPPLIER_PAYMENT' ? 'Supplier payment made' : '+ Lipa Later payment received'}${transaction.details ? ' · ' + transaction.details : ''}` : transaction ? `${KIND_LABEL[transaction.type]} · ${recordTitle({ ...rec, kind: transaction.type })}` : recordTitle(rec);
  const sub = [fmtDateTime(when), showWho && who ? `by ${who.name} (${who.role === 'OWNER' ? 'Owner' : 'Sales/Service'})` : null].filter(Boolean).join(' · ');
  const tags = isPayment ? [] : recordTags(rec);
  return (
    <View style={{ paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.line, opacity: voided ? 0.7 : 1 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <View style={{ flex: 1, paddingRight: 10 }}>
          <Text style={{ fontWeight: '700', color: C.ink, textDecorationLine: voided ? 'line-through' : 'none' }}>{title}</Text>
          <Hint>{sub}{rec.kind === 'SALE' && rec.payment_method === 'LIPA_LATER' && rec.customer_name ? ` · on credit: ${rec.customer_name}` : ''}</Hint>
          {rec.kind === 'PURCHASE' && rec.payment_method === 'LIPA_LATER' && !isPayment ? (
            <Hint>On credit, not a cost until paid{rec._owed ? ` · Paid ${kes(rec._owed.paid)} · Owing ${kes(rec._owed.balance)}` : ''}</Hint>) : null}
          {tags.length ? <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>{tags.map((t) => <Badge key={t.text} text={t.text} tone={t.tone} />)}</View> : null}
        </View>
        <Text style={{ fontWeight: '800', color: sign > 0 ? C.green : sign < 0 ? C.red : C.soft, textDecorationLine: voided ? 'line-through' : 'none' }}>{signedKes(amount, sign)}</Text>
      </View>
      {canChange && !voided ? (
        <View style={{ flexDirection: 'row', marginTop: 8 }}>
          <Btn small label="Correct" kind="dark" onPress={() => navigation.navigate('CorrectRecord', { clientId: rec.client_id, back })} style={{ marginRight: 8 }} />
          <Btn small label="Void" kind="danger" onPress={() => navigation.navigate('VoidRecord', { clientId: rec.client_id, back })} />
        </View>
      ) : null}
    </View>
  );
}

/** Total + count card used at the top of the three histories. Voided records are left out of both. */
export const totalOf = (list) => { const live = list.filter((r) => r.status !== 'voided'); return { total: live.reduce((x, r) => x + Math.round(r.total * 100), 0) / 100, count: live.length }; };
export const money = kes;
