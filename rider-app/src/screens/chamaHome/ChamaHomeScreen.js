// rider-app/src/screens/chamaHome/ChamaHomeScreen.js
// SMART CHAMA HOME: the small Home of a Chama member (or a Treasurer created as a Chama member).
//   Member    : My Savings, My Loans (Table Banking groups only), My Financial History and Statements, Logout
//   Treasurer : the same, plus Manage Chama and (Table Banking Treasurer only) Group Financial History and Statements, and the Chama Code card
// The tile rules are in chamaHomeRules.js. The group screens are the existing ones; nothing about the money rules changes.
import React, { useCallback } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Screen, Title, Sub, Card, Hint, Section, C } from '../business/BizUI';
import useChamaMembership from '../../hooks/useChamaMembership';
import { chamaHomeTiles } from './chamaHomeRules';
import { performLogout } from '../../offline/logout';
import { confirmAction } from '../../utils/confirmDialog';
import SignInNotice from '../../components/SignInNotice';
import { brandName, brandIcon } from '../../vehicle/vehicleStore';

const grid = { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', marginTop: 4 };
function Tile({ icon, label, onPress }) {
  return (
    <TouchableOpacity onPress={onPress} accessibilityRole="button" accessibilityLabel={label}
      style={{ width: '48.5%', backgroundColor: C.white, borderRadius: 14, borderWidth: 1, borderColor: C.line, paddingVertical: 18, paddingHorizontal: 10, alignItems: 'center', marginBottom: 10 }}>
      <Text style={{ fontSize: 24 }}>{icon}</Text>
      <Text style={{ fontSize: 13, fontWeight: '700', color: C.ink, textAlign: 'center', marginTop: 4 }}>{label}</Text>
    </TouchableOpacity>
  );
}
function Row({ label, onPress }) {
  return (
    <TouchableOpacity onPress={onPress} accessibilityRole="button" style={{ paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.line }}>
      <Text style={{ fontSize: 15, fontWeight: '700', color: C.ink }}>{label}</Text>
    </TouchableOpacity>
  );
}

export default function ChamaHomeScreen({ navigation }) {
  const m = useChamaMembership();
  const t = chamaHomeTiles(m);
  const go = useCallback((name, params) => navigation.navigate(name, params), [navigation]);
  const logout = useCallback(async () => {
    const yes = await confirmAction({ title: 'Logout', message: 'Are you sure you want to logout? Anything waiting to sync is kept and sent later.', confirmText: 'Logout' });
    if (!yes) return;
    try { await performLogout(); } catch (e) { /* still leave */ }
  }, []);
  return (
    <Screen>
      <SignInNotice />
      <Title>{brandIcon()} {brandName()}</Title>
      <Sub>{m.groupName || 'Your group'}</Sub>
      {t.invite ? (
        <Card onPress={() => go('ChamaSetup')}>
          <Text style={{ fontSize: 15, fontWeight: '800', color: C.ink }}>Click here to Enter your Chama Code</Text>
          <Hint>{`You are the Treasurer of ${t.invite.group || 'your group'}. Enter the Chama Code you were given to start managing it.`}</Hint>
        </Card>
      ) : null}
      {m.loaded && !t.savings && !t.invite ? <Card><Hint>You are not in a group yet. Your Treasurer will add you, and your tiles will appear here.</Hint></Card> : null}
      <View style={grid}>
        {t.savings ? <Tile icon="🐖" label="My Savings" onPress={() => go('MySavings')} /> : null}
        {t.loans ? <Tile icon="💳" label="My Loans" onPress={() => go('MyLoans')} /> : null}
      </View>
      {t.history || t.manage || t.groupHistory ? <Section>More</Section> : null}
      {t.history || t.manage || t.groupHistory ? (
        <Card>
          {t.history ? <Row label="📈 My Financial History and Statements" onPress={() => go('MemberFinancialHistory')} /> : null}
          {t.manage ? <Row label="👥 Manage Chama" onPress={() => go('ManageChama')} /> : null}
          {t.groupHistory ? <Row label="📜 Group Financial History and Statements" onPress={() => go('GroupFinanceHistory', { groupId: t.groupHistory.groupId })} /> : null}
        </Card>
      ) : null}
      <TouchableOpacity onPress={logout} style={{ paddingVertical: 14 }}><Text style={{ color: C.red, fontWeight: '700', textAlign: 'center' }}>🚪 Logout</Text></TouchableOpacity>
    </Screen>
  );
}
