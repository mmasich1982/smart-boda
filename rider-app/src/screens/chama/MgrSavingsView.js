// rider-app/src/screens/chama/MgrSavingsView.js
// One Merry-Go-Round GROUP in My Savings. A group can run several circles (each with its own amount and schedule) and
// a rider can hold one or two turns ("hands") in each. Circles are tabs. The numbers come from /chama/mgr/me (via /chama/me/savings).
//
// Swaps: the other rider can only AGREE. The rider who asked can CANCEL. There is no decline.
import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import PrimaryButton from '../../components/PrimaryButton';
import { useToast } from '../../components/Toast';
import { completeSeen, apiError, mgrSwapAgree, mgrSwapCancel, mgrMyActivity } from '../../api/groupsClient';
import { s, fmt } from './chamaStyles';
import { Tabs, niceDate, niceDateTime, swapStatus, TONE_BG, first } from './common';
import colors from '../../theme/colors';

const SEEN = ['mgr_payout_received', 'contribution_confirmed', 'contribution_rejected',
  'swap_result', 'swap_request_incoming', 'swap_needs_approval', 'swap_agreed'];

function SwapCard({ x, onAgree, onCancel, waitDays }) {
  const st = swapStatus(x);
  const open = x.stage === 'member' || x.stage === 'treasurer';
  const title = x.i_asked ? `🔁 Swap with ${first(x.b)}` : `🔁 ${first(x.a)} asks to swap with you`;
  const head = x.needs_my_agreement ? `Do you agree? ${first(x.a)} wants your Turn ${x.turn_b}.` : st.head;
  return (
    <View style={[s.card, { backgroundColor: TONE_BG[x.needs_my_agreement ? 'amber' : st.tone] }]}>
      <Text style={s.cardTitle}>{title}</Text>
      <Text style={{ fontWeight: '700' }}>{x.needs_my_agreement ? '' : `${st.icon} `}{head}</Text>
      <Text style={s.hint}>{x.effect?.text}</Text>
      {(x.effect?.warnings || []).map((w) => <Text key={w.text} style={[s.hint, { color: colors.signalAmber, fontWeight: '700' }]}>⚠️ {w.text}</Text>)}
      {!!x.reason && <Text style={s.hint}>“{x.reason}”</Text>}
      {!x.needs_my_agreement && !!st.hint && x.stage !== 'done' && <Text style={s.hint}>{st.hint}</Text>}
      {open && <Text style={s.hint}>Closes by itself if nobody answers within {waitDays || 7} days{x.expires_at ? ` (${niceDate(x.expires_at)})` : ''}.</Text>}
      {x.needs_my_agreement && <View style={{ marginTop: 8 }}><PrimaryButton label="Agree" onPress={() => onAgree(x)} /></View>}
      {x.i_asked && open && (
        <TouchableOpacity onPress={() => onCancel(x)}><Text style={{ color: colors.signalRed, fontWeight: '700', marginTop: 6 }}>Cancel request</Text></TouchableOpacity>)}
    </View>);
}

