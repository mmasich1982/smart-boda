// rider-app/src/screens/subscription/SubscriptionScreen.js
// ✅ REFACTORED: IndexedDB-FIRST + subscriptionUtils alignment
// ✅ BUSINESS LOGIC: Free Trial, Renewal, Prepay, Payment History
// ✅ UI/UX: Matches index.html design system (hero-band, cards, banners)
// ✅ OFFLINE-FIRST: All data persisted via IndexedDB adapter
// ✅ FIXED: HeroBand component replaces custom black card hero section
// ✅ FIXED: Navigation screen names corrected to match actual registration
//           'SelectFrequency' instead of 'FrequencySelectScreen'
//           'PaymentHistory' instead of 'PaymentHistoryScreen'

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  ScrollView,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useTranslation } from '../../i18n/LocalizationProvider';
import { useRider } from '../../rider/RiderContext';
import HeroBand from '../../components/HeroBand';
import indexedDbAdapter from '../../offline/adapters/indexedDbAdapter';
import { getLocalRiderId } from '../../offline/db';
import api from '../../api/client';
import {
  getActiveSubscription,
  getSubscriptionState,
  isFreTrialActive,
  isSubscriptionExpired,
  getSubscriptionHistory,
  SUBSCRIPTION_PLANS
} from '../../offline/subscriptionUtils';

