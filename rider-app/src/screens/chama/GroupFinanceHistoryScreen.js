// rider-app/src/screens/chama/GroupFinanceHistoryScreen.js
// Group Finance History & Statements (Treasurer only).
// Matches the prototype: ranges This Month / Last Month / Last 3 / Last 6 / Since Joining;
// type chips All / Contributions / Payouts / Loans; model chips (Whole group / Merry-Go-Round /
// Digital Table Banking) appear only when the group's ledger holds BOTH models, as in the prototype.
import React, { useCallback, useRef, useState } from 'react';
import { withChamaOnlineGate } from '../../components/ChamaOnlineGate';   // My Savings / My Loans / My Chama require an internet connection
import { View, Text, ScrollView } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import BackLink from '../../components/BackLink';
import PrimaryButton from '../../components/PrimaryButton';
import { useToast } from '../../components/Toast';
import { groupHistory, groupStatement, apiError } from '../../api/groupsClient';
import { s, fmt, Chip } from './chamaStyles';
import colors from '../../theme/colors';
import { generateGroupStatementPDF } from '../../utils/pdfGenerator';
import { useGroupText } from './groupText';
import useChamaMembership from '../../hooks/useChamaMembership';
import { GroupPicker, useGroupPicker } from './common';
import { clampDateRangeToRetention, CHAMA_RETENTION_CONFIG } from '../../offline/chamaRetentionPolicy';

const PAGE = 50;
const iso = (d) => d.toISOString().slice(0, 10);
const RANGES = { thisMonth: 'This Month', lastMonth: 'Last Month', last3: 'Last 3 Months', last6: 'Last 6 Months', sinceJoining: 'Since Joining' };
function rawRange(k) {
  const n = new Date(), y = n.getFullYear(), m = n.getMonth(), day = 864e5;
  if (k === 'lastMonth') return [iso(new Date(y, m - 1, 1, 12)), iso(new Date(y, m, 0, 12))];   // noon avoids a timezone day-shift
  if (k === 'last3') return [iso(new Date(Date.now() - 90 * day)), iso(n)];
  if (k === 'last6') return [iso(new Date(Date.now() - 180 * day)), iso(n)];
  if (k === 'sinceJoining') return ['2000-01-01', iso(n)];
  return [iso(new Date(y, m, 1, 12)), iso(n)];                                                    // this month
}
// SIX-MONTH RETENTION: Rider, Treasurer and Official apps keep the last 6 months on the phone, so no range may reach
// further back than that. "Since Joining" therefore means "since joining, within the last 6 months".
// Older statements are available from the Smart Boda Administrator (the notice below says so).
function range(k) {
  const [f, t] = rawRange(k);
  const c = clampDateRangeToRetention(f, t);
  return [c.from, c.to];
}
const reachesPastRetention = (k) => clampDateRangeToRetention(...rawRange(k)).clamped;

// Every ledger entry type the server can return (004 + 005 scripts). Unknown types fall back to the raw code.
const LABEL = { contribution: 'Contribution', mgr_contribution: 'Round contribution', mgr_payout: 'Payout',
  loan_disbursement: 'Loan given', loan_repayment_principal: 'Loan repayment', loan_repayment_interest: 'Loan interest' };
// Type chips: key -> label + the ledger types it selects (sent to the server as a comma list).
const TYPE_FILTERS = {
  '':      { label: 'All', types: null, models: ['tb', 'mgr'] },
  contrib: { label: 'Contributions', types: 'contribution,mgr_contribution', models: ['tb', 'mgr'] },
  payout:  { label: 'Payouts', types: 'mgr_payout', models: ['mgr'] },
  loans:   { label: 'Loans', types: 'loan_disbursement,loan_repayment_principal,loan_repayment_interest', models: ['tb'] },
};
const MODEL_CHIPS = [['', 'Whole group'], ['mgr', '🔄 Merry-Go-Round'], ['tb', '📒 Digital Table Banking']];

