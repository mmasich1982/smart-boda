// rider-app/src/screens/chama/ChamaPayScreen.js
// One payment screen for every kind of money a rider hands to the Treasurer.
// (Part 4B version. The old Part 3B version posted EVERYTHING to /chama/me/contributions.)
//
// route.params: { kind: 'contribution' | 'loan', amount?, treasurer?, groupId, circleId? }
//   contribution -> Table Banking saving, or a Merry-Go-Round round (circleId says which circle)   POST /chama/me/contributions
//   loan         -> Table Banking loan repayment                                                   POST /chama/me/loan-payments
import React, { useState } from 'react';
import { withChamaOnlineGate } from '../../components/ChamaOnlineGate';   // My Savings / My Loans / My Chama require an internet connection
import { View, Text, TextInput, ScrollView, TouchableOpacity } from 'react-native';
import BackLink from '../../components/BackLink';
import PrimaryButton from '../../components/PrimaryButton';
import { useToast } from '../../components/Toast';
import { payContribution, payLoan, apiError } from '../../api/groupsClient';
import { s, fmt } from './chamaStyles';
import colors from '../../theme/colors';
import { useGroupText } from './groupText';

const KIND = {
  contribution: { title: ['🏦', 'group.title_pay_contribution', 'Pay Contribution'], back: 'MySavings', min: 1, send: (b, p) => payContribution({ ...b, circle_id: p.circleId || undefined }, p.groupId) },
  loan: { title: ['💳', 'group.title_repay_loan', 'Repay Loan'], back: 'MyLoans', min: 100, send: (b, p) => payLoan(b, p.groupId) },
};

function ChamaPayScreen({ navigation, route }) {
  const gt = useGroupText();
  const p = route.params || {};
  const k = KIND[p.kind] || KIND.contribution;      // an unknown kind falls back to a group contribution
  const t = p.treasurer;
  const { showToast } = useToast();
  const [amount, setAmount] = useState(p.amount ? String(Math.round(p.amount)) : '');
  const [method, setMethod] = useState(null), [busy, setBusy] = useState(false);

  async function submit() {
    const a = parseInt(amount, 10);
    if (!a || a < k.min || !method) return showToast('Enter the amount and choose Cash or M-Pesa.', 'warn');
    setBusy(true);
    try {
      await k.send({ amount: a, method, channel: method === 'mpesa' ? 'treasurer' : null }, p);
      showToast('Sent. Your Treasurer will confirm it once received.', 'success');
      navigation.navigate(k.back, p.groupId ? { groupId: p.groupId } : undefined);
    } catch (e) { showToast(apiError(e, 'Could not send. Check your connection.'), 'warn'); }
    finally { setBusy(false); }
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

// Online-required module: shows a professional "internet connection required" message while offline.
export default withChamaOnlineGate(ChamaPayScreen, (p) => (p.route?.params?.kind === 'loan' ? 'loans' : 'savings'));
