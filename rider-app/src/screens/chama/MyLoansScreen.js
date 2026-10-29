// rider-app/src/screens/chama/MyLoansScreen.js
// My Loans: one tab per Table Banking group the rider belongs to (Table Banking 1, 2 ...). Merry-Go-Round groups have no loans.
import React, { useCallback, useState } from 'react';
import { withChamaOnlineGate } from '../../components/ChamaOnlineGate';   // My Savings / My Loans / My Chama require an internet connection
import { ScrollView, Text, View, TouchableOpacity } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import BackLink from '../../components/BackLink';
import TbLoanView from './TbLoanView';
import { myLoans, guaranteeRequests, apiError } from '../../api/groupsClient';
import { s } from './chamaStyles';
import { Tabs } from './common';
import TreasurerJoinCard from './TreasurerJoinCard';
import useChamaMembership from '../../hooks/useChamaMembership';
import colors from '../../theme/colors';
import { useGroupText } from './groupText';

function MyLoansScreen({ navigation, route }) {
  const gt = useGroupText();
  const { treasurerGroups } = useChamaMembership();
  const [groups, setGroups] = useState(null);
  const [asks, setAsks] = useState(0);
  const [err, setErr] = useState(null);
  const [gid, setGid] = useState(route?.params?.groupId || null);
  useFocusEffect(useCallback(() => {
    myLoans().then((r) => { setGroups(r.groups || []); setErr(null); }).catch((e) => setErr(apiError(e, 'Could not load. Check your connection.')));
    guaranteeRequests().then((r) => setAsks((r || []).length)).catch(() => {});
  }, []));
  const list = groups || [];
  const g = list.find((x) => x.group_id === gid) || list[0];
  const notMember = groups ? (treasurerGroups || []).filter((tg) => tg.group_type === 'tb' && !list.some((x) => x.group_id === tg.group_id)) : [];   // Table Banking groups I run but have not joined
  return (
    <ScrollView style={s.page} contentContainerStyle={{ padding: 16 }}>
      <BackLink onPress={() => navigation.navigate('Home')} label="← Home" />
      <Text style={s.title}>💳 {gt('group.title_my_loans', 'My Loans')}</Text>
      <Text style={s.sub}>Borrow against your savings in your Table Banking group.</Text>
      {!!err && <View style={s.card}><Text>{err}</Text></View>}
      {asks > 0 && (
        <TouchableOpacity testID="guarantee-banner" style={[s.banner, { backgroundColor: '#fff6ee', borderColor: colors.bodaOrange }]} onPress={() => navigation.navigate('GuaranteeRequests')}>
          <Text>🤝</Text><Text style={{ flex: 1, fontWeight: '700' }}>{asks} member{asks > 1 ? 's' : ''} asked you to back a loan. Tap to answer.</Text><Text>›</Text>
        </TouchableOpacity>)}
      {groups && list.length === 0 && notMember.length === 0 && <View style={s.card}><Text>{gt('group.no_tb_group', 'You are not in a Table Banking group, so there are no loans here.')}</Text></View>}
      <TreasurerJoinCard navigation={navigation} groups={notMember} what="loans" />
      {list.length > 1 && <Tabs tabs={list.map((x, i) => ({ key: x.group_id, label: `📒 ${x.group_name}` }))} value={g?.group_id} onChange={setGid} />}
      {g && <TbLoanView key={g.group_id} navigation={navigation} groupId={g.group_id} />}
    </ScrollView>);
}

// Online-required module: shows a professional "internet connection required" message while offline.
export default withChamaOnlineGate(MyLoansScreen, 'loans');
