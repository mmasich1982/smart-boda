// rider-app/src/screens/chama/MgrHistoryScreen.js
// "My Contribution History" for Merry-Go-Round, as in Smart_Boda_Prototype_v25: period tiles (This Month, Last Month,
// 6 Months, Since Joining) with totals, a "waiting for Treasurer" card, the confirmed contributions 5 to a page,
// and the Auto-Sync note. route.params: { groupId, circleId? }
//
// OFFLINE-FIRST: the payments are read from the phone (IndexedDB, the same six-month store and cleanup as the rest of the Chama history)
// and shown at once, with or without a connection. A quiet sync then brings in only what changed (offline/chamaMgrHistorySync.js).
//   This Month    the current calendar month
//   Last Month    the previous calendar month
//   6 Months      the last six months (this month and last month included)
//   Since Joining everything since joining: the total and the list come from the server, so it works for any age; offline it shows the last
//                 known total and the payments saved on the phone.
// Dates are the day the payment was confirmed by the Treasurer (or, for one still waiting, the day it was sent).
import React, { useCallback, useEffect, useState } from 'react';
import { ScrollView, Text, View, TouchableOpacity } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import BackLink from '../../components/BackLink';
import { mySavings, completeSeen } from '../../api/groupsClient';
import { s, fmt } from './chamaStyles';
import { Card, Badge, Pager, ScreenTitle, monthDay } from './mgrUi';
import { loadMgrContributions, bucketContributions, sumAmounts, getMeta, setMeta } from '../../offline/chamaMgrHistoryRepository';
import { syncMgrHistory, registerMgrHistoryGroup, refreshSummary, fetchMgrHistoryPage } from '../../offline/chamaMgrHistorySync';
import colors from '../../theme/colors';

const PER_PAGE = 5;
const REJECTED_SHOWN_DAYS = 14;               // a rejection stays in the "waiting" card this long
const TILES = [['thisMonth', '📅', 'This Month'], ['lastMonth', '📆', 'Last Month'], ['sixMonths', '📊', '6 Months'], ['sinceJoining', '👥', 'Since Joining']];
const LABELS = { thisMonth: 'This Month', lastMonth: 'Last Month', sixMonths: 'Last 6 Months', sinceJoining: 'Since Joining' };

