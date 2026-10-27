// rider-app/src/screens/chama/MgrSetupScreen.js
// "Set Up Your Chama" for a Merry-Go-Round group (Smart_Boda_Prototype_v44). Opened from Manage Chama > Members & rules.
//   NEW ROUND (not saved yet):  Places in Your Group -> round tabs + "New round" -> four steps, one at a time:
//       1 Create round (name, amount, "How often do members pay?" -> Days when members pay, "Day when a member receives Money")
//       2 Add members  ->  3 Order of receiving  ->  4 Save the round   ->  Request More Places in Your Group.
//   SAVED ROUND:  "<name> is set up and saved." with "View <name> details" and "Set up a different round".
//       The details page has the round tabs, "Round Summary", "Members Dates for Receiving Money" and the members.
// Money rules of a round (all kept from Stage 1): each contribution, two schedules (the days members pay, the day a member receives
// money), "recipient also contributes", "Treasurer also takes part". While a cycle runs these are LOCKED: what you change is saved for
// the next cycle. Nothing here computes money: the pot shown is worked out by the server (/chama/mgr/preview).
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
import { Btn, Card, DetailRows, Notice, ScreenTitle, shortDate } from './mgrUi';
import { GroupLine, CircleTabs, CheckRow, MoreInfo, Section, FormInput, u as ui } from './manageUi';
import { DEFAULT_SCHED } from './ScheduleEditor';
import { niceDate } from './common';
import useManageChama from './useManageChama';
import colors from '../../theme/colors';

const keyOf = (member, hand) => `${member}:${hand}`;
const num = (v) => parseFloat(String(v).replace(/,/g, ''));
const isDefaultName = (n) => /^(Round|Circle) \d+$/.test(String(n || ''));   // "Round 3" is only a placeholder: the box stays empty until the Treasurer names it
const STEPS = ['Create round', 'Add members', 'Order of receiving', 'Save the round'];

/** The four numbered steps. A step opens once the steps before it are done; a tick marks a finished one. */
function StepBar({ cur, max, onGo }) {
  return (
    <View style={st.steps}>
      {STEPS.map((label, i) => {
        const n = i + 1, on = n === cur, done = n < max || n < cur, locked = n > max;
        return (
          <TouchableOpacity key={label} testID={`step-${n}`} disabled={locked} onPress={() => onGo(n)} accessibilityRole="button" accessibilityState={{ selected: on, disabled: locked }}
            style={[st.step, on && st.stepOn, locked && { opacity: 0.45 }]}>
            <View style={[st.stepDot, { backgroundColor: done ? colors.signalGreen : on ? colors.bodaOrange : '#c9c6bd' }]}><Text style={st.stepNum}>{done ? '✓' : n}</Text></View>
            <Text style={[st.stepTxt, on && { color: colors.bodaOrangeDark }]}>{label}</Text>
          </TouchableOpacity>);
      })}
    </View>);
}

