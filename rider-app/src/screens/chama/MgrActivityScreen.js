// rider-app/src/screens/chama/MgrActivityScreen.js
// Activity history of a group's circles: every swap (all stages, including cancelled and expired) and every payout.
import React, { useCallback, useState } from 'react';
import { withChamaOnlineGate } from '../../components/ChamaOnlineGate';
import { View, Text, ScrollView } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import BackLink from '../../components/BackLink';
import { mgrActivity, apiError } from '../../api/groupsClient';
import { s, fmt } from './chamaStyles';
import { niceDateTime, swapStatus, TONE_BG } from './common';
import { useGroupText } from './groupText';

function MgrActivityScreen({ navigation, route }) {
  const gt = useGroupText();
  const { groupId, circleId } = route.params || {};
  const [rows, setRows] = useState(null), [err, setErr] = useState(null);
  useFocusEffect(useCallback(() => {
    mgrActivity(groupId).then((r) => { setRows(circleId ? r.filter((x) => x.circle_id === circleId) : r); setErr(null); })
      .catch((e) => { setRows([]); setErr(apiError(e, 'Could not load. Check your connection.')); });
  }, [groupId, circleId]));
  return (
    <ScrollView style={s.page} contentContainerStyle={{ padding: 16 }}>
      <BackLink onPress={() => navigation.goBack()} />
      <Text style={s.title}>🕘 {gt('group.title_activity', 'Activity')}</Text>
      <Text style={s.sub}>Payouts and turn swaps, newest first.</Text>
      {err && <View style={s.card}><Text>{err}</Text></View>}
      {rows && rows.length === 0 && !err && <Text style={s.hint}>Nothing yet.</Text>}
      {(rows || []).map((x, i) => {
        if (x.kind === 'payout') return (
          <View key={`p${i}`} style={s.card}>
            <Text style={s.hint}>{niceDateTime(x.at)} · {x.circle}</Text>
            <Text style={{ fontWeight: '700' }}>💸 {x.to} received {fmt(x.amount)} (Turn {x.turn_no})</Text>
          </View>);
        const st = swapStatus(x);
        return (
          <View key={x.id} style={[s.card, { backgroundColor: TONE_BG[st.tone] }]}>
            <Text style={s.hint}>{niceDateTime(x.at)} · {x.circle}</Text>
            <Text style={{ fontWeight: '700' }}>{st.icon} {x.effect?.text || `${x.a} ↔ ${x.b}`}</Text>
            <Text style={s.hint}>{st.head}{x.stage !== 'done' && st.hint ? ` · ${st.hint}` : ''}</Text>
          </View>);
      })}
    </ScrollView>);
}

export default withChamaOnlineGate(MgrActivityScreen, 'chama');
