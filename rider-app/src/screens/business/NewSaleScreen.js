// rider-app/src/screens/business/NewSaleScreen.js
// SMART BIZNA New Sale/Service (journey D, prototype v46). The user keys the amount on the calculator; the sale amount is the calculator's total.
// Payment: Cash, M-Pesa, Card or Lipa Later (customer name, phone and a due date after today, the rider app's rule). Save Sale/Service writes to the phone
// FIRST (offline database); the record is queued and sent when there is a connection; a failed API never blocks the user.
//
// FAST SELLING (enhancement): saving a sale NO LONGER sends the person back to Home. The screen stays, the calculator and the payment choice are cleared
// ready for the next sale, and under the Save button there is, in this order:
//   1. a green "Sale/Service saved successfully" line that goes away by itself after 3 seconds,
//   2. a hero card with today's Sales/Service Total and the number of sales made today (the same two figures as Home: the whole business for the Owner,
//      the person's own for a Sales/Service Person), already including the sale just saved,
//   3. shortcut icons to Purchases and Expenses (only the ones the person may open), which open the Record screens directly.
import React, { useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { Screen, BackLink, Title, Sub, Card, Row, Tabs, Field, Btn, Hint, Banner, ShortcutBar, s, C } from './BizUI';
import BizDateField from './BizDateField';
import BizCalculator from './BizCalculator';
import store, { BusinessRuleError } from '../../offline/businessRepository';
import { useBizDraft, useBizData, useBusinessProfile } from '../../hooks/useBusiness';
import useShortcuts from '../../hooks/useShortcuts';
import { useTimedMessage, SAVED_MESSAGE_MS } from '../../hooks/useTimedMessage';
import { kes, defaultDueDate } from '../../utils/businessFormat';

export const SAVED_TEXT = 'Sale/Service saved successfully';
const METHODS = [{ key: 'CASH', label: 'Cash' }, { key: 'MPESA', label: 'M-Pesa' }, { key: 'CARD', label: 'Card' }, { key: 'LIPA_LATER', label: 'Lipa Later' }];

/** The hero card under Save: today's total and how many sales were made today. Same figures and wording as the Home hero. */
export function TodayHero({ owner, today }) {
  const t = today || { income: 0, sales: 0 };
  return (
    <View style={[s.hero, { backgroundColor: C.asphalt }]} testID="today-hero" accessibilityLabel="Today's sales">
      <Text style={s.heroLabel}>{owner ? "Today's Sales/Service Total (whole business)" : "Today's Sales/Service Total (yours)"}</Text>
      <Text style={s.heroAmt} testID="today-hero-amount">{kes(t.income)}</Text>
      <Text style={s.heroSmall} testID="today-hero-count">{t.sales} {t.sales === 1 ? 'sale/service' : 'sales/services'} made today</Text>
    </View>
  );
}

export default function NewSaleScreen({ navigation }) {
  const [total, setTotal] = useState(0), [expr, setExpr] = useState(''), [busy, setBusy] = useState(false);
  const [calcKey, setCalcKey] = useState(0);         // a new key starts a fresh calculator after each saved sale
  // MULTIPLE BUSINESSES: a half-entered sale is kept WITH ITS BUSINESS (calculator keys, method, Lipa Later customer) and is cleared once saved.
  const draft = useBizDraft('sale', { keys: [], pm: 'CASH', name: '', phone: '', due: defaultDueDate() });
  const { keys, pm, name, phone, due } = draft.value;
  const upd = (patch) => draft.setValue((d) => ({ ...d, ...patch }));
  const [setPm, setName, setPhone, setDue] = [(v) => upd({ pm: v }), (v) => upd({ name: v }), (v) => upd({ phone: v }), (v) => upd({ due: v })];
  const lipa = pm === 'LIPA_LATER';
  const saved = useTimedMessage(SAVED_MESSAGE_MS);
  const { profile } = useBusinessProfile();
  const { data: today, reload } = useBizData(() => store.homeToday(), [profile && profile.role]);
  const shortcuts = useShortcuts('sale');
  const owner = !!profile && profile.role === 'OWNER';

  const save = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await store.recordSale({ items: [{ label: (expr || '').replace(/ =$/, '').slice(0, 60) || 'Sale/Service', amount: total }], paymentMethod: pm,
        customerName: name, customerPhone: phone, dueDate: due });
      draft.clear();                                  // back to Cash, no customer
      setCalcKey((k) => k + 1); setTotal(0); setExpr('');     // an empty calculator for the next sale
      saved.show(SAVED_TEXT);
      reload();                                       // the hero now includes this sale (it was written to the phone first)
    } catch (e) { Alert.alert('New Sale/Service', e instanceof BusinessRuleError ? e.message : 'We could not save this sale. Please try again.'); } finally { setBusy(false); }
  };

  return (
    <Screen>
      <BackLink onPress={() => navigation.navigate('BusinessHome')} />
      <Title>New Sale/Service</Title>
      <Sub>Enter the sale/service amount on the calculator.</Sub>
      {draft.ready ? <BizCalculator key={calcKey} onTotal={setTotal} onExpression={setExpr} initialKeys={keys} onKeys={(k) => upd({ keys: k })} /> : null}
      <Card><Row k="Sale/Service Total" v={kes(total)} bold color={total > 0 ? C.green : C.soft} /></Card>
      <Text style={s.label}>Payment method</Text>
      <Tabs tabs={METHODS} value={pm} onChange={setPm} />
      {lipa ? (
        <Card>
          <Text style={s.label}>Lipa Later customer</Text>
          <Field label="Customer name" value={name} onChangeText={setName} maxLength={80} />
          <Field label="Customer phone" value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="0712 345 678" />
          <BizDateField label="Payment Due Date" value={due} onChange={setDue} />
        </Card>
      ) : null}
      <Btn label="Save Sale/Service" onPress={save} disabled={busy || !(total > 0)} />
      {saved.message ? (
        <View testID="saved-notice" accessibilityRole="alert" accessibilityLiveRegion="polite"><Banner tone="green" text={saved.message} /></View>
      ) : !(total > 0) ? <Hint>Enter an amount on the calculator first.</Hint> : null}
      <TodayHero owner={owner} today={today} />
      <ShortcutBar items={shortcuts} onGo={(route) => navigation.navigate(route)} />
    </Screen>
  );
}
