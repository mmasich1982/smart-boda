//  rider-app/src/screens/chama/ManageChamaScreen.js
import React, { useCallback, useState } from 'react';
import { withChamaOnlineGate } from '../../components/ChamaOnlineGate';   // My Savings / My Loans / My Chama require an internet connection
import { View, Text, TextInput, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import BackLink from '../../components/BackLink';
import PrimaryButton from '../../components/PrimaryButton';
import GhostButton from '../../components/GhostButton';
import { useToast } from '../../components/Toast';
import colors from '../../theme/colors';
import { refreshMembership } from '../../offline/chamaSyncService';
import { getMyGroup, listMembers, validateGroupCode, latestSlotRequest, completeNotification, apiError } from '../../api/groupsClient';
import ChamaRulesCard from './ChamaRulesCard';
import { useGroupText } from './groupText';

function ManageChamaScreen({ navigation, route }) {
  const groupId = route.params?.groupId;
  const gt = useGroupText();
  const { showToast } = useToast();
  const [group, setGroup] = useState(null);
  const [members, setMembers] = useState([]);
  const [req, setReq] = useState({ pending: null, last: null });
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const g = await getMyGroup(groupId);
      setGroup(g);
      setMembers(await listMembers(groupId));
      setReq(await latestSlotRequest(groupId));
    } catch (e) {
      if (e?.response?.status === 404) setGroup(null);      // no code entered yet
      else showToast(apiError(e, 'Could not load your Chama. Check your connection.'), 'warn');
    } finally { setLoading(false); }
  }, [groupId]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function submitCode() {
    try {
      const g = await validateGroupCode(code.trim().toUpperCase());
      await refreshMembership();                             // the "Enter your Chama Code" card goes and Manage Chama shows at once
      showToast('Done. You are now the Treasurer of ' + g.group_name + '.', 'success');
      navigation.navigate('ManageChama');
    }
    catch (e) { showToast(apiError(e, 'That Chama Code was not found.'), 'warn'); }
  }
  async function dismissLast() {
    try { await completeNotification(req.last.notification_id); load(); } catch {}
  }
  const left = group ? group.slots_available : 0;
  const Box = ({ label, value, color }) => (
    <View style={s.box}><Text style={[s.boxNum, { color }]}>{value}</Text><Text style={s.boxLbl}>{label}</Text></View>
  );

  return (
    <ScrollView style={s.page} contentContainerStyle={{ padding: 16 }}>
      <BackLink onPress={() => navigation.navigate('ManageChama')} label="← Manage Chama" />
      <Text style={s.title}>⚙️ {gt('group.title_setup_members', 'Set up & members')}</Text>
      <Text style={s.sub}>For the Group Treasurer. What would you like to do?</Text>
      {loading && <Text style={s.hint}>Loading…</Text>}

      {!loading && !group && (
        <View style={s.card}>
          <Text style={s.cardTitle}>🔑 Enter your Chama Code</Text>
          <Text style={s.label}>The code you were given for your group *</Text>
          <TextInput style={s.input} autoCapitalize="characters" value={code} onChangeText={setCode} placeholder="e.g. BG-7K3M9X" />
          <PrimaryButton label="Continue →" onPress={submitCode} disabled={code.trim().length < 4} />
        </View>
      )}

      {group && (
        <>
          <View style={s.card}>
            <Text style={s.cardTitle}>✅ Chama Details</Text>
            {[['Chama Name', group.group_name], ['Location', `${group.ward}, ${group.sub_county}, ${group.county}`],
              ['Stage', group.stage_name], ['Total Number of Members Allowed', group.approved_slots],
              ['Treasurer', `${group.treasurer_name} · ${group.treasurer_phone}`],
              ['Status', group.status === 'active' ? 'Active' : 'Inactive'],
              ...(group.slots_shared ? [['Member slots shared with', `${group.shared_with} (the same people count once across both groups)`]] : [])].map(([k, v]) => (
              <View key={k} style={s.row}><Text style={s.k}>{k}</Text><Text style={s.v}>{String(v)}</Text></View>))}
          </View>
		  
		  <ChamaRulesCard groupId={groupId} onSaved={load} />

          <View style={s.card}>
            <Text style={s.cardTitle}>🎟️ Member Slots</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Box label="Total Approved Member Slots" value={group.approved_slots} color={colors.ink} />
              <Box label="Total Slots Utilized" value={group.slots_used} color={colors.bodaOrange} />
              <Box label="Available Remaining Slots" value={left} color={left ? colors.signalGreen : colors.signalRed} />
            </View>
            <View style={s.bar}><View style={{ height: '100%', width: `${Math.min(100, (group.slots_used / group.approved_slots) * 100)}%`, backgroundColor: left ? colors.signalGreen : colors.signalRed }} /></View>
            {left <= 0 && (
              <View style={s.banner}><Text>🎉</Text><View style={{ flex: 1 }}>
                <Text style={{ fontWeight: '700' }}>Your Chama is at full capacity!</Text>
                <Text style={s.hint}>You've reached the maximum approved membership, so no more members can be added for now. You can request extra slots from the Smart Boda Administrator.</Text>
              </View></View>)}
          </View>

          <View style={s.card}>
            <Text style={s.cardTitle}>Members</Text>
            {members.length === 0 && <Text style={s.hint}>No members yet.</Text>}
            {members.map((m) => (
              <View key={m.id} style={s.row}>
                <View style={{ flex: 1 }}><Text style={s.v}>{m.full_name}</Text><Text style={s.hint}>{m.phone}</Text></View>
                <Text style={s.hint}>{m.link_status === 'linked' ? '🔗 Linked' : '⏳ Awaiting sign-up'}</Text>
              </View>))}
          </View>

          <PrimaryButton label="➕ Add Chama Member" disabled={group.status !== 'active'}
            onPress={() => left <= 0 ? showToast('Member limit reached. Request more slots to add members.', 'warn') : navigation.navigate('AddChamaMember', { groupId, type: group.group_type })} />

          {req.last && req.last.notification_id && (
            <View style={[s.banner, { backgroundColor: req.last.ok ? colors.signalGreenBg : colors.signalRedBg, marginTop: 10 }]}>
              <Text>{req.last.ok ? '✅' : '❌'}</Text>
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: '700' }}>Last request {req.last.ok ? 'approved' : 'rejected'} (+{req.last.slots} slots)</Text>
                {!!req.last.comment && <Text style={s.hint}>Admin: “{req.last.comment}”</Text>}
                {!req.last.ok && <TouchableOpacity onPress={dismissLast}><Text style={{ color: colors.bodaOrange, fontWeight: '700', marginTop: 4 }}>OK, got it</Text></TouchableOpacity>}
              </View>
            </View>)}

          {req.pending ? (
            <View style={[s.card, { borderColor: colors.signalAmber }]}>
              <Text style={s.cardTitle}>⏳ Member Limit Increase Request</Text>
              <Text>+{req.pending.slots} slots requested · awaiting Smart Boda Administrator</Text>
              <Text style={s.hint}>“{req.pending.reason}”</Text>
            </View>
          ) : left <= 0 ? (
            <PrimaryButton label="📈 Request More Member Slots" onPress={() => navigation.navigate('RequestChamaSlots', { groupId })} />
          ) : (
            <><GhostButton label="📈 Request More Member Slots" disabled onPress={() => {}} />
              <Text style={s.hint}>You still have {left} available slot{left > 1 ? 's' : ''}. You can request more once all approved slots are used.</Text></>
          )}
        </>
      )}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.cream },
  title: { fontSize: 22, fontWeight: '800', color: colors.ink, marginTop: 6 },
  sub: { color: colors.inkSoft, marginBottom: 12 },
  card: { backgroundColor: '#fff', borderWidth: 1, borderColor: colors.line, borderRadius: 10, padding: 14, marginBottom: 12 },
  cardTitle: { fontWeight: '800', marginBottom: 8 },
  label: { fontSize: 10.5, fontWeight: '800', color: colors.inkSoft, marginBottom: 6 },
  input: { borderWidth: 1, borderColor: colors.line, borderRadius: 8, padding: 10, marginBottom: 10, backgroundColor: '#fff' },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: colors.line },
  k: { color: colors.inkSoft, flex: 1 }, v: { fontWeight: '700', flexShrink: 1, textAlign: 'right' },
  hint: { fontSize: 11.5, color: colors.inkSoft, marginTop: 2 },
  box: { flex: 1, alignItems: 'center', backgroundColor: '#f9f8f5', borderRadius: 10, paddingVertical: 10 },
  boxNum: { fontSize: 20, fontWeight: '800' }, boxLbl: { fontSize: 10.5, color: colors.inkSoft, textAlign: 'center' },
  bar: { height: 8, backgroundColor: '#eee', borderRadius: 99, overflow: 'hidden', marginTop: 10 },
  banner: { flexDirection: 'row', gap: 8, backgroundColor: colors.signalAmberBg, borderWidth: 1, borderColor: colors.signalAmber, borderRadius: 10, padding: 10, marginTop: 10 },
});

// Online-required module: shows a professional "internet connection required" message while offline.
export default withChamaOnlineGate(ManageChamaScreen, 'chama');
