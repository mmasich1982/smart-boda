// rider-app/src/components/FormField.js
import React from 'react';
import { View, Text, TextInput, StyleSheet } from 'react-native';
import InlineWarning from './InlineWarning';

// Every required field in Module A (Mobile Number, Full Name...) uses this
// so the "required" warning behaviour (e.g. EXC-SB02-001) is identical everywhere.
// Issue 8 fix: Added required prop to display red asterisk for mandatory fields
export default function FormField({ label, value, onChangeText, error, keyboardType = 'default', autoUppercase = false, maxLength, placeholder, required = false, onBlur, editable = true, helperText }) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>
        {label}
        {required && <Text style={styles.required}>*</Text>}
      </Text>
      <TextInput
        style={[styles.input, error && styles.inputError, !editable && styles.inputReadOnly]}
        editable={editable}
        value={value}
        onChangeText={(t) => onChangeText(autoUppercase ? t.toUpperCase() : t)}
        keyboardType={keyboardType}
        maxLength={maxLength}
        placeholder={placeholder}
        placeholderTextColor="#94a3b8"
        onBlur={onBlur}
      />
      {helperText && !error ? <Text style={styles.helper}>{helperText}</Text> : null}
      {error ? <InlineWarning message={error} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 14 },
  label: { fontSize: 10.5, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.4, color: '#5b606c', marginBottom: 6 },
  required: { color: '#e5650a', fontWeight: '900', fontSize: 12 },
  input: { borderWidth: 1.5, borderColor: '#e7e4db', borderRadius: 11, paddingHorizontal: 12, paddingVertical: 11, fontSize: 14.5, color: '#1a1c20', backgroundColor: '#fff' },
  inputReadOnly: { backgroundColor: '#f2f6fb', color: '#1a1c20', fontWeight: '700' },
  helper: { fontSize: 10.5, color: '#5b606c', marginTop: 4 },
  inputError: { borderColor: '#e0453f' },
});