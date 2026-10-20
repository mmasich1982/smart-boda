// rider-app/src/screens/chama/MgrCircleScreen.js
// One Merry-Go-Round circle, for the Treasurer (route 'MgrHub' {groupId, circleId}; circleId 'new' creates one).
//   set-up (name, amount, payout schedule) -> people (single / double turn) -> turn order -> start
//   -> each round: who has paid, people noted (exceptions), payout -> new cycle.
import React, { useCallback, useState } from 'react';
import { withChamaOnlineGate } from '../../components/ChamaOnlineGate';
import { View, Text, TextInput, TouchableOpacity, ScrollView } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import BackLink from '../../components/BackLink';
import PrimaryButton from '../../components/PrimaryButton';
import { useToast } from '../../components/Toast';
import {
  mgrCircle, mgrCircles, mgrCreateCircle, mgrUpdateCircle, mgrDeleteCircle, mgrSetPerson, mgrRemovePerson, mgrReplacePerson,
  mgrSetOrder, mgrStart, mgrPayout, mgrNote, mgrUnnote, apiError,
} from '../../api/groupsClient';
import { s, fmt, Chip } from './chamaStyles';
import ScheduleEditor, { DEFAULT_SCHED } from './ScheduleEditor';
import { niceDate } from './common';
import colors from '../../theme/colors';
import { useGroupText } from './groupText';

const keyOf = (m, h) => `${m}:${h}`;

