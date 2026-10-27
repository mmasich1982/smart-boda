// rider-app/src/screens/chama/MgrPayoutScreen.js
// "Give Money to Member" for one Merry-Go-Round round (Smart_Boda_Prototype_v44):
//   round tabs -> who this round goes to + amount collected -> who still has to pay / "Everyone has paid"
//   -> Pay the Receiving Member · Who has paid · Note a reason -> Turn Swap Requests.
// The pool can be paid out once every member who owes has paid, or the Treasurer has noted an exception.
// With "Recipient also contributes" on, the recipient is one of the payers too (the server works that out).
import React, { useCallback, useState } from 'react';
import { withChamaOnlineGate } from '../../components/ChamaOnlineGate';
import { ScrollView, Text, View, TouchableOpacity } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import BackLink from '../../components/BackLink';
import { useToast } from '../../components/Toast';
import { mgrCircle, mgrUnnote, chamaOverview, apiError } from '../../api/groupsClient';
import { s, fmt } from './chamaStyles';
import { Btn, Card, Notice, ScreenTitle, longDate, DISPLAY_FONT } from './mgrUi';
import { GroupLine, CircleTabs, MoreInfo } from './manageUi';
import useManageChama from './useManageChama';
import { first } from './common';
import colors from '../../theme/colors';

