// rider-app/src/components/NumericKeypad.js
// FIXED:
// - Removed raw text nodes that could cause "Unexpected text node" errors
// - Proper component structure with all content wrapped in containers
// - Improved styling to match cleaned.html

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';

const KEYS = ['1','2','3','4','5','6','7','8','9','.','0','back'];

// BR-SB05-010 / EXC-SB05-005: at most one decimal point; the extra tap is silently ignored.
export default function NumericKeypad({ value, onChange, currencyLabel = 'KSh', maxLength = 10 }) {
  function handleKey(k) {
    let amt = value;
    if (k === 'back') { 
      amt = amt.slice(0, -1); 
    } else if (k === '.') { 
      if (!amt.includes('.')) amt += '.'; 
    } else { 
      if (amt.length < maxLength) amt += k; 
    }
    onChange(amt);
  }

  return (
    <View style={styles.container}>
      {/* Display Section */}
      <View style={styles.display}>
        <Text style={styles.currency}>{currencyLabel}</Text>
        <Text style={styles.amount}>{value || '0'}</Text>
      </View>

      {/* Keypad Grid */}
      <View style={styles.grid}>
        {KEYS.map((k) => (
          <TouchableOpacity 
            key={k} 
            style={styles.key} 
            onPress={() => handleKey(k)}
            activeOpacity={0.7}
          >
            <Text style={styles.keyText}>
              {k === 'back' ? '⌫' : k}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  display: {
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: '#e7e4db',
    borderRadius: 16,
    paddingVertical: 22,
    paddingHorizontal: 16,
    alignItems: 'center',
    marginBottom: 14,
  },
  currency: {
    fontSize: 13,
    fontWeight: '700',
    color: '#5b606c',
    marginBottom: 4,
  },
  amount: {
    fontSize: 38,
    fontWeight: '700',
    letterSpacing: -0.4,
    color: '#1a1c20',
    lineHeight: 44,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  key: {
    width: '31%',
    paddingVertical: 14,
    marginBottom: 8,
    borderRadius: 13,
    borderWidth: 1.5,
    borderColor: '#e7e4db',
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  keyText: {
    fontSize: 17,
    fontWeight: '700',
    color: '#1a1c20',
    lineHeight: 20,
  },
});