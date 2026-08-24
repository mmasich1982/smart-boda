// rider-app/src/components/DueAlertBanner.js
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import colors from '../theme/colors';

// Shared everywhere a "how many km until X" escalation is needed (BR-SB12-008)
export function alertTier(remainingKm) {
  if (remainingKm < 0) return 'overdue';
  if (remainingKm <= 100) return 'final';
  if (remainingKm <= 200) return 'firm';
  if (remainingKm <= 500) return 'first';
  return null;
}

// Amber tiers mirror cleaned.html's signal-amber, red tiers mirror signal-red — exactly the colors used in screenMaintenanceHub()
const TIER_STYLE = {
  first: { bg: colors.signalAmberBg, text: colors.signalAmber },
  firm: { bg: colors.signalAmberBg, text: colors.signalAmber },
  final: { bg: colors.signalRedBg, text: colors.signalRed },
  overdue: { bg: colors.signalRedBg, text: colors.signalRed },
};

export default function DueAlertBanner({ serviceType, icon, remainingKm, onLogNow }) {
  const tier = alertTier(remainingKm);
  if (!tier) return null;
  const style = TIER_STYLE[tier];
  const msg = tier === 'overdue'
    ? `⚠️ Overdue by ${Math.abs(remainingKm)} km`
    : tier === 'final' ? `🔴 Due very soon — about ${remainingKm} km left`
    : tier === 'firm' ? `🟡 Coming up — about ${remainingKm} km left`
    : `Heads up — about ${remainingKm} km left`;

  return (
    <View style={[styles.banner, { backgroundColor: style.bg }]}>
      <Text style={[styles.text, { color: style.text }]}>{icon} <Text style={{ fontWeight: '800' }}>{serviceType}</Text> {msg}</Text>
      <TouchableOpacity style={styles.btn} onPress={onLogNow}><Text style={styles.btnText}>Log Now</Text></TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: { flexDirection: 'row', alignItems: 'center', borderRadius: 12, padding: 12, marginBottom: 10 },
  text: { flex: 1, fontSize: 12.5, fontWeight: '600' },
  btn: { backgroundColor: colors.bodaOrange, paddingVertical: 7, paddingHorizontal: 13, borderRadius: 9, marginLeft: 10 },
  btnText: { color: '#fff', fontSize: 11.5, fontWeight: '800' },
});
