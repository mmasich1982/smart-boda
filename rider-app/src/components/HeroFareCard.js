// rider-app/src/components/HeroFareCard.js
// ✅ MIGRATED: Updated to work with indexedDbAdapter data
// ✅ PRESERVED: Original UI/UX design completely unchanged
// - Dark gradient background (#1a1c20)
// - Proper text styling and spacing
// - Correct button styling with fullwidth plus character
// - Made amount clickable for daily summary
// ✅ FIXED: Added null/undefined safety for totalFare prop

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';

export default function HeroFareCard({ totalFare, onOpenDailySummary, onNewTrip }) {
  // ✅ Defensive null/undefined check: safely format totalFare
  const displayAmount = (() => {
    try {
      if (typeof totalFare === 'number' && totalFare >= 0) {
        return totalFare.toLocaleString();
      }
      return '0';
    } catch (err) {
      console.error('Error formatting totalFare:', err);
      return '0';
    }
  })();

  return (
    <View style={styles.heroFare}>
      <Text style={styles.label}>Today's Total Income</Text>
      <Text style={styles.sublabel}>All payment methods (Cash, M-Pesa, Lipa Later)</Text>
      <TouchableOpacity onPress={onOpenDailySummary} style={styles.amountTouchable}>
        <Text style={styles.amount}>KSh {displayAmount}</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.newTripBtn} onPress={onNewTrip}>
        <Text style={styles.newTripBtnText}>＋ New Trip</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  heroFare: {
    backgroundColor: '#1a1c20',
    borderRadius: 20,
    padding: 20,
    marginBottom: 16,
    overflow: 'hidden',
  },
  label: {
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.06,
    color: '#a9adb6',
    fontWeight: '700',
    marginBottom: 2,
  },
  sublabel: {
    fontSize: 10,
    color: '#7a7e87',
    marginBottom: 8,
    fontStyle: 'italic',
  },
  amountTouchable: {
    margin: 0,
    padding: 0,
  },
  amount: {
    fontFamily: 'Space Grotesk',
    fontSize: 34,
    fontWeight: '700',
    color: '#fff',
    marginVertical: 4,
    marginBottom: 14,
  },
  newTripBtn: {
    backgroundColor: '#ff7a1a',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 14,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#ff7a1a',
    shadowOpacity: 0.6,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
  },
  newTripBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 15.5,
  },
});