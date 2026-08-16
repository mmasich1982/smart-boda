// rider-app/src/components/TileGrid.js — replaces LanguageTileGrid.js (same file, new name + emoji support)
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';

// Used by: Language Selection (Module A), Payment Channel tiles (SB-05-B, SB-07-B), Correction Reason (SB-07).
// `options` is always fetched from Super Admin master data — BR-SB01-011, BR-SB05-003, BR-SB07-012.
export default function TileGrid({ options, selectedCode, onSelect }) {
  return (
    <View style={styles.grid}>
      {options.map((opt) => (
        <TouchableOpacity
          key={opt.code}
          onPress={() => onSelect(opt.code)}
          style={[styles.tile, selectedCode === opt.code && styles.tileSelected]}
          accessibilityRole="button"
          accessibilityState={{ selected: selectedCode === opt.code }}
        >
          <Text style={styles.tileText}>
            {opt.emoji ? `${opt.emoji} ` : ''}{opt.display_name}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 9, marginBottom: 14 },
  tile: { flexBasis: '47%', flexGrow: 1, borderWidth: 1.5, borderColor: '#e7e4db', borderRadius: 13, paddingVertical: 11, paddingHorizontal: 10, backgroundColor: '#fff' },
  tileSelected: { borderColor: '#ff7a1a', backgroundColor: '#fff6ee' },
  tileText: { fontSize: 12.5, fontWeight: '700', color: '#1a1c20' },
});
