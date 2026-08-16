// rider-app/src/components/InlineWarning.js
import React from 'react';
import { Text, StyleSheet } from 'react-native';

// e.g. "Number plate is required." shown directly below the offending field
export default function InlineWarning({ message }) {
  return <Text style={styles.text} accessibilityRole="alert">⚠️ {message}</Text>;
}

const styles = StyleSheet.create({
  text: { color: '#e0453f', fontSize: 11, fontWeight: '700', marginTop: 5 },
});
