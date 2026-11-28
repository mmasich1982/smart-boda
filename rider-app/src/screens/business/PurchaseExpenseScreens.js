// rider-app/src/screens/business/PurchaseExpenseScreens.js
// SMART BIZNA Business Purchases (journey F: the hub, Record Purchase on the calculator, and Lipa Later hand-off) and Business Expenses (journey G). Both follow the Fuel Hub pattern:
// a hub (← Home, Record ..., History), a record screen, then straight to the history. They show only when the Administrator allowed the tile for the
// person (the navigator guard and the server's 403 enforce it). Everything saves on the phone first and is queued.
// SHORTCUTS (enhancement): the hubs and the record screens carry shortcut icons to the other two screens (Purchases: Sale/Service + Expenses; Expenses:
// Sale/Service + Purchases), only the ones the person may open. They open the record screens directly (utils/businessShortcuts.js).
import React, { useState } from 'react';
import { Alert, Text } from 'react-native';
import { Screen, BackLink, Title, Sub, Card, Row, Field, Btn, Tabs, Section, Empty, Hint, ShortcutBar, s, C } from './BizUI';
import DropdownField from '../../components/DropdownField';
import { EXPENSE_TYPES } from '../../utils/businessLists';
import BizCalculator from './BizCalculator';
import store, { BusinessRuleError } from '../../offline/businessRepository';
import { useBizDraft } from '../../hooks/useBusiness';
import useShortcuts from '../../hooks/useShortcuts';
import { kes, defaultDueDate } from '../../utils/businessFormat';
import BizDateField from './BizDateField';

const say = (e) => (e instanceof BusinessRuleError ? e.message : 'We could not save this. Please try again.');

// -------------------------------------------------------------------------------------------------- hubs
function Hub({ navigation, current, title, sub, record, recordLabel, historyLabel, historyRoute }) {
  const shortcuts = useShortcuts(current);
  return (
    <Screen>
      <BackLink onPress={() => navigation.navigate('BusinessHome')} />
      <Title>{title}</Title>
      <Sub>{sub}</Sub>
      <Btn label={recordLabel} onPress={() => navigation.navigate(record)} />
      <Card onPress={() => navigation.navigate(historyRoute)}><Text style={{ fontSize: 15, fontWeight: '700', color: C.ink }}>{historyLabel}</Text></Card>
      <ShortcutBar items={shortcuts} onGo={(route) => navigation.navigate(route)} />
    </Screen>
  );
}
export const BusinessPurchasesScreen = ({ navigation }) => <Hub navigation={navigation} current="purchase" title="Business Purchases" sub="Record what you buy for the business." record="RecordPurchase" recordLabel="Record Purchase →" historyLabel="📜 Purchase History" historyRoute="PurchaseHistory" />;
export const BusinessExpensesScreen = ({ navigation }) => <Hub navigation={navigation} current="expense" title="Business Expenses" sub="Rent, electricity, transport and other running costs." record="RecordExpense" recordLabel="Record Expense →" historyLabel="📜 Expense History" historyRoute="ExpenseHistory" />;

