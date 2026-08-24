// rider-app/src/components/DropdownField.js
// FIXED:
// - Removed numberOfLines prop from Picker (not a valid Picker prop)
// - Cleaned up styling

import React from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { Picker } from '@react-native-picker/picker';

export default function DropdownField({ 
  label, 
  value, 
  onValueChange, 
  options, 
  placeholder = 'Select...', 
  error, 
  required = false 
}) {
  return (
    <View style={styles.wrap}>
      {label && (
        <Text style={styles.label}>
          {label}
          {required && <Text style={styles.required}>*</Text>}
        </Text>
      )}
      <View style={[styles.box, error && styles.boxError]}>
        <Picker 
          selectedValue={value} 
          onValueChange={onValueChange} 
          style={styles.picker}
          dropdownIconColor="#5b606c"
          mode="dropdown"
          itemStyle={styles.pickerItem}
        >
          <Picker.Item 
            label={placeholder} 
            value="" 
            color="#9aa0ab"
            fontFamily="System"
          />
          {options.map((opt) => (
            <Picker.Item 
              key={opt.value} 
              label={opt.label} 
              value={opt.value}
              color="#1a1c20"
              fontFamily="System"
            />
          ))}
        </Picker>
      </View>
      {error && <Text style={styles.error}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 14 },
  label: { 
    fontSize: 10.5, 
    fontWeight: '800', 
    textTransform: 'uppercase', 
    letterSpacing: 0.4, 
    color: '#5b606c', 
    marginBottom: 6 
  },
  required: { 
    color: '#e5650a', 
    fontWeight: '900', 
    fontSize: 12 
  },
  box: { 
    borderWidth: 1.5, 
    borderColor: '#e7e4db', 
    borderRadius: 11, 
    backgroundColor: '#fff', 
    overflow: 'hidden', 
    justifyContent: 'center', 
    height: Platform.OS === 'ios' ? 44 : 50,
    paddingHorizontal: 0,
  },
  boxError: { 
    borderColor: '#e0453f' 
  },
  picker: { 
    color: '#1a1c20', 
    fontSize: 14,
    backgroundColor: 'transparent',
  },
  pickerItem: { 
    backgroundColor: '#fff', 
    color: '#1a1c20', 
    fontSize: 14,
    fontFamily: 'System',
  },
  error: { 
    fontSize: 10.5, 
    color: '#e0453f', 
    marginTop: 5, 
    fontWeight: '700' 
  },
});