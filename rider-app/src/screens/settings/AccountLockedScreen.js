// rider-app/src/screens/settings/AccountLockedScreen.js
import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import PrimaryButton from '../../components/PrimaryButton';
import colors from '../../theme/colors';
import api from '../../api/client';

// BR-SB24-011/012: intentionally NO BackLink here — a locked account has nowhere "back" to go
// except through payment; the only exits are Pay & Unlock, Choose a different plan, or Data Export.
export default function AccountLockedScreen({ riderId, navigation }) {
  const [sub, setSub] = useState(null);

  useEffect(() => {
    api.get('/subscription', { params: { rider_id: riderId } }).then(res => setSub(res.data));
  }, []);

  if (!sub) return null;
  const daysLocked = Math.floor((Date.now() - new Date(sub.locked_at).getTime()) / 86400000);

  return (
    <View style={styles.container}>
      <View style={styles.hero}>
        <Text style={styles.heroEmoji}>👋</Text>
        <Text style={styles.heroTitle}>We've Missed You!</Text>
        <Text style={styles.heroSub}>{sub.lock_reason} — but your data is safe and waiting for you.</Text>
      </View>
      <View style={styles.banner}>
        <Text style={styles.bannerText}>👉 Good news — getting back in takes just one payment, and you're back to work instantly.</Text>
      </View>
      <View style={styles.card}>
        <View style={styles.row}><Text style={styles.k}>Days Since Expiry</Text><Text style={styles.v}>{daysLocked}</Text></View>
        <View style={styles.row}><Text style={styles.k}>Amount To Unlock</Text><Text style={styles.v}>KSh {sub.unlock_amount.toLocaleString()} ({sub.frequency})</Text></View>
      </View>
      <PrimaryButton label="🔓 Pay & Unlock Now →" onPress={() => navigation.navigate('ConfirmSubscription', { frequency: sub.frequency })} />
      <TouchableOpacity style={styles.ghostBtn} onPress={() => navigation.navigate('ChooseFrequency', { frequency: sub.frequency })}>
        <Text style={styles.ghostBtnText}>Choose a different plan</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.ghostBtn} onPress={() => navigation.navigate('DataExportRequest')}>  {/* BR-SB21-001: unconditional, even here */}
        <Text style={styles.ghostBtnText}>📤 Request Data Export (always available)</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, backgroundColor: '#fff' },
  hero: { alignItems: 'center', marginBottom: 18 },
  heroEmoji: { fontSize: 36 },
  heroTitle: { fontSize: 19, fontWeight: '700', color: colors.ink, marginTop: 6 },
  heroSub: { fontSize: 12, color: colors.inkSoft, textAlign: 'center', marginTop: 4 },
  banner: { backgroundColor: colors.signalAmberBg, borderRadius: 12, padding: 12, marginBottom: 14 },
  bannerText: { fontSize: 12.5, color: colors.ink, fontWeight: '600' },
  card: { borderWidth: 1.5, borderColor: colors.line, borderRadius: 16, padding: 16, marginBottom: 16 },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  k: { fontSize: 12.5, color: colors.inkSoft },
  v: { fontSize: 12.5, color: colors.ink, fontWeight: '700' },
  ghostBtn: { borderWidth: 1.5, borderColor: colors.line, borderRadius: 12, paddingVertical: 12, alignItems: 'center', marginBottom: 8 },
  ghostBtnText: { fontSize: 13, fontWeight: '700', color: colors.ink },
});
