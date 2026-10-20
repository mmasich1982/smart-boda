// rider-app/src/screens/chama/ChamaLoansScreen.js
import React from 'react';
import { withChamaOnlineGate } from '../../components/ChamaOnlineGate';   // My Savings / My Loans / My Chama require an internet connection
import { ScrollView, Text, TouchableOpacity } from 'react-native';
import BackLink from '../../components/BackLink';
import { s } from './chamaStyles';
import { useGroupText } from './groupText';

function ChamaLoansScreen({ navigation, route }) {
  const groupId = route.params?.groupId;
  const gt = useGroupText();
  const Row = ({ label, kind }) => (
    <TouchableOpacity style={s.card} onPress={() => navigation.navigate('ChamaQueue', { kind, groupId })}>
      <Text style={{ fontWeight: '800' }}>{label} ›</Text></TouchableOpacity>);
  return (
    <ScrollView style={s.page} contentContainerStyle={{ padding: 16 }}>
      <BackLink onPress={() => navigation.goBack()} label="← Manage Chama" />
      <Text style={s.title}>💳 {gt('group.title_loans', 'Loans')}</Text>
      <Row label="Loan Requests" kind="loanRequests" />
      <Row label="Loan Repayments" kind="repayments" />
      <TouchableOpacity style={s.card} onPress={() => navigation.navigate('SecurityHeld', { groupId })}>
        <Text style={{ fontWeight: '800' }}>🔒 Security held ›</Text></TouchableOpacity>
    </ScrollView>);
}

// Online-required module: shows a professional "internet connection required" message while offline.
export default withChamaOnlineGate(ChamaLoansScreen, 'chama');
