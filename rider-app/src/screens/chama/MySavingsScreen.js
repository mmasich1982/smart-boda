// rider-app/src/screens/chama/MySavingsScreen.js
// My Savings: type tabs (Merry-Go-Round | Table Banking), then one tab per group of that type.
// A rider can be in several groups; each tab shows that group's savings (circles and cycles for a Merry-Go-Round).
import React, { useCallback, useState } from 'react';
import { withChamaOnlineGate } from '../../components/ChamaOnlineGate';   // My Savings / My Loans / My Chama require an internet connection
import { ScrollView, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import BackLink from '../../components/BackLink';
import TbSavingsView from './TbSavingsView';
import MgrSavingsView from './MgrSavingsView';
import { mySavings, apiError } from '../../api/groupsClient';
import { s, fmt } from './chamaStyles';
import { GroupPicker, useGroupPicker } from './common';
import TreasurerJoinCard from './TreasurerJoinCard';
import useChamaMembership from '../../hooks/useChamaMembership';
import { useGroupText } from './groupText';

function MySavingsScreen({ navigation, route }) {
  const gt = useGroupText();
  const { treasurerGroups } = useChamaMembership();
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const load = useCallback(() => mySavings().then((r) => { setData(r); setErr(null); })
    .catch((e) => setErr(apiError(e, 'Could not load. Check your connection.'))), []);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  const groups = data?.groups || [];
  const pick = useGroupPicker(groups, route?.params?.groupId);
  const g = pick.group;
  const notMember = data ? (treasurerGroups || []).filter((tg) => !groups.some((x) => x.group_id === tg.group_id)) : [];   // groups I run but have not joined
  return (
    <ScrollView style={s.page} contentContainerStyle={{ padding: 16 }}>
      <BackLink onPress={() => navigation.navigate('Home')} label="← Home" />
      <Text style={s.title}>🏦 {gt('group.title_my_savings', 'My Savings')}</Text>
      {!!err && <View style={s.card}><Text>{err}</Text></View>}
      {data && groups.length === 0 && notMember.length === 0 && <View style={s.card}><Text>{gt('group.no_group_yet', 'You are not in a group yet. Your Treasurer adds you using your mobile number.')}</Text></View>}
      {data && data.totals && groups.length > 1 && (
        <Text style={s.sub}>
          {Number(data.totals.table_banking) > 0 ? `Table Banking savings ${fmt(data.totals.table_banking)}` : ''}
          {Number(data.totals.table_banking) > 0 && Number(data.totals.merry_go_round_this_cycle) > 0 ? ' · ' : ''}
          {Number(data.totals.merry_go_round_this_cycle) > 0 ? `Merry-Go-Round this cycle ${fmt(data.totals.merry_go_round_this_cycle)}` : ''}
        </Text>)}
      <GroupPicker pick={pick} />
      <TreasurerJoinCard navigation={navigation} groups={notMember} what="savings" />
      {g && g.group_type === 'tb' && <TbSavingsView key={g.group_id} navigation={navigation} groupId={g.group_id} />}
      {g && g.group_type === 'mgr' && <MgrSavingsView key={g.group_id} navigation={navigation} group={g} reload={load} />}
    </ScrollView>);
}

// Online-required module: shows a professional "internet connection required" message while offline.
export default withChamaOnlineGate(MySavingsScreen, 'savings');
