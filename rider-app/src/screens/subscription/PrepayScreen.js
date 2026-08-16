// rider-app/src/screens/subscription/PrepayScreen.js
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import BackLink from '../../components/BackLink';
import PrimaryButton from '../../components/PrimaryButton';
import colors from '../../theme/colors';

export default function PrepayScreen({ dailyPrice, currentExpiryAt, navigation }) {
  const [days, setDays] = useState(7);
  const [confirmed, setConfirmed] = useState(false);
  const total = days * dailyPrice;
  const newExpiry = new Date(Math.max(currentExpiryAt, Date.now()) + days*86400000);

  function adjust(delta) { setDays((d) => Math.max(3, Math.min(60, d + delta))); }  // BR-SB24-013: clamped 3–60

  return (
    <View style={styles.container}>
      <BackLink onPress={() => navigation.navigate('Subscription')} />
      <Text style={styles.title}>Pay Ahead & Skip the Hassle</Text>
      <View style={styles.stepperRow}>
        <TouchableOpacity style={styles.stepperBtn} onPress={() => adjust(-1)}><Text style={styles.stepperBtnText}>−</Text></TouchableOpacity>
        <Text style={styles.stepperVal}>{days}</Text>
        <TouchableOpacity style={styles.stepperBtn} onPress={() => adjust(1)}><Text style={styles.stepperBtnText}>＋</Text></TouchableOpacity>
      </View>
      <Text style={styles.stepperHint}>days to pay ahead (3–60)</Text>
      <View style={styles.card}>
        <View style={styles.row}><Text style={styles.k}>Total To Pay</Text><Text style={styles.vBold}>KSh {total.toLocaleString()}</Text></View>
        <View style={styles.row}><Text style={styles.k}>New Expiry Date</Text><Text style={styles.v}>{newExpiry.toLocaleDateString()}</Text></View>
      </View>
      <TouchableOpacity style={styles.checkboxRow} onPress={() => setConfirmed(!confirmed)}>
        <Text style={styles.checkboxLabel}>{confirmed ? '☑' : '☐'} I confirm this amount and new expiry date.</Text>
      </TouchableOpacity>
      <PrimaryButton label="Continue to Payment →" onPress={() => navigation.navigate('ConfirmPrepay', { days })} disabled={!confirmed} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, backgroundColor: '#fff' },
  title: { fontSize: 20, fontWeight: '700', color: colors.ink, marginBottom: 18 },
  stepperRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 24, marginBottom: 6 },
  stepperBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.cream, alignItems: 'center', justifyContent: 'center' },
  stepperBtnText: { fontSize: 20, fontWeight: '800', color: colors.ink },
  stepperVal: { fontSize: 30, fontWeight: '800', color: colors.ink, minWidth: 50, textAlign: 'center' },
  stepperHint: { fontSize: 11.5, color: colors.inkSoft, textAlign: 'center', marginBottom: 16 },
  card: { borderWidth: 1.5, borderColor: colors.line, borderRadius: 16, padding: 16, marginBottom: 14 },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  k: { fontSize: 12.5, color: colors.inkSoft },
  v: { fontSize: 12.5, color: colors.ink, fontWeight: '700' },
  vBold: { fontSize: 16, color: colors.ink, fontWeight: '800' },
  checkboxRow: { marginBottom: 16 },
  checkboxLabel: { fontSize: 12.5, color: colors.ink },
});
