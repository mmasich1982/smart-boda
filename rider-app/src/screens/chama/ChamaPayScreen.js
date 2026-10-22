// rider-app/src/screens/chama/ChamaPayScreen.js
// One payment screen for every kind of money a rider hands to the Treasurer.
// (Part 4B version. The old Part 3B version posted EVERYTHING to /chama/me/contributions.)
//
// route.params: { kind: 'contribution' | 'loan', amount?, treasurer?, groupId, circleId?, model?, maxAmount?, circleName? }
//   contribution -> Table Banking saving, or a Merry-Go-Round round (circleId says which circle)   POST /chama/me/contributions
//   loan         -> Table Banking loan repayment                                                   POST /chama/me/loan-payments
// model === 'mgr' shows the Merry-Go-Round "Pay contribution" layout from Smart_Boda_Prototype_v25.
import React, { useState } from 'react';
import { withChamaOnlineGate } from '../../components/ChamaOnlineGate';   // My Savings / My Loans / My Chama require an internet connection
import { View, Text, TextInput, ScrollView, TouchableOpacity } from 'react-native';
import BackLink from '../../components/BackLink';
import PrimaryButton from '../../components/PrimaryButton';
import { useToast } from '../../components/Toast';
import { payContribution, payLoan, apiError } from '../../api/groupsClient';
import { s, fmt } from './chamaStyles';
import { Btn, Card, ScreenTitle, FormLabel } from './mgrUi';
import colors from '../../theme/colors';
import { useGroupText } from './groupText';

const KIND = {
  contribution: { title: ['🏦', 'group.title_pay_contribution', 'Pay Contribution'], back: 'MySavings', min: 1, send: (b, p) => payContribution({ ...b, circle_id: p.circleId || undefined }, p.groupId) },
  loan: { title: ['💳', 'group.title_repay_loan', 'Repay Loan'], back: 'MyLoans', min: 100, send: (b, p) => payLoan(b, p.groupId) },
};
const MGR_MAX = 50000;

// Copy to the clipboard where the browser allows it; otherwise show the number so the rider can type it.
async function copyText(text, label, showToast) {
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text); showToast(`${label} copied.`, 'success'); return;
    }
  } catch { /* fall through */ }
  showToast(`${label}: ${text}`, 'success');
}

