// rider-app/src/components/DatePickerField.js
// UPDATED: Custom Date Picker Field - Text-based date input
// Matches cleaned.html styling, not native date picker

import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert } from 'react-native';

export default function DatePickerField({
  label,
  value,
  onChange,
  placeholder = 'YYYY-MM-DD',
  required = false,
  hint = '',
  error = '',
}) {
  const [isFocused, setIsFocused] = useState(false);

  const isValidDate = (dateString) => {
    // Validate YYYY-MM-DD format
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(dateString)) {
      return false;
    }
    
    const date = new Date(dateString);
    return date instanceof Date && !isNaN(date);
  };

  const handleChange = (text) => {
    onChange(text);
  };

  const handleBlur = () => {
    setIsFocused(false);
    if (value && !isValidDate(value)) {
      Alert.alert('Invalid Date', 'Please enter date in YYYY-MM-DD format');
    }
  };

  return (
    <View style={styles.field}>
      {label && (
        <Text style={styles.label}>
          {label} {required && <Text style={styles.required}>*</Text>}
        </Text>
      )}
      
      <TextInput
        style={[
          styles.input,
          isFocused && styles.inputFocused,
          error && styles.inputError,
        ]}
        placeholder={placeholder}
        placeholderTextColor="#b0a89d"
        value={value}
        onChangeText={handleChange}
        onFocus={() => setIsFocused(true)}
        onBlur={handleBlur}
        editable={true}
        selectTextOnFocus
      />

      {hint && <Text style={styles.hint}>{hint}</Text>}
      {error && <Text style={styles.errorText}>⚠️ {error}</Text>}

      {/* Helpful note */}
      <Text style={styles.formatHint}>Format: YYYY-MM-DD (e.g., 2024-12-31)</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    marginBottom: 16,
    position: 'relative',
  },
  label: {
    fontSize: 11.5,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.04,
    color: '#5b606c',
    marginBottom: 7,
  },
  required: {
    color: '#e5650a',
    fontSize: 11.5,
  },
  input: {
    width: '100%',
    padding: 13,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#e7e4db',
    fontSize: 15,
    fontFamily: 'Inter',
    backgroundColor: '#fff',
    color: '#1a1c20',
    transition: '150ms',
  },
  inputFocused: {
    borderColor: '#ff7a1a',
    shadowColor: '#ff7a1a',
    shadowOpacity: 0.12,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 0 },
  },
  inputError: {
    borderColor: '#e0453f',
    shadowColor: '#e0453f',
    shadowOpacity: 0.1,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 0 },
  },
  hint: {
    fontSize: 11.5,
    color: '#5b606c',
    marginTop: 6,
    lineHeight: 18,
  },
  formatHint: {
    fontSize: 10.5,
    color: '#b0a89d',
    marginTop: 6,
    fontStyle: 'italic',
  },
  errorText: {
    fontSize: 11.5,
    color: '#e0453f',
    marginTop: 6,
    fontWeight: '600',
  },
});