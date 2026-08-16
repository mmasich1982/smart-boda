// rider-app/src/components/BreakdownBar.js
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

// Central, single source of truth for channel colour — imported anywhere a channel is drawn.
export const CHANNEL_COLORS = {
  Cash: '#ff7a1a', SendMoney: '#ffc93c', Till: '#1e9e6f', Paybill: '#5b8def', Pochi: '#c98a12',
};

// segments: [{ code, label, amount }]. BR-SB06-003: caller only renders this when total > 0.
// BR-SB06-010/EXC-SB06-010: a zero-value channel should simply be filtered out by the caller first.
export default function BreakdownBar({ segments, total }) {
  if (!total || total <= 0) return null;
  const withPct = segments
    .filter((s) => s.amount > 0)
    .map((s) => ({ ...s, pct: Math.round((s.amount / total) * 100) }));

  return (
    <>
      <View style={styles.bar}>
        {withPct.map((s) => (
          <View key={s.code} style={{ width: `${s.pct}%`, backgroundColor: CHANNEL_COLORS[s.code] || '#999' }} />
        ))}
      </View>
      <View style={styles.legendRow}>
        {withPct.map((s) => (
          <View key={s.code} style={styles.legendItem}>
            <View style={[styles.swatch, { backgroundColor: CHANNEL_COLORS[s.code] || '#999' }]} />
            <Text style={styles.legendText}>{s.label} {s.pct}%</Text>
          </View>
        ))}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', height: 12, borderRadius: 6, overflow: 'hidden', marginTop: 8, marginBottom: 6, backgroundColor: '#e7e4db' },
  legendRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  swatch: { width: 8, height: 8, borderRadius: 2 },
  legendText: { fontSize: 10.5, color: '#5b606c' },
});
