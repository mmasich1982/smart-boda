// rider-app/src/screens/chama/ChamaQueueScreen.js
// ✅ PART 5: prototype wording for reject reasons (three sets), new heading,
//            repayment-specific reject message.

import React, { useCallback, useEffect, useState } from 'react';
import { withChamaOnlineGate } from '../../components/ChamaOnlineGate';   // My Savings / My Loans / My Chama require an internet connection
import { View, Text, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import BackLink from '../../components/BackLink';
import { useToast } from '../../components/Toast';
import { queueList, queueDecide, apiError } from '../../api/groupsClient';
import { getLocalRiderStatus } from '../../offline/db';
import { s, fmt } from './chamaStyles';
import colors from '../../theme/colors';
import { useGroupText } from './groupText';

const way = (i) => (i.method === 'cash' ? '💵 Cash' : "📱 M-Pesa (Treasurer's number)");
const CFG = {
  contributions: { title: ['📥', 'group.title_contributions', 'Contributions'], yes: 'confirm', yesLabel: 'Confirm received',
    sub: 'Contributions awaiting your confirmation. Once confirmed, they move to the history.',
    line: (i) => `${fmt(i.amount)} · ${way(i)}` },
  repayments: { title: ['💳', 'group.title_loan_repayments', 'Loan Repayments'], yes: 'confirm', yesLabel: 'Confirm received',
    sub: 'Confirm the loan repayments members have paid you. Their loan balances update only after you confirm.',
    line: (i) => `${fmt(i.amount)} · ${way(i)} · ${i.loan} · balance ${fmt(i.balance_now)}` },
  loanRequests: { title: ['💳', 'group.title_loan_requests', 'Loan Requests'], yes: 'approve', yesLabel: 'Approve & hand over cash',
    sub: 'Review each request, then hand over the cash if you approve.',
    line: (i) => `${fmt(i.amount)} · ${i.months} month(s) · total ${fmt(i.total)} · savings ${fmt(i.member_savings)}` },
};

// ✅ PART 5: the prototype's three sets of reject reasons
const REASONS = {
  default: ['I did not receive the payment', 'Amount does not match', 'I could not find the payment in my M-Pesa messages', 'Other'],
  loanRequests: ['The group fund cannot lend this amount now', 'Member already has an active loan', 'Amount is above what the member should borrow', 'Other'],
};

function ChamaQueueScreen({ navigation, route }) {
  const gt = useGroupText();
  const kind = route.params?.kind || 'contributions', c = CFG[kind];
  const groupId = route.params?.groupId;
  const { showToast } = useToast();
  const [items, setItems] = useState([]);
  const [pool, setPool] = useState(null);
  const [rejecting, setRejecting] = useState(null);

  const load = useCallback(() => queueList(kind, groupId).then((r) => { setItems(r.items); setPool(r.pool ?? null); }).catch(() => {}), [kind, groupId]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function decide(id, action, reason) {
    try {
      await queueDecide(kind, id, action, reason, groupId);
      // ✅ PART 5: repayment lists get their own reject message
      const REPAY = kind === 'repayments';
      showToast(action === 'reject'
        ? (REPAY ? 'Repayment rejected. The member will see it in their loan history.' : 'Rejected. The member will see your reason.')
        : 'Done.', action === 'reject' ? 'warn' : 'success');
      setRejecting(null);
      load();
    } catch (e) {
      showToast(apiError(e, 'Could not complete this. Check your connection.'), 'warn');
      load();
    }
  }
  const ask = (i) => Alert.alert(c.yesLabel + '?', `${i.member} · ${fmt(i.amount)}`, [{ text: 'Cancel' }, { text: 'Yes', onPress: () => decide(i.id, c.yes) }]);

  return (
    <ScrollView style={s.page} contentContainerStyle={{ padding: 16 }}>
      <BackLink onPress={() => navigation.goBack()} label="← Manage Chama" />
      <Text style={s.title}>{c.title[0]} {gt(c.title[1], c.title[2])}</Text><Text style={s.sub}>{c.sub}</Text>
      {pool !== null && <View style={s.card}><Text style={s.k}>Cash the group can lend now</Text><Text style={s.big}>{fmt(pool)}</Text></View>}
      {items.length === 0 && <Text style={s.hint}>Nothing waiting. 🎉</Text>}
      {items.map((i) => (
        <View key={i.id} style={s.card}>
          <Text style={{ fontWeight: '800' }}>{i.member}{i.phone ? ` · ${i.phone}` : ''}</Text>
          <Text style={s.hint}>{c.line(i)} · Ref {i.reference}</Text>
          {kind === 'loanRequests' && i.security && (
            <View style={{ marginTop: 6 }}>
              {i.security.required > 0 && <Text style={s.hint}>Security held {fmt(i.security.held)} of {fmt(i.security.required)} needed</Text>}
              {(i.securities || []).map((x) => <Text key={x.id} style={s.hint}>• {x.kind}{x.guarantor ? ` · ${x.guarantor}` : x.description ? ` · ${x.description}` : ''} · {fmt(x.value)} · {x.status === 'waiting_guarantor' ? 'waiting for guarantor' : x.status === 'submitted' ? 'to check' : x.status}</Text>)}
              {!i.security.ok && i.security.blockers.map((b) => <Text key={b} style={[s.hint, { color: colors.signalAmber }]}>⏳ {b}</Text>)}
              {i.security.to_check > 0 && <TouchableOpacity onPress={() => navigation.navigate('SecurityHeld', { groupId })}><Text style={{ color: colors.bodaOrange, fontWeight: '800', marginTop: 4 }}>Check the security ›</Text></TouchableOpacity>}
            </View>)}
          {rejecting === i.id ? (
            <View style={{ marginTop: 8 }}>
              <Text style={s.label}>WHY ARE YOU REJECTING THIS?</Text>
              {(REASONS[kind] || REASONS.default).map((r) => (
                <TouchableOpacity key={r} style={s.row} onPress={() => decide(i.id, 'reject', r)}><Text>{r}</Text></TouchableOpacity>
              ))}
              <TouchableOpacity onPress={() => setRejecting(null)}><Text style={{ color: colors.inkSoft, marginTop: 6 }}>Cancel</Text></TouchableOpacity>
            </View>
          ) : (
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
              <TouchableOpacity disabled={kind === 'loanRequests' && i.security && !i.security.ok} style={{ flex: 1, backgroundColor: colors.bodaOrange, padding: 10, borderRadius: 8, alignItems: 'center', opacity: kind === 'loanRequests' && i.security && !i.security.ok ? 0.4 : 1 }} onPress={() => ask(i)}>
                <Text style={{ color: '#fff', fontWeight: '800' }}>{c.yesLabel}</Text></TouchableOpacity>
              {!c.noReject && (
                <TouchableOpacity style={{ padding: 10, borderRadius: 8, borderWidth: 1, borderColor: colors.line }} onPress={() => setRejecting(i.id)}>
                  <Text style={{ fontWeight: '700' }}>Reject</Text></TouchableOpacity>)}
            </View>)}
        </View>))}
    </ScrollView>);
}

// Online-required module: shows a professional "internet connection required" message while offline.
export default withChamaOnlineGate(ChamaQueueScreen, 'chama');
