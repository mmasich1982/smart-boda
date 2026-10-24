// rider-app/src/screens/chama/MgrSetupScreen.js
// "Set Up Your Chama" for a Merry-Go-Round group (Smart_Boda_Prototype_v30). Opened from Manage Chama > Members & rules.
//   Member Slots  ->  circle tabs + "New circle"  ->  [locked card | 1 · name, contribution and schedules]
//   ->  2 · Members  ->  Add member  ->  3 · Turn order  ->  4 · Start  ->  Request More Member Slots.
// Money rules of a circle (all kept from Stage 1): each contribution, two schedules (when members contribute, when the pool is
// paid out), "recipient also contributes", "Treasurer also takes part". While a cycle runs these are LOCKED: what you change
// is saved for the next cycle. Nothing here computes money: the pot shown is worked out by the server (/chama/mgr/preview).
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { withChamaOnlineGate } from '../../components/ChamaOnlineGate';
import { ScrollView, Text, View, TextInput, TouchableOpacity } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import BackLink from '../../components/BackLink';
import DecisionDialog from '../../components/DecisionDialog';
import { useToast } from '../../components/Toast';
import {
  mgrCircle, mgrCreateCircle, mgrUpdateCircle, mgrDeleteCircle, mgrSetPerson, mgrRemovePerson, mgrReplacePerson, mgrSetOrder,
  mgrStart, mgrPreview, getMyGroup, addMember, apiError,
} from '../../api/groupsClient';
import { s, fmt } from './chamaStyles';
import { Btn, Card, DetailRows, Notice, ScreenTitle } from './mgrUi';
import { GroupLine, CircleTabs, CheckRow, MoreInfo, Section, FormInput, u as ui } from './manageUi';
import { DEFAULT_SCHED } from './ScheduleEditor';
import { niceDate } from './common';
import useManageChama from './useManageChama';
import colors from '../../theme/colors';

const keyOf = (member, hand) => `${member}:${hand}`;
const num = (v) => parseFloat(String(v).replace(/,/g, ''));

