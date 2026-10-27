// rider-app/src/screens/chama/MgrRulesScreen.js
// "Group rules" for a Merry-Go-Round circle, as in Smart_Boda_Prototype_v43: the hero card, the round summary (first 4 rows,
// the rest under "More details"), what each contribution is and how often, and the Pay for This Round button.
// route.params: { groupId, circleId }
import React, { useCallback, useState } from 'react';
import { withChamaOnlineGate } from '../../components/ChamaOnlineGate';
import { ScrollView, Text } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import BackLink from '../../components/BackLink';
import { useToast } from '../../components/Toast';
import { mySavings, apiError } from '../../api/groupsClient';
import { s, fmt } from './chamaStyles';
import { Hero, Btn, Card, DetailRows, Notice, ScreenTitle, mgrState, payParams } from './mgrUi';

function MgrRulesScreen({ navigation, route }) {
  const { showToast } = useToast();
  const { groupId, circleId } = route.params || {};
  const [group, setGroup] = useState(null), [err, setErr] = useState(null);
  useFocusEffect(useCallback(() => {
    mySavings().then((r) => { setGroup((r.groups || []).find((g) => g.group_id === groupId) || null); setErr(null); })
      .catch((e) => setErr(apiError(e, 'Could not load. Check your connection.')));
  }, [groupId]));

  const c = group && (group.circles || []).find((x) => x.id === circleId);
  const st = c ? mgrState(c) : null;
  const pay = () => {
    if (st.left <= 0) return showToast(st.kind === 'awaiting' ? 'Your payment is waiting for your Treasurer to confirm.' : 'You have already paid for this round.', 'warn');
    navigation.navigate('ChamaPay', payParams(group, c, st));
  };
  return (
    <ScrollView style={s.page} contentContainerStyle={{ padding: 16 }}>
      <BackLink onPress={() => navigation.goBack()} />
      <ScreenTitle>Merry-Go-Round</ScreenTitle>
      {!!err && <Card><Text>{err}</Text></Card>}
      {c && st && (<>
        <Hero {...st.hero} />
        {st.payoutRows.length > 0 && <Card><DetailRows rows={st.payoutRows} max={4} foldKey={`mgr-rules|${groupId}|${circleId}`} /></Card>}
        <Card><DetailRows rows={[
          ...(c.contrib_label
            ? [['Contribution', `${fmt(c.amount)} · ${c.contrib_label}`], ['Payout', c.payout_label || c.sched_label || '—']]
            : [['Each contribution', fmt(c.amount)], ['How often', c.sched_label || '—']]),
          ...(c.recipient_pays ? [['Recipient also contributes', 'Yes']] : []),
          ...(c.treasurer_joins ? [['Treasurer also takes part', 'Yes']] : []),
        ]} /></Card>
        {c.next_cycle && (
          <Notice tone="green" icon="🕒" title={`From cycle ${c.next_cycle.cycle_no}: ${fmt(c.next_cycle.amount)}${c.next_cycle.contrib_label ? ` · ${c.next_cycle.contrib_label}` : ''}, paid out ${String(c.next_cycle.payout_label).toLowerCase()}`}
            sub="Your Treasurer changed the rules. They start with the next cycle." />)}
        {st.R && Number(st.R.pending) > 0 && <Notice tone="amber" icon="⏳" title={`${fmt(st.R.pending)} awaiting Treasurer approval`} />}
        {st.canPay && st.kind !== 'paid' && <Btn label="＋ Pay for This Round" onPress={pay} testID="rules-pay" />}
      </>)}
      {group && !c && <Card><Text>This circle is no longer available.</Text></Card>}
    </ScrollView>);
}

export default withChamaOnlineGate(MgrRulesScreen, 'savings');