function MgrCircleScreen({ navigation, route }) {
  const gt = useGroupText();
  const { showToast } = useToast();
  const { groupId, circleId } = route.params || {};
  const isNew = circleId === 'new';
  const [d, setD] = useState(null);
  const [members, setMembers] = useState([]);        // everyone in the group, to add to the circle
  const [name, setName] = useState(''), [amount, setAmount] = useState('');
  const [sched, setSched] = useState(DEFAULT_SCHED);
  const [turns, setTurns] = useState({});
  const [confirm, setConfirm] = useState(null);      // 'payout' | 'delete'
  const [noting, setNoting] = useState(null);        // member_id being noted
  const [showSetup, setShowSetup] = useState(false);
  const [replacing, setReplacing] = useState(null);  // member_id being replaced by another member of the group
  const [busy, setBusy] = useState(false);

  const fill = (r) => {
    setD(r); setName(r.name); setAmount(String(Math.round(Number(r.amount) || 0))); setSched(r.sched || DEFAULT_SCHED);
    const t = {};
    r.turns.forEach((x) => { t[keyOf(x.member_id, x.hand_no)] = String(x.turn); });
    r.people.forEach((p) => { for (let h = 1; h <= p.hands; h++) if (t[keyOf(p.member_id, h)] === undefined) t[keyOf(p.member_id, h)] = ''; });
    setTurns(t);
  };
  const load = useCallback(() => {
    if (isNew) return Promise.resolve();
    return Promise.all([mgrCircle(circleId, groupId), mgrCircles(groupId)])
      .then(([r, list]) => { fill(r); setMembers(list.members || []); })
      .catch((e) => showToast(apiError(e, 'Could not load this circle.'), 'warn'));
  }, [circleId, groupId, isNew]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const run = async (fn, ok, after) => {
    if (busy) return;
    setBusy(true);
    try { const r = await fn(); if (ok) showToast(ok(r), 'success'); if (after) after(r); else await load(); }
    catch (e) { showToast(apiError(e, 'Could not complete this. Check your connection.'), 'warn'); await load(); }
    finally { setBusy(false); setConfirm(null); }
  };

  const R = d?.round;
  const num = (v) => parseFloat(String(v).replace(/,/g, ''));

  // ---------- new circle ----------
  if (isNew) {
    const create = () => {
      if (!name.trim()) return showToast('Give the circle a name, for example "Saturday circle".', 'warn');
      if (!(num(amount) > 0)) return showToast('Enter the amount each person pays.', 'warn');
      run(() => mgrCreateCircle({ name: name.trim(), amount: num(amount), sched }, groupId), () => 'Circle created. Now add the people.',
        (c) => navigation.replace('MgrHub', { groupId, circleId: c.id }));
    };
    return (
      <ScrollView style={s.page} contentContainerStyle={{ padding: 16 }}>
        <BackLink onPress={() => navigation.goBack()} label="← Manage Chama" />
        <Text style={s.title}>🔄 New circle</Text>
        <Text style={s.sub}>A circle has its own amount, payout days and people.</Text>
        <View style={s.card}>
          <Text style={s.label}>CIRCLE NAME *</Text>
          <TextInput style={s.input} value={name} onChangeText={setName} placeholder="e.g. Saturday circle" maxLength={40} />
          <Text style={s.label}>AMOUNT EACH PERSON PAYS (KSH) *</Text>
          <TextInput style={s.input} keyboardType="number-pad" value={amount} onChangeText={setAmount} placeholder="e.g. 500" />
          <ScheduleEditor sched={sched} onChange={setSched} />
        </View>
        <PrimaryButton label="Create circle" onPress={create} disabled={busy} />
      </ScrollView>);
  }

  // ---------- existing circle ----------
  const saveSetup = () => {
    if (!name.trim()) return showToast('Give the circle a name.', 'warn');
    if (!(num(amount) > 0)) return showToast('Enter the amount each person pays.', 'warn');
    run(() => mgrUpdateCircle(circleId, { name: name.trim(), amount: num(amount), sched }, groupId), () => 'Saved.', (r) => { fill(r); setShowSetup(false); });
  };
  const saveOrder = () => {
    const rows = [];
    for (const p of d.people) for (let h = 1; h <= p.hands; h++) rows.push({ member_id: p.member_id, hand_no: h, turn: parseInt(turns[keyOf(p.member_id, h)], 10) || 0 });
    const nums = rows.map((r) => r.turn).sort((a, b) => a - b);
    if (!nums.every((n, i) => n === i + 1)) return showToast('Give every turn a different number: 1, 2, 3 ... with no gaps.', 'warn');
    run(() => mgrSetOrder(circleId, rows, groupId), () => 'Turn order saved.');
  };
  const inCircle = new Set((d?.people || []).map((p) => p.member_id));
  const candidates = members.filter((m) => !inCircle.has(m.member_id));
  const canEditPeople = true;
  const exceptions = R?.noted || [];

  return (
    <ScrollView style={s.page} contentContainerStyle={{ padding: 16 }}>
      <BackLink onPress={() => navigation.goBack()} label="← Manage Chama" />
      <Text style={s.title}>🔄 {d?.name || gt('group.title_pay_out', 'Circle')}</Text>
      {d && (<>
        <Text style={s.sub}>{fmt(d.amount)} each · {d.sched_label || 'payout days not set'} · {d.people.length} people{d.hands > d.people.length ? ` (${d.hands} turns)` : ''}</Text>

        {d.needs_season_setup && <View style={s.banner}><Text>🆕</Text><Text style={{ flex: 1 }}>New season. Give the new people their turns in the order below, then start the new season.</Text></View>}
        {d.new_season && !d.needs_season_setup && <View style={s.banner}><Text>🆕</Text><Text style={{ flex: 1 }}>Cycle {d.cycle_no} has begun. The order can still change until the first payout.</Text></View>}
        {!R && d.status === 'draft' && <View style={s.banner}><Text>ℹ️</Text><Text style={{ flex: 1 }}>Not started. Add people, give each turn a number, then press Start.</Text></View>}

        {/* shortcuts */}
        <View style={{ flexDirection: 'row', gap: 10, marginBottom: 12 }}>
          <TouchableOpacity style={[s.card, { flex: 1, marginBottom: 0 }]} onPress={() => navigation.navigate('MgrSwaps', { groupId, circleId })}>
            <Text style={{ fontWeight: '800' }}>🔁 Swap requests ›</Text></TouchableOpacity>
          <TouchableOpacity style={[s.card, { flex: 1, marginBottom: 0 }]} onPress={() => navigation.navigate('MgrActivity', { groupId, circleId })}>
            <Text style={{ fontWeight: '800' }}>🕘 Activity ›</Text></TouchableOpacity>
        </View>

        {/* round */}
        {R && (<>
          <View style={[s.card, { borderColor: colors.bodaOrange }]}>
            <Text style={s.hint}>Cycle {R.cycle_no} · Round {R.round_no} · Turn {R.turn_no} of {d.turns.length} · due {niceDate(R.deadline)}</Text>
            <Text style={{ fontWeight: '800', marginTop: 4 }}>🎁 {R.recipient} receives this round</Text>
            <Text style={s.label}>POOL SO FAR</Text>
            <Text style={s.big}>{fmt(R.pot)}</Text>
            <Text style={s.hint}>of {fmt(R.expected)} expected · {R.paid_count} of {R.member_count} people done</Text>
          </View>
          {R.block && <View style={s.banner}><Text>⏳</Text><Text style={{ flex: 1, fontWeight: '700' }}>{R.block}</Text></View>}

          <View style={s.card}>
            <Text style={s.cardTitle}>Who has paid</Text>
            {R.roster.map((m) => (
              <View key={m.member_id}>
                <View style={s.row}>
                  <Text style={s.k}>{m.turns.join(' & ')}. {m.name}{m.hands > 1 ? ' ✌️' : ''}{m.is_recipient ? ' 🎁' : ''}</Text>
                  <Text style={[s.v, m.noted && { color: colors.signalAmber }]}>
                    {m.is_recipient && m.owed_total === 0 ? 'Receiving' : m.complete ? '✅ Paid' : m.noted ? `📝 Noted · owes ${fmt(m.owed)}` : `Owes ${fmt(m.owed)}`}</Text>
                </View>
                {m.noted && <Text style={s.hint}>{m.note_reason}{m.note_text ? ` · ${m.note_text}` : ''}</Text>}
                {m.noted && <TouchableOpacity onPress={() => run(() => mgrUnnote(circleId, m.member_id, groupId), () => 'Note removed.')}><Text style={{ color: colors.signalRed, fontWeight: '700', marginBottom: 6 }}>Remove note</Text></TouchableOpacity>}
                {!m.complete && !m.noted && !m.is_recipient && (noting === m.member_id ? (
                  <View style={{ marginBottom: 8 }}>
                    <Text style={s.label}>WHY CAN THIS PERSON NOT PAY?</Text>
                    {d.exception_reasons.map((why) => (
                      <TouchableOpacity key={why} style={s.row} onPress={() => { setNoting(null); run(() => mgrNote(circleId, { member_id: m.member_id, reason: why }, groupId), () => 'Noted. The payout can go ahead.'); }}>
                        <Text>{why}</Text></TouchableOpacity>))}
                    <TouchableOpacity onPress={() => setNoting(null)}><Text style={{ color: colors.inkSoft, marginTop: 6 }}>Cancel</Text></TouchableOpacity>
                  </View>
                ) : <TouchableOpacity onPress={() => setNoting(m.member_id)}><Text style={{ color: colors.bodaOrange, fontWeight: '700', marginBottom: 6 }}>Cannot pay? Note why</Text></TouchableOpacity>)}
              </View>))}
            {R.short > 0 && <Text style={[s.hint, { color: colors.signalAmber }]}>The pool will be {fmt(R.short)} short because of noted people.</Text>}
            {R.pending > 0 && <Text style={s.hint}>{R.pending} payment(s) wait for you in Contributions.</Text>}
          </View>

          {confirm === 'payout' ? (
            <View style={[s.card, { borderColor: colors.bodaOrange }]}>
              <Text style={{ fontWeight: '800' }}>I have handed {fmt(R.pot)} to {R.recipient}.</Text>
              <View style={{ height: 8 }} />
              <PrimaryButton label="Yes, confirm payout" onPress={() => run(mgrPayout.bind(null, circleId, groupId), (r) => `💸 ${fmt(r.paid)} paid to ${r.to}${r.new_cycle ? ' · new cycle starts' : ''}`)} disabled={busy} />
              <TouchableOpacity onPress={() => setConfirm(null)}><Text style={{ color: colors.inkSoft, marginTop: 8, textAlign: 'center' }}>Cancel</Text></TouchableOpacity>
            </View>
          ) : <PrimaryButton label={`💸 Pay out ${fmt(R.pot)}`} disabled={!R.can_pay || busy} onPress={() => setConfirm('payout')} />}
        </>)}

        {/* people and order */}
        {canEditPeople && (<>
          <Text style={[s.cardTitle, { marginTop: 16 }]}>People in this circle</Text>
          <View style={s.card}>
            {d.people.length === 0 && <Text style={s.hint}>Nobody yet. Add people below.</Text>}
            {d.people.map((p) => (
              <View key={p.member_id} style={[s.row, { flexWrap: 'wrap' }]}>
                <View style={{ flex: 1 }}>
                  <Text style={s.v}>{p.name}{p.double ? ' ✌️' : ''}</Text>
                  <Text style={s.hint}>{p.phone}{p.joins_next_cycle ? ' · joins next cycle' : ''}{!p.linked ? ' · not signed in yet' : ''}</Text>
                </View>
                <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
                  <Chip on={p.double} label={p.double ? 'Double turn' : 'Single'} onPress={() => run(() => mgrSetPerson(circleId, p.member_id, p.double ? 1 : 2, groupId))} />
                  {d.status === 'draft' && <TouchableOpacity onPress={() => run(() => mgrRemovePerson(circleId, p.member_id, groupId))}><Text style={{ color: colors.signalRed, fontWeight: '800', fontSize: 18 }}>✕</Text></TouchableOpacity>}
                  {d.status !== 'draft' && <Chip on={replacing === p.member_id} label="Replace" onPress={() => setReplacing(replacing === p.member_id ? null : p.member_id)} />}
                </View>
                {replacing === p.member_id && (
                  <View style={{ width: '100%', marginTop: 8 }}>
                    <Text style={s.hint}>Choose who takes over {p.name}'s open turns. Turns already paid stay with {p.name}; money already paid counts for the new person.</Text>
                    <View style={s.chipRow}>{candidates.map((m) => <Chip key={m.member_id} on={false} label={m.name}
                      onPress={() => { setReplacing(null); run(() => mgrReplacePerson(circleId, p.member_id, m.member_id, groupId), () => `🔁 ${m.name} replaces ${p.name}`); }} />)}</View>
                    {candidates.length === 0 && <Text style={s.hint}>Every other member is already in this circle. Add the new person in Set up & members first.</Text>}
                  </View>)}
              </View>))}
            {candidates.length > 0 && (<>
              <Text style={[s.label, { marginTop: 10 }]}>ADD A PERSON</Text>
              <View style={s.chipRow}>{candidates.map((m) => <Chip key={m.member_id} on={false} label={`+ ${m.name}`} onPress={() => run(() => mgrSetPerson(circleId, m.member_id, 1, groupId))} />)}</View>
              {R && <Text style={s.hint}>New people join from the next cycle.</Text>}
            </>)}
            {candidates.length === 0 && members.length > 0 && <Text style={s.hint}>Everyone in your group is already in this circle. Add more people from Set up & members.</Text>}
          </View>

          {d.people.length > 0 && d.order_editable && (
            <View style={s.card}>
              <Text style={s.cardTitle}>Turn order</Text>
              <Text style={s.hint}>Type the turn number for each turn. 1 receives first. A double-turn person has two turns; avoid putting them back to back.</Text>
              {d.people.flatMap((p) => Array.from({ length: p.hands }, (_, i) => i + 1).map((h) => (
                <View key={keyOf(p.member_id, h)} style={s.row}>
                  <Text style={s.k}>{p.name}{p.hands > 1 ? ` · turn ${h === 1 ? 'A' : 'B'}` : ''}</Text>
                  <TextInput style={[s.input, { width: 70, marginBottom: 0, textAlign: 'center' }]} keyboardType="number-pad"
                    value={turns[keyOf(p.member_id, h)] ?? ''} onChangeText={(v) => setTurns({ ...turns, [keyOf(p.member_id, h)]: v })} />
                </View>)))}
              <View style={{ height: 8 }} /><PrimaryButton label="Save turn order" onPress={saveOrder} disabled={busy} />
            </View>)}
          {!R && <PrimaryButton label={d.needs_season_setup ? '▶ Start new season' : '▶ Start Merry-Go-Round'} disabled={!d.order_complete || busy}
            onPress={() => run(() => mgrStart(circleId, groupId), () => 'Started. Everyone can now see their turn.')} />}
          {!R && !d.order_complete && d.people.length > 0 && <Text style={s.hint}>Save the turn order first. Every turn needs a number.</Text>}
        </>)}

        {/* schedule view */}
        {d.turns.length > 0 && (<>
          <Text style={[s.cardTitle, { marginTop: 16 }]}>Payout schedule</Text>
          {d.turns.map((x) => (
            <View key={`${x.turn}`} style={[s.row, x.status === 'current' && { backgroundColor: '#fff6ee' }]}>
              <Text style={s.k}>{x.turn}. {x.name}{x.hand_no === 2 || d.people.find((p) => p.member_id === x.member_id)?.double ? ' ✌️' : ''}{x.status === 'current' ? ' 🎁 now' : ''}</Text>
              <Text style={s.v}>{x.status === 'paid' ? '✅ paid' : niceDate(x.date)}</Text></View>))}
        </>)}

        {/* settings */}
        {canEditPeople && (<>
          <TouchableOpacity onPress={() => setShowSetup(!showSetup)} style={{ marginTop: 16 }}>
            <Text style={{ fontWeight: '800', color: colors.bodaOrange }}>{showSetup ? '▾' : '▸'} Circle settings (name, amount, payout days)</Text></TouchableOpacity>
          {showSetup && (
            <View style={[s.card, { marginTop: 8 }]}>
              <Text style={s.label}>CIRCLE NAME</Text>
              <TextInput style={s.input} value={name} onChangeText={setName} maxLength={40} />
              <Text style={s.label}>AMOUNT EACH PERSON PAYS (KSH)</Text>
              <TextInput style={s.input} keyboardType="number-pad" value={amount} onChangeText={setAmount} />
              {R && <Text style={s.hint}>A new amount applies from the next round.</Text>}
              <ScheduleEditor sched={sched} onChange={setSched} flags={d.monthly_flags} />
              <PrimaryButton label="Save settings" onPress={saveSetup} disabled={busy} />
            </View>)}
          {d.status === 'draft' && (confirm === 'delete'
            ? <View style={[s.card, { borderColor: colors.signalRed }]}><Text style={{ fontWeight: '700' }}>Delete this circle?</Text>
                <PrimaryButton label="Yes, delete" onPress={() => run(() => mgrDeleteCircle(circleId, groupId), () => 'Circle deleted.', () => navigation.goBack())} />
                <TouchableOpacity onPress={() => setConfirm(null)}><Text style={{ color: colors.inkSoft, marginTop: 8, textAlign: 'center' }}>Cancel</Text></TouchableOpacity></View>
            : <TouchableOpacity onPress={() => setConfirm('delete')}><Text style={{ color: colors.signalRed, fontWeight: '700', marginTop: 8 }}>Delete this circle</Text></TouchableOpacity>)}
        </>)}

        {d.payouts.length > 0 && (<>
          <Text style={[s.cardTitle, { marginTop: 16 }]}>Recent payouts</Text>
          {d.payouts.map((p) => <View key={`${p.cycle_no}-${p.round_no}`} style={s.row}><Text style={s.k}>Cycle {p.cycle_no} · Turn {p.turn_no} · {p.to}</Text><Text style={s.v}>{fmt(p.amount)}</Text></View>)}
        </>)}
      </>)}
    </ScrollView>);
}

// Online-required module: shows a professional "internet connection required" message while offline.
export default withChamaOnlineGate(MgrCircleScreen, 'chama');
