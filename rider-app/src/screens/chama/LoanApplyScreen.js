// rider-app/src/screens/chama/LoanApplyScreen.js
// Apply for a Table Banking loan in three short steps (prototype v30):
//   1 How much and for how long   2 What you put up (security / guarantors, only if the group asks)   3 Check and send.
// With params.applicationId the rider is adding more security (or a new guarantor) to an application that is still waiting.
import React, { useEffect, useState } from 'react';
import { withChamaOnlineGate } from '../../components/ChamaOnlineGate';
import { View, Text, TextInput, ScrollView, TouchableOpacity } from 'react-native';
import BackLink from '../../components/BackLink';
import PrimaryButton from '../../components/PrimaryButton';
import { useToast } from '../../components/Toast';
import { mySummary, applyLoan, addSecurity, guarantorCandidates, apiError } from '../../api/groupsClient';
import { s, fmt, Chip } from './chamaStyles';
import colors from '../../theme/colors';
import { useGroupText } from './groupText';

// Same formula as the server (calc_loan). The server is the authority.
const calc = (a, m, r) => { const interest = Math.round(a * r / 100 * m), total = a + interest; return { interest, total, inst: Math.ceil(total / m) }; };
const KIND_LABEL = { savings: '💰 My savings', logbook: '📘 Bike logbook', title: '📜 Title deed', chattel: '🛋️ Household item', guarantor: '🤝 A guarantor' };
const FORM_LABEL = { savings: 'their savings', logbook: 'their logbook', title: 'their title deed', chattel: 'their household item' };

