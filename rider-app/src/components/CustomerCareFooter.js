// rider-app/src/components/CustomerCareFooter.js — shared help footer under every onboarding CTA
import React from 'react';
import { Text, StyleSheet } from 'react-native';

export default function CustomerCareFooter() {
  return (
    <Text style={styles.text}>
      Need help? Call or WhatsApp us anytime:{'\n'}
      📞 +254 757 334481   ·   📞 +254 101 605262
    </Text>
  );
}

const styles = StyleSheet.create({
  text: { fontSize: 11.5, color: '#5b606c', textAlign: 'center', marginTop: 18, lineHeight: 18, paddingHorizontal: 20 },
});
