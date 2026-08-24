// rider-app/src/components/HeroFareCard.js
// ✅ MIGRATED: Updated to work with IndexedDB data structure
// - Accepts runningTotal instead of totalFare
// - Handles subscription object
// - Proper null/undefined safety
// - Dark gradient background with proper styling

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';

/**
 * HeroFareCard Component
 * 
 * Props:
 * - runningTotal (number): Today's total income
 * - subscription (object): Subscription status object
 * - isActive (boolean): Whether subscription is active
 * - riderId (string): Current rider ID
 * - onOpenDailySummary (function): Callback when amount is tapped
 * - onNewTrip (function): Callback when new trip button is pressed
 */
export default function HeroFareCard({
  totalFare = 0,
  runningTotal = 0,
  subscription = null,
  isActive = false,
  riderId = null,
  onOpenDailySummary = null,
  onNewTrip = null,
}) {
  // ✅ Defensive: Use runningTotal if provided, else fallback to totalFare
  const displayAmount = typeof runningTotal === 'number' ? runningTotal : 
                       typeof totalFare === 'number' ? totalFare : 0;
  
  // ✅ Defensive: Safely format the amount
  const formattedAmount = (() => {
    try {
      if (typeof displayAmount === 'number' && displayAmount >= 0) {
        return displayAmount.toLocaleString('en-US', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        });
      }
      return '0.00';
    } catch (err) {
      console.error('❌ Error formatting amount:', err);
      return displayAmount.toString();
    }
  })();

  // ✅ Subscription badge text
  const getSubscriptionBadge = () => {
    if (!subscription) return null;
    
    if (isActive) {
      return {
        text: '✅ Active',
        bgColor: '#e6f5ef',
        textColor: '#2d7659',
      };
    } else {
      return {
        text: '⭘ Inactive',
        bgColor: '#fdf3df',
        textColor: '#cc7a00',
      };
    }
  };

  const badge = getSubscriptionBadge();

  return (
    <View style={styles.heroFare}>
      {/* Top Row: Label + Badge */}
      <View style={styles.headerRow}>
        <Text style={styles.label}>Today's Total Income</Text>
        {badge && (
          <View style={[styles.badge, { backgroundColor: badge.bgColor }]}>
            <Text style={[styles.badgeText, { color: badge.textColor }]}>
              {badge.text}
            </Text>
          </View>
        )}
      </View>

      {/* Sublabel */}
      <Text style={styles.sublabel}>All payment methods (Cash, M-Pesa, Lipa Later)</Text>

      {/* Amount - Clickable */}
      <TouchableOpacity 
        onPress={onOpenDailySummary}
        style={styles.amountTouchable}
        activeOpacity={0.7}
      >
        <Text style={styles.amount}>KSh {formattedAmount}</Text>
      </TouchableOpacity>

      {/* New Trip Button */}
      <TouchableOpacity 
        style={styles.newTripBtn} 
        onPress={onNewTrip}
        activeOpacity={0.8}
      >
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
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 2,
  },
  label: {
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.06,
    color: '#a9adb6',
    fontWeight: '700',
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '600',
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