// rider-app/src/screens/chama/SecurityHeldScreen.js
// Treasurer's register of loan security: items to check, items held, and what can be given back (loan cleared).
import React, { useCallback, useState } from 'react';
import { withChamaOnlineGate } from '../../components/ChamaOnlineGate';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import BackLink from '../../components/BackLink';
import StatusBadge from '../../components/StatusBadge';
import { useToast } from '../../components/Toast';
import { securityHeld, holdSecurity, declineSecurity, releaseSecurity, apiError } from '../../api/groupsClient';
import { s, fmt } from './chamaStyles';
import colors from '../../theme/colors';
import { useGroupText } from './groupText';

const KIND = { savings: '💰 Savings', logbook: '📘 Logbook', title: '📜 Title deed', chattel: '🛋️ Household item', guarantor: '🤝 Guarantor' };
const REASONS = ['The papers do not match', 'The item could not be verified', 'The value is too low', 'Other'];

function SecurityHeldScreen({ navigation, route }) {
  const gt = useGroupText();
  const { showToast } = useToast();
  const groupId = route.params?.groupId;
  const [d, setD] = useState(null);
  const [declining, setDeclining] = useState(null);
  const load = useCallback(() => securityHeld(groupId).then(setD).catch((e) => { setD({ borrowers: [], to_check: 0, held: 0, value_held: 0 }); showToast(apiError(e, 'Could not load.'), 'warn'); }), [groupId]);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  const run = async (fn, ok) => { try { await fn(); showToast(ok, 'success'); } catch (e) { showToast(apiError(e, 'Could not complete this.'), 'warn'); } setDeclining(null); load(); };
  return (
    <ScrollView style={s.page} contentContainerStyle={{ padding: 16 }}>
      <BackLink onPress={() => navigation.goBack()} />
      <Text style={s.title}>🔒 {gt('group.title_security_held', 'Security held')}</Text>
      {d && (<>
        <View style={s.card}>
          <View style={s.row}><Text style={s.k}>Worth holding</Text><Text style={s.v}>{fmt(d.value_held)}</Text></View>
          <View style={s.row}><Text style={s.k}>Items held</Text><Text style={s.v}>{d.held}</Text></View>
          <View style={s.row}><Text style={s.k}>Waiting for you to check</Text><Text style={s.v}>{d.to_check}</Text></View>
        </View>
        {d.borrowers.length === 0 && <Text style={s.hint}>No security yet.</Text>}
        {d.borrowers.map((b) => (
          <View key={b.member_id} style={s.card}>
            <Text style={{ fontWeight: '800' }}>{b.member} · {b.phone}</Text>
            <Text style={s.hint}>Still owes {fmt(b.owes)}</Text>
            {b.items.map((x) => (
              <View key={x.id} style={{ paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.line }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={{ flex: 1, fontWeight: '700' }}>{KIND[x.kind]}{x.guarantor ? ` · ${x.guarantor}` : ''}</Text><Text style={s.v}>{fmt(x.value)}</Text></View>
                {!!x.description && x.kind !== 'savings' && <Text style={s.hint}>{x.description}{x.ref ? ` · Serial ${x.ref}` : ''}</Text>}
                {x.status === 'submitted' ? (declining === x.id ? (
                  <View style={{ marginTop: 6 }}><Text style={s.label}>WHY?</Text>
                    {REASONS.map((r) => <TouchableOpacity key={r} style={s.row} onPress={() => run(() => declineSecurity(x.id, r, groupId), 'Sent back to the member.')}><Text>{r}</Text></TouchableOpacity>)}
                    <TouchableOpacity onPress={() => setDeclining(null)}><Text style={{ color: colors.inkSoft, marginTop: 6 }}>Cancel</Text></TouchableOpacity></View>
                ) : (
                  <View style={{ flexDirection: 'row', gap: 10, marginTop: 6 }}>
                    <TouchableOpacity style={{ flex: 1, backgroundColor: colors.bodaOrange, padding: 10, borderRadius: 8, alignItems: 'center' }} onPress={() => run(() => holdSecurity(x.id, groupId), 'Checked. The group is now holding it.')}>
                      <Text style={{ color: '#fff', fontWeight: '800' }}>I checked it · hold</Text></TouchableOpacity>
                    <TouchableOpacity style={{ padding: 10, borderRadius: 8, borderWidth: 1, borderColor: colors.line }} onPress={() => setDeclining(x.id)}><Text style={{ fontWeight: '700' }}>Cannot accept</Text></TouchableOpacity>
                  </View>))
                  : <View style={{ marginTop: 4 }}><StatusBadge label={x.status === 'held' ? 'Held' : x.status} color={x.status === 'held' ? 'green' : 'amber'} /></View>}
              </View>))}
            {b.can_release && (
              <TouchableOpacity style={{ marginTop: 10, backgroundColor: colors.bodaOrange, padding: 12, borderRadius: 8, alignItems: 'center' }}
                onPress={() => run(() => releaseSecurity(b.member_id, groupId), 'Security given back.')}>
                <Text style={{ color: '#fff', fontWeight: '800' }}>Loan cleared · give everything back</Text></TouchableOpacity>)}
          </View>))}
      </>)}
    </ScrollView>);
}

export default withChamaOnlineGate(SecurityHeldScreen, 'chama');