const SubscriptionScreen = () => {
  const navigation = useNavigation();
  const { t } = useTranslation();
  const { state } = useRider();

  // ========================================================================
  // STATE
  // ========================================================================
  const [localRiderId, setLocalRiderId] = useState(null);
  const [subscription, setSubscription] = useState(null);
  const [subState, setSubState] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

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
          console.log('✅ SubscriptionScreen: Loaded local rider ID:', id);
        } else if (state?.riderId) {
          setLocalRiderId(state.riderId);
          console.log('✅ SubscriptionScreen: Using context rider ID:', state.riderId);
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
  // LOAD SUBSCRIPTION DATA
  // ========================================================================
  const loadSubscriptionData = useCallback(async () => {
    if (!localRiderId || !isMountedRef.current) {
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // ✅ Load active subscription & state using subscriptionUtils
      const sub = await getActiveSubscription(localRiderId);
      const state = await getSubscriptionState(localRiderId);

      if (isMountedRef.current) {
        setSubscription(sub);
        setSubState(state);

        if (!sub && !state.trialStarted) {
          setError('no_subscription_data');
        }
      }
    } catch (err) {
      console.error('❌ Error loading subscription:', err);
      if (isMountedRef.current) {
        setError('error_loading_subscription');
      }
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  }, [localRiderId]);

  // ========================================================================
  // FOCUS EFFECT: Load subscription data
  // ========================================================================
  useFocusEffect(
    useCallback(() => {
      if (!hasLoadedRef.current && localRiderId) {
        console.log('📌 SubscriptionScreen focused, loading data...');
        hasLoadedRef.current = true;
        loadSubscriptionData();
      }

      return () => {
        // Keep loaded state on unfocus
      };
    }, [loadSubscriptionData, localRiderId])
  );

  // ========================================================================
  // REFRESH HANDLER
  // ========================================================================
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadSubscriptionData();
    setRefreshing(false);
  }, [loadSubscriptionData]);

  // ========================================================================
  // HANDLE ACTIONS - ✅ CORRECTED SCREEN NAMES
  // ========================================================================
  const handleSubscribeNow = () => {
    console.log('🔵 [handleSubscribeNow] Navigating to SelectFrequency');
    navigation.navigate('SelectFrequency');
  };

  const handleRenewNow = () => {
    console.log('🔵 [handleRenewNow] Navigating to SelectFrequency');
    navigation.navigate('SelectFrequency');
  };

  const handlePrepay = () => {
    console.log('🟢 [handlePrepay] Navigating to PrepayScreen');
    navigation.navigate('PrepayScreen', {
      currentExpiryAt: subscription?.expiryDate
    });
  };

  const handlePaymentHistory = () => {
    console.log('🔵 [handlePaymentHistory] Navigating to PaymentHistory');
    navigation.navigate('PaymentHistory');
  };



  // ========================================================================
  // RENDER HELPERS
  // ========================================================================
  const daysUntilExpiry = () => {
    if (!subscription?.expiryDate) return 0;
    const expiryMs = new Date(subscription.expiryDate).getTime();
    return Math.ceil((expiryMs - Date.now()) / (1000 * 60 * 60 * 24));
  };

  const hoursOfTrialLeft = () => {
    if (!subState?.trialEndDate) return 0;
    const trialEndMs = new Date(subState.trialEndDate).getTime();
    return Math.ceil((trialEndMs - Date.now()) / (1000 * 60 * 60));
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
  // ERROR STATE
  // ========================================================================
  if (error) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>
          {error === 'error_loading_subscription'
            ? 'Error loading subscription. Please try again.'
            : 'No subscription found. Start your free trial today.'}
        </Text>
        <TouchableOpacity
          style={styles.retryButton}
          onPress={() => {
            hasLoadedRef.current = false;
            loadSubscriptionData();
          }}
        >
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ========================================================================
  // DETERMINE STATE
  // ========================================================================
  const isOnFreeTrial = subState?.trialStarted && !subscription;
  const isSubscribed = !!subscription;
  const daysLeft = daysUntilExpiry();
  const trialHoursLeft = hoursOfTrialLeft();

  // ========================================================================
  // MAIN UI - FREE TRIAL OR ACTIVE SUBSCRIPTION
  // ========================================================================
  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      {/* ✅ HERO BAND COMPONENT (replaces custom black card) */}
      <HeroBand
        title={
          isOnFreeTrial
            ? '2 Hour Free Trial'
            : isSubscribed
            ? `Renew in ${daysLeft} Day${daysLeft > 1 ? 's' : ''}`
            : 'Start Your Journey'
        }
        subtitle={
          isOnFreeTrial
            ? 'Pay anytime before or after. No surprises.'
            : isSubscribed
            ? `Your ${subscription.plan === 'biweekly' ? 'Bi-Weekly' : 'Monthly'} plan expires soon.`
            : 'Choose a plan that works for you.'
        }
        onBack={() => navigation.goBack()}
      />

      {/* FREE TRIAL BANNER */}
      {isOnFreeTrial && (
        <View style={styles.bannerContainer}>
          <View style={[styles.banner, styles.bannerTrial]}>
            <Text style={styles.bannerText}>
              ✨ Take your time — your 2-hour free trial doesn't expire until{' '}
              {new Date(subState.trialEndDate).toLocaleDateString('en-KE')}
            </Text>
          </View>
        </View>
      )}

      {/* SUBSCRIPTION DETAILS CARD */}
      {isSubscribed && (
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>Your Plan</Text>
          </View>

          <View style={styles.kvRow}>
            <Text style={styles.kvLabel}>Plan Type</Text>
            <Text style={styles.kvValue}>
              {subscription.plan === 'biweekly' ? 'Bi-Weekly' : 'Monthly'}
            </Text>
          </View>

          <View style={styles.kvRow}>
            <Text style={styles.kvLabel}>Amount</Text>
            <Text style={styles.kvValue}>KSh {subscription.amount.toLocaleString()}</Text>
          </View>

          <View style={[styles.kvRow, { borderBottomWidth: 0 }]}>
            <Text style={styles.kvLabel}>Expires</Text>
            <Text style={styles.kvValue}>
              {new Date(subscription.expiryDate).toLocaleDateString('en-KE')}
            </Text>
          </View>
        </View>
      )}

      {/* BENEFITS CARD */}
      {isOnFreeTrial && (
        <View style={styles.benefitsCard}>
          <Text style={styles.benefitsTitle}>Why Subscribe Now?</Text>
          <Text style={styles.benefitsText}>
            ✅ Keep tracking every trip, fuel cost, and service reminder{'\n'}
            ✅ Guaranteed acess to accurate statements{'\n'}
            ✅ From just KSh 33/day — less than a cup of tea
          </Text>
        </View>
      )}

      {/* ACTION BUTTONS */}
      <View style={styles.actionsContainer}>
        <TouchableOpacity
          style={styles.buttonPrimary}
          onPress={isOnFreeTrial ? handleSubscribeNow : handleRenewNow}
          activeOpacity={0.8}
        >
          <Text style={styles.buttonPrimaryText}>
            {isOnFreeTrial ? '🚀 Subscribe Now →' : '🔁 Renew Now →'}
          </Text>
        </TouchableOpacity>

        {subscription && (
          <TouchableOpacity
            style={styles.buttonGhost}
            onPress={() => navigation.navigate('SelectFrequency')}
            activeOpacity={0.7}
          >
            <Text style={styles.buttonGhostText}>Change how often I pay</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={styles.buttonGhost}
          onPress={handlePrepay}
          activeOpacity={0.7}
        >
          <Text style={styles.buttonGhostText}>📅 Pay Ahead & Skip the Hassle →</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={handlePaymentHistory}
          activeOpacity={0.7}
        >
          <Text style={styles.linkText}>View Payment History →</Text>
        </TouchableOpacity>
      </View>

      {/* INFO BANNER */}
      <View style={styles.bannerContainer}>
        <View style={[styles.banner, styles.bannerInfo]}>
          <Text style={styles.bannerTextInfo}>
            ℹ️ Payment via M-Pesa (Lipa na M-Pesa, Pochi la Biashara, or Send Money)
          </Text>
        </View>
      </View>
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
    paddingHorizontal: 20,
  },
  loadingText: {
    fontSize: 14,
    color: '#5b606c',
    marginTop: 12,
  },
  errorText: {
    fontSize: 14,
    color: '#a5312c',
    textAlign: 'center',
    marginBottom: 20,
  },
  retryButton: {
    backgroundColor: '#ff7a1a',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 12,
  },
  retryButtonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
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
  bannerTrial: {
    backgroundColor: '#e6f5ef',
  },
  bannerWarn: {
    backgroundColor: '#fdf3df',
  },
  bannerError: {
    backgroundColor: '#fdecea',
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
  cardSubtext: {
    fontSize: 12.5,
    color: '#5b606c',
    lineHeight: 19,
  },

  // Benefits Card
  benefitsCard: {
    backgroundColor: '#fff',
    marginHorizontal: 14,
    marginBottom: 14,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#e7e4db',
    padding: 16,
  },
  benefitsTitle: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#1a1c20',
    marginBottom: 10,
  },
  benefitsText: {
    fontSize: 12.5,
    color: '#5b606c',
    lineHeight: 19,
  },

  // Key-Value Row
  kvRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f0ede5',
  },
  kvLabel: {
    fontSize: 13,
    color: '#5b606c',
    fontWeight: '500',
  },
  kvValue: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1a1c20',
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
    borderColor: '#ff7a1a',
    paddingVertical: 14,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  buttonGhostText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#ff7a1a',
  },

  // Link Text
  linkText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#e5650a',
    paddingVertical: 6,
  },
});

export default SubscriptionScreen;