function MgrSetupScreen({ navigation }) {
  const m = useManageChama();
  const { showToast } = useToast();
  const gid = m.gid, cid = m.circle?.id;

  const [d, setD] = useState(null), [grp, setGrp] = useState(null), [pv, setPv] = useState(null);
  const [name, setName] = useState(''), [amount, setAmount] = useState('');
  const [turns, setTurns] = useState({});
  const [double, setDouble] = useState(false), [newName, setNewName] = useState(''), [newPhone, setNewPhone] = useState('');
  const [replacing, setReplacing] = useState(null), [rules, setRules] = useState(false), [del, setDel] = useState(false), [busy, setBusy] = useState(false);

  const fill = (r) => {
    const e = r.effective || {};
    setD(r); setName(r.name); setAmount(String(Math.round(Number(e.amount ?? r.amount) || 0)));
    const t = {};
    (r.turns || []).forEach((x) => { t[keyOf(x.member_id, x.hand_no)] = String(x.turn); });
    (r.people || []).forEach((p) => { for (let h = 1; h <= p.hands; h++) if (t[keyOf(p.member_id, h)] === undefined) t[keyOf(p.member_id, h)] = ''; });
    setTurns(t);
  };
  const load = useCallback(async () => {
    if (!gid) return;
    getMyGroup(gid).then(setGrp).catch(() => {});
    if (!cid) { setD(null); return; }
    try { fill(await mgrCircle(cid, gid)); } catch (e) { showToast(apiError(e, 'Could not load this circle.'), 'warn'); }
  }, [gid, cid]);
  useFocusEffect(useCallback(() => { load(); return undefined; }, [load]));

  const run = async (fn, ok, after) => {
    if (busy) return;
    setBusy(true);
    try { const r = await fn(); if (ok) showToast(ok(r), 'success'); if (after) await after(r); await load(); await m.reload(); }
    catch (e) { showToast(apiError(e, 'Could not complete this. Check your connection.'), 'warn'); await load(); }
    finally { setBusy(false); }
  };

  const R = d?.round;
  const eff = d?.effective || {};
  const started = d?.status === 'active';
  const locked = !!d?.locked;
  const people = d?.people || [];
  const hands = (d?.turns || []).length || people.reduce((t, p) => t + p.hands, 0);
  const recipientPays = !!(eff.recipient_pays ?? d?.recipient_pays), treasurerJoins = !!(eff.treasurer_joins ?? d?.treasurer_joins);
  const contribSched = eff.contrib_sched === undefined ? d?.contrib_sched : eff.contrib_sched;
  const paySched = eff.sched || d?.sched;
  const payoutLabel = pv?.payout_label || d?.sched_label || 'Not set';
  const contribLabel = contribSched ? (pv?.contrib_label || d?.contrib_label || 'Own days') : 'Once per payout';

  // The pot, worked out by the server for the rules as they will apply.
  useEffect(() => {
    if (!d || !gid) return undefined;
    let live = true;
    const t = setTimeout(() => {
      mgrPreview({ amount: num(amount) || 0, sched: paySched, contrib_sched: contribSched || { type: 'same' }, recipient_pays: recipientPays, hands }, gid)
        .then((r) => { if (live) setPv(r); }).catch(() => { if (live) setPv(null); });
    }, 350);
    return () => { live = false; clearTimeout(t); };
  }, [d && d.id, amount, JSON.stringify(paySched), JSON.stringify(contribSched), recipientPays, hands, gid]);

  // ---------- saving the rules ----------
  const savedMsg = (r) => (r.locked ? `Saved. It starts from cycle ${r.cycle_no + 1}.` : 'Saved.');
  // Saves go to the server ONE AT A TIME, in the order they were made, and they refresh only what the screen knows about the circle:
  // they never rewrite the text boxes (so saving the name can never wipe an amount that is being typed).
  const saveQ = useRef(Promise.resolve());
  const persist = (patch) => {
    const job = saveQ.current.then(async () => {
      const r = await mgrUpdateCircle(cid, patch, gid);
      setD(r);
      if (patch.name !== undefined) m.reload();                  // the circle tabs show the name
      return r;
    });
    saveQ.current = job.catch(() => {});                         // one failed save must not block the next
    return job;
  };
  const save = (patch, quiet) => persist(patch)
    .then((r) => { if (!quiet) showToast(savedMsg(r), 'success'); })
    .catch((e) => showToast(apiError(e, 'Could not save. Check your connection.'), 'warn'));
  // Saves whatever has been typed but not yet saved. Called before anything that depends on the saved circle (Start, the schedule screens),
  // so an amount can never be "typed but not saved" when the server checks it.
  const flushRules = async () => {
    if (!d) return;
    const patch = {};
    const nm = name.trim();
    if (nm && nm !== d.name) patch.name = nm;
    const a = num(amount);
    if (String(amount).trim() !== '' && Number.isFinite(a) && a >= 0 && a !== Number(eff.amount ?? d.amount)) patch.amount = a;
    if (Object.keys(patch).length) await persist(patch);
    await saveQ.current;
  };
  const saveName = () => { if (name.trim() && name.trim() !== d.name) save({ name: name.trim() }, true); };
  const saveAmount = () => {
    const a = num(amount);
    if (!Number.isFinite(a) || a < 0) return showToast('Enter the amount as a number.', 'warn');
    if (a !== Number(eff.amount ?? d.amount)) save({ amount: a });
  };
  const newCircle = () => run(
    () => mgrCreateCircle({ name: `Circle ${(m.circles || []).length + 1}`, amount: 0, sched: DEFAULT_SCHED, contrib_sched: { type: 'same' }, recipient_pays: false, treasurer_joins: false }, gid),
    () => 'Circle created. Now add the people.', (c) => m.setCircle(c.id));

  // ---------- people ----------
  const inCircle = new Set(people.map((p) => p.member_id));
  const treasurerOk = !!treasurerJoins;
  const candidates = (m.members || []).filter((x) => !inCircle.has(x.member_id) && (!x.is_treasurer || treasurerOk));
  const isTreasurerMember = (id) => !!(m.members || []).find((x) => x.member_id === id)?.is_treasurer;
  const turnsOf = (id) => (d?.turns || []).filter((t) => t.member_id === id).map((t) => t.turn).join(' & ');
  const seats = double ? 2 : 1;
  const addNew = () => {
    if (newName.trim().length < 3) return showToast('Enter the full name (at least 3 letters).', 'warn');
    if (!newPhone.trim()) return showToast('Enter the phone number.', 'warn');
    run(() => addMember({ full_name: newName.trim(), phone: newPhone.trim(), circles: [{ circle_id: cid, hands: seats }] }, gid),
      () => `${newName.trim()} added.`, () => { setNewName(''); setNewPhone(''); setDouble(false); });
  };

  // ---------- turn order ----------
  const saveOrder = () => {
    const rows = [];
    for (const p of people) for (let h = 1; h <= p.hands; h++) rows.push({ member_id: p.member_id, hand_no: h, turn: parseInt(turns[keyOf(p.member_id, h)], 10) || 0 });
    const nums = rows.map((r) => r.turn).sort((a, b) => a - b);
    if (!nums.every((n, i) => n === i + 1)) return showToast('Give every turn a different number: 1, 2, 3 ... with no gaps.', 'warn');
    run(() => mgrSetOrder(cid, rows, gid), () => 'Turn order saved.');
  };
  const orderRows = people.flatMap((p) => Array.from({ length: p.hands }, (_, i) => ({ p, h: i + 1 })));
  const blank = orderRows.find(({ p, h }) => !String(turns[keyOf(p.member_id, h)] ?? '').trim());
  const showOrder = !!d && people.length > 0 && (d.order_editable || d.needs_season_setup);

  // ---------- start ----------
  const checks = [
    ['Amount per hand is set', num(amount) > 0],
    ['Payout schedule is set', !!paySched && !(pv && !pv.ok)],
    ...(contribSched ? [['Contribution days fit the payouts', !(pv && !pv.ok)]] : []),
    ['At least 2 hands', hands >= 2],
    ['Turn order is saved', !!d?.order_complete],
  ];
  const ready = checks.every(([, ok]) => ok);

  const openSchedule = async (kind) => {
    try { await flushRules(); } catch (e) { return showToast(apiError(e, 'Could not save. Check your connection.'), 'warn'); }
    navigation.navigate('MgrSchedule', { kind, circleId: cid, groupId: gid });
  };
  const slotsLeft = grp ? grp.slots_available : 0;

  // ---------- the editable rules (card 1) ----------
  const rulesCard = !!d && (
    <>
      <FormInput label="Circle name" value={name} onChangeText={setName} onBlur={saveName} maxLength={40} />
      <FormInput label={contribSched ? 'Each contribution (KSh)' : 'Amount per hand (KSh)'} required value={amount} onChangeText={setAmount} onBlur={saveAmount}
        keyboardType="number-pad" placeholder="e.g. 500" />
      <Text style={ui.label}>Payout schedule</Text>
      <View style={st.schedRow}>
        <Text style={st.schedTxt}>🗓️ {payoutLabel}</Text>
        <Btn small ghost label="Change" onPress={() => openSchedule('payout')} testID="change-payout" />
      </View>
      <Text style={[ui.label, { marginTop: 12 }]}>Contribution schedule</Text>
      <View style={st.schedRow}>
        <Text style={st.schedTxt}>🗓️ {contribLabel}</Text>
        <Btn small ghost label="Change" onPress={() => openSchedule('contribution')} testID="change-contrib" />
      </View>
      <View style={{ height: 12 }} />
      <CheckRow checked={recipientPays} onChange={(v) => save({ recipient_pays: v })} disabled={busy} testID="recipient-pays">
        The person receiving the pool also contributes that round.
      </CheckRow>
      <CheckRow checked={treasurerJoins} onChange={(v) => save({ treasurer_joins: v })} disabled={busy || (!!d.treasurer_in_circle && treasurerJoins)} testID="treasurer-joins">
        The Treasurer also contributes and receives a payout.
      </CheckRow>
      {!!d.treasurer_in_circle && treasurerJoins && <Text style={ui.hint}>You are in this circle as a member. Remove yourself first to switch this off.</Text>}
      {pv && !pv.ok && (
        <View style={st.err}><Text style={{ fontSize: 15 }}>⚠️</Text>
          <View style={{ flex: 1 }}><Text style={st.errTitle}>This does not fit</Text><Text style={st.errTxt}>{pv.error}</Text></View></View>)}
      {pv && pv.ok && (
        <View style={st.pot}>
          {(() => {
            const p0 = pv.periods[0], payers = hands ? Math.max(0, hands - (recipientPays ? 0 : 1)) : 0;
            return (<>
              <Text style={st.potTxt}>Pot = {payers} {payers === 1 ? 'payer' : 'payers'} × <Text style={st.potMoney}>{fmt(p0?.per_person ?? num(amount) ?? 0)}</Text> = <Text style={st.potMoney}>{fmt(p0?.pool ?? 0)}</Text></Text>
              {p0 && p0.contributions > 1 && <Text style={st.potSub}>Each person pays {p0.contributions} × {fmt(num(amount))} for the payout on {niceDate(p0.payout)}.</Text>}
              {!recipientPays && <Text style={st.potSub}>The person receiving does not pay that round.</Text>}
              <Text style={st.potSub}>Worked out by the app. It is never typed.</Text>
            </>);
          })()}
        </View>)}
    </>);

  return (
    <ScrollView style={s.page} contentContainerStyle={{ padding: 16 }} keyboardShouldPersistTaps="handled">
      <BackLink onPress={() => navigation.navigate('ManageChama')} label="← Manage Chama" />
      <ScreenTitle>⚙️ Set Up Your Chama</ScreenTitle>
      <GroupLine type="mgr" name={m.group?.group_name} />

      {!!grp && (<>
        <Card>
          <Text style={st.slotTitle}>🎟️ Member Slots</Text>
          <View style={st.slotRow}>
            <View style={st.slotBox}><Text style={[st.slotNum, { color: colors.ink }]}>{grp.approved_slots}</Text><Text style={st.slotLbl}>Total Approved Member Slots</Text></View>
            <View style={st.slotBox}><Text style={[st.slotNum, { color: colors.bodaOrange }]}>{grp.slots_used}</Text><Text style={st.slotLbl}>Total Slots Utilized</Text></View>
            <View style={st.slotBox}><Text style={[st.slotNum, { color: colors.signalGreen }]}>{slotsLeft}</Text><Text style={st.slotLbl}>Available Remaining Slots</Text></View>
          </View>
          <View style={st.bar}><View style={{ height: '100%', width: `${grp.approved_slots ? Math.min(100, (grp.slots_used / grp.approved_slots) * 100) : 0}%`, backgroundColor: slotsLeft ? colors.signalGreen : colors.signalRed }} /></View>
        </Card>
        <MoreInfo>Each person in your Chama takes one slot, however many circles they are in or whether they have a double turn. Ask for more slots below when you run out.</MoreInfo>
      </>)}

      <CircleTabs m={m} />
      <Btn ghost label="＋ New circle" onPress={newCircle} disabled={busy || !m.group || m.group.status !== 'active'} testID="new-circle" />

      {m.circles && m.circles.length === 0 && <Notice tone="amber" icon="🔄" title="No circle yet" sub="Tap New circle to begin. A circle has its own contribution, schedules and people." />}

      {!!d && d.id === cid && (<>
        {!!d.pending_cfg && <Notice tone="green" icon="🕒" title={`Rule changes are saved. They start from cycle ${d.cycle_no + 1}.`} />}
        {d.needs_season_setup && <Notice tone="amber" icon="⚠️" title="Give the new people their turns, then start the new season." />}

        {/* ---- running: locked card, then the pot / schedule card ---- */}
        {started && !d.needs_season_setup && (<>
          <Card style={{ borderColor: colors.bodaOrange }}>
            <Text style={st.lockTitle}>🔒 Locked for this cycle</Text>
            <DetailRows rows={[
              ['Contribution amount', fmt(d.amount)],
              ['Contributions', d.contrib_label || 'Once per payout'],
              ['Payouts', d.sched_label || '—'],
              ...(R ? [['Cycle', `Cycle ${d.cycle_no} · Turn ${R.turn_no} of ${(d.turns || []).length}`], ['Cycle ends', `After the Turn ${(d.turns || []).length} payout`]] : []),
              ...(d.recipient_pays ? [['Recipient also contributes', 'Yes']] : []),
              ...(d.treasurer_joins ? [['Treasurer also takes part', 'Yes']] : []),
            ]} />
            <MoreInfo>The contribution, the schedules and the two settings stay the same until the cycle ends, so everyone knows what to expect. You can still change them: the new rules start with the next cycle.</MoreInfo>
          </Card>
          <Card>
            <DetailRows rows={[
              ['Pot per round', (() => {
                const per = Number(R?.amount_per_member || d.amount), payers = per > 0 ? Math.round(Number(R?.expected || 0) / per) : 0;
                return <Text style={st.potLine}><Text style={st.potBold}>{payers}</Text> {payers === 1 ? 'payer' : 'payers'} × <Text style={st.potBold}>{fmt(per)}</Text> = <Text style={st.potMoney}>{fmt(R?.expected || 0)}</Text></Text>;
              })()],
              ['Payout schedule', <TouchableOpacity onPress={() => openSchedule('payout')} accessibilityRole="link"><Text style={st.linkVal}>{d.sched_label || payoutLabel} ›</Text></TouchableOpacity>],
              ['Contribution schedule', <TouchableOpacity onPress={() => openSchedule('contribution')} accessibilityRole="link"><Text style={st.linkVal}>{d.contrib_label || 'Once per payout'} ›</Text></TouchableOpacity>],
            ]} />
          </Card>
          <Section title="Rules for the next cycle" collapsible startOpen={rules}>{rulesCard}</Section>
        </>)}

        {/* ---- not started (or a new season): 1 · name, amount and schedule ---- */}
        {(!started || d.needs_season_setup) && <Section title={`1 · ${d.name} · name, amount and schedules`}>{rulesCard}</Section>}

        {/* ---- 2 · members ---- */}
        <Section title={`2 · Members in ${d.name}`} collapsible>
          {people.length === 0 && <Text style={ui.hint}>Nobody yet. Add people below.</Text>}
          {people.map((p, i) => (
            <View key={p.member_id} style={[st.person, i === people.length - 1 && { borderBottomWidth: 0 }]}>
              <View style={{ flex: 1 }}>
                <Text style={st.pName}>{isTreasurerMember(p.member_id) ? 'You (Treasurer)' : p.name}{p.double ? ' ✌️' : ''}</Text>
                <Text style={st.pSub}>{p.phone}{turnsOf(p.member_id) ? ` · Turn ${turnsOf(p.member_id)}` : ''}{p.joins_next_cycle ? ' · joins next cycle' : ''}{!p.linked ? ' · not signed in yet' : ''}</Text>
              </View>
              {!started ? (
                <View style={{ alignItems: 'flex-end', gap: 6 }}>
                  <TouchableOpacity onPress={() => run(() => mgrSetPerson(cid, p.member_id, p.double ? 1 : 2, gid))} style={st.dbl} accessibilityRole="checkbox" accessibilityState={{ checked: !!p.double }}>
                    <View style={[ui.box, { width: 18, height: 18 }, p.double && ui.boxOn]}>{p.double ? <Text style={[ui.tick, { fontSize: 12 }]}>✓</Text> : null}</View>
                    <Text style={st.dblTxt}>Double turn</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => run(() => mgrRemovePerson(cid, p.member_id, gid))} accessibilityRole="button"><Text style={{ color: colors.signalRed, fontWeight: '800', fontSize: 12.5 }}>✕ Remove</Text></TouchableOpacity>
                </View>
              ) : (
                <Btn small ghost label="↔ Replace" onPress={() => setReplacing(replacing === p.member_id ? null : p.member_id)} />
              )}
              {replacing === p.member_id && (
                <View style={{ width: '100%', marginTop: 8 }}>
                  <Text style={ui.hint}>Choose who takes over {p.name}'s open turns. Turns already paid stay with {p.name}; money already paid counts for the new person.</Text>
                  {candidates.map((x) => (
                    <Btn key={x.member_id} small ghost label={`↔ ${x.name}`} style={{ marginTop: 6 }}
                      onPress={() => { setReplacing(null); run(() => mgrReplacePerson(cid, p.member_id, x.member_id, gid), () => `🔁 ${x.name} replaces ${p.name}`); }} />))}
                  {candidates.length === 0 && <Text style={ui.hint}>Every other member is already in this circle. Add the new person below first.</Text>}
                </View>)}
            </View>))}
        </Section>

        {/* ---- add member ---- */}
        <Card>
          <Text style={st.addTitle}>＋ Add member{started ? ' (joins next cycle)' : ''}</Text>
          <CheckRow checked={double} onChange={setDouble} testID="double-turn">Double turn · one person, one slot, two hands. Pays 2× and gets two payouts.</CheckRow>
          {candidates.length > 0 && (<>
            <Text style={st.kicker}>ALREADY IN THIS GROUP · NO NEW SLOT</Text>
            {candidates.map((x, i) => (
              <View key={x.member_id} style={[st.cand, i === candidates.length - 1 && { borderBottomWidth: 0 }]}>
                <Text style={st.pName}>{x.name}{x.is_treasurer ? ' (you)' : ''}</Text>
                <Btn small ghost label="＋ Add" onPress={() => run(() => mgrSetPerson(cid, x.member_id, seats, gid), () => `${x.name} added.`, () => setDouble(false))} />
              </View>))}
          </>)}
          {!treasurerOk && (m.members || []).some((x) => x.is_treasurer && !inCircle.has(x.member_id)) && (
            <Text style={ui.hint}>To put yourself in this circle, switch on "The Treasurer also contributes and receives a payout" in the rules above.</Text>)}
          <Text style={st.kicker}>NEW PERSON · TAKES 1 SLOT</Text>
          <FormInput value={newName} onChangeText={setNewName} placeholder="Full name" />
          <FormInput value={newPhone} onChangeText={setNewPhone} placeholder="07XX XXX XXX" keyboardType="phone-pad" />
          <Btn glow label="Add new person" onPress={addNew} disabled={busy || slotsLeft < 1} testID="add-new-person" />
          {slotsLeft < 1 && !!grp && <Text style={ui.hint}>No slots left. Request more slots below.</Text>}
        </Card>

        {/* ---- 3 · turn order ---- */}
        {showOrder && (
          <Section title="3 · Turn order" collapsible>
            <Text style={st.orderTitle}>🔢 Turn Order</Text>
            <MoreInfo>Type the turn number for each turn. 1 receives first. A double-turn person has two turns; avoid putting them back to back.</MoreInfo>
            {orderRows.map(({ p, h }) => (
              <View key={keyOf(p.member_id, h)} style={st.orderRow}>
                <Text style={st.pName}>{isTreasurerMember(p.member_id) ? 'You' : p.name}{p.hands > 1 ? ` · turn ${h === 1 ? 'A' : 'B'}` : ''}</Text>
                <TextInput style={st.orderIn} keyboardType="number-pad" value={turns[keyOf(p.member_id, h)] ?? ''}
                  onChangeText={(v) => setTurns({ ...turns, [keyOf(p.member_id, h)]: v })} />
              </View>))}
            {!!blank && <Text style={st.warn}>⚠️ {isTreasurerMember(blank.p.member_id) ? 'You have' : `${blank.p.name} has`} no turn number</Text>}
            <Btn label="Save turn order" onPress={saveOrder} disabled={busy || !!blank} testID="save-order" />
          </Section>)}

        {/* ---- 4 · start ---- */}
        {!R && (
          <Section title={d.needs_season_setup ? '4 · Start new season' : '4 · Start first round'}>
            {checks.map(([label, ok]) => <Text key={label} style={st.check}>{ok ? '✅' : '⬜'} {label}</Text>)}
            <MoreInfo>Everyone in the circle sees their turn once you start. Before that you can still change anything.</MoreInfo>
            <Btn glow label={d.needs_season_setup ? '🚀 Start new season' : '🚀 Start first round'} disabled={busy || !ready}
              onPress={() => run(async () => { await flushRules(); return mgrStart(cid, gid); }, () => 'Started. Everyone can now see their turn.')} testID="start-round" />
          </Section>)}

        {!started && (
          <TouchableOpacity onPress={() => setDel(true)} style={{ alignItems: 'center', marginBottom: 14 }} accessibilityRole="button">
            <Text style={{ color: colors.signalRed, fontWeight: '700', fontSize: 13 }}>Delete this circle</Text>
          </TouchableOpacity>)}
      </>)}

      <Btn ghost label="📈 Request More Member Slots" onPress={() => navigation.navigate('RequestChamaSlots', { groupId: gid })} testID="request-slots" />
      <MoreInfo>If your Chama has grown, ask for more member slots. We will review the request and let you know.</MoreInfo>

      <DecisionDialog visible={del} busy={busy} danger title="Delete this circle?" message="Only a circle that has not started can be deleted."
        confirmLabel="Delete" onCancel={() => setDel(false)}
        onConfirm={() => { setDel(false); run(() => mgrDeleteCircle(cid, gid), () => 'Circle deleted.', () => m.setCircle(null)); }} />
    </ScrollView>);
}

