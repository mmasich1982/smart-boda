// rider-app/src/screens/chama/MgrTurnsView.js
// "Members Turns for Receiving Money" for ONE Merry-Go-Round circle (Smart_Boda_Prototype_v43):
//   My Turn for Receiving the Money card -> my turn-swap card -> round progress -> filter chips -> the list of every turn, 10 to a page.
//
// Swaps: the other rider can only AGREE. The rider who asked can CANCEL. There is no decline.
import React, { useState } from 'react';
import { View, Text } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useToast } from '../../components/Toast';
import { apiError, mgrSwapAgree, mgrSwapCancel } from '../../api/groupsClient';
import { fmt } from './chamaStyles';
import { first } from './common';
import { Btn, Card, FilterChips, Pager, Badge, longDate, DISPLAY_FONT } from './mgrUi';
import colors from '../../theme/colors';

const PAGE_SIZE = 10;
const PILL = { paid: ['green', '✓ Received'], next: ['amber', '⏭ Next to receive'], upcoming: ['grey', 'Yet to receive'] };
const DOT_BG = { paid: colors.signalGreenBg, next: colors.signalAmberBg, upcoming: '#eeeeee' };

/** The card that tells the rider where their turn swap stands. */
function SwapCard({ x, waitDays, onAgree, onCancel }) {
  const open = x.stage === 'member' || x.stage === 'treasurer';
  const other = x.i_asked ? first(x.b) : first(x.a);
  const title = x.i_asked ? `🔁 Turn Swap with ${x.b}` : `🔁 Turn Swap with ${x.a}`;
  let tone = { bg: colors.signalAmberBg, bd: colors.signalAmber }, head, hint, buttons = null;

  if (x.needs_my_agreement) {
    head = `⏳ Do you agree? ${other} wants your Turn ${x.turn_b}.`;
    hint = x.effect?.text || 'Your Treasurer approves the swap after you agree.';
    buttons = <Btn small label="Agree" onPress={() => onAgree(x)} style={{ marginTop: 6 }} />;
  } else if (x.stage === 'member') {
    head = `⏳ Waiting for ${other} to agree`;
    hint = `Your Treasurer approves the swap after ${other} agrees.`;
    buttons = <Btn small ghost label="Cancel request" onPress={() => onCancel(x)} style={{ marginTop: 6, alignSelf: 'stretch' }} />;
  } else if (x.stage === 'treasurer') {
    head = '⏳ Waiting for Treasurer approval';
    hint = `${other} has agreed. Your turn stays the same until the Treasurer approves.`;
    buttons = x.i_asked ? <Btn small ghost label="Cancel request" onPress={() => onCancel(x)} style={{ marginTop: 6, alignSelf: 'stretch' }} /> : null;
  } else if (x.stage === 'done') {
    tone = { bg: colors.signalGreenBg, bd: colors.signalGreen };
    head = '✅ Swap approved';
    hint = x.effect?.text || '';
  } else if (x.stage === 'expired') {
    tone = { bg: '#f3f3f3', bd: colors.line };
    head = '⌛ Swap request expired';
    hint = x.note || 'Nobody answered in time, so the request closed by itself.';
  } else {
    tone = { bg: '#fdecec', bd: colors.signalRed };
    head = '❌ Swap not approved';
    hint = x.note || 'Your Treasurer declined this request.';
  }
  return (
    <Card style={{ backgroundColor: tone.bg, borderColor: tone.bd }}>
      <Text style={ss.cardTitle}>{title}</Text>
      <Text style={ss.head}>{head}</Text>
      {!!hint && <Text style={ss.hint}>{hint}</Text>}
      {open && <Text style={ss.hint}>Closes by itself if nobody answers within {waitDays || 7} days.</Text>}
      {buttons}
    </Card>);
}

