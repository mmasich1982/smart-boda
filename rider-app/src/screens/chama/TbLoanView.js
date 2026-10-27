// rider-app/src/screens/chama/TbLoanView.js
// The loan side of ONE Table Banking group: borrowing power, "Where is my loan?" tracker, the loan, repayments, security given.
import React, { useCallback, useState } from 'react';
import { View, Text, TouchableOpacity, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import PrimaryButton from '../../components/PrimaryButton';
import StatusBadge from '../../components/StatusBadge';
import { useToast } from '../../components/Toast';
import { mySummary, cancelLoanApp, completeSeen, apiError } from '../../api/groupsClient';
import { s, fmt } from './chamaStyles';
import { niceDate } from './common';
import colors from '../../theme/colors';

const COLOR = { pending: 'amber', confirmed: 'green', rejected: 'red' };   // StatusBadge takes a NAME: green | amber | red | grey
const SEC_COLOR = { waiting_guarantor: 'amber', submitted: 'amber', held: 'green' };
const SEC_TEXT = { waiting_guarantor: 'Waiting for yes', submitted: 'Treasurer to check', held: 'Held safely' };
const SEEN = ['loan_approved', 'loan_rejected', 'loan_payment_confirmed', 'loan_payment_rejected',
  'guarantee_accepted', 'guarantee_declined', 'security_release_due'];
const KIND = { savings: '💰 My savings', logbook: '📘 Logbook', title: '📜 Title deed', chattel: '📦 Household item', guarantor: '🤝 Guarantor' };

/** Steps of "Where is my loan?" built from the server's security status. */
export function loanSteps(app) {
  const sec = app.security || {};
  const hasGuar = (app.securities || []).some((x) => x.kind === 'guarantor' && x.status !== 'declined' && x.status !== 'withdrawn');
  const guarDone = !sec.waiting_guarantors;
  const checked = guarDone && !sec.to_check;
  return [
    { label: 'You applied', done: true },
    ...(hasGuar ? [{ label: sec.waiting_guarantors ? `Guarantors saying yes (${sec.waiting_guarantors} still to answer)` : 'Guarantors said yes', done: guarDone }] : []),
    ...((sec.offered > 0 || sec.required > 0) ? [{ label: checked && sec.ok ? 'Security checked and held' : 'Treasurer checks your security', done: checked && sec.ok }] : []),
    { label: 'Treasurer approves and hands over the cash', done: false },
  ];
}

export default function TbLoanView({ navigation, groupId }) {
  const { showToast } = useToast();
  const [d, setD] = useState(null);
  const [err, setErr] = useState(null);
  const load = useCallback(() => mySummary(groupId).then((r) => { setD(r); setErr(null); completeSeen(SEEN); })
    .catch((e) => setErr(apiError(e, 'Could not load. Check your connection.'))), [groupId]);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  const L = d?.loan, A = d?.pending_application;
  const cancel = () => Alert.alert('Cancel application?', 'Any security you put up is freed.', [{ text: 'No' }, { text: 'Yes', onPress: async () => {
    try { await cancelLoanApp(A.id); showToast('Application cancelled.', 'info'); load(); } catch (e) { showToast(apiError(e, 'Could not cancel.'), 'warn'); } } }]);
  return (
    <>
      {err && <View style={s.card}><Text>{err}</Text></View>}
      {d && (<>
        <Text style={s.sub}>{d.group} · Treasurer {d.treasurer?.name}</Text>
        <View style={[s.card, { borderColor: colors.bodaOrange }]}>
          <Text style={s.cardTitle}>📒 My Borrowing Power</Text>
          <Text style={s.big}>{fmt(d.available)}</Text><Text style={s.hint}>available to borrow</Text>
          <View style={s.row}><Text style={s.k}>Table Banking savings</Text><Text style={s.v}>{fmt(d.savings)}</Text></View>
          {Number(d.committed_savings) > 0 && (
            <View style={s.row}><Text style={s.k}>🔒 Committed as loan security</Text><Text style={s.v}>− {fmt(d.committed_savings)}</Text></View>)}
          <View style={[s.row, { borderBottomWidth: 0 }]}><Text style={s.k}>Borrowing limit ({d.rules.multiple}× uncommitted savings)</Text><Text style={s.v}>{fmt(d.limit)}</Text></View>
          {Number(d.committed_savings) > 0 && <Text style={s.hint}>Savings you have committed to a loan (yours or someone you back) cannot be borrowed against until that loan is repaid.</Text>}
        </View>

        {A && (
          <View style={[s.card, { borderColor: colors.signalAmber }]} testID="loan-tracker">
            <Text style={s.cardTitle}>⏳ Where is my loan?</Text>
            <View style={s.row}><Text style={s.k}>Amount</Text><Text style={s.v}>{fmt(A.amount)} · {A.months} month(s)</Text></View>
            <View style={s.row}><Text style={s.k}>Total to repay</Text><Text style={s.v}>{fmt(A.total)}</Text></View>
            {(() => { const steps = loanSteps(A); const cur = steps.findIndex((x) => !x.done);
              return steps.map((st, i) => (
                <View key={st.label} style={{ flexDirection: 'row', paddingVertical: 5 }}>
                  <Text style={{ width: 26 }}>{st.done ? '✅' : i === cur ? '⏳' : '⚪'}</Text>
                  <Text style={{ flex: 1, fontWeight: i === cur ? '800' : '500', color: st.done || i === cur ? colors.ink : colors.inkSoft }}>{st.label}</Text>
                </View>)); })()}
            {(A.securities || []).filter((x) => ['waiting_guarantor', 'submitted', 'held'].includes(x.status)).map((x) => (
              <View key={x.id} style={s.row}>
                <Text style={s.k}>{KIND[x.kind]}{x.guarantor ? ` · ${x.guarantor}` : x.description && x.kind !== 'savings' ? ` · ${x.description}` : ''}</Text>
                <View style={{ alignItems: 'flex-end' }}><Text style={s.v}>{fmt(x.value)}</Text><StatusBadge label={SEC_TEXT[x.status]} color={SEC_COLOR[x.status]} /></View>
              </View>))}
            {(A.securities || []).filter((x) => x.status === 'declined').map((x) => (
              <Text key={x.id} style={[s.hint, { color: colors.signalRed }]}>{x.guarantor || KIND[x.kind]} said no or could not be accepted.</Text>))}
            {(A.security?.blockers || []).length > 0 && A.security.mode === 'required' && (
              <Text style={[s.hint, { color: colors.signalAmber }]}>{A.security.blockers[0]}</Text>)}
            {d.security_rules?.allowed?.length > 0 && (
              <TouchableOpacity onPress={() => navigation.navigate('LoanApply', { groupId: d.group_id, applicationId: A.id })}>
                <Text style={{ color: colors.bodaOrange, fontWeight: '800', marginTop: 8 }}>➕ Add security or another guarantor</Text></TouchableOpacity>)}
            <TouchableOpacity onPress={cancel}><Text style={{ color: colors.signalRed, fontWeight: '700', marginTop: 8 }}>Cancel application</Text></TouchableOpacity>
          </View>)}

        {L && (
          <View style={[s.card, L.overdue && { borderColor: colors.signalRed }]}>
            <Text style={s.cardTitle}>{L.migrated ? 'My existing loan' : 'My loan'} {L.reference}</Text>
            {L.migrated && <Text style={s.hint}>Recorded by your Treasurer when you joined the group.</Text>}
            {[['Amount borrowed', L.principal], ...(L.migrated ? [] : [[`Interest (${d.rules.rate}% × ${L.months} months)`, L.interest]]),
              ['Total to repay', L.total], ['Paid so far', L.paid], ['Principal still owed', L.principal_balance], ['Interest still owed', L.interest_balance], ['Amount still owed', L.balance]]
              .map(([k, v]) => <View key={k} style={s.row}><Text style={s.k}>{k}</Text><Text style={s.v}>{fmt(v)}</Text></View>)}
            {L.due_date && <View style={s.row}><Text style={s.k}>Due date</Text>
              <Text style={[s.v, L.overdue && { color: colors.signalRed }]}>{niceDate(L.due_date)}{L.overdue ? '  ⚠️ Overdue' : ''}</Text></View>}
            <View style={{ marginTop: 8 }}><PrimaryButton label="Repay Loan →"
              onPress={() => navigation.navigate('ChamaPay', { kind: 'loan', amount: Math.min(L.installment, L.balance), treasurer: d.treasurer, groupId: d.group_id })} /></View>
          </View>)}

        {(d.security_given || []).length > 0 && L && (
          <View style={s.card}>
            <Text style={s.cardTitle}>🔒 Security I gave</Text>
            {d.security_given.map((x) => (
              <View key={x.id} style={s.row}><Text style={s.k}>{KIND[x.kind]}{x.guarantor ? ` · ${x.guarantor}` : ''}</Text><Text style={s.v}>{fmt(x.value)}</Text></View>))}
            <Text style={s.hint}>Your Treasurer gives it back when the loan is fully paid.</Text>
          </View>)}

        {!L && !A && (<>
          <View style={[s.card, { borderColor: d.eligibility.eligible ? colors.signalGreen : colors.signalAmber }]}>
            <Text style={s.cardTitle}>{d.eligibility.eligible ? '✅ You can borrow' : '⏳ Not eligible yet'}</Text>
            {[['Savings (incl. opening balance)', fmt(d.eligibility.savings)],
              ...(Number(d.eligibility.committed_savings) > 0 ? [['🔒 Committed as loan security', `− ${fmt(d.eligibility.committed_savings)}`]] : []),
              [`Borrowing limit (${d.eligibility.multiple}× uncommitted savings)`, fmt(d.eligibility.limit)],
              ['Available to borrow', fmt(d.eligibility.available)],
              ['Confirmed contributions', d.eligibility.required_contributions ? `${d.eligibility.confirmed_contributions} of ${d.eligibility.required_contributions} needed` : String(d.eligibility.confirmed_contributions)]]
              .map(([k, v]) => <View key={k} style={s.row}><Text style={s.k}>{k}</Text><Text style={s.v}>{v}</Text></View>)}
            {d.eligibility.blockers.map((b) => <Text key={b} style={[s.hint, { color: colors.signalAmber }]}>• {b}</Text>)}
            {d.security_rules?.mode === 'required' && <Text style={s.hint}>This group asks for security worth {d.security_rules.cover_pct}% of the loan.</Text>}
          </View>
          <PrimaryButton label="➕ Apply for a Loan" disabled={!d.eligibility.eligible} onPress={() => navigation.navigate('LoanApply', { groupId: d.group_id })} />
        </>)}

        <TouchableOpacity onPress={() => navigation.navigate('GroupLoans', { groupId: d.group_id })}>
          <Text style={{ color: colors.bodaOrange, fontWeight: '800', marginVertical: 12 }}>👥 See who is borrowing in this group ›</Text></TouchableOpacity>
        <TouchableOpacity testID="open-repayments" onPress={() => navigation.navigate('TbHistory', { groupId: d.group_id, kind: 'loan_repayment' })}>
          <Text style={{ color: colors.bodaOrange, fontWeight: '800', marginVertical: 6 }}>📈 My Loan Repayment ›</Text></TouchableOpacity>
        <Text style={s.hint}>Your loan repayments by month, with totals. Saved on your phone, so it also opens offline.</Text>
      </>)}
    </>);
}