const st = {
  slotTitle: { fontWeight: '800', fontSize: 15, color: colors.ink, marginBottom: 10 },
  slotRow: { flexDirection: 'row', gap: 8 },
  slotBox: { flex: 1, backgroundColor: '#f9f8f5', borderRadius: 12, paddingVertical: 12, paddingHorizontal: 6, alignItems: 'center' },
  slotNum: { fontSize: 28, fontWeight: '800' },
  slotLbl: { fontSize: 11.5, color: colors.inkSoft, textAlign: 'center', marginTop: 2 },
  bar: { height: 10, backgroundColor: '#eeeeee', borderRadius: 99, overflow: 'hidden', marginTop: 12 },
  lockTitle: { fontWeight: '800', fontSize: 16, color: colors.ink, marginBottom: 4 },
  schedRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 4 },
  schedTxt: { flex: 1, fontWeight: '700', fontSize: 14.5, color: colors.ink },
  pot: { backgroundColor: '#f9f8f5', borderRadius: 10, padding: 12, marginTop: 6 },
  potTxt: { fontSize: 13, color: colors.ink, fontWeight: '600' },
  potMoney: { color: colors.bodaOrange, fontWeight: '800' },
  potLine: { fontSize: 14, color: colors.inkSoft, textAlign: 'right' },
  potBold: { fontWeight: '800', color: colors.ink },
  linkVal: { fontSize: 14, color: colors.bodaOrangeDark, fontWeight: '700', textDecorationLine: 'underline', textAlign: 'right' },
  potSub: { fontSize: 12, color: colors.inkSoft, marginTop: 4 },
  err: { flexDirection: 'row', gap: 10, backgroundColor: '#fdecec', borderWidth: 1, borderColor: colors.signalRed, borderRadius: 14, padding: 14, marginTop: 8 },
  errTitle: { fontWeight: '800', fontSize: 14, color: colors.ink },
  errTxt: { fontSize: 12.5, color: colors.inkSoft, marginTop: 2, lineHeight: 18 },
  person: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.line },
  pName: { fontWeight: '800', fontSize: 14, color: colors.ink },
  pSub: { fontSize: 12, color: colors.inkSoft, marginTop: 2 },
  dbl: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dblTxt: { fontSize: 12.5, color: colors.inkSoft, fontWeight: '600' },
  addTitle: { fontWeight: '800', fontSize: 15, color: colors.ink, marginBottom: 10 },
  kicker: { fontSize: 11.5, fontWeight: '800', color: colors.bodaOrangeDark, letterSpacing: 0.3, marginTop: 6, marginBottom: 6 },
  cand: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.line },
  orderTitle: { fontWeight: '800', fontSize: 15, color: colors.ink },
  orderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8 },
  orderIn: { width: 64, borderWidth: 1, borderColor: colors.line, borderRadius: 10, paddingVertical: 10, textAlign: 'center', fontSize: 14, color: colors.ink, backgroundColor: '#fff' },
  warn: { fontSize: 12.5, color: colors.signalAmber, marginVertical: 8 },
  check: { fontSize: 14.5, color: colors.ink, marginVertical: 5 },
};

export default withChamaOnlineGate(MgrSetupScreen, 'chama');