// rider-app/src/components/StatusChip.js
import React from 'react';
import { Text, StyleSheet } from 'react-native';

// tone: 'success' (Editable, Synced) | 'neutral' (Locked, Queued) | 'danger' (Voided, Failed-Retrying)
// tone: 'success' (Editable) | 'neutral' (Locked AND Voided — cleaned.html's .chip-tiny default gray covers both) | 'danger' (reserved, e.g. a future Failed-Retrying use)
export default function StatusChip({ label, tone = 'neutral' }) {
  return <Text style={[styles.chip, styles[tone]]}>{label}</Text>;
}

const styles = StyleSheet.create({
  chip: { fontSize: 9, fontWeight: '800', paddingVertical: 2, paddingHorizontal: 7, borderRadius: 999, overflow: 'hidden' },
  success: { backgroundColor: '#e6f5ef', color: '#1e9e6f' },
  neutral: { backgroundColor: '#eeeeee', color: '#777777' },
  danger: { backgroundColor: '#fdecea', color: '#e0453f' },
});