function LoanApplyScreen({ navigation, route }) {
  const gt = useGroupText();
  const { showToast } = useToast();
  const { groupId, applicationId } = route.params || {};
  const adding = !!applicationId;
  const [d, setD] = useState(null);
  const [people, setPeople] = useState([]);
  const [step, setStep] = useState(adding ? 2 : 1);
  const [amount, setAmount] = useState('');
  const [months, setMonths] = useState(3);
  const [purpose, setPurpose] = useState('Bike repair / parts');
  const [offers, setOffers] = useState([]);      // [{kind, value, description, ref, guarantor_member_id, guarantor_name, guarantor_form}]
  const [draft, setDraft] = useState(null);      // the item being filled in
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    mySummary(groupId).then(setD).catch((e) => showToast(apiError(e, 'Could not load.'), 'warn'));
    guarantorCandidates(groupId).then(setPeople).catch(() => {});
  }, [groupId]);

  const rules = d?.security_rules;
  const A = d?.pending_application;
  const a = adding && A ? Number(A.amount) : parseInt(amount, 10) || 0;
  const needed = rules?.mode === 'required' && a >= Number(rules.from_amount || 0) ? Math.ceil(a * rules.cover_pct / 100) : 0;
  // Savings (also a guarantor's savings) count in full; a logbook, title or household item counts at the group's discount.
  const counted = (o) => (o.kind === 'savings' || (o.kind === 'guarantor' && (o.guarantor_form || 'savings') === 'savings'))
    ? Number(o.value || 0) : Math.floor(Number(o.value || 0) * Number(rules?.haircut_pct ?? 100) / 100);
  const offered = offers.reduce((t, o) => t + counted(o), 0);
  const heldAlready = adding && A ? Number(A.security?.offered || 0) : 0;
  const stillNeeded = Math.max(0, needed - offered - heldAlready);
  const step1ok = d && a >= Number(d.rules.min_amount) && a <= Number(d.available);
  const c = step1ok ? calc(a, months, Number(d.rules.rate)) : null;
  const allowed = rules?.allowed || [];

  function startDraft(kind) {
    setDraft({ kind, value: kind === 'savings' ? String(Math.min(stillNeeded || a, Number(d.savings_pledge_max || 0))) : '', description: '', ref: '', guarantor: null, form: 'savings' });
  }
  function saveDraft() {
    const v = parseInt(draft.value, 10) || 0;
    if (v <= 0) return showToast('Enter the amount or what it is worth.', 'warn');
    if (draft.kind === 'savings' && v > Number(d.savings_pledge_max || 0)) return showToast(`You can lock at most ${fmt(d.savings_pledge_max)} of your savings.`, 'warn');
    if (['logbook', 'title', 'chattel'].includes(draft.kind) && !draft.description.trim()) return showToast('Please fill in the details.', 'warn');
    if (['logbook', 'title', 'chattel'].includes(draft.kind) && !draft.ref.trim()) return showToast('Please add the number of the item. One item can secure only one loan.', 'warn');
    if (draft.kind === 'guarantor' && draft.form !== 'savings' && !draft.ref.trim()) return showToast('Please add the number of the item your guarantor puts up.', 'warn');
    if (draft.kind === 'guarantor') {
      if (!draft.guarantor) return showToast('Choose who will back you.', 'warn');
      if (offers.filter((o) => o.kind === 'guarantor').length >= (rules.guar.max - (adding ? A?.securities?.filter((x) => x.kind === 'guarantor' && ['waiting_guarantor', 'submitted', 'held'].includes(x.status)).length || 0 : 0))) return showToast(`Your group allows at most ${rules.guar.max} guarantor(s).`, 'warn');
    }
    setOffers([...offers, { kind: draft.kind, value: v, description: draft.description.trim(), ref: draft.ref.trim(),
      guarantor_member_id: draft.guarantor?.member_id, guarantor_name: draft.guarantor?.name, guarantor_form: draft.kind === 'guarantor' ? draft.form : undefined }]);
    setDraft(null);
  }
  const payload = (o) => ({ kind: o.kind, value: o.value, description: o.description || undefined, ref: o.ref || undefined,
    guarantor_member_id: o.guarantor_member_id, guarantor_form: o.guarantor_form });

  async function submit() {
    setBusy(true);
    try {
      if (adding) {
        for (const o of offers) await addSecurity(applicationId, payload(o));
        showToast('Added. Your Treasurer will check it.', 'success');
      } else {
        await applyLoan({ amount: a, months, purpose, securities: offers.map(payload) }, groupId);
        showToast(offers.some((o) => o.kind === 'guarantor') ? 'Sent. Your guarantors will be asked to say yes.' : 'Application sent to your Treasurer.', 'success');
      }
      navigation.navigate('MyLoans', { groupId });
    } catch (e) { showToast(apiError(e, 'Could not send. Check your connection.'), 'warn'); }
    finally { setBusy(false); }
  }

  const stepLabels = adding ? [] : ['Amount', 'Security', 'Check'];
  return (
    <ScrollView style={s.page} contentContainerStyle={{ padding: 16 }}>
      <BackLink onPress={() => (step > 1 && !adding ? setStep(step - 1) : navigation.goBack())} />
      <Text style={s.title}>{adding ? '➕ Add security' : `➕ ${gt('group.title_apply_loan', 'Apply for a Loan')}`}</Text>
      {d && <Text style={s.sub}>{d.group}</Text>}
      {!adding && d && <View style={{ flexDirection: 'row', gap: 6, marginBottom: 12 }}>
        {stepLabels.map((l, i) => <View key={l} style={{ flex: 1, paddingVertical: 6, borderBottomWidth: 3, borderBottomColor: i + 1 <= step ? colors.bodaOrange : colors.line }}>
          <Text style={{ fontSize: 12, fontWeight: i + 1 === step ? '800' : '500' }}>{i + 1}. {l}</Text></View>)}</View>}

      {d && step === 1 && (<>
        <View style={s.card}>
          <Text style={s.label}>LOAN AMOUNT (KSH) *</Text>
          <TextInput style={s.input} keyboardType="number-pad" value={amount} onChangeText={setAmount} placeholder="e.g. 10000" />
          <Text style={s.hint}>Smallest {fmt(d.rules.min_amount)} · Most you can borrow {fmt(d.available)}</Text>
          <Text style={[s.label, { marginTop: 12 }]}>HOW MANY MONTHS TO REPAY *</Text>
          <View style={s.chipRow}>{Array.from({ length: d.rules.max_months }, (_, i) => i + 1).map((m) =>
            <Chip key={m} on={months === m} label={`${m} month${m > 1 ? 's' : ''}`} onPress={() => setMonths(m)} />)}</View>
          <Text style={[s.label, { marginTop: 6 }]}>WHAT IS IT FOR?</Text>
          <TextInput style={s.input} value={purpose} onChangeText={setPurpose} maxLength={80} />
        </View>
        <View style={s.card}>
          <Text style={s.cardTitle}>🧮 What you will repay</Text>
          {c ? (<>
            <View style={s.row}><Text style={s.k}>Interest ({d.rules.rate}% × {months} month{months > 1 ? 's' : ''})</Text><Text style={s.v}>{fmt(c.interest)}</Text></View>
            <View style={s.row}><Text style={s.k}>Total to repay</Text><Text style={s.v}>{fmt(c.total)}</Text></View>
            <View style={s.row}><Text style={s.k}>Each month</Text><Text style={s.v}>{fmt(c.inst)}</Text></View>
          </>) : <Text style={s.hint}>{a > Number(d.available) ? `That is above what you can borrow now (${fmt(d.available)}).` : `Enter at least ${fmt(d.rules.min_amount)} to see what you will repay.`}</Text>}
        </View>
        <PrimaryButton label={allowed.length ? 'Next: security →' : 'Next: check →'} disabled={!step1ok} onPress={() => setStep(allowed.length ? 2 : 3)} />
      </>)}

      {d && step === 2 && (<>
        <View style={s.card}>
          <Text style={s.cardTitle}>🔒 What you put up</Text>
          {needed > 0
            ? <Text style={s.hint}>Your group asks for security worth at least {fmt(needed)} ({rules.cover_pct}% of the loan). {heldAlready > 0 ? `Already offered: ${fmt(heldAlready)}.` : ''}</Text>
            : <Text style={s.hint}>Your group does not need security for this loan, but you may offer some to help your request.</Text>}
          {needed > 0 && <Text style={[s.hint, { fontWeight: '800', color: stillNeeded ? colors.signalAmber : colors.signalGreen }]}>
            {stillNeeded ? `Still to add: ${fmt(stillNeeded)}` : '✅ Cover reached'}</Text>}
          {rules.guar.on && <Text style={s.hint}>A guarantor is optional. If you add one, their backing counts toward the cover.</Text>}
          {Number(rules.haircut_pct) < 100 && allowed.some((k) => ['logbook', 'title', 'chattel'].includes(k)) && <Text style={s.hint}>A logbook, title deed or household item counts at {rules.haircut_pct}% of its value.</Text>}
          {offers.map((o, i) => (
            <View key={i} style={s.row}>
              <Text style={s.k}>{KIND_LABEL[o.kind]}{o.guarantor_name ? ` · ${o.guarantor_name} (${FORM_LABEL[o.guarantor_form]})` : o.description ? ` · ${o.description}` : ''}</Text>
              <View style={{ alignItems: 'flex-end' }}><Text style={s.v}>{fmt(o.value)}</Text>
                <TouchableOpacity onPress={() => setOffers(offers.filter((_, j) => j !== i))}><Text style={{ color: colors.signalRed, fontWeight: '700' }}>Remove</Text></TouchableOpacity></View>
            </View>))}
        </View>

        {!draft && (<View style={s.chipRow}>{allowed.map((k) => <Chip key={k} on={false} label={`+ ${KIND_LABEL[k]}`} onPress={() => startDraft(k)} />)}</View>)}

        {draft && (
          <View style={[s.card, { borderColor: colors.bodaOrange }]}>
            <Text style={s.cardTitle}>{KIND_LABEL[draft.kind]}</Text>
            {draft.kind === 'savings' && <Text style={s.hint}>You can lock up to {fmt(d.savings_pledge_max)} (free savings {fmt(d.free)}). It stays locked until you finish paying.</Text>}
            {draft.kind === 'guarantor' && (<>
              <Text style={s.label}>WHO WILL BACK YOU? *</Text>
              {people.length === 0 && <Text style={s.hint}>No other member can say yes yet.</Text>}
              <View style={s.chipRow}>{people.map((p) => <Chip key={p.member_id} on={draft.guarantor?.member_id === p.member_id} label={`${p.name} · ${p.phone_hint}`} onPress={() => setDraft({ ...draft, guarantor: p })} />)}</View>
              <Text style={s.label}>THEY BACK YOU WITH</Text>
              <View style={s.chipRow}>{['savings', 'logbook', 'title', 'chattel'].filter((f) => rules.guar.forms[f]).map((f) =>
                <Chip key={f} on={draft.form === f} label={FORM_LABEL[f]} onPress={() => setDraft({ ...draft, form: f })} />)}</View>
              {draft.form !== 'savings' && (<><Text style={s.label}>NUMBER OF THE ITEM *</Text>
                <TextInput style={s.input} autoCapitalize="characters" value={draft.ref} onChangeText={(v) => setDraft({ ...draft, ref: v })} maxLength={60} /></>)}
            </>)}
            {['logbook', 'title', 'chattel'].includes(draft.kind) && (<>
              <Text style={s.label}>{draft.kind === 'logbook' ? 'LOGBOOK NUMBER *' : draft.kind === 'title' ? 'TITLE DEED NUMBER AND PLACE *' : 'WHAT IS THE ITEM? *'}</Text>
              <TextInput style={s.input} value={draft.description} onChangeText={(v) => setDraft({ ...draft, description: v })} maxLength={120} />
              <Text style={s.label}>{draft.kind === 'logbook' ? 'REGISTRATION NUMBER (AS ON THE LOGBOOK) *' : draft.kind === 'title' ? 'TITLE DEED NUMBER *' : 'SERIAL NUMBER *'}</Text>
              <TextInput style={s.input} autoCapitalize="characters" value={draft.ref} onChangeText={(v) => setDraft({ ...draft, ref: v })} maxLength={60} />
              <Text style={s.hint}>{rules.verify}. {rules.valuation}. One item can secure only one loan at a time.</Text>
            </>)}
            <Text style={s.label}>{draft.kind === 'savings' || draft.kind === 'guarantor' ? 'AMOUNT (KSH) *' : 'WHAT IT IS WORTH (KSH) *'}</Text>
            <TextInput style={s.input} keyboardType="number-pad" value={draft.value} onChangeText={(v) => setDraft({ ...draft, value: v })} />
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 1 }}><PrimaryButton label="Add" onPress={saveDraft} /></View>
              <TouchableOpacity style={{ padding: 14 }} onPress={() => setDraft(null)}><Text style={{ fontWeight: '700' }}>Cancel</Text></TouchableOpacity>
            </View>
          </View>)}

        {!draft && <PrimaryButton label={adding ? 'Send to my Treasurer' : 'Next: check →'}
          disabled={busy || (adding ? offers.length === 0 : (needed > 0 && stillNeeded > 0))}
          onPress={adding ? submit : () => setStep(3)} />}
        {!draft && !adding && needed > 0 && stillNeeded > 0 && <Text style={s.hint}>Add {fmt(stillNeeded)} more security to continue.</Text>}
      </>)}

      {d && step === 3 && c && (<>
        <View style={s.card}>
          <Text style={s.cardTitle}>Check your request</Text>
          {[['Loan amount', fmt(a)], ['Months', String(months)], ['Total to repay', fmt(c.total)], ['Each month', fmt(c.inst)], ['For', purpose || '—']]
            .map(([k, v]) => <View key={k} style={s.row}><Text style={s.k}>{k}</Text><Text style={s.v}>{v}</Text></View>)}
          {offers.map((o, i) => <View key={i} style={s.row}><Text style={s.k}>{KIND_LABEL[o.kind]}{o.guarantor_name ? ` · ${o.guarantor_name}` : ''}</Text><Text style={s.v}>{fmt(o.value)}</Text></View>)}
          {offers.some((o) => o.kind === 'guarantor') && <Text style={s.hint}>Your guarantors get a message and must say yes before your Treasurer checks the request.</Text>}
        </View>
        <PrimaryButton label="Send application" onPress={submit} disabled={busy} />
        <TouchableOpacity onPress={() => setStep(allowed.length ? 2 : 1)}><Text style={{ textAlign: 'center', marginTop: 12, fontWeight: '700' }}>← Change something</Text></TouchableOpacity>
      </>)}
    </ScrollView>);
}

export default withChamaOnlineGate(LoanApplyScreen, 'loans');
