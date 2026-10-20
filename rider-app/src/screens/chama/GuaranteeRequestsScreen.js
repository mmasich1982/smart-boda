// rider-app/src/screens/chama/GuaranteeRequestsScreen.js
// Fellow members who asked ME to back their loan. Saying yes locks that part of my savings (or records my item)
// until their loan is repaid. I may also say no; the borrower is told and can ask someone else.
import React, { useCallback, useState } from 'react';
import { withChamaOnlineGate } from '../../components/ChamaOnlineGate';
import { View, Text, ScrollView, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import BackLink from '../../components/BackLink';
import PrimaryButton from '../../components/PrimaryButton';
import GhostButton from '../../components/GhostButton';
import { useToast } from '../../components/Toast';
import { guaranteeRequests, answerGuarantee, apiError } from '../../api/groupsClient';
import { s, fmt } from './chamaStyles';
import { niceDate } from './common';
import { useGroupText } from './groupText';

const FORM = { savings: 'my savings', logbook: 'my logbook', title: 'my title deed', chattel: 'my household item' };

function GuaranteeRequestsScreen({ navigation }) {
  const gt = useGroupText();
  const { showToast } = useToast();
  const [rows, setRows] = useState(null), [err, setErr] = useState(null);
  const load = useCallback(() => guaranteeRequests().then((r) => { setRows(r); setErr(null); }).catch((e) => setErr(apiError(e, 'Could not load.'))), []);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  const answer = async (r, yes) => {
    try { await answerGuarantee(r.id, yes); showToast(yes ? 'Thank you. You are now backing this loan.' : 'You said no. They will be told.', yes ? 'success' : 'info'); load(); }
    catch (e) { showToast(apiError(e, 'Could not send your answer.'), 'warn'); load(); }
  };
  const confirmYes = (r) => Alert.alert('Back this loan?',
    r.form === 'savings' ? `${fmt(r.value)} of your savings in ${r.group} stays locked until ${r.borrower.split(' ')[0]} finishes paying.` : `You agree to back ${r.borrower.split(' ')[0]}'s loan with ${FORM[r.form]}.`,
    [{ text: 'Not now' }, { text: 'Yes, I agree', onPress: () => answer(r, true) }]);
  return (
    <ScrollView style={s.page} contentContainerStyle={{ padding: 16 }}>
      <BackLink onPress={() => navigation.goBack()} />
      <Text style={s.title}>🤝 {gt('group.title_guarantee_requests', 'Guarantee requests')}</Text>
      <Text style={s.sub}>A guarantor is a member who vouches for a borrower. Only say yes if you trust them to pay.</Text>
      {!!err && <View style={s.card}><Text>{err}</Text></View>}
      {rows && rows.length === 0 && <View style={s.card}><Text>Nobody is waiting for your answer.</Text></View>}
      {(rows || []).map((r) => (
        <View key={r.id} style={s.card}>
          <Text style={s.cardTitle}>{r.borrower} · {r.group}</Text>
          <View style={s.row}><Text style={s.k}>Loan</Text><Text style={s.v}>{fmt(r.loan_amount)} · {r.months} month(s)</Text></View>
          <View style={s.row}><Text style={s.k}>They ask you to back it with</Text><Text style={s.v}>{FORM[r.form]}{r.form === 'savings' ? ` (${fmt(r.value)})` : ''}</Text></View>
          {r.form === 'savings' && <Text style={s.hint}>Your free savings: {fmt(r.my_free_savings)}</Text>}
          <Text style={s.hint}>Asked on {niceDate(r.at)}</Text>
          <View style={{ marginTop: 8 }}><PrimaryButton label="Yes, I will back it" onPress={() => confirmYes(r)} /></View>
          <GhostButton label="No, I cannot" onPress={() => answer(r, false)} />
        </View>))}
    </ScrollView>);
}
export default withChamaOnlineGate(GuaranteeRequestsScreen, 'loans');
