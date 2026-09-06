// rider-app/src/components/BackLink.js
// UPDATED: Aligned with cleaned.html styling

import React from 'react';
import { TouchableOpacity, Text, StyleSheet } from 'react-native';

export default function BackLink({ onPress, label = '← Back' }) {
  return (
    <TouchableOpacity 
      style={styles.container} 
      onPress={onPress}
      accessibilityRole="button"
      accessible
      accessibilityLabel={label}
    >
      <Text style={styles.text}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 12,
    paddingVertical: 6,
    paddingHorizontal: 0,
    width: 'fit-content',
  },
  text: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#5b606c',
  },
});