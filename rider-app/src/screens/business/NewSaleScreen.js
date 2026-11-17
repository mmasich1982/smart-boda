// rider-app/src/screens/business/NewSaleScreen.js
// SMART BIZNA New Sale/Service (journey D, prototype v46). The user keys the amount on the calculator; the sale amount is the calculator's total.
// Payment: Cash, M-Pesa, Card or Lipa Later (customer name, phone and a due date after today, the rider app's rule). Save Sale/Service writes to the phone
// FIRST (offline database), Home shows the new total at once, the record is queued and sent when there is a connection; a failed API never blocks the user.
import React, { useState } from 'react';
import { Alert, Text } from 'react-native';
import { Screen, BackLink, Title, Sub, Card, Row, Tabs, Field, Btn, Hint, s, C } from './BizUI';
import BizCalculator from './BizCalculator';
import store, { BusinessRuleError } from '../../offline/businessRepository';
import { useBizDraft } from '../../hooks/useBusiness';
import { kes, defaultDueDate } from '../../utils/businessFormat';

const METHODS = [{ key: 'CASH', label: 'Cash' }, { key: 'MPESA', label: 'M-Pesa' }, { key: 'CARD', label: 'Card' }, { key: 'LIPA_LATER', label: 'Lipa Later' }];

export default function NewSaleScreen({ navigation }) {
  const [total, setTotal] = useState(0), [expr, setExpr] = useState(''), [busy, setBusy] = useState(false);
  // MULTIPLE BUSINESSES: a half-entered sale is kept WITH ITS BUSINESS (calculator keys, method, Lipa Later customer) and is cleared once saved.
  const draft = useBizDraft('sale', { keys: [], pm: 'CASH', name: '', phone: '', due: defaultDueDate() });
  const { keys, pm, name, phone, due } = draft.value;
  const upd = (patch) => draft.setValue((d) => ({ ...d, ...patch }));
  const [setPm, setName, setPhone, setDue] = [(v) => upd({ pm: v }), (v) => upd({ name: v }), (v) => upd({ phone: v }), (v) => upd({ due: v })];
  const lipa = pm === 'LIPA_LATER';

  const save = async () => {
    setBusy(true);
    try {
      await store.recordSale({ items: [{ label: (expr || '').replace(/ =$/, '').slice(0, 60) || 'Sale/Service', amount: total }], paymentMethod: pm,
        customerName: name, customerPhone: phone, dueDate: due });
      draft.clear();
      navigation.navigate('BusinessHome');
    } catch (e) { Alert.alert('New Sale/Service', e instanceof BusinessRuleError ? e.message : 'We could not save this sale. Please try again.'); } finally { setBusy(false); }
  };

  return (
    <Screen>
      <BackLink onPress={() => navigation.navigate('BusinessHome')} />
      <Title>New Sale/Service</Title>
      <Sub>Enter the sale/service amount on the calculator.</Sub>
      {draft.ready ? <BizCalculator onTotal={setTotal} onExpression={setExpr} initialKeys={keys} onKeys={(k) => upd({ keys: k })} /> : null}
      <Card><Row k="Sale/Service Total" v={kes(total)} bold color={total > 0 ? C.green : C.soft} /></Card>
      <Text style={s.label}>Payment method</Text>
      <Tabs tabs={METHODS} value={pm} onChange={setPm} />
      {lipa ? (
        <Card>
          <Text style={s.label}>Lipa Later customer</Text>
          <Field label="Customer name" value={name} onChangeText={setName} maxLength={80} />
          <Field label="Customer phone" value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="0712 345 678" />
          <Field label="Due date (YYYY-MM-DD)" value={due} onChangeText={setDue} autoCapitalize="none" hint="Must be after today. This is not income until the customer pays." />
        </Card>
      ) : null}
      <Btn label="Save Sale/Service" onPress={save} disabled={busy || !(total > 0)} />
      {!(total > 0) ? <Hint>Enter an amount on the calculator first.</Hint> : null}
    </Screen>
  );
}
