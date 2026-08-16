// rider-app/src/components/PrimaryButton.js
import React from 'react';
import { TouchableOpacity, Text, StyleSheet } from 'react-native';

export default function PrimaryButton({ label, onPress, disabled = false, glow = false }) {
  // glow: subtle pulsing shadow (Reanimated), used on the highest-intent CTAs — Value Preview and PIN Login —
  // to match cleaned.html's .btn-glow. Purely cosmetic, no functional difference.
  return (
    <TouchableOpacity
      style={[styles.btn, disabled && styles.btnDisabled]}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
    >
      <Text style={[styles.btnText, disabled && styles.btnTextDisabled]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  // boda_orange primary action color — replaces the old dull blue to match cleaned.html's .btn-primary
  btn: { backgroundColor: '#ff7a1a', paddingVertical: 15, paddingHorizontal: 16, borderRadius: 13, alignItems: 'center', marginHorizontal: 20, marginTop: 12, shadowColor: '#ff7a1a', shadowOpacity: 0.35, shadowRadius: 10, shadowOffset: { width: 0, height: 6 }, elevation: 3 },
  btnDisabled: { backgroundColor: '#e9dccc', shadowOpacity: 0 },
  btnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  btnTextDisabled: { color: '#9b8975' },
});