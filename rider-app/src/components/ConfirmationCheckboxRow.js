// rider-app/src/components/ConfirmationCheckboxRow.js
// Extracted from Module A's inline consent Switch (ProfileConfirmationScreen.js) so the exact
// same "explicit second step" checkbox pattern is reused for SB-07-C's Void confirmation.
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Checkbox from 'expo-checkbox'; // matches cleaned.html's <input type="checkbox"> — a tick box, not a toggle Switch

export default function ConfirmationCheckboxRow({ label, checked, onChange, danger = false }) {
  return (
    <View style={styles.row}>
      <Checkbox value={checked} onValueChange={onChange} color={checked ? (danger ? '#e0453f' : '#ff7a1a') : undefined} />
      <Text style={[styles.label, danger && styles.labelDanger]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: 8 },
  label: { fontSize: 12.5, color: '#1a1c20', flex: 1 },
  labelDanger: { color: '#e0453f' },
});