function ChamaPayScreen({ navigation, route }) {
  const gt = useGroupText();
  const p = route.params || {};
  const mgr = p.model === 'mgr';
  const k = KIND[p.kind] || KIND.contribution;      // an unknown kind falls back to a group contribution
  const t = p.treasurer;
  const { showToast } = useToast();
  const [amount, setAmount] = useState(p.amount ? String(Math.round(p.amount)) : '');
  const [method, setMethod] = useState(null), [busy, setBusy] = useState(false);

  // Merry-Go-Round: KSh 100 minimum (lower only when that is all that is left to pay) and KSh 50,000 maximum.
  const mgrMin = p.maxAmount > 0 ? Math.min(100, Math.round(p.maxAmount)) : 100;
  const min = mgr ? mgrMin : k.min;
  const a = parseInt(amount, 10);
  const ready = !!a && a >= min && (!mgr || a <= MGR_MAX) && !!method;

  async function submit() {
    if (!ready) return showToast(mgr ? `Enter an amount (${fmt(min)}–${fmt(MGR_MAX)}) and choose Cash or M-Pesa.` : 'Enter the amount and choose Cash or M-Pesa.', 'warn');
    if (mgr && p.maxAmount > 0 && a > p.maxAmount) return showToast(`The most you can pay this round is ${fmt(p.maxAmount)}.`, 'warn');
    setBusy(true);
    try {
      const r = await k.send({ amount: a, method, channel: method === 'mpesa' ? 'treasurer' : null }, p);
      if (mgr) {
        navigation.replace('MgrPaySubmitted', { groupId: p.groupId, circleId: p.circleId, amount: a, method, reference: r?.reference || r?.id, treasurer: t });
      } else {
        showToast('Sent. Your Treasurer will confirm it once received.', 'success');
        navigation.navigate(k.back, p.groupId ? { groupId: p.groupId } : undefined);
      }
    } catch (e) { showToast(apiError(e, 'Could not send. Check your connection.'), 'warn'); }
    finally { setBusy(false); }
  }

  // ---------- Merry-Go-Round: Pay contribution ----------
  if (mgr) {
    const tFirst = t ? String(t.name || '').split(' ')[0] : 'your Treasurer';
    const MTile = ({ id, e, label, sub }) => (
      <TouchableOpacity testID={`pay-${id}`} onPress={() => setMethod(id)} style={[m.tile, method === id && m.tileOn]}>
        <Text style={m.emoji}>{e}</Text><Text style={m.lbl}>{label}</Text><Text style={m.sub}>{sub}</Text>
      </TouchableOpacity>);
    return (
      <ScrollView style={s.page} contentContainerStyle={{ padding: 16 }}>
        <BackLink onPress={() => navigation.goBack()} />
        <ScreenTitle>💳 Pay contribution</ScreenTitle>
        <Card>
          <FormLabel required>Amount contributed (KSh)</FormLabel>
          <TextInput style={m.input} keyboardType="number-pad" value={amount} onChangeText={setAmount}
            placeholder={`e.g. ${p.amount ? Math.round(p.amount) : 500}`} />
          <Text style={m.hint}>Minimum {fmt(min)} · Maximum {fmt(MGR_MAX)}</Text>
        </Card>
        <Card>
          <Text style={m.cardTitle}>How did you pay?</Text>
          <View style={m.grid}>
            <MTile id="cash" e="💵" label="Cash" sub={`Handed to ${tFirst}`} />
            <MTile id="mpesa" e="📲" label="M-Pesa" sub="Sent from your phone" />
          </View>
          {method === 'cash' && !!t && (
            <Text style={m.hint}>💵 Hand the cash to <Text style={{ fontWeight: '700' }}>{t.name}</Text>, your Treasurer ({t.phone}), then tap the button below.</Text>)}
          {method === 'mpesa' && !!t && (
            <TouchableOpacity style={m.copy} onPress={() => copyText(t.phone, "Treasurer's number", showToast)}>
              <View style={{ flex: 1 }}>
                <Text style={m.copyLbl}>Treasurer's number · {t.name}</Text>
                <Text style={m.copyBig}>{t.phone}</Text>
              </View>
              <Text>📋</Text>
            </TouchableOpacity>)}
        </Card>
        <Btn label="I've Made the Payment ✅" onPress={submit} disabled={busy || !ready} testID="mgr-submit" />
      </ScrollView>);
  }

  const Tile = ({ id, e, label, hint }) => (
    <TouchableOpacity onPress={() => setMethod(id)} style={[s.card, method === id && { borderColor: colors.bodaOrange, backgroundColor: '#fff6ee' }]}>
      <Text style={{ fontWeight: '800' }}>{e} {label}</Text><Text style={s.hint}>{hint}</Text></TouchableOpacity>);

  return (
    <ScrollView style={s.page} contentContainerStyle={{ padding: 16 }}>
      <BackLink onPress={() => navigation.goBack()} />
      <Text style={s.title}>{k.title[0]} {gt(k.title[1], k.title[2])}</Text>
      <Text style={s.sub}>Your balance updates once your Treasurer confirms.</Text>
      <View style={s.card}>
        <Text style={s.label}>AMOUNT YOU ARE PAYING (KSH) *</Text>
        <TextInput style={s.input} keyboardType="number-pad" value={amount} onChangeText={setAmount} />
        {!!p.amount && <Text style={s.hint}>Suggested: {fmt(p.amount)}. You can change it.</Text>}
      </View>
      <Tile id="cash" e="💵" label="Cash" hint={t ? `Hand it to ${t.name.split(' ')[0]}, the treasurer` : ''} />
      <Tile id="mpesa" e="📱" label="M-Pesa · Treasurer's Number" hint={t ? `${t.name} · ${t.phone}` : ''} />
      <PrimaryButton label={method === 'cash' ? 'Record Cash Payment →' : method === 'mpesa' ? "I've Sent the Money ✅" : 'Choose a Payment Method'}
        onPress={submit} disabled={busy || !method} />
    </ScrollView>);
}

const m = {
  input: { borderWidth: 1, borderColor: colors.line, borderRadius: 10, paddingVertical: 12, paddingHorizontal: 14, fontSize: 14, color: colors.ink, backgroundColor: '#fff' },
  hint: { fontSize: 11.5, color: colors.inkSoft, marginTop: 6, lineHeight: 17 },
  cardTitle: { fontWeight: '700', fontSize: 13.5, color: colors.ink, marginBottom: 8 },
  grid: { flexDirection: 'row', gap: 10, marginBottom: 6 },
  tile: { flex: 1, borderWidth: 1.5, borderColor: colors.line, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 12, backgroundColor: '#fff' },
  tileOn: { borderColor: colors.bodaOrange, backgroundColor: '#fff6ee' },
  emoji: { fontSize: 22, marginBottom: 6 },
  lbl: { fontWeight: '700', fontSize: 13, color: colors.ink },
  sub: { fontSize: 11, color: colors.inkSoft, marginTop: 2 },
  copy: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f9f8f5', borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.line, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 12, marginTop: 8 },
  copyLbl: { fontSize: 10, color: colors.inkSoft, textTransform: 'uppercase', letterSpacing: 0.5 },
  copyBig: { fontSize: 16, fontWeight: '800', color: colors.ink },
};

// Online-required module: shows a professional "internet connection required" message while offline.
export default withChamaOnlineGate(ChamaPayScreen, (p) => (p.route?.params?.kind === 'loan' ? 'loans' : 'savings'));