function MgrHistoryScreen({ navigation, route }) {
  const { groupId, circleId } = route.params || {};
  const [rows, setRows] = useState(null), [meta, setMetaState] = useState({});
  const [cat, setCat] = useState('thisMonth'), [page, setPage] = useState(1);
  const [remote, setRemote] = useState(null);       // Since Joining from the server: null = loading, false = could not reach it, {items,total}

  const reloadLocal = useCallback(async () => {
    const [r, m] = await Promise.all([loadMgrContributions(groupId, circleId), getMeta(groupId)]);
    setRows(r); setMetaState(m || {});
  }, [groupId, circleId]);

  // Show the phone's copy first, then catch up with the server in the background.
  useFocusEffect(useCallback(() => {
    let live = true;
    (async () => {
      await reloadLocal();
      await registerMgrHistoryGroup(groupId);
      const res = await syncMgrHistory(groupId);                      // only what changed since the last time
      await Promise.all([
        refreshSummary(groupId, circleId),                            // the "Since Joining" total (any age)
        mySavings().then((sv) => {                                    // the Treasurer's first name for "Approved by" (remembered for offline)
          const g = (sv.groups || []).find((x) => x.group_id === groupId);
          const first = String(g?.treasurer?.name || '').split(' ')[0];
          return first ? setMeta(groupId, { treasurer_first: first }) : null;
        }).catch(() => {}),
      ]);
      if (live) await reloadLocal();
      if (res.ok || res.skipped === 'recent') completeSeen(['contribution_confirmed', 'contribution_rejected']).catch(() => {});
    })().catch(() => {});
    return () => { live = false; };
  }, [groupId, circleId, reloadLocal]));

  // Since Joining: the whole history from the server, one page at a time.
  useEffect(() => {
    if (cat !== 'sinceJoining') return undefined;
    let live = true;
    setRemote(null);
    fetchMgrHistoryPage(groupId, circleId, { offset: (page - 1) * PER_PAGE, limit: PER_PAGE })
      .then((res) => { if (live) setRemote({ items: res.items, total: res.total }); })
      .catch(() => { if (live) setRemote(false); });
    return () => { live = false; };
  }, [cat, page, groupId, circleId]);

  const list = rows || [];
  const confirmed = list.filter((x) => x.status === 'confirmed');
  const fresh = Date.now() - REJECTED_SHOWN_DAYS * 86400000;
  const notDone = list.filter((x) => x.status === 'pending' || (x.status === 'rejected' && new Date(x.at).getTime() >= fresh)).slice(0, 5);
  const multi = new Set(list.map((x) => x.circle_id)).size > 1;
  const tFirst = meta.treasurer_first || '';

  const by = bucketContributions(confirmed);
  const summary = meta.summary?.[circleId || 'all'];
  const tot = { thisMonth: sumAmounts(by.thisMonth), lastMonth: sumAmounts(by.lastMonth), sixMonths: sumAmounts(by.sixMonths), sinceJoining: sumAmounts(by.sinceJoining) };
  const sinceCount = Math.max(summary?.count || 0, by.sinceJoining.length);
  tot.sinceJoining = Math.max(summary?.total || 0, tot.sinceJoining);          // the server's total covers payments older than the phone keeps

  const onServer = cat === 'sinceJoining' && !!remote;
  const local = by[cat] || [];
  const totalCount = onServer ? remote.total : local.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / PER_PAGE));
  const pg = Math.min(page, totalPages);
  const pageRecords = onServer ? remote.items : local.slice((pg - 1) * PER_PAGE, pg * PER_PAGE);
  const shownCount = cat === 'sinceJoining' ? Math.max(totalCount, sinceCount) : totalCount;
  const last = meta.lastSyncAt ? monthDay(new Date(meta.lastSyncAt).toISOString()) : confirmed[0] ? monthDay(confirmed[0].at) : monthDay(new Date().toISOString());

  return (
    <ScrollView style={s.page} contentContainerStyle={{ padding: 16 }}>
      <BackLink onPress={() => navigation.goBack()} label="← Back to Contributions Hub" />
      <ScreenTitle>📈 My Contribution History</ScreenTitle>

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
        {cat === 'sinceJoining' && remote === false && (
          <Text style={h.offlineNote}>Older payments need an internet connection. Showing what is saved on this phone (the last 6 months).</Text>)}
        {(rows !== null && shownCount > 0) ? (<>
          <View style={h.totalBox}>
            <Text style={h.totalTxt}>Total for period: <Text style={{ fontWeight: '700' }}>{fmt(tot[cat])}</Text> • {shownCount} transaction{shownCount !== 1 ? 's' : ''}</Text>
          </View>
          {pageRecords.map((e, i) => (
            <View key={e.id} style={[h.row, i === pageRecords.length - 1 && { borderBottomWidth: 0 }]}>
              <View style={{ flex: 1 }}>
                <Text style={h.rowTitle}>Merry-go-round{multi && e.circle_name ? ` · ${e.circle_name}` : ''}</Text>
                <Text style={h.rowSub}>{monthDay(e.at)} • {e.method === 'cash' ? '💵 Cash' : '📲 M-Pesa'}{e.self_confirmed ? ' • 🧾 Self-confirmed by Treasurer' : tFirst ? ` • ✓ Approved by ${tFirst}` : ''}</Text>
              </View>
              <Text style={h.rowAmt}>+{fmt(e.amount)}</Text>
            </View>))}
          <Pager page={pg} totalPages={totalPages} total={totalCount} pageSize={PER_PAGE} onPage={setPage} />
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
  offlineNote: { fontSize: 11.5, color: colors.inkSoft, marginBottom: 8, lineHeight: 17 },
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

export default MgrHistoryScreen;