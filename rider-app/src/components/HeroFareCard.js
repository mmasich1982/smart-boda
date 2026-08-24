// rider-app/src/components/HeroFareCard.js
// ✅ MIGRATED: Updated to work with IndexedDB data
// ✅ PRESERVED: Original UI/UX design

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';

export default function HeroFareCard({ 
  totalFare = 0,
  runningTotal = 0,
  tripsToday = 0,
  onOpenDailySummary,
  onNewTrip 
}) {
  // ✅ Use runningTotal if provided, fallback to totalFare
  const displayAmount = typeof runningTotal === 'number' ? runningTotal : 
                       typeof totalFare === 'number' ? totalFare : 0;

  // ✅ Safely format amount
  const formattedAmount = (() => {
    try {
      if (typeof displayAmount === 'number' && displayAmount >= 0) {
        return displayAmount.toLocaleString('en-US');
      }
      return '0';
    } catch (err) {
      console.error('Error formatting amount:', err);
      return String(displayAmount);
    }
  })();

  return (
    <View style={styles.heroFare}>
      <Text style={styles.heroTitle}>Today's Total Income</Text>
      <TouchableOpacity onPress={onOpenDailySummary}>
        <Text style={styles.heroNumber}>KSh {formattedAmount}</Text>
      </TouchableOpacity>
      <Text style={styles.heroSubtext}>
        {tripsToday} trip{tripsToday !== 1 ? 's' : ''} • All payment methods
      </Text>
      <TouchableOpacity style={styles.heroButton} onPress={onNewTrip}>
        <Text style={styles.heroButtonText}>+ New Trip</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  heroFare: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#e7e4db',
  },
  heroTitle: {
    fontSize: 12,
    color: '#5b606c',
    fontWeight: '600',
    marginBottom: 6,
  },
  heroNumber: {
    fontSize: 36,
    fontWeight: '700',
    color: '#1a1c20',
    marginBottom: 8,
  },
  heroSubtext: {
    fontSize: 12,
    color: '#5b606c',
    marginBottom: 14,
  },
  heroButton: {
    backgroundColor: '#ff7a1a',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    alignItems: 'center',
  },
  heroButtonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 12,
  },
});