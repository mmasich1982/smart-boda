// rider-app/src/screens/chama/MgrHistoryScreen.js
// "My Contribution History" for Merry-Go-Round, as in Smart_Boda_Prototype_v25: period tiles (This Month, Last Month,
// 6 Months, Since Joining) with totals, a "waiting for Treasurer" card, the confirmed contributions 5 to a page,
// and the Auto-Sync note. route.params: { groupId, circleId? }
import React, { useCallback, useState } from 'react';
import { withChamaOnlineGate } from '../../components/ChamaOnlineGate';
import { ScrollView, Text, View, TouchableOpacity } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import BackLink from '../../components/BackLink';
import { mySavings, mgrMyActivity, completeSeen, apiError } from '../../api/groupsClient';
import { s, fmt } from './chamaStyles';
import { Card, Badge, Pager, ScreenTitle, monthDay } from './mgrUi';
import colors from '../../theme/colors';

const PER_PAGE = 5;
const TILES = [['thisMonth', '📅', 'This Month'], ['lastMonth', '📆', 'Last Month'], ['sixMonths', '📊', '6 Months'], ['sinceJoining', '👥', 'Since Joining']];
const LABELS = { thisMonth: 'This Month', lastMonth: 'Last Month', sixMonths: 'Last 6 Months', sinceJoining: 'Since Joining' };

function MgrHistoryScreen({ navigation, route }) {
  const { groupId, circleId } = route.params || {};
  const [rows, setRows] = useState(null), [group, setGroup] = useState(null), [err, setErr] = useState(null);
  const [cat, setCat] = useState('thisMonth'), [page, setPage] = useState(1);

  useFocusEffect(useCallback(() => {
    Promise.all([mgrMyActivity(groupId), mySavings()])
      .then(([a, sv]) => {
        setRows((a || []).filter((x) => x.kind === 'contribution' && (!circleId || x.circle_id === circleId)));
        setGroup((sv.groups || []).find((g) => g.group_id === groupId) || null);
        setErr(null); completeSeen(['contribution_confirmed', 'contribution_rejected']);
      })
      .catch((e) => { setRows([]); setErr(apiError(e, 'Could not load. Check your connection.')); });
  }, [groupId, circleId]));

  const list = rows || [];
  const confirmed = list.filter((x) => x.status === 'confirmed');
  const notDone = list.filter((x) => x.status !== 'confirmed').slice(0, 5);
  const circleName = (id) => (group?.circles || []).find((x) => x.id === id)?.name;
  const multi = (group?.circles || []).length > 1;
  const tFirst = String(group?.treasurer?.name || '').split(' ')[0];

  // Same buckets as the prototype: each contribution falls into the first one it fits.
  const now = new Date(), today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const thisStart = new Date(today.getFullYear(), today.getMonth(), 1).getTime();
  const lastStart = new Date(today.getFullYear(), today.getMonth() - 1, 1).getTime();
  const sixStart = new Date(today.getFullYear(), today.getMonth() - 6, 1).getTime();
  const by = { thisMonth: [], lastMonth: [], sixMonths: [], sinceJoining: [] };
  confirmed.forEach((e) => {
    const t = new Date(e.at).getTime();
    if (t >= thisStart) by.thisMonth.push(e);
    else if (t >= lastStart) by.lastMonth.push(e);
    else if (t >= sixStart) by.sixMonths.push(e);
    else by.sinceJoining.push(e);
  });
  Object.keys(by).forEach((k) => by[k].sort((a, b) => new Date(b.at) - new Date(a.at)));
  const tot = {}; Object.keys(by).forEach((k) => { tot[k] = by[k].reduce((n, r) => n + Number(r.amount), 0); });
  const records = by[cat] || [];
  const totalPages = Math.max(1, Math.ceil(records.length / PER_PAGE));
  const pg = Math.min(page, totalPages);
  const pageRecords = records.slice((pg - 1) * PER_PAGE, pg * PER_PAGE);
  const last = confirmed[0] ? monthDay(confirmed[0].at) : monthDay(new Date().toISOString());

  return (
    <ScrollView style={s.page} contentContainerStyle={{ padding: 16 }}>
      <BackLink onPress={() => navigation.goBack()} label="← Back to Contributions Hub" />
      <ScreenTitle>📈 My Contribution History</ScreenTitle>
      {!!err && <Card><Text>{err}</Text></Card>}

      <View style={h.grid}>
        {TILES.map(([k, e, l]) => (
          <TouchableOpacity key={k} testID={`tile-${k}`} onPress={() => { setCat(k); setPage(1); }} style={[h.tile, cat === k && h.tileOn]}>
            <Text style={{ fontSize: 20, marginBottom: 4 }}>{e}</Text>
            <Text style={h.tileLbl}>{l}</Text>
            <Text style={h.tileAmt}>{fmt(tot[k])}</Text>
          </TouchableOpacity>))}
      </View>

      {notDone.length > 0 && (
        <Card style={{ borderColor: colors.signalAmber }}>
          <Text style={h.title}>🕒 Waiting for Treasurer</Text>
          {notDone.map((r) => (
            <View key={r.id} style={h.pendRow}>
              <View style={{ flex: 1 }}>
                <Text style={h.pendTxt}>{fmt(r.amount)} · {r.method === 'cash' ? '💵 Cash' : '📲 M-Pesa'}</Text>
                {r.status === 'rejected' && !!r.reason && <Text style={h.reason}>Reason: {r.reason}</Text>}
              </View>
              {r.status === 'rejected' ? <Badge tone="red">✕ Not confirmed</Badge> : <Badge tone="amber">Pending</Badge>}
            </View>))}
        </Card>)}

      <Card>
        <Text style={h.title}>{LABELS[cat]}</Text>
        {records.length ? (<>
          <View style={h.totalBox}>
            <Text style={h.totalTxt}>Total for period: <Text style={{ fontWeight: '700' }}>{fmt(tot[cat])}</Text> • {records.length} transaction{records.length !== 1 ? 's' : ''}</Text>
          </View>
          {pageRecords.map((e, i) => (
            <View key={e.id} style={[h.row, i === pageRecords.length - 1 && { borderBottomWidth: 0 }]}>
              <View style={{ flex: 1 }}>
                <Text style={h.rowTitle}>Merry-go-round{multi && circleName(e.circle_id) ? ` · ${circleName(e.circle_id)}` : ''}</Text>
                <Text style={h.rowSub}>{monthDay(e.at)} • {e.method === 'cash' ? '💵 Cash' : '📲 M-Pesa'}{e.self_confirmed ? ' • 🧾 Self-confirmed by Treasurer' : tFirst ? ` • ✓ Approved by ${tFirst}` : ''}</Text>
              </View>
              <Text style={h.rowAmt}>+{fmt(e.amount)}</Text>
            </View>))}
          <Pager page={pg} totalPages={totalPages} total={records.length} pageSize={PER_PAGE} onPage={setPage} />
        </>) : <Text style={h.empty}>No contributions for this period yet.</Text>}
      </Card>

      <View style={h.sync}>
        <Text style={{ fontSize: 16 }}>🔄</Text>
        <View style={{ flex: 1 }}>
          <Text style={h.syncTitle}>Auto-Sync Active</Text>
          <Text style={h.syncTxt}>This screen syncs automatically when your Chama treasurer records contributions. Last updated: {last}</Text>
        </View>
      </View>
    </ScrollView>);
}

