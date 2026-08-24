// rider-app/src/components/DigitBoxInput.js
import React, { useRef } from 'react';
import { View, TextInput, StyleSheet } from 'react-native';

// length=4 for every PIN screen (SB-04-A/B/C)
// masked=true hides the digit visually (BR-SB04-003) but still returns the real value via onChange
export default function DigitBoxInput({ length, value, onChange, masked = false, disabled = false }) {
  const inputRefs = useRef([]);

  const handleChange = (text, index) => {
    if (!/^\d?$/.test(text)) return; // digits only
    const chars = value.split('');
    chars[index] = text;
    const next = chars.join('').slice(0, length);
    onChange(next);
    if (text && index < length - 1) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyPress = (e, index) => {
    if (e.nativeEvent.key === 'Backspace' && !value[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  return (
    <View style={styles.row}>
      {Array.from({ length }).map((_, i) => (
        <TextInput
          key={i}
          ref={(el) => (inputRefs.current[i] = el)}
          style={[styles.box, value[i] && styles.boxFilled]}
          keyboardType="number-pad"
          maxLength={1}
          secureTextEntry={masked}
          editable={!disabled}
          value={value[i] || ''}
          onChangeText={(t) => handleChange(t, i)}
          onKeyPress={(e) => handleKeyPress(e, i)}
          accessibilityLabel={`Digit ${i + 1} of ${length}`}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'center', gap: 10, marginVertical: 14 },
  box: { width: 48, height: 56, borderWidth: 1.5, borderColor: '#e7e4db', borderRadius: 13, textAlign: 'center', fontSize: 22, fontWeight: '800', color: '#1a1c20', backgroundColor: '#fff' },
  boxFilled: { borderColor: '#e5650a', backgroundColor: '#fff7ec' },
});
