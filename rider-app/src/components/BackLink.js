// rider-app/src/components/BackLink.js
// UPDATED: Highly visible back navigation with thick arrow

import React from 'react';
import { TouchableOpacity, Text, StyleSheet } from 'react-native';

export default function BackLink({ onPress, label = '‹ Back' }) {
  return (
    <TouchableOpacity 
      style={styles.container} 
      onPress={onPress}
      accessibilityRole="button"
      accessible
      accessibilityLabel={label}
      activeOpacity={0.6}
    >
      <Text style={styles.text}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 16,
    paddingVertical: 12,
    paddingHorizontal: 4,
    width: 'fit-content',
  },
  text: {
    fontSize: 18,
    fontWeight: '900',
    color: '#1a1c20',
    letterSpacing: 0.5,
  },
});