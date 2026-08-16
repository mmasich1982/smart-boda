// rider-app/src/components/LanguageTileGrid.js
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';

// BR-SB01-011: `languages` is always fetched from Super Admin master data, never hard-coded here
export default function LanguageTileGrid({ languages, selectedCode, onSelect }) {
  return (
    <View style={styles.grid}>
      {languages.map((lang) => (
        <TouchableOpacity
          key={lang.code}
          onPress={() => onSelect(lang.code)}
          style={[styles.tile, selectedCode === lang.code && styles.tileSelected]}
          accessibilityRole="button"
          accessibilityState={{ selected: selectedCode === lang.code }}
        >
          <Text style={[styles.tileText, selectedCode === lang.code && styles.tileTextSelected]}>
            {lang.display_name}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 9, marginHorizontal: 20, marginTop: 24, marginBottom: 20 },
  tile: { flexBasis: '47%', flexGrow: 1, paddingVertical: 12, paddingHorizontal: 10, borderRadius: 13, borderWidth: 1.5, borderColor: '#e7e4db', backgroundColor: '#fff', alignItems: 'center' },
  tileSelected: { backgroundColor: '#fff6ee', borderColor: '#ff7a1a' },
  tileText: { fontSize: 13.5, fontWeight: '700', color: '#1a1c20' },
  tileTextSelected: { color: '#e5650a' },
});