function GroupFinanceHistoryScreen({ navigation, route }) {
  const gt = useGroupText();
  // A Treasurer may run several groups: pick one (Merry-Go-Round / Table Banking tabs). Opened from a group's page, it is preselected.
  const { treasurerGroups } = useChamaMembership();
  const pick = useGroupPicker(treasurerGroups, route?.params?.groupId);
  const groupId = pick.group?.group_id || route?.params?.groupId;
  const { showToast } = useToast();
  const [k, setK] = useState('thisMonth'), [type, setType] = useState(''), [model, setModel] = useState('');
  const [h, setH] = useState(null), [st, setSt] = useState(null), [loadingMore, setLoadingMore] = useState(false);
  const reqId = useRef(0);          // ignore a slow response that arrives after the person changed the filters

  const load = useCallback(async (pg = 1) => {
    const id = ++reqId.current, [f, t] = range(k);
    try {
      const r = await groupHistory({ date_from: f, date_to: t, entry_type: TYPE_FILTERS[type]?.types || undefined,
        model: model || undefined, page: pg, page_size: PAGE, group_id: groupId });
      if (id !== reqId.current) return;
      setH((prev) => ({ ...r, items: pg > 1 && prev ? [...prev.items, ...r.items] : r.items }));
    } catch (e) {
      if (id === reqId.current) showToast(apiError(e, 'Could not load. Check your connection.'), 'warn');
    }
  }, [k, type, model, groupId]);
  useFocusEffect(useCallback(() => { load(1); }, [load]));

  async function more() { setLoadingMore(true); await load((h?.page || 1) + 1); setLoadingMore(false); }
  async function statement() {
    const [f, t] = range(k);
    try { setSt(await groupStatement({ date_from: f, date_to: t, group_id: groupId })); }
    catch (e) { showToast(apiError(e, 'Could not generate.'), 'warn'); }
  }
  const pickRange = (key) => { setK(key); setSt(null); };
  const pickModel = (key) => { setModel(key); setType(''); };      // a type chip may not apply to the other model

  const models = h?.models || [];
  const showModelChips = models.length >= 2;
  const activeModel = model || (models.length === 1 ? models[0] : null);
  const typeChips = Object.entries(TYPE_FILTERS).filter(([, v]) => !activeModel || v.models.includes(activeModel));
  const net = h ? Number(h.money_in) - Number(h.money_out) : 0;
  const hasMore = h && h.items.length < h.total;
  const hasReceived = st && Number(st.totals?.received || 0) > 0;

  return (
    <ScrollView style={s.page} contentContainerStyle={{ padding: 16 }}>
      <BackLink onPress={() => navigation.navigate('Home')} label="← Home" />
      <Text style={s.title}>{gt('group.title_finance_history', 'Group Finance History & Statements')}</Text>
      <Text style={s.sub}>Money in and out of the group</Text>

      <GroupPicker pick={pick} />
      {showModelChips && (
        <View style={s.chipRow}>{MODEL_CHIPS.map(([key, l]) => <Chip key={key || 'all'} on={model === key} label={l} onPress={() => pickModel(key)} />)}</View>)}
      <View style={s.chipRow}>{Object.entries(RANGES).map(([key, l]) => <Chip key={key} on={k === key} label={l} onPress={() => pickRange(key)} />)}</View>
      {reachesPastRetention(k) && (
        <Text style={[s.hint, { marginBottom: 10 }]}>ℹ️ {gt('chama.retention.notice', CHAMA_RETENTION_CONFIG.ADMIN_NOTICE)}</Text>)}

      {h && (<>
        <View style={[s.card, { backgroundColor: net < 0 ? colors.signalRedBg : '#fff6ee' }]}>
          <Text style={s.label}>GROUP BALANCE (SELECTED RANGE)</Text>
          <Text style={s.big}>{net < 0 ? '− ' : ''}{fmt(Math.abs(net))}</Text>
          <Text style={s.hint}>Money in: {fmt(h.money_in)}  ·  Money out: {fmt(h.money_out)}</Text>
        </View>
        <View style={s.chipRow}>{typeChips.map(([key, v]) => <Chip key={key || 'all'} on={type === key} label={v.label} onPress={() => setType(key)} />)}</View>
        {h.items.length === 0 && <Text style={s.hint}>No transactions in this range.</Text>}
        {h.items.map((i) => (
          <View key={i.id} style={s.row}>
            <View style={{ flex: 1 }}>
              <Text style={s.v}>{LABEL[i.type] || i.type}{i.member ? ' · ' + i.member : ''}</Text>
              <Text style={s.hint}>{new Date(i.posted_at).toLocaleString()}</Text>
            </View>
            <Text style={{ fontWeight: '800', color: i.direction === 'in' ? colors.signalGreen : colors.signalRed }}>{i.direction === 'in' ? '+' : '−'}{fmt(i.amount)}</Text>
          </View>))}
        {hasMore && <View style={{ marginTop: 10 }}><PrimaryButton label={loadingMore ? 'Loading…' : `Show more (${h.items.length} of ${h.total})`} onPress={more} disabled={loadingMore} /></View>}
        <View style={{ marginTop: 14 }}><PrimaryButton label="Generate Statement" onPress={statement} /></View>
      </>)}

      {st && (
        <View style={[s.card, { marginTop: 12 }]}>
          <Text style={s.cardTitle}>Statement {st.reference}</Text>
          <Text style={s.hint}>{st.group} · {st.group_code} · {st.from} to {st.to}</Text>
          {st.members.map((m) => (
            <View key={m.member_id || m.phone} style={s.row}><Text style={s.k}>{m.member} ({m.phone})</Text>
              <Text style={s.hint}>Saved {fmt(m.contributions)} · Borrowed {fmt(m.loans_taken)} · Repaid {fmt(m.repaid)}{hasReceived ? ` · Received ${fmt(m.received)}` : ''}</Text></View>))}
          <View style={s.row}><Text style={s.k}>Totals</Text>
            <Text style={s.v}>{fmt(st.totals.contributions)} saved · {fmt(st.totals.loans_taken)} lent · {fmt(st.totals.repaid)} repaid{hasReceived ? ` · ${fmt(st.totals.received)} paid out` : ''}</Text></View>
          <View style={s.row}><Text style={s.k}>Group fund now</Text><Text style={s.v}>{fmt(st.pool_now)}</Text></View>
          <View style={{ marginTop: 10 }}>
            <PrimaryButton label="Download PDF" onPress={async () => {
              try { await generateGroupStatementPDF(st); }
              catch (e) { showToast('Could not create the PDF. Try again.', 'warn'); }
            }} />
          </View>
        </View>)}
    </ScrollView>);
}

// Online-required module: shows a professional "internet connection required" message while offline.
export default withChamaOnlineGate(GroupFinanceHistoryScreen, 'chama');
