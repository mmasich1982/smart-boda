// rider-app/src/screens/chama/MgrSavingsView.js
// One Merry-Go-Round GROUP in My Savings, laid out like Smart_Boda_Prototype_v25:
//   hero (contribution due / sent / paid) -> Pay contribution -> contributions summary -> Members Payout Turns
//   -> "Group rules" and "My Contribution history" links.
// A group can run several circles (each with its own amount and schedule); circles are tabs when there is more than one.
// The numbers come from /chama/mgr/me (via /chama/me/savings).
import React, { useEffect, useState } from 'react';
import { View, Text } from 'react-native';
import { useToast } from '../../components/Toast';
import { completeSeen, mgrMyActivity } from '../../api/groupsClient';
import { fmt } from './chamaStyles';
import { Tabs } from './common';
import MgrTurnsView from './MgrTurnsView';
import { Hero, Btn, TextLink, Card, DetailRows, Notice, mgrState, payParams } from './mgrUi';
import colors from '../../theme/colors';

const SEEN = ['mgr_payout_received', 'contribution_confirmed', 'contribution_rejected',
  'swap_result', 'swap_request_incoming', 'swap_needs_approval', 'swap_agreed'];

export default function MgrSavingsView({ navigation, group, reload }) {
  const { showToast } = useToast();
  const circles = group.circles || [];
  const [cid, setCid] = useState(null);
  const [view, setView] = useState('mine');          // 'mine' | 'turns'  (Members Payout Turns)
  const [activity, setActivity] = useState([]);
  const c = circles.find((x) => x.id === cid) || circles[0];
  useEffect(() => { completeSeen(SEEN); mgrMyActivity(group.group_id).then((a) => setActivity(a || [])).catch(() => {}); }, [group]);

  const nameLine = <Text style={s.groupName}>👥 {group.group_name}</Text>;
  if (circles.length === 0) {
    return (<>
      {nameLine}
      <Card><Text style={s.cardTitle}>{group.group_name}</Text><Text>Your Treasurer has not put you in a circle yet.</Text></Card>
    </>);
  }

  const st = mgrState(c);
  const myPays = activity.filter((a) => a.kind === 'contribution' && a.circle_id === c.id);
  const waiting = myPays.find((a) => a.status === 'pending');
  const lastRej = myPays[0] && myPays[0].status === 'rejected' ? myPays[0] : null;   // newest decision was a rejection
  const go = (screen) => navigation.navigate(screen, { groupId: group.group_id, circleId: c.id });
  const pay = () => {
    if (st.left <= 0) return showToast(st.kind === 'awaiting' ? 'Your payment is waiting for your Treasurer to confirm.' : 'You have already paid for this round.', 'warn');
    navigation.navigate('ChamaPay', payParams(group, c, st));
  };
  const picker = circles.length > 1
    ? <Tabs small tabs={circles.map((x) => ({ key: x.id, label: x.name }))} value={c.id} onChange={(k) => { setCid(k); setView('mine'); }} />
    : null;

  if (view === 'turns') {
    return (<>
      {nameLine}{picker}
      <MgrTurnsView group={group} c={c} st={st} navigation={navigation} reload={reload} onBack={() => setView('mine')} />
    </>);
  }

  return (<>
    {nameLine}{picker}
    <Hero {...st.hero} />

    {st.R && Number(st.R.pending) > 0 ? (
      <Notice tone="amber" icon="⏳" onPress={() => go('MgrHistory')}
        title={`${fmt(st.R.pending)} ${waiting ? (waiting.method === 'cash' ? 'cash' : 'M-Pesa') + ' ' : ''}awaiting Treasurer approval`}
        sub={`Tap to view${waiting?.reference ? ` · Ref ${waiting.reference}` : ''}`} />) : null}
    {st.kind === 'due' && lastRej && (
      <Notice tone="red" icon="❌" title={`Your ${fmt(lastRej.amount)} payment was not accepted${lastRej.reason ? `: “${lastRej.reason}”` : ''}. Please pay again.`} />)}

    {st.canPay && <Btn label={st.kind === 'paid' ? 'Pay another contribution' : '＋ Pay contribution'} ghost={st.kind === 'paid'} onPress={pay} testID="mgr-pay" />}

    {st.payoutRows.length > 0 && <Card><DetailRows rows={st.payoutRows} /></Card>}
    {(c.notes || []).map((n) => (
      <Notice key={n.name} tone="amber" icon="📝" title={`${n.name}: ${n.reason}${n.note ? ` · ${n.note}` : ''}. The group has agreed, so the pool is paid out without it.`} />))}

    <Btn ghost label="Members Payout Turns" onPress={() => setView('turns')} testID="mgr-turns" />
    <TextLink label="Group rules" onPress={() => go('MgrRules')} />
    <TextLink label="My Contribution history" onPress={() => go('MgrHistory')} />
  </>);
}

const s = {
  groupName: { fontSize: 12.5, fontWeight: '600', color: colors.inkSoft, marginBottom: 12 },
  cardTitle: { fontWeight: '700', fontSize: 13.5, marginBottom: 4 },
};