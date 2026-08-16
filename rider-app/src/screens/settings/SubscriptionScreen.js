// rider-app/src/screens/settings/SubscriptionScreen.js
import React, { useState, useEffect } from 'react';
import { ScrollView, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import BackLink from '../../components/BackLink';
import PrimaryButton from '../../components/PrimaryButton';
import colors from '../../theme/colors';
import api from '../../api/client';

export default function SubscriptionScreen({ riderId, navigation }) {
  const [sub, setSub] = useState(null);

  useEffect(() => {
    api.get('/subscription', { params: { rider_id: riderId } }).then((res) => {
      if (res.data.locked) { navigation.replace('AccountLocked'); return; }  // BR-SB24-011: locked view takes over entirely
      setSub(res.data);
    });
  }, []);

  if (!sub) return null;
  const urgent = sub.days_left <= 2;
  const noun = sub.has_ever_paid ? 'plan' : 'free trial';

  return (
    <ScrollView style={styles.container}>
      <View style={styles.hero}>
        <BackLink label="← Home" onPress={() => navigation.navigate('Home')} />
        <Text style={styles.heroEyebrow}>{sub.has_ever_paid ? "✅ You're all set" : '🎁 Your free trial'}</Text>
        <Text style={styles.heroTitle}>{sub.has_ever_paid ? 'Active' : 'Free Trial'}</Text>
        <View style={styles.heroDaysRow}>
          <Text style={styles.heroDays}>{Math.max(sub.days_left, 0)}</Text>
          <Text style={styles.heroDaysLabel}>day{sub.days_left===1?'':'s'} left {sub.has_ever_paid ? 'on your plan' : 'of your free trial'}</Text>
        </View>
      </View>

      {urgent && (
        <View style={[styles.banner, sub.days_left <= 1 ? styles.bannerError : styles.bannerWarn]}>
          <Text style={styles.bannerText}>{sub.days_left <= 1 ? '⚠️ Today is your last day!' : `⏰ Only ${sub.days_left} days left.`} Keep your bike's tools running — subscribe now.</Text>
        </View>
      )}

      <View style={styles.card}>
        <View style={styles.row}><Text style={styles.k}>Plan</Text><Text style={styles.v}>{sub.plan_name}</Text></View>
        <View style={styles.row}><Text style={styles.k}>Daily Rate</Text><Text style={styles.v}>💵 KSh {sub.daily_price}/day</Text></View>
        {sub.has_ever_paid && <View style={styles.row}><Text style={styles.k}>You Pay</Text><Text style={styles.v}>{sub.frequency}</Text></View>}
        <View style={styles.row}><Text style={styles.k}>{sub.has_ever_paid ? 'Next Payment Due' : 'Trial Ends'}</Text><Text style={styles.v}>{new Date(sub.expiry_at).toLocaleDateString()}</Text></View>
      </View>

      {!sub.has_ever_paid && (
        <View style={styles.whyCard}>
          <Text style={styles.whyTitle}>Why subscribe?</Text>
          <Text style={styles.whyLine}>✅ Keep tracking every trip, fuel cost, and service reminder</Text>
          <Text style={styles.whyLine}>✅ Stay connected to your SACCO</Text>
          <Text style={styles.whyLine}>✅ From as little as KSh {sub.daily_price} a day — less than a cup of tea</Text>
        </View>
      )}

      <PrimaryButton label={sub.has_ever_paid ? '🔁 Renew Now →' : '🚀 Subscribe Now →'}
        onPress={() => navigation.navigate(sub.has_ever_paid ? 'ConfirmSubscription' : 'ChooseFrequency', { frequency: sub.frequency })} />
      {sub.has_ever_paid && (
        <Text style={styles.linkBtn} onPress={() => navigation.navigate('ChooseFrequency', { frequency: sub.frequency })}>Change how often I pay</Text>
      )}
      <TouchableOpacity style={styles.ghostBtn} onPress={() => navigation.navigate('Prepay')}>
        <Text style={styles.ghostBtnText}>📅 Pay Ahead & Skip the Hassle →</Text>
      </TouchableOpacity>
      <Text style={styles.linkBtn} onPress={() => navigation.navigate('PaymentHistory')}>View Payment History →</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, backgroundColor: '#fff' },
  hero: { backgroundColor: colors.ink, borderRadius: 18, padding: 18, marginHorizontal: -24, marginTop: -24, marginBottom: 18 },
  heroEyebrow: { fontSize: 11.5, fontWeight: '700', color: 'rgba(255,255,255,.8)', marginBottom: 2 },
  heroTitle: { fontSize: 24, fontWeight: '800', color: '#fff' },
  heroDaysRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8, marginTop: 8 },
  heroDays: { fontSize: 32, fontWeight: '800', color: '#fff' },
  heroDaysLabel: { fontSize: 12.5, color: 'rgba(255,255,255,.85)' },
  banner: { borderRadius: 12, padding: 12, marginBottom: 14 },
  bannerWarn: { backgroundColor: colors.signalAmberBg },
  bannerError: { backgroundColor: colors.signalRedBg },
  bannerText: { fontSize: 12.5, color: colors.ink, fontWeight: '600' },
  card: { borderWidth: 1.5, borderColor: colors.line, borderRadius: 16, padding: 16, marginBottom: 14 },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  k: { fontSize: 12.5, color: colors.inkSoft },
  v: { fontSize: 12.5, color: colors.ink, fontWeight: '700' },
  whyCard: { backgroundColor: colors.cream, borderRadius: 14, padding: 14, marginBottom: 14 },
  whyTitle: { fontWeight: '700', fontSize: 13, color: colors.ink, marginBottom: 6 },
  whyLine: { fontSize: 12, color: colors.ink, lineHeight: 22 },
  linkBtn: { fontSize: 12.5, fontWeight: '700', color: colors.bodaOrange, textAlign: 'center', marginTop: 4, marginBottom: 8 },
  ghostBtn: { borderWidth: 1.5, borderColor: colors.line, borderRadius: 12, paddingVertical: 12, alignItems: 'center', marginBottom: 8 },
  ghostBtnText: { fontSize: 13, fontWeight: '700', color: colors.ink },
});
