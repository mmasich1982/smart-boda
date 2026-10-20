// rider-app/src/screens/chama/GroupLoansScreen.js
// Who in my Table Banking group is borrowing (names, balances, due dates) so members can see the fund working.
import React, { useCallback, useState } from 'react';
import { withChamaOnlineGate } from '../../components/ChamaOnlineGate';
import { View, Text, ScrollView } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import BackLink from '../../components/BackLink';
import { groupLoans, apiError } from '../../api/groupsClient';
import { s, fmt } from './chamaStyles';
import { niceDate } from './common';
import colors from '../../theme/colors';
import { useGroupText } from './groupText';

function GroupLoansScreen({ navigation, route }) {
  const gt = useGroupText();
  const groupId = route?.params?.groupId;
  const [d, setD] = useState(null), [err, setErr] = useState(null);
  useFocusEffect(useCallback(() => { groupLoans(groupId).then((r) => { setD(r); setErr(null); }).catch((e) => setErr(apiError(e, 'Could not load.'))); }, [groupId]));
  return (
    <ScrollView style={s.page} contentContainerStyle={{ padding: 16 }}>
      <BackLink onPress={() => navigation.goBack()} />
      <Text style={s.title}>👥 {gt('group.title_group_loans', 'Group Loans')}</Text>
      {!!err && <View style={s.card}><Text>{err}</Text></View>}
      {d && (<>
        <Text style={s.sub}>{d.group}</Text>
        <View style={[s.card, { borderColor: colors.bodaOrange }]}><Text style={s.label}>CASH IN THE GROUP FUND</Text><Text style={s.big}>{fmt(d.pool)}</Text></View>
        {d.loans.length === 0 && <Text style={s.hint}>Nobody is borrowing right now.</Text>}
        {d.loans.map((l, i) => (
          <View key={i} style={[s.card, l.mine && { borderColor: colors.bodaOrange }]}>
            <View style={s.row}><Text style={s.k}>{l.mine ? 'You' : l.member}</Text><Text style={s.v}>{fmt(l.balance)} still owed</Text></View>
            <Text style={[s.hint, l.overdue && { color: colors.signalRed }]}>Borrowed {fmt(l.principal)} · due {niceDate(l.due_date)}{l.overdue ? ' · ⚠️ overdue' : ''}</Text>
          </View>))}
      </>)}
    </ScrollView>);
}
export default withChamaOnlineGate(GroupLoansScreen, 'loans');
