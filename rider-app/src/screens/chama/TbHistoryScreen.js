// rider-app/src/screens/chama/TbHistoryScreen.js
// One screen, two titles, opened from two places (it never mixes the two categories):
//   My Savings > "My Savings Contribution"   (route.params.kind = 'savings')        only savings contributions
//   My Loans   > "My Loan Repayment"         (route.params.kind = 'loan_repayment') only loan repayments
// Same layout as the Merry-Go-Round history (MgrHistoryScreen).
//   Period tiles     This Month, Last Month, 6 Months, Since Joining, each with its total for the chosen category
//   "Waiting for Treasurer" card, then the confirmed payments 5 to a page.
// route.params: { groupId, kind }   kind = 'savings' (default) | 'loan_repayment'
//
// OFFLINE-FIRST: the payments are read from the phone (IndexedDB, the same six-month store and cleanup as the rest of the Chama history)
// and shown at once, with or without a connection. A quiet sync then brings in only what changed (offline/chamaTbHistorySync.js).
//   This Month    the current calendar month           Last Month    the previous calendar month
//   6 Months      the last six months (this and last month included)
//   Since Joining everything: the totals and the list come from the server, so it works for any age; offline it shows the last known
//                 totals and the payments saved on the phone.
// Dates are the day the payment was confirmed by the Treasurer (or, for one still waiting, the day it was sent).
import React, { useCallback, useEffect, useState } from 'react';
import { ScrollView, Text, View, TouchableOpacity } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import BackLink from '../../components/BackLink';
import { completeSeen, mySavings } from '../../api/groupsClient';
import { s, fmt } from './chamaStyles';
import { Card, Badge, Pager, ScreenTitle, monthDay } from './mgrUi';
import { loadTbPayments, bucketPayments, byKind, sumAmounts, getMeta, setMeta } from '../../offline/chamaTbHistoryRepository';
import { syncTbHistory, registerTbHistoryGroup, refreshTbSummary, fetchTbHistoryPage } from '../../offline/chamaTbHistorySync';
import colors from '../../theme/colors';

const PER_PAGE = 5;
const REJECTED_SHOWN_DAYS = 14;               // a rejection stays in the "waiting" card this long
const TILES = [['thisMonth', '📅', 'This Month'], ['lastMonth', '📆', 'Last Month'], ['sixMonths', '📊', '6 Months'], ['sinceJoining', '👥', 'Since Joining']];
const LABELS = { thisMonth: 'This Month', lastMonth: 'Last Month', sixMonths: 'Last 6 Months', sinceJoining: 'Since Joining' };
const TITLE = { savings: '💰 My Savings Contribution', loan_repayment: '🏦 My Loan Repayment' };
const EMPTY = { savings: 'No savings contributions for this period yet.', loan_repayment: 'No loan repayments for this period yet.' };

function TbHistoryScreen({ navigation, route }) {
  const { groupId, kind: kindParam } = route.params || {};
  const kind = kindParam === 'loan_repayment' ? 'loan_repayment' : 'savings';   // fixed by where the screen was opened from
  const [rows, setRows] = useState(null), [meta, setMetaState] = useState({});
  const [cat, setCat] = useState('thisMonth'), [page, setPage] = useState(1);
  const [remote, setRemote] = useState(null);       // Since Joining from the server: null = loading, false = could not reach it, {items,total}

  const reloadLocal = useCallback(async () => {
    const [r, m] = await Promise.all([loadTbPayments(groupId), getMeta(groupId)]);
    setRows(r); setMetaState(m || {});
  }, [groupId]);

  // Show the phone's copy first, then catch up with the server in the background.
  useFocusEffect(useCallback(() => {
    let live = true;
    (async () => {
      await reloadLocal();
      await registerTbHistoryGroup(groupId);
      const res = await syncTbHistory(groupId);                       // only what changed since the last time
      await Promise.all([
        refreshTbSummary(groupId),                                    // the "Since Joining" totals (any age)
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
  }, [groupId, reloadLocal]));

  // Since Joining: the whole history from the server, one page at a time.
  useEffect(() => {
    if (cat !== 'sinceJoining') return undefined;
    let live = true;
    setRemote(null);
    fetchTbHistoryPage(groupId, { kind, offset: (page - 1) * PER_PAGE, limit: PER_PAGE })
      .then((res) => { if (live) setRemote({ items: res.items, total: res.total }); })
      .catch(() => { if (live) setRemote(false); });
    return () => { live = false; };
  }, [cat, page, kind, groupId]);

  const list = rows || [];
  const confirmed = list.filter((x) => x.status === 'confirmed');
  const fresh = Date.now() - REJECTED_SHOWN_DAYS * 86400000;
  const notDone = byKind(list, kind).filter((x) => x.status === 'pending' || (x.status === 'rejected' && new Date(x.at).getTime() >= fresh)).slice(0, 5);
  const tFirst = String(meta.treasurer_first || '');

  // The tiles, for the chosen category. Server totals (any age) win over the phone's six months when they are larger.
  const by = bucketPayments(byKind(confirmed, kind));
  const sv = meta.summary || {};
  const srv = (k) => sv[k] || { count: 0, total: 0 };
  const tot = { thisMonth: sumAmounts(by.thisMonth), lastMonth: sumAmounts(by.lastMonth), sixMonths: sumAmounts(by.sixMonths), sinceJoining: sumAmounts(by.sinceJoining) };
  tot.sinceJoining = Math.max(srv(kind).total, tot.sinceJoining);
  const sinceCount = Math.max(srv(kind).count, by.sinceJoining.length);

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
      <BackLink onPress={() => navigation.goBack()} label="← Back" />
      <ScreenTitle>{TITLE[kind]}</ScreenTitle>

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
                <Text style={h.rowTitle}>{kind === 'loan_repayment' ? 'Loan repayment' : 'Savings contribution'}</Text>
                <Text style={h.rowSub}>{monthDay(e.at)} • {e.method === 'cash' ? '💵 Cash' : '📲 M-Pesa'}{tFirst ? ` • ✓ Approved by ${tFirst}` : ''}</Text>
              </View>
              <Text style={[h.rowAmt, kind === 'loan_repayment' && { color: colors.bodaOrange }]}>{kind === 'loan_repayment' ? '−' : '+'}{fmt(e.amount)}</Text>
            </View>))}
          <Pager page={pg} totalPages={totalPages} total={totalCount} pageSize={PER_PAGE} onPage={setPage} />
        </>) : <Text style={h.empty}>{EMPTY[kind]}</Text>}
      </Card>

      <View style={h.sync}>
        <Text style={{ fontSize: 16 }}>🔄</Text>
        <View style={{ flex: 1 }}>
          <Text style={h.syncTitle}>Auto-Sync Active</Text>
          <Text style={h.syncTxt}>This screen syncs automatically when your Chama treasurer records your {kind === 'loan_repayment' ? 'loan repayments' : 'contributions'}. Last updated: {last}</Text>
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
export default TbHistoryScreen;
