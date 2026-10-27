// rider-app/src/screens/chama/TbSavingsView.js
// Table Banking savings of ONE group: what I have saved, what is locked as loan security, what is free, the group's
// contribution rule, pay contribution, history.
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import PrimaryButton from '../../components/PrimaryButton';
import { mySummary, completeSeen, apiError } from '../../api/groupsClient';
import { s, fmt } from './chamaStyles';
import { registerTbHistoryGroup } from '../../offline/chamaTbHistorySync';
import colors from '../../theme/colors';

export default function TbSavingsView({ navigation, groupId }) {
  const [d, setD] = useState(null);
  const [err, setErr] = useState(null);
  useEffect(() => { registerTbHistoryGroup(groupId).catch(() => {}); }, [groupId]);   // keep this group's payments history up to date in the background
  useFocusEffect(useCallback(() => {
    mySummary(groupId).then((r) => { setD(r); setErr(null); completeSeen(['contribution_confirmed', 'contribution_rejected']); })
      .catch((e) => setErr(apiError(e, 'Could not load. Check your connection.')));
  }, [groupId]));
  return (
    <>
      {err && <View style={s.card}><Text>{err}</Text></View>}
      {d && (<>
        <Text style={s.sub}>{d.group} · Treasurer {d.treasurer?.name}</Text>
        <View style={[s.card, { borderColor: colors.bodaOrange }]}>
          <Text style={s.cardTitle}>My Table Banking savings</Text>
          <Text style={s.big}>{fmt(d.savings)}</Text>
          <Text style={s.hint}>Your savings stay invested in the group.</Text>
          {Number(d.locked) > 0 && (<>
            <View style={s.row}><Text style={s.k}>🔒 Locked as loan security</Text><Text style={s.v}>{fmt(d.locked)}</Text></View>
            <View style={[s.row, { borderBottomWidth: 0 }]}><Text style={s.k}>Free to use</Text><Text style={s.v}>{fmt(d.free)}</Text></View>
            <Text style={s.hint}>Locked savings are released when the loan is fully paid.</Text>
          </>)}
        </View>
        {Number(d.opening?.savings) > 0 && (
          <View style={s.card}>
            <Text style={s.cardTitle}>Opening balance (recorded by your Treasurer)</Text>
            <View style={s.row}><Text style={s.k}>Opening savings</Text><Text style={s.v}>{fmt(d.opening.savings)}</Text></View>
            <Text style={s.hint}>Your savings above = this opening balance + every contribution your Treasurer has confirmed.</Text>
          </View>)}
        {d.pending_contributions_total > 0 && (
          <View style={s.banner}><Text>⏳</Text><Text style={{ flex: 1, fontWeight: '700' }}>{fmt(d.pending_contributions_total)} awaiting Treasurer confirmation</Text></View>)}
        <View style={s.card}>
          <Text style={s.cardTitle}>📋 Group Contribution Rule</Text>
          <View style={s.row}><Text style={s.k}>Agreed contribution 🔒</Text><Text style={s.v}>{d.category ? `${fmt(d.category.amount)} · ${d.category.freq}` : 'Not set'}</Text></View>
          {!!d.rules?.meeting?.day && <View style={s.row}><Text style={s.k}>Group meets</Text>
            <Text style={s.v}>{[d.rules.meeting.week, d.rules.meeting.day].filter(Boolean).join(' ')}</Text></View>}
        </View>
        <PrimaryButton label="Pay Contribution →"
          onPress={() => navigation.navigate('ChamaPay', { kind: 'contribution', amount: d.category?.amount, treasurer: d.treasurer, groupId: d.group_id })} />
        <TouchableOpacity testID="open-history" onPress={() => navigation.navigate('TbHistory', { groupId: d.group_id, kind: 'savings' })}>
          <Text style={{ color: colors.bodaOrange, fontWeight: '800', marginVertical: 14 }}>📈 My Payments History ›</Text></TouchableOpacity>
        <Text style={s.hint}>Your contributions and loan repayments by month, with totals. Saved on your phone, so it also opens offline.</Text>
      </>)}
    </>);
}
