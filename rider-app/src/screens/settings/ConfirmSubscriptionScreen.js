// rider-app/src/screens/settings/ConfirmSubscriptionScreen.js
import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Clipboard } from 'react-native';
import BackLink from '../../components/BackLink';
import PrimaryButton from '../../components/PrimaryButton';
import colors from '../../theme/colors';
import api from '../../api/client';
import { useToast } from '../../components/Toast';

const PAY_NUMBER = '0757 334 481';

export default function ConfirmSubscriptionScreen({ route, riderId, amountFor, navigation }) {
  const { frequency } = route.params;
  const calc = amountFor(frequency);
  const [code, setCode] = useState('');
  const [error, setError] = useState(null);
  const { showToast } = useToast();

  function copyNumber() {
    Clipboard.setString('0757334481');
    showToast('Number copied — paste it into M-Pesa. 📋', 'success');
  }

  async function handlePaid() {
    const trimmed = code.trim().toUpperCase();
    if (!trimmed) { setError('M-Pesa confirmation code is required.'); return; }  // EXC-SB24-001
    if (trimmed.length < 8) { setError('That code looks too short — please check the M-Pesa message and re-enter it.'); return; }  // EXC-SB24-002
    const res = await api.post('/subscription/pay', null, { params: { rider_id: riderId, frequency_key: frequency, mpesa_code: trimmed } });
    // BR-SB24-007: unlocked/activated the instant this call succeeds — no polling, no "Processing" screen
    showToast(res.data.was_locked ? 'Payment received — your account is unlocked! 🎉' : 'Payment received! Your subscription is active. 🎉', 'success');
    navigation.navigate('Home');
  }

  return (
    <View style={styles.container}>
      <BackLink label="← Change" onPress={() => navigation.navigate('ChooseFrequency', { frequency })} />
      <Text style={styles.title}>Confirm Your Plan</Text>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>{calc.emoji} {calc.label} Plan</Text>
        <View style={styles.row}><Text style={styles.k}>Daily rate</Text><Text style={styles.v}>KSh {calc.dailyPrice} × {calc.days} day{calc.days===1?'':'s'}</Text></View>
        {calc.save > 0 && (<>
          <View style={styles.row}><Text style={styles.k}>Sticker price</Text><Text style={styles.strike}>KSh {calc.sticker.toLocaleString()}</Text></View>
          <View style={styles.row}><Text style={styles.k}>You save</Text><Text style={styles.save}>− KSh {calc.save.toLocaleString()}</Text></View>
        </>)}
        <View style={[styles.row, styles.rowTotal]}><Text style={styles.k}>Total to pay now</Text><Text style={styles.vBold}>KSh {calc.amount.toLocaleString()}</Text></View>
      </View>
      <View style={styles.payPanel}>
        <Text style={styles.payHint}>📲 Please use "Send Money" to the Safaricom number below.</Text>
        <TouchableOpacity style={styles.payNumberBox} onPress={copyNumber}>
          <Text style={styles.payNumberLabel}>Safaricom Number</Text>
          <Text style={styles.payNumber}>{PAY_NUMBER}</Text>
        </TouchableOpacity>
        <Text style={styles.payAmountLabel}>Amount To Send</Text>
        <Text style={styles.payAmount}>KSh {calc.amount.toLocaleString()}</Text>
      </View>
      <Text style={styles.label}>M-Pesa Confirmation Code</Text>
      <TextInput style={styles.input} placeholder="e.g. QK71X9Y2AB" maxLength={15} autoCapitalize="characters"
        value={code} onChangeText={setCode} />
      {error && <Text style={styles.error}>⚠️ {error}</Text>}
      <PrimaryButton label="I've Made This Payment ✅" onPress={handlePaid} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, backgroundColor: '#fff' },
  title: { fontSize: 20, fontWeight: '700', color: colors.ink, marginBottom: 14 },
  card: { borderWidth: 1.5, borderColor: colors.line, borderRadius: 16, padding: 16, marginBottom: 14 },
  cardTitle: { fontWeight: '700', fontSize: 13.5, color: colors.ink, marginBottom: 6 },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  rowTotal: { borderTopWidth: 1, borderColor: colors.line, paddingTop: 8, marginTop: 4 },
  k: { fontSize: 12.5, color: colors.inkSoft },
  v: { fontSize: 12.5, color: colors.ink, fontWeight: '700' },
  vBold: { fontSize: 16, color: colors.ink, fontWeight: '800' },
  strike: { fontSize: 12.5, color: colors.inkSoft, textDecorationLine: 'line-through' },
  save: { fontSize: 12.5, color: colors.signalGreen, fontWeight: '700' },
  payPanel: { backgroundColor: '#0a6e3d', borderRadius: 14, padding: 18, marginBottom: 14 },
  payHint: { fontSize: 13, color: '#fff', opacity: 0.95, marginBottom: 14, lineHeight: 20 },
  payNumberBox: { backgroundColor: 'rgba(255,255,255,.14)', borderWidth: 1.5, borderColor: 'rgba(255,255,255,.55)', borderStyle: 'dashed', borderRadius: 10, padding: 12, marginBottom: 14 },
  payNumberLabel: { fontSize: 10, color: 'rgba(255,255,255,.85)', textTransform: 'uppercase' },
  payNumber: { fontSize: 20, fontWeight: '800', color: '#fff' },
  payAmountLabel: { fontSize: 10.5, color: 'rgba(255,255,255,.85)', textTransform: 'uppercase', textAlign: 'center' },
  payAmount: { fontSize: 26, fontWeight: '800', color: '#fff', textAlign: 'center' },
  label: { fontSize: 12, fontWeight: '700', color: colors.ink, marginBottom: 6, marginTop: 6 },
  input: { borderWidth: 1.5, borderColor: colors.line, borderRadius: 10, padding: 12, fontSize: 13, textTransform: 'uppercase', marginBottom: 6 },
  error: { color: colors.signalRed, fontSize: 12.5, marginBottom: 10, fontWeight: '700' },
});
