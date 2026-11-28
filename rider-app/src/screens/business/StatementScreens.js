// rider-app/src/screens/business/StatementScreens.js
// SMART BIZNA statements (journeys J and O). STRICTLY OFFLINE FIRST: a Summary or Detailed statement is always built from the data stored on this phone,
// never from the server or database, and downloaded as a PDF built on the phone (no email, no internet). A period older than the six months kept on
// the phone is requested from the Smart Bizna Admin, who prepares it from the server records; it arrives here as Ready and is downloaded the same way.
import React, { useEffect, useState } from 'react';
import { Alert, View, Text } from 'react-native';
import { Screen, BackLink, Title, Sub, Card, Row, Section, Tabs, Btn, Field, Empty, Hint, Badge, Banner, Pager, s, C } from './BizUI';
import DropdownField from '../../components/DropdownField';
import { STATEMENT_PURPOSES, paginate } from '../../utils/businessLists';
import { useBizData } from '../../hooks/useBusiness';
import store, { BusinessRuleError } from '../../offline/businessRepository';
import * as R from '../../offline/businessReportUtils';
import { kes, fmtDateTime, fmtDate, histRange, rangeLabel, todayEat, HIST_TABS } from '../../utils/businessFormat';
import { statementFee, DEFAULT_STATEMENT_FEES, olderDateBounds } from '../../offline/businessDaily';
import BizDateField from './BizDateField';
import { useTimedMessage } from '../../hooks/useTimedMessage';
import StatementTablesPreview from './StatementTablesPreview';
import { downloadBusinessStatement } from '../../offline/businessStatementPdf';

const TYPES = [{ key: 'summary', label: 'Summary' }, { key: 'detailed', label: 'Detailed' }];
export const REQUEST_SENT_TEXT = 'Your statement request has been successfully submitted to the Smart Bizna Administration Team. Your statement will be prepared and made available within the next 24 hours. Please ensure that you regularly connect to the internet so that the statement can be delivered to your device.';
const RANGES = [...HIST_TABS, { key: 'older', label: 'Older than 3 months' }];     // the four periods on the phone, then the Administrator
const say = (e) => (e instanceof BusinessRuleError ? e.message : 'Something went wrong. Please try again.');