export default function MgrSavingsView({ navigation, group, reload }) {
  const { showToast } = useToast();
  const circles = group.circles || [];
  const [cid, setCid] = useState(null);
  const [activity, setActivity] = useState([]);
  const c = circles.find((x) => x.id === cid) || circles[0];
  useEffect(() => { completeSeen(SEEN); mgrMyActivity().then((a) => setActivity(a || [])).catch(() => {}); }, [group.group_id]);

  const act = async (fn, ok, bad) => { try { await fn(); showToast(ok, 'success'); reload && reload(); } catch (e) { showToast(apiError(e, bad), 'warn'); } };

  if (circles.length === 0) {
    return (<View style={s.card}>
      <Text style={s.cardTitle}>{group.group_name}</Text>
      <Text>Your Treasurer has not put you in a circle yet.</Text></View>);
  }
  const R = c.round;
  const banner = c.status === 'draft' || !R
    ? ['⏳', c.joins_next_cycle ? 'You join from the next cycle.' : 'Waiting for your Treasurer to start this circle.']
    : R.i_receive ? ['🎉', "It's your turn! Everyone else pays you this round."]
    : R.owes_total <= 0 ? ['✅', 'Nothing to pay this round.']
    : R.owed <= 0 ? ['✅', "You've paid for this round."]
    : R.pending > 0 ? ['⏳', `${fmt(R.pending)} sent. Waiting for your Treasurer to confirm.`]
    : ['💳', `Pay ${fmt(R.owed)} by ${niceDate(R.deadline)}.`];
  const mySwaps = (c.swaps || []);
  const history = activity.filter((a) => !c || a.circle_id === c.id).slice(0, 8);
  return (<>
    <Text style={s.sub}>{group.group_name} · Treasurer {group.treasurer?.name}</Text>
    <Tabs small tabs={circles.map((x) => ({ key: x.id, label: x.name }))} value={c.id} onChange={setCid} />

    <View style={[s.card, { borderColor: colors.bodaOrange }]}>
      <Text style={s.cardTitle}>{c.name} · Cycle {c.cycle_no}</Text>
      <Text style={s.big}>{fmt(c.saved_this_cycle)}</Text>
      <Text style={s.hint}>Saved this cycle · {fmt(c.amount)} · {c.sched_label}</Text>
      <View style={s.row}><Text style={s.k}>My turn{c.my_hands > 1 ? 's' : ''}</Text>
        <Text style={s.v}>{c.my_turns.length ? c.my_turns.map((t) => `Turn ${t.turn}`).join(' and ') : '—'} of {c.total_turns}</Text></View>
      {c.my_hands > 1 && <Text style={s.hint}>🔁 You have a double turn: you receive twice in this cycle.</Text>}
      <View style={[s.row, { borderBottomWidth: 0 }]}><Text style={s.k}>When I receive, I get about</Text><Text style={s.v}>{fmt(c.payout_estimate)}</Text></View>
      {c.my_turns.map((t) => <Text key={t.turn} style={s.hint}>Turn {t.turn}: {t.status === 'paid' ? 'received' : t.status === 'current' ? 'now' : niceDate(t.date)}</Text>)}
    </View>

    <View style={[s.banner, { backgroundColor: '#fff6ee' }]}><Text>{banner[0]}</Text><Text style={{ flex: 1, fontWeight: '700' }}>{banner[1]}</Text></View>
    {R && (
      <View style={s.card}>
        <Text style={s.label}>POOL THIS ROUND</Text><Text style={s.big}>{fmt(R.pot)}</Text>
        <Text style={s.hint}>Round {R.round_no} · Turn {R.turn_no} goes to {R.recipient} · {R.paid_count} of {R.member_count} have paid · due {niceDate(R.deadline)}</Text>
        {R.hands_owing > 1 && <Text style={s.hint}>You pay for {R.hands_owing} turns this round.</Text>}
      </View>)}
    {(c.notes || []).map((n) => (
      <View key={n.name} style={s.banner}><Text>📝</Text><Text style={{ flex: 1 }}>{n.name}: {n.reason}{n.note ? ` · ${n.note}` : ''}. The group has agreed, so the pool is paid out without it.</Text></View>))}
    {R && !R.i_receive && R.owed > 0 && R.pending <= 0 && (
      <PrimaryButton label="Pay Contribution →" onPress={() => navigation.navigate('ChamaPay', {
        kind: 'contribution', amount: R.owed, treasurer: group.treasurer, groupId: group.group_id, circleId: c.id })} />)}


    <Text style={[s.cardTitle, { marginTop: 14 }]}>Payout schedule</Text>
    {c.schedule.length === 0 && <Text style={s.hint}>The order has not been set yet.</Text>}
    {c.schedule.map((x) => (
      <View key={`${x.turn}-${x.hand_no}`} style={[s.row, x.mine && { backgroundColor: '#fff6ee' }]}>
        <Text style={s.k}>{x.turn}. {x.mine ? 'You' : x.name}{x.status === 'current' ? ' 🎁 now' : ''}{x.status === 'paid' ? ' ✓' : ''}</Text>
        <Text style={s.v}>{x.status === 'paid' ? 'Received' : niceDate(x.date)}</Text></View>))}

    {/* Turn swaps */}
    <Text style={[s.cardTitle, { marginTop: 14 }]}>🔁 Turn swaps</Text>
    {mySwaps.filter((x) => x.needs_my_agreement || ['member', 'treasurer'].includes(x.stage)).map((x) => (
      <SwapCard key={x.id} x={x} waitDays={c.swap?.waiting_days}
        onAgree={(y) => act(() => mgrSwapAgree(y.id), 'Agreed. Now waiting for the Treasurer.', 'Could not agree.')}
        onCancel={(y) => act(() => mgrSwapCancel(y.id), 'Swap request cancelled.', 'Could not cancel.')} />))}
    {c.swap?.can_request
      ? <PrimaryButton label="🔁 Request a Turn Swap" onPress={() => navigation.navigate('SwapRequest', { circle: c, groupId: group.group_id })} />
      : <Text style={s.hint}>{R ? 'You have no upcoming turn that can be swapped right now.' : 'Swaps open once the circle starts.'}</Text>}
    {c.swap && <Text style={s.hint}>The other rider can only agree. A request nobody answers closes by itself after {c.swap.waiting_days} days, or when its turn arrives.</Text>}
    {mySwaps.filter((x) => !(x.needs_my_agreement || ['member', 'treasurer'].includes(x.stage))).slice(0, 3).map((x) => (
      <SwapCard key={x.id} x={x} waitDays={c.swap?.waiting_days} onAgree={() => {}} onCancel={() => {}} />))}

    {history.length > 0 && (<>
      <Text style={[s.cardTitle, { marginTop: 14 }]}>Activity history</Text>
      {history.map((a, i) => (
        <View key={`${a.kind}-${a.id || i}`} style={s.row}>
          <Text style={[s.k, { flex: 3 }]}>{a.kind === 'payout' ? `💸 ${a.to} received ${fmt(a.amount)} (Turn ${a.turn_no})`
            : `🔁 ${swapStatus(a).head}: ${a.effect?.text || ''}`}</Text>
          <Text style={[s.v, { flex: 1 }]}>{niceDateTime(a.at)}</Text></View>))}
    </>)}
  </>);
}