function MgrPayoutScreen({ navigation }) {
  const m = useManageChama();
  const { showToast } = useToast();
  const gid = m.gid, cid = m.circle?.id;
  const [d, setD] = useState(null), [swaps, setSwaps] = useState(0), [err, setErr] = useState(null), [why, setWhy] = useState(false);

  const load = useCallback(() => {
    if (!gid || !cid) { setD(null); return Promise.resolve(); }
    chamaOverview(gid).then((o) => setSwaps(Number(o?.pending_swaps || 0))).catch(() => {});
    return mgrCircle(cid, gid).then((r) => { setD(r); setErr(null); }).catch((e) => setErr(apiError(e, 'Could not load. Check your connection.')));
  }, [gid, cid]);
  useFocusEffect(useCallback(() => { load(); return undefined; }, [load]));

  const R = d && d.id === cid ? d.round : null;
  const total = d && d.id === cid ? (d.turns || []).length : 0;
  const unpaid = R ? R.unpaid : [];
  const pct = R && R.member_count ? Math.min(100, (R.paid_count / R.member_count) * 100) : 0;
  const go = (to) => navigation.navigate(to, { groupId: gid });

  return (
    <ScrollView style={s.page} contentContainerStyle={{ padding: 16 }}>
      <BackLink onPress={() => navigation.navigate('ManageChama')} label="← Manage Chama" />
      <ScreenTitle>💸 Give Money to Member</ScreenTitle>
      <GroupLine type="mgr" name={m.group?.group_name} />
      <CircleTabs m={m} />
      {!!err && <Card><Text>{err}</Text></Card>}
      {m.circles && m.circles.length === 0 && <Notice tone="amber" icon="🔄" title="No round yet" sub="Open Members & rules to make one." />}

      {d && d.id === cid && !R && (
        <Notice tone="amber" icon="⏳" title={d.status === 'draft' ? 'This round has not started yet' : 'Waiting for the new season'}
          sub="Open Members & rules to finish the set-up and save the round." />)}

      {R && (<>
        <LinearGradient colors={['#fff6ee', '#ffffff']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={p.goes}>
          <Text style={p.goesLbl}>THIS ROUND GOES TO</Text>
          <Text style={p.goesName}>{R.recipient}{R.recipient_is_treasurer ? ' (you)' : ''}</Text>
          <Text style={p.goesTurn}>Turn {R.turn_no} of {total}</Text>
          <Text style={p.goesAmt}>{fmt(R.pot)}</Text>
          <Text style={p.goesSub}>collected so far · due {longDate(R.deadline)}</Text>
          <View style={p.bar}><View style={[p.barFill, { width: `${pct}%`, backgroundColor: R.can_pay ? colors.signalGreen : colors.signalAmber }]} /></View>
          <Text style={p.goesPaid}>{R.paid_count} of {R.member_count} members have paid</Text>
          {R.contrib_count > 1 && <Text style={[p.goesSub, { marginTop: 4 }]}>Each person pays {R.contrib_count} × {fmt(R.unit_amount)} = {fmt(R.amount_per_member)} this round.</Text>}
        </LinearGradient>

        {R.can_pay ? (
          <View style={p.ok}>
            <Text style={{ fontSize: 15 }}>✅</Text>
            <View style={{ flex: 1 }}><Text style={p.okTitle}>{(R.noted || []).length ? 'Everyone has paid or is noted' : 'Everyone has paid'}</Text><Text style={p.okSub}>You can pay out now.</Text></View>
          </View>
        ) : (unpaid.length > 0 ? (
          <View style={p.wait}>
            <Text style={{ fontSize: 15 }}>⏳</Text>
            <View style={{ flex: 1 }}>
              <Text style={p.waitTitle}>Waiting for {unpaid.length} member{unpaid.length === 1 ? '' : 's'} to pay{' '}
                <Text onPress={() => setWhy(!why)} accessibilityRole="button" style={p.info}>ⓘ</Text></Text>
              {unpaid.map((x) => <Text key={x.member_id} style={p.bullet}>• {x.name}</Text>)}
              {why && <Text style={p.whyTxt}>The pool is paid out once every member who owes has paid, or you have noted an exception for someone who cannot.</Text>}
            </View>
          </View>) : (R.block ? <Notice tone="amber" icon="⏳" title={R.block} /> : null))}

        <Btn glow={R.can_pay} label={R.can_pay ? `💸 Pay ${fmt(R.pot)} to ${R.recipient_is_treasurer ? 'yourself' : first(R.recipient)} →` : '💸 Pay the Receiving Member (not yet)'} disabled={!R.can_pay}
          onPress={() => go('MgrConfirmPayout')} testID="payout-go" />
        <Btn ghost label="📋 Who has paid →" onPress={() => go('MgrRoster')} testID="payout-roster" />

        {(R.noted || []).length > 0 && (
          <Card>
            <Text style={p.cardTitle}>📝 Noted by you · members can see this</Text>
            {R.noted.map((x) => (
              <View key={x.member_id} style={p.noted}>
                <View style={{ flex: 1 }}>
                  <Text style={p.notedName}>{x.name}</Text>
                  <Text style={s.hint}>{x.reason}{x.note ? ` · ${x.note}` : ''} · owes {fmt(x.owed)}</Text>
                </View>
                <TouchableOpacity accessibilityRole="button" onPress={() => mgrUnnote(cid, x.member_id, gid).then(() => { showToast('Note removed.', 'success'); load(); }).catch((e) => showToast(apiError(e, 'Could not remove.'), 'warn'))}>
                  <Text style={p.remove}>Undo</Text>
                </TouchableOpacity>
              </View>))}
          </Card>)}

        {unpaid.length > 0 && (
          <Card>
            <Text style={p.cardTitle}>Someone cannot pay this time?</Text>
            <MoreInfo>Only for a death or an emergency. Write the reason here. Members will see it. The pool is paid out without that person's share.</MoreInfo>
            <Btn ghost label="📝 Note a reason" onPress={() => go('MgrException')} style={{ marginBottom: 0 }} testID="payout-exception" />
          </Card>)}
      </>)}

      <TouchableOpacity activeOpacity={0.8} onPress={() => go('MgrSwaps')} style={p.swap} accessibilityRole="button" testID="payout-swaps">
        <Text style={{ fontSize: 30 }}>🔁</Text>
        <View style={{ flex: 1 }}>
          <Text style={p.swapTitle}>Turn Swap Requests</Text>
          <Text style={s.hint}>{swaps ? `${swaps} swap${swaps === 1 ? '' : 's'} waiting` : 'No swaps waiting'}</Text>
        </View>
        <Text style={{ color: colors.inkSoft, fontSize: 22 }}>›</Text>
      </TouchableOpacity>
    </ScrollView>);
}

const p = {
  goes: { borderRadius: 18, borderWidth: 1.5, borderColor: colors.bodaOrange, padding: 16, alignItems: 'center', marginBottom: 14, overflow: 'hidden' },
  goesLbl: { fontSize: 13, color: colors.inkSoft, letterSpacing: 0.5 },
  goesName: { fontFamily: DISPLAY_FONT, fontSize: 22, fontWeight: '800', color: colors.ink, marginTop: 2 },
  goesTurn: { fontSize: 13, color: colors.inkSoft },
  goesAmt: { fontFamily: DISPLAY_FONT, fontSize: 40, fontWeight: '800', color: colors.bodaOrange, marginVertical: 6 },
  goesSub: { fontSize: 13, color: colors.inkSoft, textAlign: 'center' },
  bar: { alignSelf: 'stretch', height: 10, backgroundColor: '#eeeeee', borderRadius: 99, overflow: 'hidden', marginTop: 10 },
  barFill: { height: 10 },
  goesPaid: { fontSize: 14, fontWeight: '800', color: colors.ink, marginTop: 6 },
  ok: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', backgroundColor: colors.signalGreenBg, borderWidth: 1, borderColor: colors.signalGreen, borderRadius: 14, padding: 14, marginBottom: 14 },
  okTitle: { fontWeight: '800', fontSize: 14.5, color: colors.ink },
  okSub: { fontSize: 13.5, color: colors.inkSoft, marginTop: 2 },
  wait: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', backgroundColor: colors.signalAmberBg, borderWidth: 1, borderColor: colors.signalAmber, borderRadius: 14, padding: 14, marginBottom: 14 },
  waitTitle: { fontWeight: '800', fontSize: 14.5, color: colors.ink, marginBottom: 6 },
  bullet: { fontSize: 14.5, color: colors.ink, marginVertical: 5, marginLeft: 6 },
  info: { color: colors.bodaOrangeDark, fontWeight: '700' },
  whyTxt: { fontSize: 12.5, color: colors.inkSoft, lineHeight: 19, marginTop: 4 },
  cardTitle: { fontWeight: '800', fontSize: 16, color: colors.ink },
  noted: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  notedName: { fontWeight: '700', fontSize: 14, color: colors.ink },
  remove: { color: colors.signalRed, fontWeight: '800', fontSize: 13 },
  swap: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: '#fff', borderWidth: 1, borderColor: colors.line, borderRadius: 16, padding: 14, marginBottom: 14 },
  swapTitle: { fontWeight: '800', fontSize: 16, color: colors.ink },
};

export default withChamaOnlineGate(MgrPayoutScreen, 'chama');