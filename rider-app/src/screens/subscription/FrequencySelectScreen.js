// rider-app/src/screens/subscription/FrequencySelectScreen.js
// ✅ REFACTORED: IndexedDB-FIRST + subscriptionUtils alignment
// ✅ BUSINESS LOGIC: Frequency selection (Bi-Weekly 500, Monthly 1000)
// ✅ UI/UX: Matches index.html design system (tiles, cards, buttons)
// ✅ OFFLINE-FIRST: All data persisted via IndexedDB adapter
// ✅ UPDATED: Uses HeroBand component for consistent header design

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  ScrollView,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useTranslation } from '../../i18n/LocalizationProvider';
import { useRider } from '../../rider/RiderContext';
import HeroBand from '../../components/HeroBand';
import indexedDbAdapter from '../../offline/adapters/indexedDbAdapter';
import { getLocalRiderId } from '../../offline/db';
import api from '../../api/client';
import { getActiveSubscription, SUBSCRIPTION_PLANS } from '../../offline/subscriptionUtils';

const FrequencySelectScreen = () => {
  const navigation = useNavigation();
  const { t } = useTranslation();
  const { state } = useRider();

  // ========================================================================
  // STATE
  // ========================================================================
  const [localRiderId, setLocalRiderId] = useState(null);
  const [selectedFrequency, setSelectedFrequency] = useState('biweekly');
  const [currentSubscription, setCurrentSubscription] = useState(null);
  const [loading, setLoading] = useState(true);

  // ========================================================================
  // CONTROL MECHANISMS
  // ========================================================================
  const hasLoadedRef = useRef(false);
  const isMountedRef = useRef(true);

  // ========================================================================
  // LOAD RIDER ID (Local-First)
  // ========================================================================
  useEffect(() => {
    const loadRiderId = async () => {
      try {
        const id = await getLocalRiderId();
        if (id) {
          setLocalRiderId(id);
          console.log('✅ FrequencySelect: Loaded local rider ID:', id);
        } else if (state?.riderId) {
          setLocalRiderId(state.riderId);
          console.log('✅ FrequencySelect: Using context rider ID:', state.riderId);
        }
      } catch (err) {
        console.error('❌ Error loading rider ID:', err);
      }
    };

    loadRiderId();
  }, [state?.riderId]);

  // ========================================================================
  // INITIALIZE COMPONENT MOUNT/UNMOUNT
  // ========================================================================
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // ========================================================================
  // RESET LOADED FLAG ON RIDER ID CHANGE
  // ========================================================================
  useEffect(() => {
    hasLoadedRef.current = false;
  }, [localRiderId]);

  // ========================================================================
  // LOAD CURRENT SUBSCRIPTION
  // ========================================================================
  const loadCurrentSubscription = useCallback(async () => {
    if (!localRiderId || !isMountedRef.current) {
      return;
    }

    try {
      setLoading(true);

      // ✅ Use subscriptionUtils to get current subscription
      const sub = await getActiveSubscription(localRiderId);

      if (isMountedRef.current) {
        setCurrentSubscription(sub);

        // ✅ Pre-select current frequency if already subscribed
        if (sub?.plan) {
          setSelectedFrequency(sub.plan);
        }
      }
    } catch (err) {
      console.error('❌ Error loading subscription:', err);
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  }, [localRiderId]);

  // ========================================================================
  // FOCUS EFFECT: Load on screen focus
  // ========================================================================
  useFocusEffect(
    useCallback(() => {
      if (!hasLoadedRef.current && localRiderId) {
        console.log('📌 FrequencySelect focused, loading data...');
        hasLoadedRef.current = true;
        loadCurrentSubscription();
      }

      return () => {
        // Keep loaded state on unfocus
      };
    }, [loadCurrentSubscription, localRiderId])
  );

  // ========================================================================
  // HANDLE CONTINUE
  // ========================================================================
  const handleContinue = () => {
    if (!selectedFrequency) {
      console.warn('⚠️ No frequency selected');
      return;
    }

    // Pass selected frequency to confirmation screen
    navigation.navigate('ConfirmSubscriptionScreen', {
      selectedFrequency
    });
  };

  // ========================================================================
  // RENDER FREQUENCY TILE
  // ========================================================================
  const renderFrequencyTile = (frequency) => {
    const isSelected = selectedFrequency === frequency.key;

    return (
      <TouchableOpacity
        key={frequency.key}
        style={[
          styles.tile,
          isSelected && styles.tileSelected
        ]}
        onPress={() => setSelectedFrequency(frequency.key)}
        activeOpacity={0.7}
      >
        <Text style={styles.tileEmoji}>{frequency.emoji}</Text>
        <Text style={styles.tileLabel}>{frequency.label}</Text>
        <Text style={styles.tilePriceAmount}>
          KSh {frequency.amount.toLocaleString()}
        </Text>
        <Text style={styles.tilePricePeriod}>
          every {frequency.days} day{frequency.days > 1 ? 's' : ''}
        </Text>
        <Text style={styles.tilePricePerDay}>
          ~ KSh {Math.round(frequency.amount / frequency.days)}/day
        </Text>
      </TouchableOpacity>
    );
  };

  // ========================================================================
  // LOADING STATE
  // ========================================================================
  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#ff7a1a" />
      </View>
    );
  }

  // ========================================================================
  // MAIN UI
  // ========================================================================
  const frequencies = [
    {
      key: 'biweekly',
      label: '📆 Bi-Weekly',
      emoji: '📆',
      days: SUBSCRIPTION_PLANS.biweekly.days,
      amount: SUBSCRIPTION_PLANS.biweekly.amount
    },
    {
      key: 'monthly',
      label: '📆 Monthly',
      emoji: '📆',
      days: SUBSCRIPTION_PLANS.monthly.days,
      amount: SUBSCRIPTION_PLANS.monthly.amount
    }
  ];

  return (
    <ScrollView style={styles.container}>
      {/* HERO BAND */}
      <HeroBand
        title="How Would You Like to Pay?"
        subtitle={currentSubscription ? 'Change your plan anytime.' : 'Pick what works best for you. Pay now to get started.'}
        onBack={() => navigation.goBack()}
      />

      {/* FREQUENCY TILES */}
      <View style={styles.tileGrid}>
        {frequencies.map(frequency => renderFrequencyTile(frequency))}
      </View>

      {/* INFO TEXT */}
      <View style={styles.hintCard}>
        <Text style={styles.hintTitle}>Daily Rate Breakdown</Text>
        <Text style={styles.hintText}>
          Bi-Weekly: KSh {Math.round(SUBSCRIPTION_PLANS.biweekly.amount / SUBSCRIPTION_PLANS.biweekly.days)}/day{'\n'}
          Monthly: KSh {Math.round(SUBSCRIPTION_PLANS.monthly.amount / SUBSCRIPTION_PLANS.monthly.days)}/day
        </Text>
      </View>

      {/* CURRENT PLAN DISPLAY */}
      {currentSubscription && (
        <View style={styles.currentPlanCard}>
          <Text style={styles.currentPlanLabel}>Your Current Plan</Text>
          <Text style={styles.currentPlanValue}>
            {currentSubscription.plan === 'biweekly' ? 'Bi-Weekly' : 'Monthly'} - KSh {currentSubscription.amount}
          </Text>
          <Text style={styles.currentPlanNote}>
            Expires: {new Date(currentSubscription.expiryDate).toLocaleDateString('en-KE')}
          </Text>
        </View>
      )}

      {/* ACTION BUTTON */}
      <TouchableOpacity
        style={[styles.buttonPrimary, !selectedFrequency && styles.buttonDisabled]}
        onPress={handleContinue}
        disabled={!selectedFrequency}
        activeOpacity={0.8}
      >
        <Text style={styles.buttonPrimaryText}>Continue →</Text>
      </TouchableOpacity>

      {/* SPACER */}
      <View style={{ height: 20 }} />
    </ScrollView>
  );
};

