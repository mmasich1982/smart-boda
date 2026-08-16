// rider-app/src/components/SelectableTileGrid.js — 2-column tile picker
// (matches cleaned.html's .tile-grid/.tile — used for Fuel Type today, reusable for any
// single-select master-data list rendered as tiles rather than a dropdown or button row)
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';

export default function SelectableTileGrid({ options, selectedCode, onSelect }) {
  return (
    <View style={styles.grid}>
      {options.map((opt) => {
        const isSelected = opt.code === selectedCode;
        return (
          <TouchableOpacity
            key={opt.code}
            style={[styles.tile, isSelected && styles.tileSelected]}
            onPress={() => onSelect(opt.code)}
            accessibilityRole="radio"
            accessibilityState={{ selected: isSelected }}
          >
            {opt.emoji && <Text style={styles.emoji}>{opt.emoji}</Text>}
            <Text style={styles.lbl}>{opt.display_name}</Text>
            {opt.sub_label && <Text style={styles.sub}>{opt.sub_label}</Text>}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 9, marginBottom: 6 },
  tile: { flexBasis: '47%', flexGrow: 1, borderWidth: 1.5, borderColor: '#e7e4db', borderRadius: 13, padding: 12, backgroundColor: '#fff' },
  tileSelected: { borderColor: '#ff7a1a', backgroundColor: '#fff6ee' },
  emoji: { fontSize: 20, marginBottom: 5 },
  lbl: { fontWeight: '700', fontSize: 12.5, color: '#1a1c20' },
  sub: { fontSize: 10.5, color: '#5b606c', marginTop: 2 },
});
