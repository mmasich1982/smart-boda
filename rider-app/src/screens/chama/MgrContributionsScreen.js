// rider-app/src/screens/chama/MgrContributionsScreen.js
// "Contributions" for the Treasurer of a Merry-Go-Round group (Smart_Boda_Prototype_v30):
//   circle tabs -> "To confirm" card -> search -> one card per payment waiting -> "Received Contributions History".
// A payment only exists once the member submitted "I've made the payment"; the Treasurer then confirms or rejects it.
// Tapping a card opens the review screen. route.params: { groupId? }  (the group and circle also come from the Manage Chama choice)
import React, { useCallback, useState } from 'react';
import { withChamaOnlineGate } from '../../components/ChamaOnlineGate';
import { ScrollView, Text, View, TextInput, TouchableOpacity } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import BackLink from '../../components/BackLink';
import { queueList, apiError } from '../../api/groupsClient';
import { s, fmt } from './chamaStyles';
import { Card, ScreenTitle } from './mgrUi';
import { GroupLine, CircleTabs } from './manageUi';
import useManageChama from './useManageChama';
import colors from '../../theme/colors';

/** "25 min ago", "3 h ago", "2 days ago" */
export function ago(iso) {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const h = Math.round(mins / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  return `${d} day${d === 1 ? '' : 's'} ago`;
}
export const methodLabel = (m) => (m === 'cash' ? '💵 Cash' : '📲 M-Pesa');

function MgrContributionsScreen({ navigation, route }) {
  const m = useManageChama();
  const gid = route.params?.groupId || m.gid;
  const [items, setItems] = useState(null), [err, setErr] = useState(null), [q, setQ] = useState('');

  useFocusEffect(useCallback(() => {
    if (!gid) return undefined;
    queueList('contributions', gid).then((r) => { setItems((r && r.items) || []); setErr(null); })
      .catch((e) => { setItems([]); setErr(apiError(e, 'Could not load. Check your connection.')); });
    return undefined;
  }, [gid]));

  const mgrOnly = (items || []).filter((i) => i.model === 'mgr' && (!m.circle || i.circle_id === m.circle.id));
  const needle = q.trim().toLowerCase();
  const shown = needle
    ? mgrOnly.filter((i) => `${i.member} ${i.phone || ''} ${i.reference || ''}`.toLowerCase().includes(needle))
    : mgrOnly;
  const total = mgrOnly.reduce((t, i) => t + Number(i.amount), 0);

  return (
    <ScrollView style={s.page} contentContainerStyle={{ padding: 16 }} keyboardShouldPersistTaps="handled">
      <BackLink onPress={() => navigation.navigate('ManageChama')} label="← Manage Chama" />
      <ScreenTitle>📥 Contributions</ScreenTitle>
      <GroupLine type="mgr" name={m.group?.group_name} />
      <CircleTabs m={m} />

      <Card style={{ alignItems: 'center' }}>
        <Text style={c.statLbl}>To confirm</Text>
        <Text style={c.statBig}>{mgrOnly.length ? `${mgrOnly.length} · ${fmt(total)}` : 'All done ✅'}</Text>
        <Text style={c.statSub}>Confirm before day ends</Text>
      </Card>

      {!!err && <Card><Text>{err}</Text></Card>}
      <TextInput style={c.search} value={q} onChangeText={setQ} placeholder="Search name, phone or ref" placeholderTextColor="#9a9da4" />

      {shown.map((i) => (
        <TouchableOpacity key={i.id} testID={`contrib-${i.id}`} activeOpacity={0.8} style={c.card}
          onPress={() => navigation.navigate('MgrContributionDetail', { groupId: gid, item: i })}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={c.name}>{i.member}</Text>
            <Text style={c.sub}>🔄 {i.circle_name || 'Merry-Go-Round'} · {methodLabel(i.method)} · {ago(i.submitted_at)}</Text>
          </View>
          <Text style={c.amt}>{fmt(i.amount)}</Text>
        </TouchableOpacity>))}
      {items && shown.length === 0 && !!needle && <Text style={s.hint}>No payment matches “{q}”.</Text>}

      {/* "Received Contributions History" link (Group Finance History & Statements) hidden for now */}
    </ScrollView>);
}

const c = {
  statLbl: { fontSize: 13, fontWeight: '600', color: colors.inkSoft },
  statBig: { fontSize: 30, fontWeight: '800', color: colors.bodaOrange, marginVertical: 2 },
  statSub: { fontSize: 12.5, color: colors.inkSoft },
  search: { backgroundColor: '#fff', borderWidth: 1, borderColor: colors.line, borderRadius: 14, paddingVertical: 13, paddingHorizontal: 14, fontSize: 15, color: colors.ink, marginBottom: 10 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#fff', borderWidth: 1, borderColor: colors.line, borderRadius: 16, padding: 14, marginBottom: 14 },
  name: { fontWeight: '800', fontSize: 15, color: colors.ink },
  sub: { fontSize: 12, color: colors.inkSoft, marginTop: 2 },
  amt: { fontWeight: '800', color: colors.bodaOrange, fontSize: 16, textAlign: 'right' },
  link: { color: colors.bodaOrangeDark, fontWeight: '800', fontSize: 14.5 },
};

export default withChamaOnlineGate(MgrContributionsScreen, 'chama');