const h = {
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
  tile: { width: '48.5%', borderWidth: 1.5, borderColor: colors.line, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 8, alignItems: 'center', backgroundColor: '#fff' },
  tileOn: { borderColor: colors.bodaOrange, backgroundColor: '#fff6ee' },
  tileLbl: { fontSize: 11.5, fontWeight: '700', color: colors.ink },
  tileAmt: { fontSize: 11, fontWeight: '700', color: colors.inkSoft, marginTop: 3 },
  title: { fontWeight: '700', fontSize: 13.5, color: colors.ink, marginBottom: 6 },
  pendRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingVertical: 6 },
  pendTxt: { fontWeight: '700', fontSize: 13, color: colors.ink },
  reason: { fontSize: 11, color: colors.signalRed, marginTop: 2 },
  totalBox: { backgroundColor: '#f9f8f5', borderRadius: 8, padding: 8, marginBottom: 10 },
  totalTxt: { fontSize: 12, color: colors.inkSoft },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.line },
  rowTitle: { fontWeight: '600', fontSize: 12.5, color: colors.ink },
  rowSub: { fontSize: 11, color: colors.inkSoft, marginTop: 2 },
  rowAmt: { fontWeight: '700', fontSize: 13, color: colors.signalGreen, marginLeft: 8 },
  empty: { fontSize: 11.5, color: colors.inkSoft, paddingVertical: 10 },
  sync: { flexDirection: 'row', gap: 8, alignItems: 'flex-start', marginTop: 0, padding: 12, backgroundColor: colors.signalGreenBg, borderRadius: 12, borderWidth: 1, borderColor: colors.signalGreen },
  syncTitle: { fontWeight: '600', fontSize: 12, color: colors.ink, marginBottom: 3 },
  syncTxt: { fontSize: 12, color: colors.ink },
};

export default withChamaOnlineGate(MgrHistoryScreen, 'savings');