// ============================================================================
// STYLES
// ============================================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f6f4ef',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f6f4ef',
  },

  // Title & Subtitle (handled by HeroBand now)

  // Tile Grid
  tileGrid: {
    flexDirection: 'row',
    gap: 10,
    marginHorizontal: 14,
    marginBottom: 14,
  },

  // Tile
  tile: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#e7e4db',
    padding: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileSelected: {
    borderColor: '#ff7a1a',
    backgroundColor: '#fff6ee',
    shadowColor: '#ff7a1a',
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  tileEmoji: {
    fontSize: 22,
    marginBottom: 8,
  },
  tileLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1a1c20',
    marginBottom: 6,
    textAlign: 'center',
  },
  tilePriceAmount: {
    fontSize: 16,
    fontWeight: '800',
    color: '#ff7a1a',
    marginBottom: 2,
  },
  tilePricePeriod: {
    fontSize: 11,
    color: '#5b606c',
    marginBottom: 4,
  },
  tilePricePerDay: {
    fontSize: 10.5,
    color: '#8b8c8e',
    fontStyle: 'italic',
  },

  // Hint Card
  hintCard: {
    backgroundColor: '#eef3fb',
    borderRadius: 14,
    borderLeftWidth: 4,
    borderLeftColor: '#1976d2',
    padding: 14,
    marginHorizontal: 14,
    marginBottom: 14,
  },
  hintTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1976d2',
    marginBottom: 6,
  },
  hintText: {
    fontSize: 12,
    color: '#2c5182',
    lineHeight: 18,
  },

  // Current Plan Card
  currentPlanCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#e7e4db',
    padding: 14,
    marginHorizontal: 14,
    marginBottom: 20,
  },
  currentPlanLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#5b606c',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  currentPlanValue: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1a1c20',
    marginBottom: 4,
  },
  currentPlanNote: {
    fontSize: 11,
    color: '#8b8c8e',
  },

  // Primary Button
  buttonPrimary: {
    backgroundColor: '#ff7a1a',
    borderRadius: 14,
    paddingVertical: 15,
    paddingHorizontal: 16,
    marginHorizontal: 14,
    alignItems: 'center',
    shadowColor: '#ff7a1a',
    shadowOpacity: 0.3,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
    marginBottom: 20,
  },
  buttonDisabled: {
    backgroundColor: '#e9dccc',
    opacity: 0.6,
    shadowOpacity: 0,
  },
  buttonPrimaryText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: 0.3,
  },
});

export default FrequencySelectScreen;