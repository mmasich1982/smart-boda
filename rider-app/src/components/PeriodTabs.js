// rider-app/src/components/PeriodTabs.js
// UPDATED: Aligned with cleaned.html styling for financial performance screens
// Provides period selection tabs for filtering net profit data

import React from 'react';
import { View, TouchableOpacity, Text, StyleSheet } from 'react-native';

export default function PeriodTabs({ options, active, onChange }) {
  return (
    <View style={styles.container}>
      {options.map((option) => (
        <TouchableOpacity
          key={option.key}
          style={[styles.tab, active === option.key && styles.tabActive]}
          onPress={() => onChange(option.key)}
          accessibilityRole="button"
          accessibilityState={{ selected: active === option.key }}
        >
          <Text style={[styles.tabText, active === option.key && styles.tabTextActive]}>
            {option.label}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    gap: 6,
    backgroundColor: '#eee',
    borderRadius: 12,
    padding: 4,
    marginBottom: 14,
  },
  tab: {
    flex: 1,
    paddingVertical: 9,
    paddingHorizontal: 6,
    borderRadius: 9,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabActive: {
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  tabText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#5b606c',
    textAlign: 'center',
  },
  tabTextActive: {
    color: '#1a1c20',
  },
});