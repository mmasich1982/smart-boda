// rider-app/src/screens/business/StatementScreens.js
// SMART BIZNA statements (journeys J and O). STRICTLY OFFLINE FIRST: a Summary or Detailed statement is always built from the data stored on this phone,
// never from the server or database, and downloaded as a PDF built on the phone (no email, no internet). A period older than the six months kept on
// the phone is requested from the Smart Bizna Admin, who prepares it from the server records; it arrives here as Ready and is downloaded the same way.
import React, { useState } from 'react';
import { Alert, View, Text } from 'react-native';
import { Screen, BackLink, Title, Sub, Card, Row, Section, Tabs, Btn, Field, Empty, Hint, Badge, Banner, s, C } from './BizUI';
import { useBizData } from '../../hooks/useBusiness';
import store, { BusinessRuleError } from '../../offline/businessRepository';
import * as R from '../../offline/businessReportUtils';
import { kes, fmtDateTime, fmtDate, histRange, rangeLabel, todayEat } from '../../utils/businessFormat';
import { downloadBusinessStatement } from '../../offline/businessStatementPdf';

const TYPES = [{ key: 'summary', label: 'Summary' }, { key: 'detailed', label: 'Detailed' }];
const RANGES = [{ key: 'thisMonth', label: 'This Month' }, { key: 'lastMonth', label: 'Last Month' }, { key: 'last3', label: 'Last 3 Months' }, { key: 'last6', label: 'Last 6 Months' }, { key: 'older', label: 'Older than 6 months' }];
const say = (e) => (e instanceof BusinessRuleError ? e.message : 'Something went wrong. Please try again.');

export function StatementSetupScreen({ navigation, route }) {
  const [type, setType] = useState('summary');
  const [key, setKey] = useState(route.params && RANGES.some((r) => r.key === route.params.key) ? route.params.key : 'thisMonth');
  const [from, setFrom] = useState(''), [to, setTo] = useState(''), [purpose, setPurpose] = useState(''), [busy, setBusy] = useState(false);
  const older = key === 'older';
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
      await store.requestStatement({ type, from: from.trim(), to: to.trim(), purpose: purpose.trim() });
      Alert.alert('Request sent', 'Your request is saved. Smart Bizna Admin will prepare it within 24 hours and it will appear under Saved Statements and Requests.');
      navigation.navigate('StatementList');
    } catch (e) { Alert.alert('Request', say(e)); } finally { setBusy(false); }
  };

  return (
    <Screen>
      <BackLink label="← Back" onPress={() => navigation.goBack()} />
      <Title>Generate a Statement</Title>
      <Sub>Built on this phone from your saved records. No internet or email needed.</Sub>
      <Section>Statement type</Section>
      <Tabs tabs={TYPES} value={type} onChange={setType} />
      <Hint style={{ marginBottom: 8 }}>{type === 'summary' ? 'Totals, Cost Breakdown and By Sales/Service Person, with a verification code.' : 'Everything in the Summary plus every transaction line (voided lines are marked VOID and not counted).'}</Hint>
      <Section>Period</Section>
      <Tabs tabs={RANGES} value={key} onChange={setKey} />
      {older ? (
        <>
          <Banner tone="amber" text="Older statements are provided by Smart Bizna Admin. Your phone keeps six months." />
          <Field label="From (YYYY-MM-DD)" value={from} onChangeText={setFrom} placeholder="2026-01-01" autoCapitalize="none" />
          <Field label="To (YYYY-MM-DD)" value={to} onChangeText={setTo} placeholder="2026-01-31" autoCapitalize="none" hint={`Up to ${todayEat()}`} />
        </>
      ) : <Hint style={{ marginBottom: 8 }}>{rangeLabel(range)}</Hint>}
      <Field label="Purpose (optional)" value={purpose} onChangeText={setPurpose} placeholder="e.g. Bank loan, KRA" />
      {older ? <Btn label="Request from Smart Bizna Admin" onPress={request} disabled={busy} /> : <Btn label="Preview Statement →" onPress={generate} disabled={busy} />}
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
      <Card><Text style={s.label}>Verification code</Text><Text style={{ fontSize: 20, fontWeight: '800', letterSpacing: 1.5, color: C.ink }}>{st.verification_code}</Text>
        <Hint>Worked out on this phone from the business, the period and the four totals. Changing any figure on the PDF will no longer match it.</Hint></Card>
      {st.type === 'detailed' ? <Hint>{(st.lines || []).length} transaction lines will be included.</Hint> : null}
      <Hint style={{ marginBottom: 10 }}>{st.source === 'server' ? 'Prepared by Smart Bizna Admin from the server records.' : 'Built on this phone. Generated ' + fmtDateTime(st.generated_at) + '.'}</Hint>
      <Btn label="⬇️ Download" onPress={download} disabled={busy} />
    </Screen>
  );
}

export function StatementListScreen({ navigation }) {
  const { data } = useBizData(async () => ({ saved: await store.listStatements(), reqs: await store.listRequests() }));
  const statusBadge = (r) => (r.status === 'ready' ? { text: 'Ready', tone: 'green' } : r.status === 'requested' ? { text: 'Requested', tone: 'amber' } : { text: 'Queued', tone: 'soft' });
  return (
    <Screen>
      <BackLink label="← Back" onPress={() => navigation.goBack()} />
      <Title>Saved Statements and Requests</Title>
      <Section>Saved on this phone</Section>
      <Card>
        {data && data.saved.length ? data.saved.map((e) => (
          <View key={e.id} style={{ paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: C.line }}>
            <Text style={{ fontWeight: '700', color: C.ink }}>{e.type === 'detailed' ? 'Detailed' : 'Summary'} · {fmtDate(e.date_from)} – {fmtDate(e.date_to)}</Text>
            <Hint>Code {e.verification_code} · saved {fmtDateTime(e.saved_at)}</Hint>
            <Btn small label="⬇️ Download again" kind="dark" onPress={() => downloadBusinessStatement(e.statement).catch(() => Alert.alert('Download', 'We could not create the PDF. Please try again.'))} style={{ marginTop: 6 }} />
          </View>)) : <Empty>No saved statements yet.</Empty>}
      </Card>
      <Section>Requests to Smart Bizna Admin</Section>
      <Card>
        {data && data.reqs.length ? data.reqs.map((r) => (
          <View key={r.client_id} style={{ paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: C.line }}>
            <Text style={{ fontWeight: '700', color: C.ink }}>{r.statement_type === 'detailed' ? 'Detailed' : 'Summary'} · {fmtDate(r.period_from)} – {fmtDate(r.period_to)}</Text>
            <View style={{ flexDirection: 'row' }}><Badge {...statusBadge(r)} /></View>
            {r.status === 'ready' && r.statement ? <Btn small label="⬇️ Download" kind="dark" onPress={() => downloadBusinessStatement({ ...r.statement, source: 'server' }).catch(() => Alert.alert('Download', 'We could not create the PDF. Please try again.'))} style={{ marginTop: 6 }} /> : null}
          </View>)) : <Empty>No requests yet.</Empty>}
      </Card>
    </Screen>
  );
}
