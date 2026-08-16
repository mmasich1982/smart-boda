// rider-app/src/components/ProgressStatCard.js — the earned/cost/profit bar-chart card
// used on ValuePreviewScreen (illustrative) and later reused, with real data, on Home
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

function Row({ label, value, barColor, widthPct }) {
  return (
    <View style={{ marginTop: 8 }}>
      <View style={styles.kvRow}>
        <Text style={styles.k}>{label}</Text>
        <Text style={styles.v}>KSh {value.toLocaleString()}</Text>
      </View>
      <View style={styles.barTrack}><View style={[styles.barFill, { backgroundColor: barColor, width: `${widthPct}%` }]} /></View>
    </View>
  );
}

export default function ProgressStatCard({ earnedLabel, earnedValue, costLabel, costValue, netLabel, netValue, showHint = false, hintText }) {
  const costPct = Math.round((costValue / earnedValue) * 100);
  const netPct = Math.round((netValue / earnedValue) * 100);
  
  return (
    <LinearGradient
      colors={['#fff7ec', '#fff']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.gradientContainer}
    >
      <View style={styles.card}>
        <View style={styles.cardTitleRow}>
          <Text style={styles.cardTitle}>💰 My Progress this Week</Text>
          <View style={styles.badge}><Text style={styles.badgeText}>Example</Text></View> {/* required "illustrative" label, SB-01.5 */}
        </View>
        <Row label={earnedLabel} value={earnedValue} barColor="#1e9e6f" widthPct={100} />
        <Row label={costLabel} value={costValue} barColor="#c98a12" widthPct={costPct} />
        <Row label={netLabel} value={netValue} barColor="#1e9e6f" widthPct={netPct} />
        {showHint && hintText && (
          <Text style={styles.hint}>{hintText}</Text>
        )}
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  gradientContainer: { borderRadius: 16, marginBottom: 8, overflow: 'hidden' },
  card: { borderWidth: 1.5, borderColor: '#ffc93c', borderRadius: 16, padding: 16, backgroundColor: 'transparent' },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  cardTitle: { fontWeight: '700', fontSize: 13.5 },
  badge: { marginLeft: 'auto', backgroundColor: '#fdf3df', borderRadius: 999, paddingVertical: 3, paddingHorizontal: 9 },
  badgeText: { fontSize: 10.5, fontWeight: '700', color: '#c98a12' },
  kvRow: { flexDirection: 'row', justifyContent: 'space-between', fontSize: 12.5 },
  k: { color: '#5b606c' },
  v: { fontWeight: '700' },
  barTrack: { height: 6, backgroundColor: '#e7e4db', borderRadius: 4, overflow: 'hidden', marginTop: 4 },
  barFill: { height: '100%', borderRadius: 4 },
  hint: { fontSize: 11, color: '#5b606c', marginTop: 10, lineHeight: 17 },
});