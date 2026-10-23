// rider-app/src/screens/chama/MgrContributionDetailScreen.js
// One payment waiting for the Treasurer (Smart_Boda_Prototype_v30):
//   "Did you receive this money?"  ->  Yes, I got it (confirms)  /  No, or not sure (opens the reject review).
// A Treasurer who is also a member can confirm their own payment; the history then labels it "self-confirmed".
// route.params: { groupId, item }  where item comes from the contributions queue.
import React, { useState } from 'react';
import { withChamaOnlineGate } from '../../components/ChamaOnlineGate';
import { ScrollView, Text, View, TouchableOpacity } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import BackLink from '../../components/BackLink';
import { useToast } from '../../components/Toast';
import { queueDecide, apiError } from '../../api/groupsClient';
import { s, fmt } from './chamaStyles';
import { Hero, Btn, Card, DetailRows, ScreenTitle, DISPLAY_FONT } from './mgrUi';
import { Fold, FormInput } from './manageUi';
import { methodLabel } from './MgrContributionsScreen';
import { niceDateTime, first } from './common';
import colors from '../../theme/colors';

const REASONS = ['I did not receive the payment', 'Amount does not match', 'I could not find the payment in my M-Pesa messages', 'Other'];

function MgrContributionDetailScreen({ navigation, route }) {
  const { showToast } = useToast();
  const { groupId, item: i } = route.params || {};
  const [rejecting, setRejecting] = useState(false), [pick, setPick] = useState(null), [note, setNote] = useState(''), [busy, setBusy] = useState(false);
  if (!i) return <ScrollView style={s.page}><BackLink onPress={() => navigation.goBack()} /><Text style={{ padding: 16 }}>Open this from Contributions.</Text></ScrollView>;

  const done = (msg, tone) => { showToast(msg, tone); navigation.navigate('MgrContributions', { groupId }); };
  const decide = async (action, reason) => {
    setBusy(true);
    try { await queueDecide('contributions', i.id, action, reason, groupId); done(action === 'reject' ? 'Rejected. The member will see your reason.' : 'Confirmed. Thank you.', action === 'reject' ? 'warn' : 'success'); }
    catch (e) { showToast(apiError(e, 'Could not save. Check your connection.'), 'warn'); setBusy(false); }
  };
  const reason = pick === 'Other' ? (note.trim() ? `Other: ${note.trim()}` : '') : pick ? (note.trim() ? `${pick}. ${note.trim()}` : pick) : '';

  // ---------- "No, or not sure": Review Contribution ----------
  if (rejecting) {
    return (
      <ScrollView style={s.page} contentContainerStyle={{ padding: 16 }} keyboardShouldPersistTaps="handled">
        <BackLink onPress={() => setRejecting(false)} label="← Contributions" />
        <ScreenTitle>Review Contribution</ScreenTitle>
        <LinearGradient colors={['#fff6ee', '#ffffff']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={d.amountBox}>
          <Text style={d.amountLbl}>AMOUNT TO CONFIRM</Text>
          <Text style={d.amountBig}>{fmt(i.amount)}</Text>
        </LinearGradient>
        <Card>
          <DetailRows rows={[
            ['Member', i.member],
            ['Category', `🔄 ${i.circle_name || 'Merry-Go-Round'}`],
            ['Payment method', i.method === 'cash' ? '💵 Cash' : '📱 M-Pesa · Treasurer no.'],
            ...(i.method === 'cash' ? [] : [['Paid to', 'Treasurer no.']]),
            ['Submitted', niceDateTime(i.submitted_at)],
          ]} />
          <Fold bare title="More details"><DetailRows rows={[['Phone', i.phone || '—'], ['Ref', i.reference || '—']]} /></Fold>
        </Card>
        <Card>
          <Text style={d.why}>❌ Why are you rejecting this?</Text>
          {REASONS.map((x) => (
            <TouchableOpacity key={x} testID={`reason-${x}`} onPress={() => setPick(x)} style={[d.reason, pick === x && d.reasonOn]}>
              <Text style={d.reasonTxt}>{x}</Text>
            </TouchableOpacity>))}
          <FormInput label="Note to the member (optional)" value={note} onChangeText={setNote} maxLength={200} placeholder="e.g. Please resend with the correct amount" />
        </Card>
        <Btn label={`Reject & Notify ${first(i.member)}`} disabled={busy || !reason} onPress={() => decide('reject', reason)} style={{ backgroundColor: busy || !reason ? '#e9a7a3' : colors.signalRed }} testID="reject-send" />
        <Btn ghost label="Cancel" onPress={() => setRejecting(false)} />
      </ScrollView>);
  }

  // ---------- Did you receive this money? ----------
  return (
    <ScrollView style={s.page} contentContainerStyle={{ padding: 16 }}>
      <BackLink onPress={() => navigation.goBack()} label="← Payments" />
      <Hero label={i.member.toUpperCase()} amount={fmt(i.amount)} split={[methodLabel(i.method), i.circle_name || 'Merry-Go-Round']} />
      <Text style={d.ask}>Did you receive this money?</Text>
      <Btn label="✓ Yes, I got it" disabled={busy} onPress={() => decide('confirm')} testID="confirm-yes" />
      <Btn ghost label="✗ No, or not sure" disabled={busy} onPress={() => { setPick(null); setNote(''); setRejecting(true); }} testID="confirm-no" />
      <Fold title="Details"><DetailRows rows={[['Phone', i.phone || '—'], ['Time', niceDateTime(i.submitted_at)], ['Ref', i.reference || '—']]} /></Fold>
    </ScrollView>);
}

const d = {
  ask: { fontFamily: DISPLAY_FONT, fontSize: 18, fontWeight: '800', color: colors.ink, textAlign: 'center', marginVertical: 8 },
  amountBox: { borderRadius: 16, borderWidth: 1.5, borderColor: colors.bodaOrange, padding: 16, alignItems: 'center', marginBottom: 14, overflow: 'hidden' },
  amountLbl: { fontSize: 13, color: colors.inkSoft, letterSpacing: 0.5 },
  amountBig: { fontFamily: DISPLAY_FONT, fontSize: 32, fontWeight: '800', color: colors.bodaOrange },
  why: { fontWeight: '800', fontSize: 15, color: colors.ink, marginBottom: 8 },
  reason: { borderWidth: 1, borderColor: colors.line, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 14, marginBottom: 8, backgroundColor: '#fff' },
  reasonOn: { borderColor: colors.bodaOrange, backgroundColor: '#fff6ee' },
  reasonTxt: { fontWeight: '700', fontSize: 13.5, color: colors.ink },
};

export default withChamaOnlineGate(MgrContributionDetailScreen, 'chama');