// rider-app/src/components/GoalProgressBar.js
import React from 'react';
import { View, StyleSheet } from 'react-native';

export default function GoalProgressBar({ earned, target, testID }) {
  const pctRaw = target > 0 ? (earned / target) * 100 : 0;
  const pct = Math.min(100, Math.max(0, pctRaw));  // BR-SB15-*/BR-SB17-005: capped for display only, never for the stored total
  return (
    <View style={styles.track} testID={testID}>
      <View style={[styles.fill, { width: `${pct}%` }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  track: { height: 8, borderRadius: 99, backgroundColor: '#e7e4db', overflow: 'hidden', marginVertical: 8 },
  fill: { height: '100%', backgroundColor: '#ff7a1a', borderRadius: 99 },  // boda-orange
});