// -------------------------------------------------------------------------------------------------- Record Purchase (v48)
// The New Sale/Service calculator with identical behaviour. The purchase amount is the calculator total. Payment: Cash, M-Pesa, Card or Lipa Later.
// LIPA LATER works exactly like Sales/Services: choosing it shows Supplier Name, Supplier Mobile Number and Payment Due Date RIGHT HERE under the Payment Method
// (no other screen opens). Save writes to the phone first, clears the calculator and the supplier boxes, and opens the Purchase History (an owed purchase opens the
// Lipa Later Suppliers Report, where it appears). A refused save keeps everything keyed and says why.
export function RecordPurchaseScreen({ navigation }) {
  const [total, setTotal] = useState(0), [expr, setExpr] = useState(''), [busy, setBusy] = useState(false);
  const [calcKey, setCalcKey] = useState(0);                                  // a new key starts a fresh calculator
  const draft = useBizDraft('purchase', { keys: [], pm: 'CASH', name: '', phone: '', due: defaultDueDate() });   // MULTIPLE BUSINESSES: kept with its own business
  const { keys, pm, name, phone, due } = draft.value;
  const upd = (patch) => draft.setValue((d) => ({ ...d, ...patch }));
  const lipa = pm === 'LIPA_LATER';
  const shortcuts = useShortcuts('purchase');
  const save = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await store.recordPurchase({ items: [{ label: (expr || '').replace(/ =$/, '').slice(0, 60) || 'Purchase', amount: total }], paymentMethod: pm,
        supplierName: name, supplierPhone: phone, dueDate: due });
      draft.clear(); setCalcKey((k) => k + 1); setTotal(0); setExpr('');       // calculator, method and supplier boxes cleared
      if (lipa) navigation.navigate('SupplierLipaReport', { back: 'BusinessPurchases' });      // an owed purchase opens the Lipa Later Suppliers Report
      else navigation.navigate('PurchaseHistory');                             // straight to the history (the Fuel Hub pattern)
    } catch (e) { Alert.alert('Record Purchase', say(e)); } finally { setBusy(false); }
  };
  return (
    <Screen>
      <BackLink label="← Purchases" onPress={() => navigation.navigate('BusinessPurchases')} />
      <Title>Record Purchase</Title>
      {draft.ready ? <BizCalculator key={calcKey} onTotal={setTotal} onExpression={setExpr} initialKeys={keys} onKeys={(k) => upd({ keys: k })} /> : null}
      <Card><Row k="PURCHASE AMOUNT" v={kes(total)} bold color={total > 0 ? C.red : C.soft} /></Card>
      <Text style={s.label}>Payment method</Text>
      <Tabs tabs={[{ key: 'CASH', label: 'Cash' }, { key: 'MPESA', label: 'M-Pesa' }, { key: 'CARD', label: 'Card' }, { key: 'LIPA_LATER', label: 'Lipa Later' }]} value={pm} onChange={(v) => upd({ pm: v })} />
      {lipa ? (
        <Card>
          <Text style={s.label}>Lipa Later supplier</Text>
          <Field label="Supplier Name" value={name} onChangeText={(v) => upd({ name: v })} maxLength={80} placeholder="e.g. Wholesale Distributors" />
          <Field label="Supplier Mobile Number" value={phone} onChangeText={(v) => upd({ phone: v })} keyboardType="phone-pad" placeholder="0712 345 678" />
          <BizDateField label="Payment Due Date" value={due} onChange={(v) => upd({ due: v })} hint="Must be after today. It is not a cost until you pay the supplier." />
        </Card>
      ) : null}
      <Btn label="Save Purchase →" onPress={save} disabled={busy || !(total > 0)} />
      {!(total > 0) ? <Hint>Enter the purchase amount on the calculator first.</Hint> : null}
      <ShortcutBar items={shortcuts} onGo={(route) => navigation.navigate(route)} />
    </Screen>
  );
}

// -------------------------------------------------------------------------------------------------- Record Expense
// The expense TYPE is chosen from a drop list (Household ... Others). The chosen type is what is saved as the expense's details ("Others" is saved as "Others").
export function RecordExpenseScreen({ navigation }) {
  const [busy, setBusy] = useState(false);
  const draft = useBizDraft('expense', { details: '', amount: '' });          // MULTIPLE BUSINESSES: kept with its own business
  const { details, amount } = draft.value;
  const setDetails = (v) => draft.setValue((d) => ({ ...d, details: v })), setAmount = (v) => draft.setValue((d) => ({ ...d, amount: v }));
  const shortcuts = useShortcuts('expense');
  const save = async () => {
    setBusy(true);
    try { await store.recordExpense({ details, amount: parseFloat(amount) }); draft.clear(); navigation.navigate('ExpenseHistory'); }
    catch (e) { Alert.alert('Record Expense', say(e)); } finally { setBusy(false); }
  };
  return (
    <Screen>
      <BackLink label="← Expenses" onPress={() => navigation.navigate('BusinessExpenses')} />
      <Title>Record Expense</Title>
      <Sub>Choose the type of expense, then enter the amount.</Sub>
      <DropdownField label="Expense type" required value={details} onValueChange={setDetails} placeholder="Select expense type..." options={EXPENSE_TYPES.map((t) => ({ label: t, value: t }))} />
      <Field label="Amount (KSh)" value={amount} onChangeText={(v) => setAmount(v.replace(/[^0-9.]/g, ''))} keyboardType="decimal-pad" />
      <Btn label="Record Expense Cost →" onPress={save} disabled={busy || !EXPENSE_TYPES.includes(details) || !(parseFloat(amount) > 0)} />
      <ShortcutBar items={shortcuts} onGo={(route) => navigation.navigate(route)} />
    </Screen>
  );
}
