// rider-app/src/screens/chama/CircleRulesForm.js
// The money rules of a Merry-Go-Round circle, used by "New circle" and by "Circle settings":
//   each contribution -> how often members contribute -> how often the pool is paid out
//   -> does the recipient also contribute? -> does the Treasurer take part?  -> live summary.
// The summary is worked out by the server (POST /chama/mgr/preview) so it uses the real calendar: a month with 26 contribution
// days and a month with 27 give different targets, and an impossible combination is explained before anything is saved.
import React, { useEffect, useState } from 'react';
import { View, Text, TextInput } from 'react-native';
import { s, fmt, Chip } from './chamaStyles';
import ScheduleEditor, { DEFAULT_SCHED } from './ScheduleEditor';
import { niceDate } from './common';
import { mgrPreview } from '../../api/groupsClient';
import colors from '../../theme/colors';

const num = (v) => parseFloat(String(v).replace(/,/g, ''));

const YesNo = ({ value, onChange, disabled }) => (
  <View style={s.chipRow}>
    <Chip on={!!value} label="Yes" onPress={() => !disabled && onChange(true)} />
    <Chip on={!value} label="No" onPress={() => !disabled && onChange(false)} />
  </View>);

/** The summary card under the form. */
export function RulesSummary({ amount, sched, contrib, recipientPays, hands, groupId }) {
  const [pv, setPv] = useState(null);
  const a = num(amount);
  useEffect(() => {
    if (!(a > 0) || !sched) { setPv(null); return undefined; }
    let live = true;
    const t = setTimeout(() => {
      mgrPreview({ amount: a, sched, contrib_sched: contrib || { type: 'same' }, recipient_pays: !!recipientPays, hands: hands || 0 }, groupId)
        .then((r) => { if (live) setPv(r); })
        .catch(() => { if (live) setPv(null); });
    }, 400);
    return () => { live = false; clearTimeout(t); };
  }, [a, JSON.stringify(sched), JSON.stringify(contrib), !!recipientPays, hands, groupId]);

  if (!(a > 0)) return null;
  if (!pv) return <View style={[s.card, { backgroundColor: '#f9f8f5' }]}><Text style={s.hint}>Working out the summary…</Text></View>;
  if (!pv.ok) {
    return (
      <View style={[s.card, { borderColor: colors.signalRed, backgroundColor: '#fdecec' }]}>
        <Text style={{ fontWeight: '800', color: colors.ink }}>⚠️ This combination does not work</Text>
        <Text style={s.hint}>{pv.error}</Text>
      </View>);
  }
  const p0 = pv.periods[0];
  const counts = pv.periods.map((p) => p.contributions);
  const varies = new Set(counts).size > 1;
  return (
    <View style={[s.card, { backgroundColor: '#f9f8f5' }]}>
      <Text style={s.cardTitle}>Summary</Text>
      {p0 && (
        <Text style={{ color: colors.ink, lineHeight: 20 }}>
          Each person pays <Text style={{ fontWeight: '800' }}>{fmt(a)}</Text>{pv.contrib_label ? ` (${pv.contrib_label.toLowerCase()})` : ''}
          {p0.contributions > 1 ? <> = <Text style={{ fontWeight: '800' }}>{fmt(p0.per_person)}</Text> for the payout on {niceDate(p0.payout)} ({p0.contributions} contributions)</> : <> for each payout</>}.
        </Text>)}
      {varies && <Text style={s.hint}>The number of contribution days changes between payouts: {counts.join(', ')} for the next {counts.length}. The app shows the exact amount for each round.</Text>}
      {p0 && p0.pool != null
        ? <Text style={{ color: colors.ink, marginTop: 6, lineHeight: 20 }}>With {pv.hands} turns the recipient receives <Text style={{ fontWeight: '800' }}>{fmt(p0.pool)}</Text>
            {pv.recipient_pays ? ' (everyone pays, including the recipient).' : ' (the recipient does not pay that round).'}</Text>
        : <Text style={[s.hint, { marginTop: 6 }]}>The recipient receives {pv.recipient_pays ? 'everyone' : 'everyone else'}'s round amount. The total shows once people are added.</Text>}
    </View>);
}

/**
 * Props: values and setters for the form, `isNew`, `locked` (cycle running), `cycleNo`, `hands` (turns in the circle),
 * `monthlyFlags`, `treasurerInCircle`, `groupId`.
 */
export default function CircleRulesForm({
  amount, setAmount, contrib, setContrib, sched, setSched, recipientPays, setRecipientPays, treasurerJoins, setTreasurerJoins,
  isNew, locked, cycleNo, hands, monthlyFlags, treasurerInCircle, groupId, pendingNote,
}) {
  const sameAsPayout = !contrib;
  return (
    <View>
      {locked && (
        <View style={s.banner}><Text>🔒</Text><Text style={{ flex: 1 }}>
          The money rules are locked for this cycle. Anything you change here starts from cycle {cycleNo + 1}.</Text></View>)}
      {!!pendingNote && <View style={s.banner}><Text>🕒</Text><Text style={{ flex: 1 }}>{pendingNote}</Text></View>}

      <Text style={s.label}>EACH CONTRIBUTION (KSH) *</Text>
      <TextInput style={s.input} keyboardType="number-pad" value={amount} onChangeText={setAmount} placeholder="e.g. 100" />
      <Text style={s.hint}>What each person pays on every contribution day.</Text>

      {!isNew && (
        <View style={[s.chipRow, { marginTop: 8 }]}>
          <Chip on={sameAsPayout} label="One payment per payout" onPress={() => setContrib(null)} />
          <Chip on={!sameAsPayout} label="Own contribution days" onPress={() => !contrib && setContrib({ ...(sched || DEFAULT_SCHED) })} />
        </View>)}
      {!sameAsPayout && <ScheduleEditor kind="contribution" sched={contrib} onChange={setContrib} flags={contrib?.type === 'monthly' ? monthlyFlags : []} />}

      <View style={{ height: 8 }} />
      <ScheduleEditor kind="payout" sched={sched} onChange={setSched} flags={monthlyFlags} />

      <Text style={[s.label, { marginTop: 12 }]}>DOES THE PERSON RECEIVING THE POOL ALSO CONTRIBUTE THAT ROUND?</Text>
      <YesNo value={recipientPays} onChange={setRecipientPays} />
      <Text style={s.hint}>No: the recipient receives without paying that round. Yes: everyone pays every round, including the recipient.</Text>

      <Text style={[s.label, { marginTop: 12 }]}>DOES THE TREASURER ALSO CONTRIBUTE AND RECEIVE A PAYOUT?</Text>
      <YesNo value={treasurerJoins} onChange={setTreasurerJoins} disabled={treasurerInCircle && treasurerJoins} />
      <Text style={s.hint}>
        {treasurerInCircle && treasurerJoins
          ? 'You are in this circle as a member. Remove yourself from the circle first to switch this off.'
          : 'Yes: you can add yourself as a member with your own turn. Your own contributions show as "self-confirmed" and your own payout as "self-paid", so members can see them.'}
      </Text>

      <RulesSummary amount={amount} sched={sched} contrib={contrib} recipientPays={recipientPays} hands={hands} groupId={groupId} />
    </View>);
}