function MgrSetupScreen({ navigation }) {
  const m = useManageChama();
  const { showToast } = useToast();
  const gid = m.gid, cid = m.circle?.id;

  const [d, setD] = useState(null), [grp, setGrp] = useState(null), [pv, setPv] = useState(null);
  const [name, setName] = useState(''), [amount, setAmount] = useState('');
  const [turns, setTurns] = useState({});
  const [double, setDouble] = useState(false), [newName, setNewName] = useState(''), [newPhone, setNewPhone] = useState('');
  const [replacing, setReplacing] = useState(null), [rules, setRules] = useState(false), [del, setDel] = useState(false), [busy, setBusy] = useState(false);
  const [step, setStep] = useState(1), [detail, setDetail] = useState(false);
  useEffect(() => { setDetail(false); setStep(1); }, [cid]);          // picking another round shows that round from its start

  const fill = (r) => {
    const e = r.effective || {};
    setD(r); setName(isDefaultName(r.name) ? '' : r.name); setAmount(String(Math.round(Number(e.amount ?? r.amount) || 0)));
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
    () => mgrCreateCircle({ name: `Round ${(m.circles || []).length + 1}`, amount: 0, sched: DEFAULT_SCHED, contrib_sched: { type: 'same' }, recipient_pays: false, treasurer_joins: false }, gid),
    () => 'Round created. Now add the people.', (c) => { m.setCircle(c.id); setStep(1); setDetail(false); });

  // ---------- people ----------
  const inCircle = new Set(people.map((p) => p.member_id));
  const treasurerOk = !!treasurerJoins;
  const candidates = (m.members || []).filter((x) => !inCircle.has(x.member_id) && (!x.is_treasurer || treasurerOk));
  const isTreasurerMember = (id) => !!(m.members || []).find((x) => x.member_id === id)?.is_treasurer;
  const turnsOf = (id) => (d?.turns || []).filter((t) => t.member_id === id).map((t) => `Turn ${t.turn}`).join(' and ');
  const seats = double ? 2 : 1;
  const addNew = () => {
    if (newName.trim().length < 3) return showToast('Write the full name (at least 3 letters).', 'warn');
    if (!newPhone.trim()) return showToast('Write the phone number.', 'warn');
    run(() => addMember({ full_name: newName.trim(), phone: newPhone.trim(), circles: [{ circle_id: cid, hands: seats }] }, gid),
      () => `${newName.trim()} added.`, () => { setNewName(''); setNewPhone(''); setDouble(false); });
  };

  // ---------- turn order ----------
  const saveOrder = () => {
    const rows = [];
    for (const p of people) for (let h = 1; h <= p.hands; h++) rows.push({ member_id: p.member_id, hand_no: h, turn: parseInt(turns[keyOf(p.member_id, h)], 10) || 0 });
    const nums = rows.map((r) => r.turn).sort((a, b) => a - b);
    if (!nums.every((n, i) => n === i + 1)) return showToast(`Use each number from 1 to ${hands} only once, with no gaps.`, 'warn');
    run(() => mgrSetOrder(cid, rows, gid), () => 'Turn order saved.', () => setStep(4));
  };
  const orderRows = people.flatMap((p) => Array.from({ length: p.hands }, (_, i) => ({ p, h: i + 1 })));
  const blank = orderRows.find(({ p, h }) => !String(turns[keyOf(p.member_id, h)] ?? '').trim());
  const showOrder = !!d && people.length > 0 && (d.order_editable || d.needs_season_setup);

  // ---------- save the round (the old "start") ----------
  const amountOk = num(amount) > 0, daysOk = !!paySched && !(pv && !pv.ok), membersOk = hands >= 2, orderOk = !!d?.order_complete;
  const checks = [
    ['Amount to pay is set', amountOk],
    ['Pay days are set', daysOk],
    ['At least 2 members added', membersOk],
    ['Order of receiving is saved', orderOk],
  ];
  const ready = checks.every(([, ok]) => ok);
  const maxStep = !(amountOk && daysOk) ? 1 : !membersOk ? 2 : !orderOk ? 3 : 4;      // a step opens once the ones before it are done
  const cur = Math.min(step, maxStep);

  const openSchedule = async (kind) => {
    try { await flushRules(); } catch (e) { return showToast(apiError(e, 'Could not save. Check your connection.'), 'warn'); }
    navigation.navigate('MgrSchedule', { kind, circleId: cid, groupId: gid });
  };
  const goStep = async (n) => {
    try { await flushRules(); } catch (e) { return showToast(apiError(e, 'Could not save. Check your connection.'), 'warn'); }
    setStep(n);
  };
  const slotsLeft = grp ? grp.slots_available : 0;

  // ---------- the editable rules (step 1 · Create your round) ----------
  const rulesCard = !!d && (
    <>
      <FormInput label="Name of the chama" value={name} onChangeText={setName} onBlur={saveName} maxLength={40} placeholder="e.g. Kitengela Mulembe Chama" />
      <FormInput label="How much does each member pay? (KSh)" required value={amount} onChangeText={setAmount} onBlur={saveAmount}
        keyboardType="number-pad" placeholder="e.g. 700" />
      <Text style={ui.label}>How often do members pay?</Text>
      <View style={st.schedRow}>
        <Text style={st.schedTxt}>📅 {contribLabel}</Text>
        <Btn small ghost label={started ? 'Change' : 'Pick days'} onPress={() => openSchedule('contribution')} testID="change-contrib" />
      </View>
      <MoreInfo>Members can pay a little at a time. It adds up to the amount above.</MoreInfo>
      <Text style={[ui.label, { marginTop: 8 }]}>Day when a member receives Money</Text>
      <View style={st.schedRow}>
        <Text style={st.schedTxt}>🗓️ {payoutLabel}</Text>
        <Btn small ghost label="Change" onPress={() => openSchedule('payout')} testID="change-payout" />
      </View>
      <View style={{ height: 12 }} />
      <CheckRow checked={recipientPays} onChange={(v) => save({ recipient_pays: v })} disabled={busy} testID="recipient-pays">
        The person receiving the pool also contributes that round.
      </CheckRow>
      <CheckRow checked={treasurerJoins} onChange={(v) => save({ treasurer_joins: v })} disabled={busy || (!!d.treasurer_in_circle && treasurerJoins)} testID="treasurer-joins">
        The Treasurer also contributes and receives a payout.
      </CheckRow>
      {!!d.treasurer_in_circle && treasurerJoins && <Text style={ui.hint}>You are in this round as a member. Remove yourself first to switch this off.</Text>}
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

  // ---------- members of the round, and adding people ----------
  const membersCard = (
    <>
      {people.length === 0 && <Text style={ui.hint}>Nobody yet. Add people below.</Text>}
      {people.map((p, i) => (
        <View key={p.member_id} style={[st.person, i === people.length - 1 && { borderBottomWidth: 0 }]}>
          <View style={{ flex: 1 }}>
            <Text style={st.pName}>{isTreasurerMember(p.member_id) ? 'You (Treasurer)' : p.name}{p.double ? ' ✌️' : ''}</Text>
            <Text style={st.pSub}>{p.phone}{turnsOf(p.member_id) ? ` · ${turnsOf(p.member_id)}` : ''}{p.joins_next_cycle ? ' · joins next round' : ''}{!p.linked ? ' · not signed in yet' : ''}</Text>
          </View>
          {!started ? (
            <View style={{ alignItems: 'flex-end', gap: 6 }}>
              <TouchableOpacity onPress={() => run(() => mgrSetPerson(cid, p.member_id, p.double ? 1 : 2, gid))} style={st.dbl} accessibilityRole="checkbox" accessibilityState={{ checked: !!p.double }}>
                <View style={[ui.box, { width: 18, height: 18 }, p.double && ui.boxOn]}>{p.double ? <Text style={[ui.tick, { fontSize: 12 }]}>✓</Text> : null}</View>
                <Text style={st.dblTxt}>Takes two turns</Text>
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
              {candidates.length === 0 && <Text style={ui.hint}>Every other member is already in this round. Add the new person below first.</Text>}
            </View>)}
        </View>))}
    </>);

  const addCard = (
    <Card>
      <Text style={st.addTitle}>＋ Add a new member{started ? ' (joins next round)' : ''}</Text>
      <CheckRow checked={double} onChange={setDouble} testID="double-turn">
        <Text style={{ fontWeight: '800' }}>Takes two turns</Text> · pays double and receives money two times.
      </CheckRow>
      {candidates.length > 0 && (<>
        <Text style={st.kicker}>ALREADY IN THIS GROUP · NO NEW PLACE</Text>
        {candidates.map((x, i) => (
          <View key={x.member_id} style={[st.cand, i === candidates.length - 1 && { borderBottomWidth: 0 }]}>
            <Text style={st.pName}>{x.name}{x.is_treasurer ? ' (you)' : ''}</Text>
            <Btn small ghost label="＋ Add" onPress={() => run(() => mgrSetPerson(cid, x.member_id, seats, gid), () => `${x.name} added.`, () => setDouble(false))} />
          </View>))}
      </>)}
      {!treasurerOk && (m.members || []).some((x) => x.is_treasurer && !inCircle.has(x.member_id)) && (
        <Text style={ui.hint}>To put yourself in this round, switch on "The Treasurer also contributes and receives a payout" in step 1.</Text>)}
      <Text style={st.kicker}>NEW PERSON · TAKES 1 PLACE</Text>
      <FormInput value={newName} onChangeText={setNewName} placeholder="Full name" />
      <FormInput value={newPhone} onChangeText={setNewPhone} placeholder="Phone number, e.g. 0712345678" keyboardType="phone-pad" />
      <Btn label="Add this person" onPress={addNew} disabled={busy || slotsLeft < 1} testID="add-new-person" />
      {slotsLeft < 1 && !!grp && <Text style={ui.hint}>No places left. Ask for more places below.</Text>}
    </Card>);

  const requestPlaces = (<>
    <Btn ghost label="📈 Request More Places in Your Group" onPress={() => navigation.navigate('RequestChamaSlots', { groupId: gid })} testID="request-slots" />
    <MoreInfo>If your Chama has grown, ask for more places in your group. We will review the request and let you know.</MoreInfo>
  </>);

  // "Back" and "Next: …" under each step. A step's Next stays off until that step is complete.
  const nav = (n, ok, msg) => (<>
    <View style={st.navRow}>
      {n > 1 && <Btn ghost label="← Back" onPress={() => setStep(n - 1)} style={{ flex: 1 }} testID={`back-${n}`} />}
      {n < 4 && <Btn label={`Next: ${STEPS[n]} →`} disabled={busy || !ok} onPress={() => goStep(n + 1)} style={{ flex: 2 }} testID={`next-${n}`} />}
    </View>
    {!ok && !!msg && <Text style={ui.hint}>{msg}</Text>}
  </>);

  // ---------- what is on the screen ----------
  const here = !!d && d.id === cid;
  const saved = here && started && !d.needs_season_setup;      // a round that has been saved and is running
  const summary = saved && !detail, details = saved && detail;
  const setup = here && !saved;                                  // a new round (or a new season) still being set up
  const nm = d?.name || 'your chama';
  const turnRows = (d?.turns || []).filter((t) => t.date && t.status !== 'paid').slice(0, 6);
  const rowOf = (t) => [shortDate(t.date), `Turn ${t.turn} · ${isTreasurerMember(t.member_id) ? 'You' : t.name}`];

  return (
    <ScrollView style={s.page} contentContainerStyle={{ padding: 16 }} keyboardShouldPersistTaps="handled">
      <BackLink onPress={() => (details ? setDetail(false) : navigation.navigate('ManageChama'))} label={details ? '← Back' : '← Manage Chama'} />
      <ScreenTitle>⚙️ Set Up Your Chama</ScreenTitle>
      <GroupLine type="mgr" name={m.group?.group_name} />

      {/* ---- places in the group (while a round is being set up) ---- */}
      {!summary && !details && !!grp && (<>
        <Card>
          <Text style={st.slotTitle}>🎟️ Places in Your Group</Text>
          <View style={st.slotRow}>
            <View style={st.slotBox}><Text style={[st.slotNum, { color: colors.ink }]}>{grp.approved_slots}</Text><Text style={st.slotLbl}>Places allowed</Text></View>
            <View style={st.slotBox}><Text style={[st.slotNum, { color: colors.bodaOrange }]}>{grp.slots_used}</Text><Text style={st.slotLbl}>Places used</Text></View>
            <View style={st.slotBox}><Text style={[st.slotNum, { color: colors.signalGreen }]}>{slotsLeft}</Text><Text style={st.slotLbl}>Places left</Text></View>
          </View>
          <View style={st.bar}><View style={{ height: '100%', width: `${grp.approved_slots ? Math.min(100, (grp.slots_used / grp.approved_slots) * 100) : 0}%`, backgroundColor: slotsLeft ? colors.signalGreen : colors.signalRed }} /></View>
        </Card>
        <Text style={st.placesHint}>Every person you add uses one place in your group.</Text>
      </>)}

      {/* ---- round tabs and New round (not on the saved summary) ---- */}
      {!summary && <CircleTabs m={m} />}
      {!summary && !details && <Btn ghost label="＋ New round" onPress={newCircle} disabled={busy || !m.group || m.group.status !== 'active'} testID="new-circle" />}

      {m.circles && m.circles.length === 0 && <Notice tone="amber" icon="🔄" title="No round yet" sub="Tap New round to begin. A round has its own amount, pay days and people." />}

      {here && !!d.pending_cfg && !summary && <Notice tone="green" icon="🕒" title={`Rule changes are saved. They start from cycle ${d.cycle_no + 1}.`} />}
      {here && d.needs_season_setup && <Notice tone="amber" icon="⚠️" title="Give the new people their turns, then save the new round." />}

      {/* ---- SAVED ROUND: set up and saved ---- */}
      {summary && (<>
        <Notice tone="green" icon="✅" title={`${nm} is set up and saved.`} />
        <Btn label={`👁️ View ${nm} details`} onPress={() => setDetail(true)} testID="view-details" />
        <Btn ghost label="Set up a different round" onPress={newCircle} disabled={busy || !m.group || m.group.status !== 'active'} testID="different-round" />
        <Text style={st.centerHint}>Use this if your group has more than one round type.</Text>
      </>)}

      {/* ---- SAVED ROUND: details ---- */}
      {details && (<>
        <Card>
          <Text style={st.cardTitle}>Round Summary</Text>
          <DetailRows rows={[
            ['Each member will pay', fmt(d.amount)],
            ['How often members pay', d.contrib_label || 'Once per payout'],
            ['Members', String(hands)],
            ['Money each member receives', fmt(R?.expected ?? 0)],
          ]} max={4} foldKey={`mgr-setup|${cid}`} />
        </Card>
        <Card>
          <Text style={st.cardTitle}>Members Dates for Receiving Money</Text>
          {turnRows.length === 0 && <Text style={ui.hint}>No payouts coming up.</Text>}
          {turnRows.map((t, i) => { const [a, b] = rowOf(t); return (
            <View key={t.turn} style={[st.dateRow, i === turnRows.length - 1 && { borderBottomWidth: 0 }]}>
              <Text style={st.dateL}>{a}</Text><Text style={st.dateR}>{b}</Text>
            </View>); })}
        </Card>
        <Notice tone="amber" icon="🔒" title="Locked for this cycle" sub={`The amount, the days and the two settings stay the same until the cycle ends. You can still change them under "Rules for the next cycle": the new rules start from cycle ${d.cycle_no + 1}.`} />
        <Section title="Rules for the next cycle" collapsible startOpen={rules}>{rulesCard}</Section>
        <Section title={`Members in ${nm}`} collapsible startOpen={false}>
          {membersCard}
          {addCard}
          {requestPlaces}
        </Section>
      </>)}

      {/* ---- NEW ROUND: four steps, one at a time ---- */}
      {setup && (<>
        <StepBar cur={cur} max={maxStep} onGo={setStep} />

        {cur === 1 && (<>
          <Card><Text style={st.stepTitle}>Step 1 · Create your round</Text>{rulesCard}</Card>
          {nav(1, amountOk && daysOk, 'Enter the amount and pick the pay days to continue.')}
        </>)}

        {cur === 2 && (<>
          <Text style={st.stepHead}>Step 2 · Add members to {nm}</Text>
          <Card>{membersCard}</Card>
          {addCard}
          {nav(2, membersOk, 'Add at least 2 members to continue.')}
        </>)}

        {cur === 3 && (<>
          <Text style={st.stepHead}>Step 3 · Define the order of receiving</Text>
          {showOrder ? (
            <Card>
              <Text style={st.orderHint}>Who will receive the money first, second, third...? Type a number next to each name. Use each number from 1 to {hands} only once.</Text>
              {orderRows.map(({ p, h }) => (
                <View key={keyOf(p.member_id, h)} style={st.orderRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={st.pName}>{isTreasurerMember(p.member_id) ? 'You' : p.name}</Text>
                    {p.hands > 1 && <Text style={st.pSub}>Double turn {h} of 2</Text>}
                  </View>
                  <TextInput style={st.orderIn} keyboardType="number-pad" value={turns[keyOf(p.member_id, h)] ?? ''}
                    onChangeText={(v) => setTurns({ ...turns, [keyOf(p.member_id, h)]: v })} />
                </View>))}
              <Text style={st.orderMsg}>{blank ? `⚠️ ${isTreasurerMember(blank.p.member_id) ? 'You have' : `${blank.p.name} has`} no turn number` : '✅ All numbers are filled in.'}</Text>
              <Btn label="Save order" onPress={saveOrder} disabled={busy || !!blank} testID="save-order" style={{ marginTop: 8 }} />
            </Card>
          ) : <Card><Text style={ui.hint}>The order of receiving cannot be changed now.</Text></Card>}
          {nav(3, orderOk, 'Save the order to continue.')}
        </>)}

        {cur === 4 && (<>
          <Text style={st.stepHead}>Step 4 · Save the round</Text>
          <Card>
            <Text style={st.orderHint}>Check that everything is ready, then save the round.</Text>
            {checks.map(([label, ok]) => <Text key={label} style={st.check}>{ok ? '✅' : '⬜'} {label}</Text>)}
            <MoreInfo>After you save the round, you cannot change the members, amount or order.</MoreInfo>
            <Btn glow label="🚀 Save the Round" disabled={busy || !ready}
              onPress={() => run(async () => { await flushRules(); return mgrStart(cid, gid); }, () => 'Round saved. Members, amount and turns are locked.')} testID="start-round" />
          </Card>
          {nav(4, true)}
        </>)}

        {!started && (
          <TouchableOpacity onPress={() => setDel(true)} style={{ alignItems: 'center', marginBottom: 14 }} accessibilityRole="button">
            <Text style={{ color: colors.signalRed, fontWeight: '700', fontSize: 13 }}>Delete this round</Text>
          </TouchableOpacity>)}
      </>)}

      {!summary && !details && requestPlaces}

      <DecisionDialog visible={del} busy={busy} danger title="Delete this round?" message="Only a round that has not been saved can be deleted."
        confirmLabel="Delete" onCancel={() => setDel(false)}
        onConfirm={() => { setDel(false); run(() => mgrDeleteCircle(cid, gid), () => 'Round deleted.', () => m.setCircle(null)); }} />
    </ScrollView>);
}

const st = {
  steps: { flexDirection: 'row', gap: 4, marginTop: 6, marginBottom: 12 },
  step: { flex: 1, alignItems: 'center', paddingVertical: 7, paddingHorizontal: 2, borderRadius: 10, borderWidth: 1.5, borderColor: 'transparent' },
  stepOn: { backgroundColor: '#fff', borderColor: colors.bodaOrange },
  stepDot: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginBottom: 3 },
  stepNum: { color: '#fff', fontWeight: '800', fontSize: 12 },
  stepTxt: { fontSize: 11, fontWeight: '700', color: colors.inkSoft, textAlign: 'center' },
  stepTitle: { fontWeight: '800', fontSize: 15.5, color: colors.ink, marginBottom: 10 },
  stepHead: { fontWeight: '800', fontSize: 15, color: colors.ink, marginTop: 4, marginBottom: 8 },
  navRow: { flexDirection: 'row', gap: 8, marginTop: 4 },
  placesHint: { fontSize: 12.5, color: colors.inkSoft, marginHorizontal: 2, marginBottom: 12 },
  centerHint: { fontSize: 12.5, color: colors.inkSoft, textAlign: 'center', marginTop: 2, marginBottom: 12 },
  cardTitle: { fontWeight: '800', fontSize: 16, color: colors.ink, marginBottom: 6 },
  dateRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: colors.line },
  dateL: { fontWeight: '800', fontSize: 14, color: colors.ink },
  dateR: { fontSize: 13, color: colors.inkSoft, textAlign: 'right', flexShrink: 1 },
  orderHint: { fontSize: 13, color: colors.inkSoft, lineHeight: 19, marginBottom: 8 },
  orderMsg: { fontSize: 12.5, color: colors.ink, marginTop: 8 },
  slotTitle: { fontWeight: '800', fontSize: 15, color: colors.ink, marginBottom: 10 },
  slotRow: { flexDirection: 'row', gap: 8 },
  slotBox: { flex: 1, backgroundColor: '#f9f8f5', borderRadius: 12, paddingVertical: 12, paddingHorizontal: 6, alignItems: 'center' },
  slotNum: { fontSize: 28, fontWeight: '800' },
  slotLbl: { fontSize: 11.5, color: colors.inkSoft, textAlign: 'center', marginTop: 2 },
  bar: { height: 10, backgroundColor: '#eeeeee', borderRadius: 99, overflow: 'hidden', marginTop: 12 },
  schedRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 4 },
  schedTxt: { flex: 1, fontWeight: '700', fontSize: 14.5, color: colors.ink },
  pot: { backgroundColor: '#f9f8f5', borderRadius: 10, padding: 12, marginTop: 6 },
  potTxt: { fontSize: 13, color: colors.ink, fontWeight: '600' },
  potMoney: { color: colors.bodaOrange, fontWeight: '800' },
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
  orderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8 },
  orderIn: { width: 64, borderWidth: 1, borderColor: colors.line, borderRadius: 10, paddingVertical: 10, textAlign: 'center', fontSize: 14, color: colors.ink, backgroundColor: '#fff' },
  check: { fontSize: 14.5, color: colors.ink, marginVertical: 5 },
};

export default withChamaOnlineGate(MgrSetupScreen, 'chama');