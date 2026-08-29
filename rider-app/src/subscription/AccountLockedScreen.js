// rider-app/src/screens/subscription/AccountLockedScreen.js
// ✅ REFACTORED: IndexedDB-FIRST + subscriptionUtils alignment
// ✅ BUSINESS LOGIC: Display when subscription expired without payment
// ✅ UI/UX: Graceful, friendly, matches index.html design system
// ✅ OFFLINE-FIRST: All data persisted via IndexedDB adapter
// ✅ REPLACES HOME SCREEN: Shows this instead of home when locked

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
import indexedDbAdapter from '../../offline/adapters/indexedDbAdapter';
import { getLocalRiderId } from '../../offline/db';
import {
  getSubscriptionState,
  getActiveSubscription,
  SUBSCRIPTION_PLANS
} from '../../offline/subscriptionUtils';

const AccountLockedScreen = () => {
  const navigation = useNavigation();
  const { t } = useTranslation();
  const { state } = useRider();

  // ========================================================================
  // STATE
  // ========================================================================
  const [localRiderId, setLocalRiderId] = useState(null);
  const [subState, setSubState] = useState(null);
  const [subscription, setSubscription] = useState(null);
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
          console.log('✅ AccountLocked: Loaded local rider ID:', id);
        } else if (state?.riderId) {
          setLocalRiderId(state.riderId);
          console.log('✅ AccountLocked: Using context rider ID:', state.riderId);
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
  // LOAD LOCK STATE & SUBSCRIPTION DATA
  // ========================================================================
  const loadLockData = useCallback(async () => {
    if (!localRiderId || !isMountedRef.current) {
      return;
    }

    try {
      setLoading(true);

      // ✅ Load subscription state (lock info)
      const state = await getSubscriptionState(localRiderId);
      const sub = await getActiveSubscription(localRiderId);

      if (isMountedRef.current) {
        setSubState(state);
        setSubscription(sub);
      }
    } catch (err) {
      console.error('❌ Error loading lock data:', err);
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
        console.log('📌 AccountLocked focused, loading data...');
        hasLoadedRef.current = true;
        loadLockData();
      }

      return () => {
        // Keep loaded state on unfocus
      };
    }, [loadLockData, localRiderId])
  );

  // ========================================================================
  // CALCULATE DAYS SINCE EXPIRY
  // ========================================================================
  const daysSinceLock = () => {
    if (!subState?.lockedAt) return 0;
    const lockedMs = new Date(subState.lockedAt).getTime();
    return Math.floor((Date.now() - lockedMs) / (1000 * 60 * 60 * 24));
  };

  // ========================================================================
  // GET UNLOCK AMOUNT (DEFAULT TO BIWEEKLY IF NO SUBSCRIPTION)
  // ========================================================================
  const getUnlockAmount = () => {
    if (subscription?.amount) {
      return subscription.amount;
    }
    // Default to biweekly plan
    return SUBSCRIPTION_PLANS.biweekly.amount;
  };

  // ========================================================================
  // HANDLE ACTIONS
  // ========================================================================
  const handlePayAndUnlock = () => {
    navigation.navigate('FrequencySelectScreen');
  };

  const handleChooseDifferentPlan = () => {
    navigation.navigate('FrequencySelectScreen');
  };

  const handleRequestDataExport = () => {
    // TODO: Implement data export flow
    console.log('📤 Data export requested');
  };

  // ========================================================================
  // LOADING STATE
  // ========================================================================
  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#ff7a1a" />
        <Text style={styles.loadingText}>{t('common.loading') || 'Loading...'}</Text>
      </View>
    );
  }

  // ========================================================================
  // MAIN UI - LOCKED ACCOUNT
  // ========================================================================
  return (
    <ScrollView style={styles.container}>
      {/* HERO SECTION */}
      <View style={styles.heroLocked}>
        <Text style={styles.heroEmoji}>👋</Text>
        <Text style={styles.heroTitle}>We've Missed You!</Text>
        <Text style={styles.heroSubtitle}>
          {subState?.lockReason || 'Subscription expired'} — but your data is safe and waiting for you.
        </Text>
      </View>

      {/* GOOD NEWS BANNER */}
      <View style={styles.bannerContainer}>
        <View style={[styles.banner, styles.bannerWarn]}>
          <Text style={styles.bannerText}>
            👉 Good news — getting back in takes just one payment, and you're back to work instantly.
          </Text>
        </View>
      </View>

      {/* LOCK DETAILS CARD */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>Account Status</Text>
        </View>

        <View style={styles.kvRow}>
          <Text style={styles.kvLabel}>Status</Text>
          <Text style={styles.kvValue}>🔒 Locked</Text>
        </View>

        <View style={styles.kvRow}>
          <Text style={styles.kvLabel}>Days Since Expiry</Text>
          <Text style={styles.kvValue}>{daysSinceLock()}</Text>
        </View>

        <View style={[styles.kvRow, styles.kvRowBold]}>
          <Text style={styles.kvLabelBold}>Amount To Unlock</Text>
          <Text style={styles.kvValueBold}>KSh {getUnlockAmount().toLocaleString()}</Text>
        </View>

        {subscription && (
          <View style={styles.kvRow}>
            <Text style={styles.kvLabel}>Plan</Text>
            <Text style={styles.kvValue}>
              {subscription.plan === 'biweekly' ? 'Bi-Weekly' : 'Monthly'}
            </Text>
          </View>
        )}
      </View>

      {/* WHY UNLOCK CARD */}
      <View style={styles.whyUnlockCard}>
        <Text style={styles.whyUnlockTitle}>Why You're Locked Out</Text>
        <Text style={styles.whyUnlockText}>
          ✅ Keep tracking every trip, fuel cost, and service reminder{'\n'}
          ✅ Stay connected to your SACCO and earnings{'\n'}
          ✅ Access all your vehicle data and payment history{'\n'}
          {'\n'}
          Once you pay, you're back immediately. No waiting.
        </Text>
      </View>

      {/* ACTION BUTTONS */}
      <View style={styles.actionsContainer}>
        <TouchableOpacity
          style={styles.buttonPrimary}
          onPress={handlePayAndUnlock}
          activeOpacity={0.8}
        >
          <Text style={styles.buttonPrimaryText}>🔓 Pay & Unlock Now →</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.buttonGhost}
          onPress={handleChooseDifferentPlan}
          activeOpacity={0.7}
        >
          <Text style={styles.buttonGhostText}>Choose a different plan</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.buttonGhost}
          onPress={handleRequestDataExport}
          activeOpacity={0.7}
        >
          <Text style={styles.buttonGhostText}>📤 Request Data Export</Text>
        </TouchableOpacity>
      </View>

      {/* INFO BANNER */}
      <View style={styles.bannerContainer}>
        <View style={[styles.banner, styles.bannerInfo]}>
          <Text style={styles.bannerTextInfo}>
            💡 Even while locked, your data is safe. You can always export it. Just unlock to get back to work.
          </Text>
        </View>
      </View>

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
  loadingText: {
    fontSize: 14,
    color: '#5b606c',
    marginTop: 12,
  },

  // Hero Section
  heroLocked: {
    backgroundColor: '#fdecea',
    paddingHorizontal: 20,
    paddingVertical: 28,
    alignItems: 'center',
  },
  heroEmoji: {
    fontSize: 40,
    marginBottom: 12,
  },
  heroTitle: {
    fontSize: 26,
    fontWeight: '700',
    color: '#1a1c20',
    marginBottom: 8,
    textAlign: 'center',
  },
  heroSubtitle: {
    fontSize: 14,
    color: '#5b606c',
    lineHeight: 20,
    textAlign: 'center',
  },

  // Banners
  bannerContainer: {
    marginHorizontal: 14,
    marginTop: 14,
  },
  banner: {
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 13,
    marginBottom: 14,
  },
  bannerWarn: {
    backgroundColor: '#fdf3df',
  },
  bannerInfo: {
    backgroundColor: '#eef3fb',
  },
  bannerText: {
    fontSize: 12.5,
    color: '#5b606c',
    lineHeight: 18,
  },
  bannerTextInfo: {
    fontSize: 12.5,
    color: '#2c5182',
    lineHeight: 18,
  },

  // Cards
  card: {
    backgroundColor: '#fff',
    marginHorizontal: 14,
    marginBottom: 14,
    marginTop: 14,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#e7e4db',
    padding: 16,
  },
  cardHeader: {
    marginBottom: 12,
  },
  cardTitle: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#1a1c20',
  },

  // Key-Value Row
  kvRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: '#f0ede5',
  },
  kvRowBold: {
    paddingVertical: 13,
    marginTop: 4,
    borderBottomWidth: 0,
    borderTopWidth: 1,
    borderTopColor: '#e7e4db',
  },
  kvLabel: {
    fontSize: 12,
    color: '#5b606c',
    fontWeight: '500',
  },
  kvLabelBold: {
    fontSize: 13,
    color: '#1a1c20',
    fontWeight: '700',
  },
  kvValue: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1a1c20',
  },
  kvValueBold: {
    fontSize: 16,
    fontWeight: '800',
    color: '#e0453f',
  },

  // Why Unlock Card
  whyUnlockCard: {
    backgroundColor: '#fff',
    marginHorizontal: 14,
    marginBottom: 14,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#e7e4db',
    padding: 16,
  },
  whyUnlockTitle: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#1a1c20',
    marginBottom: 10,
  },
  whyUnlockText: {
    fontSize: 12.5,
    color: '#5b606c',
    lineHeight: 19,
  },

  // Actions Container
  actionsContainer: {
    marginHorizontal: 14,
    marginBottom: 20,
    gap: 8,
  },

  // Primary Button
  buttonPrimary: {
    backgroundColor: '#ff7a1a',
    borderRadius: 14,
    paddingVertical: 15,
    paddingHorizontal: 16,
    alignItems: 'center',
    shadowColor: '#ff7a1a',
    shadowOpacity: 0.3,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  buttonPrimaryText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: 0.3,
  },

  // Ghost Button
  buttonGhost: {
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#e7e4db',
    paddingVertical: 14,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  buttonGhostText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1a1c20',
  },
});

export default AccountLockedScreen;