export function StatementSetupScreen({ navigation, route }) {
  const [type, setType] = useState('summary');
  const [key, setKey] = useState(route.params && RANGES.some((r) => r.key === route.params.key) ? route.params.key : 'thisMonth');
  const [from, setFrom] = useState(''), [to, setTo] = useState(''), [purpose, setPurpose] = useState(''), [busy, setBusy] = useState(false);
  const older = key === 'older';
  const sent = useTimedMessage(12000);                             // the green success notice
  const [problem, setProblem] = useState(null);                  // a refused request (for example the same request within 48 hours), shown in the screen, not a pop-up
  const bounds = olderDateBounds(Date.now());                      // From and To: from one year ago to the day before the 3 months kept on the phone
  const [fees, setFees] = useState(DEFAULT_STATEMENT_FEES);       // the Administrator's fees (fetched when online; these are the fallback)
  useEffect(() => { let live = true; try { require('../../api/businessClient').businessStatementFees().then((f) => live && Array.isArray(f && f.tiers) && setFees(f.tiers)).catch(() => {}); } catch (e) { /* offline */ } return () => { live = false; }; }, []);
  const fee = older && /^\d{4}-\d{2}-\d{2}$/.test(from.trim()) ? statementFee(from.trim(), Date.now(), fees) : null;
  const range = older ? null : histRange(key);

  const generate = async () => {
    setBusy(true);
    try {
      const st = await store.buildStatement({ type, fromMs: range[0], toMs: range[1] });
      if (purpose.trim()) st.purpose = purpose.trim();
      navigation.navigate('StatementPreview', { statement: st });
    } catch (e) { Alert.alert('Statement', say(e)); } finally { setBusy(false); }
  };
  const request = async () => {
    setBusy(true);
    try {
      setProblem(null);
      await store.requestStatement({ type, from, to, purpose: purpose.trim(), fees });
      sent.show(REQUEST_SENT_TEXT);
      setFrom(''); setTo('');
    } catch (e) { if (e && e.code === 'DUPLICATE_REQUEST') setProblem(say(e)); else Alert.alert('Request', say(e)); } finally { setBusy(false); }
  };

  return (
    <Screen>
      <BackLink label="← Back" onPress={() => navigation.goBack()} />
      <Title>Generate a Statement</Title>
      <Sub>Built on this phone from your daily summaries. No internet or email needed. The phone keeps this month and the 3 months before it.</Sub>
      <Section>Statement type</Section>
      <Tabs tabs={TYPES} value={type} onChange={setType} />
      <Hint style={{ marginBottom: 8 }}>{type === 'summary' ? 'One row per month: Sales, Purchases, Expenses and Net Income, with the totals, Cost Breakdown and By Sales/Service Person, and a verification code.' : 'For each month, one row per DAY: Sales, Purchases, Expenses and Net Income, then the month total. Each figure is that day\'s total, not individual transactions.'}</Hint>
      <Section>Period</Section>
      <Tabs tabs={RANGES} value={key} onChange={setKey} />
      {older ? (
        <>
          <Banner tone="amber" text="Older statements are provided by Smart Bizna Admin. Your phone keeps this month and the 3 months before it." />
          <BizDateField label="From" value={from} onChange={(v) => { setFrom(v); setProblem(null); if (to && to < v) setTo(''); }} min={bounds.min} max={bounds.max} testID="older-from" hint={`From ${bounds.min} (one year ago) to ${bounds.max}. The last 3 months are made on your phone.`} />
          <BizDateField label="To" value={to} onChange={(v) => { setTo(v); setProblem(null); }} min={from && from > bounds.min ? from : bounds.min} max={bounds.max} testID="older-to" hint={`Up to ${bounds.max}.`} />
          {fee ? (fee.available
            ? <Banner tone={fee.onPhone ? 'green' : 'amber'} text={fee.onPhone ? 'This period is on your phone: choose it from the periods above. It is free.' : `Fee for this statement: KSh ${fee.fee.toLocaleString()} (the oldest month is ${fee.monthsBack} months back).`} />
            : <Banner tone="red" text="Statements are kept for one year. This period is older than that." />) : <Hint>The fee depends on how old the statement is: {fees.map((t) => `${t.from} to ${t.to} months back KSh ${Number(t.fee).toLocaleString()}`).join(' · ')}.</Hint>}
        </>
      ) : <Hint style={{ marginBottom: 8 }}>{rangeLabel(range)}</Hint>}
      <DropdownField label="Purpose" value={purpose} onValueChange={setPurpose} placeholder="Select purpose (optional)..." options={STATEMENT_PURPOSES.map((p) => ({ label: p, value: p }))} />
      {older && sent.message ? <View testID="request-sent" accessibilityRole="alert" accessibilityLiveRegion="polite"><Banner tone="green" text={sent.message} /></View> : null}
      {older && problem ? <Banner tone="amber" text={problem} /> : null}
      {older ? <Btn label="Request from Smart Bizna Admin" onPress={request} disabled={busy || !from || !to} /> : <Btn label="Preview Statement →" onPress={generate} disabled={busy} />}
    </Screen>
  );
}

