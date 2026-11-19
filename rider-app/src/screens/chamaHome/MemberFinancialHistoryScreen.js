// rider-app/src/screens/chamaHome/MemberFinancialHistoryScreen.js
// SMART CHAMA: "My Financial History and Statements" - the member's OWN group money: paid in, loan repaid, received, balance owing,
// for This Month / Last Month / 6 Months / Since Joining, with a Summary and a Detailed PDF statement ("Smart Chama Digital").
// OFFLINE-FIRST: the payments are read from the phone (the six months kept by the existing Chama history), so this screen opens and the
// statements print with no internet. Online, a quiet catch-up brings in newer payments, the server's Since Joining totals and the loan balance.
import React, { useCallback, useState } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Screen, BackLink, Title, Sub, Card, Hint, Row, Btn, Tabs } from '../business/BizUI';
import useChamaMembership from '../../hooks/useChamaMembership';
import { PERIODS, memberTotals, statementLines, hasLoans } from '../../utils/memberStatement';
import { loadTbPayments, getMeta } from '../../offline/chamaTbHistoryRepository';
import { loadMgrContributions } from '../../offline/chamaMgrHistoryRepository';
import { syncTbHistory, refreshTbSummary } from '../../offline/chamaTbHistorySync';
import { syncMgrHistory } from '../../offline/chamaMgrHistorySync';
import { myLoans } from '../../api/groupsClient';
import { generateMemberStatementPDF } from '../../utils/pdfGenerator';
import { getLocalRiderStatus } from '../../offline/db';
import { brandName } from '../../vehicle/vehicleStore';

const kes = (n) => 'KSh ' + Math.round(Number(n || 0)).toLocaleString();
const LABEL = Object.fromEntries(PERIODS);

export default function MemberFinancialHistoryScreen({ navigation }) {
  const m = useChamaMembership();
  const groups = (m.memberships || []).map((x) => ({ id: x.group_id, name: x.group_name || 'My group', type: x.group_type }));
  const [gid, setGid] = useState(null);
  const [period, setPeriod] = useState('thisMonth');
  const [data, setData] = useState({ savings: [], repayments: [], mgr: [], received: [] });
  const [extra, setExtra] = useState({});
  const [msg, setMsg] = useState(null);
  const g = groups.find((x) => x.id === gid) || groups[0] || null;

  const load = useCallback(async (group) => {
    if (!group) return;
    const readLocal = async () => {
      const tb = group.type === 'tb' ? await loadTbPayments(group.id) : [];
      const mgr = group.type === 'mgr' ? await loadMgrContributions(group.id) : [];
      const meta = group.type === 'tb' ? await getMeta(group.id) : {};
      setData({ savings: tb.filter((x) => x.kind === 'savings'), repayments: tb.filter((x) => x.kind === 'loan_repayment'), mgr, received: [] });
      const sum = meta && meta.summary;
      setExtra((e) => ({ ...e, sinceJoining: sum ? { paid_in: sum.savings.total, repaid: sum.loan_repayment.total, received: (e.sinceJoining && e.sinceJoining.received) || 0 } : e.sinceJoining }));
    };
    await readLocal();                                     // the phone's copy first (works offline)
    try {
      if (group.type === 'tb') { await syncTbHistory(group.id); await refreshTbSummary(group.id); } else await syncMgrHistory(group.id);
      await readLocal();
      if (hasLoans(group.type)) {
        const r = await myLoans();
        const L = ((r.groups || []).find((x) => x.group_id === group.id) || {}).loan;
        if (L) setExtra((e) => ({ ...e, owing: Number(L.balance), sinceJoining: { ...(e.sinceJoining || {}), received: Number(L.principal) || (e.sinceJoining && e.sinceJoining.received) || 0 } }));
        else setExtra((e) => ({ ...e, owing: 0 }));
      }
    } catch (e) { /* offline: keep what the phone has */ }
  }, []);
  useFocusEffect(useCallback(() => { load(g); }, [g && g.id, m.loaded])); // eslint-disable-line react-hooks/exhaustive-deps

  const totals = memberTotals(data, period, new Date(), { owing: hasLoans(g && g.type) ? extra.owing : null, sinceJoining: extra.sinceJoining });
  const lines = statementLines(data, period);

  const print = async (detailed) => {
    setMsg(null);
    try {
      const st = (await getLocalRiderStatus()) || {};
      const ref = `SC-${String(st.rider_id || '').slice(0, 6).toUpperCase()}-${Date.now().toString(36).toUpperCase()}`;
      await generateMemberStatementPDF({ member: st.full_name || '', phone: st.mobile_number || '', group: g ? g.name : '', period_label: `${LABEL[period]}, up to ${new Date().toLocaleDateString()}`,
        detailed, totals, lines, reference: ref });
    } catch (e) { setMsg('Could not create the statement. Please try again.'); }
  };

  return (
    <Screen>
      <BackLink onPress={() => navigation.navigate('Home')} />
      <Title>📈 My Financial History</Title>
      <Sub>Your own money in your group</Sub>
      {groups.length > 1 ? <Tabs value={g && g.id} onChange={setGid} tabs={groups.map((x) => ({ key: x.id, label: x.name }))} /> : g ? <Hint>{g.name}</Hint> : null}
      {!g ? <Card><Hint>You are not in a group yet.</Hint></Card> : (
        <>
          <Tabs value={period} onChange={setPeriod} tabs={PERIODS.map(([k, l]) => ({ key: k, label: l }))} />
          <Card>
            <Row k="Paid in" v={kes(totals.paidIn)} bold />
            {hasLoans(g.type) ? <Row k="Loan repaid" v={kes(totals.repaid)} /> : null}
            {hasLoans(g.type) || totals.received > 0 ? <Row k="Received" v={kes(totals.received)} /> : null}
            {hasLoans(g.type) ? <Row k="Balance owing" v={totals.owing === null ? 'Connect to see' : kes(totals.owing)} bold /> : null}
          </Card>
          <Card>
            {lines.length === 0 ? <Hint>No payments in this period yet.</Hint> : lines.slice(0, 20).map((l, i) => (
              <Row key={i} k={`${new Date(l.at).toLocaleDateString()}  ${l.label}`} v={kes(l.amount)} />))}
          </Card>
          <Btn label="Summary Statement (PDF)" onPress={() => print(false)} />
          <Btn label="Detailed Statement (PDF)" kind="dark" onPress={() => print(true)} />
          {msg ? <Hint>{msg}</Hint> : null}
          <Hint>{`${brandName()} keeps the last 6 months on this phone. "Since Joining" totals come from the server when you are online.`}</Hint>
        </>
      )}
    </Screen>
  );
}
