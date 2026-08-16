// rider-app/src/components/LiveCalculationHint.js
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import colors from '../theme/colors';

export default function LiveCalculationHint({ visible, label, value }) {
  if (!visible) return null;  // EXC-SB09-003: hidden until both underlying fields are valid
  return (
    <View style={styles.wrap}>
      <Text style={styles.text}>{label}: <Text style={styles.value}>{value}</Text></Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 14 },
  text: { fontSize: 12, color: colors.inkSoft },
  value: { fontWeight: '800', color: colors.ink },
});
