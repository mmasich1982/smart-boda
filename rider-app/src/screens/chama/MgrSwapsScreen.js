// rider-app/src/screens/chama/MgrSwapsScreen.js
// Treasurer: approve or turn down turn swaps.
// Each card says what will change ("Amina moves from Turn 3 to Turn 6 and Joseph from Turn 6 to Turn 3")
// and warns when a double-turn rider would end up with two turns back to back.
// The other rider can only agree, and the requester can only cancel: there is no rider "decline" here.
import React, { useCallback, useState } from 'react';
import { withChamaOnlineGate } from '../../components/ChamaOnlineGate';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import BackLink from '../../components/BackLink';
import PrimaryButton from '../../components/PrimaryButton';
import { useToast } from '../../components/Toast';
import { mgrSwaps, mgrSwapApprove, mgrSwapDeclineAdmin, apiError } from '../../api/groupsClient';
import { s } from './chamaStyles';
import { niceDate, niceDateTime, swapStatus, TONE_BG, first } from './common';
import colors from '../../theme/colors';
import { useGroupText } from './groupText';

function MgrSwapsScreen({ navigation, route }) {
  const gt = useGroupText();
  const { showToast } = useToast();
  const { groupId, circleId } = route.params || {};
  const [rows, setRows] = useState(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => mgrSwaps(groupId).then((r) => setRows(circleId ? r.filter((x) => x.circle_id === circleId) : r))
    .catch((e) => { setRows([]); showToast(apiError(e, 'Could not load.'), 'warn'); }), [groupId, circleId]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function decide(x, ok) {
    if (busy) return;
    setBusy(true);
    try {
      const r = await (ok ? mgrSwapApprove(x.id, groupId) : mgrSwapDeclineAdmin(x.id, groupId));
      showToast(r.message || (ok ? 'Swap approved.' : 'Swap turned down.'), ok ? 'success' : 'warn');
    } catch (e) { showToast(apiError(e, 'Could not complete this.'), 'warn'); }
    finally { setBusy(false); load(); }
  }
  const waiting = (rows || []).filter((x) => x.stage === 'treasurer');
  const other = (rows || []).filter((x) => x.stage === 'member');
  const closed = (rows || []).filter((x) => !['treasurer', 'member'].includes(x.stage));
  return (
    <ScrollView style={s.page} contentContainerStyle={{ padding: 16 }}>
      <BackLink onPress={() => navigation.goBack()} />
      <Text style={s.title}>🔁 {gt('group.title_swap_requests', 'Turn swap requests')}</Text>
      <Text style={s.sub}>Riders ask each other. Once the other rider agrees, you approve here.</Text>
      {rows && waiting.length === 0 && <Text style={s.hint}>Nothing waiting for you. 🎉</Text>}
      {waiting.map((x) => (
        <View key={x.id} style={[s.card, { borderColor: colors.signalAmber }]} testID={`swap-${x.id}`}>
          <Text style={s.hint}>{x.circle}</Text>
          <Text style={{ fontWeight: '800', fontSize: 15 }}>{x.effect?.text}</Text>
          {!!x.reason && <Text style={s.hint}>“{x.reason}”</Text>}
          <Text style={s.hint}>{first(x.b)} agreed{x.agreed_at ? ` · ${niceDateTime(x.agreed_at)}` : ''}. Closes by itself on {niceDate(x.expires_at)}.</Text>
          {Object.entries(x.effect?.dates || {}).length > 0 && <Text style={s.hint}>Dates: {Object.entries(x.effect.dates).map(([t, d]) => `Turn ${t} ${niceDate(d)}`).join(' · ')}</Text>}
          {(x.effect?.warnings || []).map((w) => (
            <View key={w.text} style={s.banner}><Text>⚠️</Text><Text style={{ flex: 1, fontWeight: '700' }}>{w.text}</Text></View>))}
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 8, alignItems: 'center' }}>
            <View style={{ flex: 1 }}><PrimaryButton label="Approve swap" onPress={() => decide(x, true)} disabled={busy} /></View>
            <TouchableOpacity onPress={() => decide(x, false)} disabled={busy}><Text style={{ fontWeight: '800', color: colors.signalRed, padding: 8 }}>Do not approve</Text></TouchableOpacity>
          </View>
        </View>))}
      {other.length > 0 && (<>
        <Text style={[s.cardTitle, { marginTop: 14 }]}>Waiting for the other rider</Text>
        {other.map((x) => (
          <View key={x.id} style={s.card}>
            <Text style={s.hint}>{x.circle}</Text>
            <Text style={{ fontWeight: '700' }}>{x.effect?.text}</Text>
            <Text style={s.hint}>⏳ {first(x.b)} has not agreed yet. Closes by itself on {niceDate(x.expires_at)}.</Text>
          </View>))}
      </>)}
      {closed.length > 0 && (<>
        <Text style={[s.cardTitle, { marginTop: 14 }]}>Earlier requests</Text>
        {closed.map((x) => { const st = swapStatus(x); return (
          <View key={x.id} style={[s.card, { backgroundColor: TONE_BG[st.tone] }]}>
            <Text style={s.hint}>{x.circle} · {niceDateTime(x.closed_at || x.requested_at)}</Text>
            <Text style={{ fontWeight: '700' }}>{st.icon} {x.a} ↔ {x.b} · Turn {x.turn_a} and Turn {x.turn_b}</Text>
            <Text style={s.hint}>{st.head}{st.hint ? ` · ${st.hint}` : ''}</Text>
          </View>); })}
      </>)}
    </ScrollView>);
}

export default withChamaOnlineGate(MgrSwapsScreen, 'chama');
