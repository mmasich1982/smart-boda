// rider-app/src/screens/chama/TreasurerJoinCard.js
// Shown on My Savings / My Loans to a Treasurer who is not yet a MEMBER of the group they run.
// Savings and loans belong to a member (opening balance, contribution category), so the Treasurer adds themselves once, like any member.
// After that they pay, borrow and repay here, and confirm their own payments and loans in Manage Chama (for now the Treasurer approves their own).
import React from 'react';
import { View, Text } from 'react-native';
import PrimaryButton from '../../components/PrimaryButton';
import { s } from './chamaStyles';

/** groups: the Treasurer's groups where they are not a member yet. what: 'savings' | 'loans'. */
export default function TreasurerJoinCard({ navigation, groups, what }) {
  if (!groups || groups.length === 0) return null;
  return (
    <>
      {groups.map((g) => (
        <View key={g.group_id} style={[s.card, { borderColor: '#ff7a1a' }]} testID={`treasurer-join-${g.group_id}`}>
          <Text style={s.cardTitle}>🤝 {g.group_name}</Text>
          <Text style={s.hint}>
            You are the Treasurer of this group. To {what === 'loans' ? 'borrow' : 'save'} in it yourself, add yourself as a member first.
            You will confirm your own {what === 'loans' ? 'loans and repayments' : 'contributions'} in Manage Chama.
          </Text>
          <View style={{ marginTop: 8 }}>
            {g.group_type === 'tb'
              ? <PrimaryButton label="➕ Add myself as a member" onPress={() => navigation.navigate('AddChamaMember', { groupId: g.group_id, type: 'tb', self: true })} />
              : <PrimaryButton label="Open Members & rules" onPress={() => navigation.navigate('MgrSetup', { groupId: g.group_id })} />}
          </View>
        </View>))}
    </>);
}