export function StatementPreviewScreen({ navigation, route }) {
  const st = route.params && route.params.statement;
  const [busy, setBusy] = useState(false), [saved, setSaved] = useState(false);
  if (!st) return <Screen><BackLink label="← Back" onPress={() => navigation.goBack()} /><Empty>Statement not found.</Empty></Screen>;
  const t = st.totals;
  const download = async () => {
    setBusy(true);
    try {
      if (!saved && st.source !== 'server') { await store.saveStatement(st); setSaved(true); }     // kept in the statements list on the phone
      await downloadBusinessStatement(st);
    } catch (e) { Alert.alert('Download', 'We could not create the PDF. Your statement is saved; try again from Saved Statements.'); } finally { setBusy(false); }
  };
  return (
    <Screen>
      <BackLink label="← Back" onPress={() => navigation.goBack()} />
      <Title>{st.type === 'detailed' ? 'Detailed' : 'Summary'} Statement</Title>
      <Sub>{st.business_name} · {fmtDate(st.date_from)} – {fmtDate(st.date_to)}</Sub>
      <Card>
        <Row k="Total Income" v={kes(t.income)} /><Row k="Total Purchases" v={kes(t.purchases)} /><Row k="Total Expenses" v={kes(t.expenses)} />
        <Row k="Net Profit" v={kes(t.net_profit)} bold color={t.net_profit < 0 ? C.red : C.green} />
      </Card>
      <StatementTablesPreview statement={st} />
      <Card><Text style={s.label}>Verification code</Text><Text style={{ fontSize: 20, fontWeight: '800', letterSpacing: 1.5, color: C.ink }}>{st.verification_code}</Text>
        <Hint>Worked out on this phone from the business, the period and the four totals. Changing any figure on the PDF will no longer match it.</Hint></Card>
            <Hint style={{ marginBottom: 10 }}>{st.source === 'server' ? 'Prepared by Smart Bizna Admin from the server records.' : 'Built on this phone. Generated ' + fmtDateTime(st.generated_at) + '.'}</Hint>
      <Btn label="⬇️ Download" onPress={download} disabled={busy} />
    </Screen>
  );
}

export function StatementListScreen({ navigation }) {
  const { data } = useBizData(async () => ({ saved: await store.listStatements(), reqs: await store.listRequests() }));
  const [pageS, setPageS] = useState(1), [pageR, setPageR] = useState(1);        // PAGING: each list is paged on its own, 20 a page
  const ps = paginate(data ? data.saved : [], pageS), pr = paginate(data ? data.reqs : [], pageR);
  const statusBadge = (r) => (r.status === 'ready' ? { text: 'Ready', tone: 'green' } : r.status === 'requested' ? { text: 'Requested', tone: 'amber' } : { text: 'Queued', tone: 'soft' });
  return (
    <Screen>
      <BackLink label="← Back" onPress={() => navigation.goBack()} />
      <Title>Saved Statements and Requests</Title>
      <Section>Saved on this phone</Section>
      <Pager {...ps} onChange={setPageS} />
      <Card>
        {data && data.saved.length ? ps.rows.map((e) => (
          <View key={e.id} style={{ paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: C.line }}>
            <Text style={{ fontWeight: '700', color: C.ink }}>{e.type === 'detailed' ? 'Detailed' : 'Summary'} · {fmtDate(e.date_from)} – {fmtDate(e.date_to)}</Text>
            <Hint>Code {e.verification_code} · saved {fmtDateTime(e.saved_at)}</Hint>
            <Btn small label="⬇️ Download again" kind="dark" onPress={() => downloadBusinessStatement(e.statement).catch(() => Alert.alert('Download', 'We could not create the PDF. Please try again.'))} style={{ marginTop: 6 }} />
          </View>)) : <Empty>No saved statements yet.</Empty>}
      </Card>
      <Pager {...ps} onChange={setPageS} />
      <Section>Requests to Smart Bizna Admin</Section>
      <Pager {...pr} onChange={setPageR} />
      <Card>
        {data && data.reqs.length ? pr.rows.map((r) => (
          <View key={r.client_id} style={{ paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: C.line }}>
            <Text style={{ fontWeight: '700', color: C.ink }}>{r.statement_type === 'detailed' ? 'Detailed' : 'Summary'} · {fmtDate(r.period_from)} – {fmtDate(r.period_to)}</Text>
            <View style={{ flexDirection: 'row' }}><Badge {...statusBadge(r)} /></View>
            {r.status === 'ready' && r.statement ? <Btn small label="⬇️ Download" kind="dark" onPress={() => downloadBusinessStatement({ ...r.statement, source: 'server' }).catch(() => Alert.alert('Download', 'We could not create the PDF. Please try again.'))} style={{ marginTop: 6 }} /> : null}
          </View>)) : <Empty>No requests yet.</Empty>}
      </Card>
      <Pager {...pr} onChange={setPageR} />
    </Screen>
  );
}