export default function MgrTurnsView({ group, c, st, navigation, reload, onBack }) {
  const { showToast } = useToast();
  const [filter, setFilter] = useState('all');
  const [page, setPage] = useState(1);
  const all = st.turns, me = st.me;

  const act = async (fn, ok, bad) => {
    try { await fn(); showToast(ok, 'success'); reload && reload(); } catch (e) { showToast(apiError(e, bad), 'warn'); }
  };

  const count = (k) => (k === 'all' ? all.length : all.filter((t) => t.status === k).length);
  const list = all.filter((t) => filter === 'all' || t.status === filter);
  const totalPages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
  const pg = Math.min(page, totalPages);
  const pageItems = list.slice((pg - 1) * PAGE_SIZE, pg * PAGE_SIZE);
  const paid = all.filter((t) => t.status === 'paid').length;

  const mineNos = all.filter((t) => t.mine);
  const shown = mineNos.filter((t) => t.status !== 'paid').length ? mineNos.filter((t) => t.status !== 'paid') : mineNos;
  const turnText = shown.length ? `${shown.map((t) => `Turn ${t.turn}`).join(' and ')} of ${c.total_turns}` : '—';
  const before = me ? Math.max(0, me.turn - (c.current_turn || 1)) : 0;
  const mineMsg = !me ? 'Your Treasurer has not set your turn yet.'
    : me.status === 'paid' ? 'You have received your money'
    : me.status === 'next' ? "You're next to receive the money!"
    : `${before} more member${before === 1 ? ' receives' : 's receive'} money before you`;
  const estimate = me && me.status !== 'paid' && Number(c.payout_estimate) > 0 ? ` · Money to be received: ${fmt(c.payout_estimate)}` : '';

  // Swaps: anything waiting for my agreement, plus the newest request I made that was not cancelled.
  const swaps = c.swaps || [];
  const incoming = swaps.filter((x) => x.needs_my_agreement);
  const mine = swaps.filter((x) => x.i_asked && x.stage !== 'cancelled')[0];
  const cards = [...incoming, ...(mine && !incoming.includes(mine) ? [mine] : [])];

  return (<>
    <Btn ghost label="← My Savings" onPress={onBack} testID="turns-back" />

    <LinearGradient colors={['#fff6ee', '#ffffff']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={ss.myTurn}>
      <Text style={ss.cardTitle}>🎯 My Turn for Receiving the Money</Text>
      <Text style={ss.turnBig}>{turnText}</Text>
      {!!me && <Text style={ss.payDate}>{me.status === 'paid' ? 'Received on:' : 'Receiving date:'} {me.date ? longDate(me.date) : '—'}</Text>}
      <Text style={ss.turnMsg}>{mineMsg}{estimate}</Text>
      {c.my_hands > 1 && <Text style={ss.turnMsg}>🔁 You have a double turn: you receive twice in this cycle.</Text>}
      {!!me && me.status === 'upcoming' && !!c.swap?.can_request && (
        <Btn small ghost label="🔁 Request a Turn Swap" style={{ marginTop: 10 }}
          onPress={() => navigation.navigate('SwapRequest', { circle: c, groupId: group.group_id })} />)}
    </LinearGradient>

    {cards.map((x) => (
      <SwapCard key={x.id} x={x} waitDays={c.swap?.waiting_days}
        onAgree={(y) => act(() => mgrSwapAgree(y.id, group.group_id), 'Agreed. Now waiting for the Treasurer.', 'Could not agree.')}
        onCancel={(y) => act(() => mgrSwapCancel(y.id, group.group_id), 'Swap request cancelled.', 'Could not cancel.')} />))}

    <Card>
      <View style={ss.progressHead}>
        <Text style={ss.progressTxt}>Round progress</Text>
        <Text style={ss.progressTxt}>{paid} of {all.length} paid</Text>
      </View>
      <View style={ss.barBg}><View style={[ss.barFill, { width: `${all.length ? (paid / all.length) * 100 : 0}%` }]} /></View>
    </Card>

    <FilterChips value={filter} onChange={(k) => { setFilter(k); setPage(1); }}
      chips={[['all', 'All'], ['paid', 'Received'], ['next', 'Next'], ['upcoming', 'Yet to receive']].map(([k, l]) => ({ key: k, label: `${l} (${count(k)})` }))} />

    <Card>
      {list.length === 0 && <Text style={ss.empty}>{all.length === 0 ? 'The order has not been set yet.' : 'No turns in this group.'}</Text>}
      {pageItems.map((t, i) => (
        <View key={t.key} style={[ss.row, i === pageItems.length - 1 && { borderBottomWidth: 0 }, t.mine && ss.rowMine]}>
          <View style={ss.rowLeft}>
            <View style={[ss.dot, { backgroundColor: DOT_BG[t.status] }]}><Text style={ss.dotTxt}>{t.turn}</Text></View>
            <View style={{ flex: 1 }}>
              <Text style={[ss.name, t.mine && { fontWeight: '800' }]}>{t.name}{t.mine ? ' ⭐' : ''}</Text>
              <Text style={ss.when}>{t.status === 'paid' ? 'Received' : 'Scheduled'}{(t.status === 'paid' ? t.paid_at : t.date) ? ` · ${longDate(t.status === 'paid' ? t.paid_at : t.date)}` : ''}{t.self_paid ? ' · self-paid' : ''}</Text>
            </View>
          </View>
          <Badge tone={PILL[t.status][0]}>{PILL[t.status][1]}</Badge>
        </View>))}
      <Pager page={pg} totalPages={totalPages} total={list.length} pageSize={PAGE_SIZE} onPage={setPage} />
    </Card>
  </>);
}

const ss = {
  myTurn: { borderRadius: 16, borderWidth: 1.5, borderColor: colors.bodaOrange, padding: 14, marginBottom: 14, overflow: 'hidden' },
  cardTitle: { fontWeight: '700', fontSize: 13.5, color: colors.ink, marginBottom: 4 },
  turnBig: { fontFamily: DISPLAY_FONT, fontSize: 26, fontWeight: '700', color: colors.bodaOrangeDark, marginVertical: 6 },
  payDate: { fontSize: 12.5, fontWeight: '600', color: colors.ink },
  turnMsg: { fontSize: 11.5, color: colors.inkSoft, marginTop: 3 },
  head: { fontWeight: '700', fontSize: 12.5, color: colors.ink },
  hint: { fontSize: 11.5, color: colors.inkSoft, marginTop: 6, lineHeight: 17 },
  progressHead: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  progressTxt: { fontSize: 12, fontWeight: '700', color: colors.ink },
  barBg: { height: 8, backgroundColor: '#eeeeee', borderRadius: 99, overflow: 'hidden' },
  barFill: { height: 8, backgroundColor: colors.signalGreen },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 11, paddingHorizontal: 6, borderBottomWidth: 1, borderBottomColor: colors.line, gap: 8 },
  rowMine: { backgroundColor: '#fff6ee', borderRadius: 10 },
  rowLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  dot: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  dotTxt: { fontSize: 11.5, fontWeight: '800', color: colors.ink },
  name: { fontSize: 12.5, fontWeight: '600', color: colors.ink },
  when: { fontSize: 11, color: colors.inkSoft, marginTop: 1 },
  empty: { fontSize: 11.5, color: colors.inkSoft, paddingVertical: 6 },
};