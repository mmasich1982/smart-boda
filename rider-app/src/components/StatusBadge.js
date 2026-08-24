// rider-app/src/components/StatusBadge.js
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

const COLORS = {
  green: { bg: '#ecfdf5', text: '#065f46' },
  amber: { bg: '#fff7ec', text: '#8a5c0d' },
  red: { bg: '#fef2f2', text: '#e0453f' },
  grey: { bg: '#f1f5f9', text: '#475569' },
};

export default function StatusBadge({ label, color }) {
  const c = COLORS[color] || COLORS.grey;
  return (
    <View style={[styles.badge, { backgroundColor: c.bg }]}>
      <Text style={[styles.text, { color: c.text }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { paddingVertical: 3, paddingHorizontal: 8, borderRadius: 999, alignSelf: 'flex-start' },
  text: { fontSize: 11, fontWeight: '800' },
});
