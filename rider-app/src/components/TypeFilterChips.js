// rider-app/src/components/TypeFilterChips.js
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';

export default function TypeFilterChips({ options, active, onChange }) {
  return (
    <View style={styles.row}>
      {options.map((opt) => (
        <TouchableOpacity key={opt.key} onPress={() => onChange(opt.key)}
          style={[styles.chip, active === opt.key && styles.chipActive]}>
          <Text style={[styles.label, active === opt.key && styles.labelActive]}>{opt.label}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
  chip: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 999, backgroundColor: '#eef2f7' },
  chipActive: { backgroundColor: '#ff7a1a' },
  label: { fontSize: 12, fontWeight: '700', color: '#5b606c' },
  labelActive: { color: '#fff' },
});
