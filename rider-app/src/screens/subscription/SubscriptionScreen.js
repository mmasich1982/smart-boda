// rider-app/src/screens/subscription/SubscriptionScreen.js
// ✅ REFACTORED: IndexedDB-FIRST + subscriptionUtils alignment
// ✅ BUSINESS LOGIC: Free Trial, Renewal, Prepay, Payment History
// ✅ UI/UX: Matches index.html design system (hero-band, cards, banners)
// ✅ OFFLINE-FIRST: All data persisted via IndexedDB adapter

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
import indexedDbAdapter from '../../offline/adapters/indexedDbAdapter';
import { getLocalRiderId } from '../../offline/db';
import api from '../../api/client';
import {
  getActiveSubscription,
  getSubscriptionState,
  isFreTrialActive,
  isSubscriptionExpired,
  createSubscription,
  lockAccount,
  unlockAccount,
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

        // ✅ Check if account should be locked (expiry without payment)
        if (!state.lockedAt && sub === null && state.trialEndDate) {
          const trialEndMs = new Date(state.trialEndDate).getTime();
          if (trialEndMs <= Date.now()) {
            // Trial expired, lock account
            await lockAccount(localRiderId, 'Free trial expired');
            const updatedState = await getSubscriptionState(localRiderId);
            setSubState(updatedState);
          }
        }

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
  // FOCUS EFFECT: Load on screen focus
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
  // HANDLE ACTIONS
  // ========================================================================
  const handleSubscribeNow = () => {
    navigation.navigate('FrequencySelectScreen');
  };

  const handleRenewNow = () => {
    navigation.navigate('FrequencySelectScreen');
  };

  const handlePrepay = () => {
    navigation.navigate('PrepayScreen', {
      currentExpiryAt: subscription?.expiryDate
    });
  };

  const handlePaymentHistory = () => {
    navigation.navigate('PaymentHistoryScreen');
  };

  const handleUnlock = () => {
    navigation.navigate('FrequencySelectScreen');
  };

  // ========================================================================
  // RENDER HELPERS
  // ========================================================================
  const daysUntilExpiry = () => {
    if (!subscription?.expiryDate) return 0;
    const expiryMs = new Date(subscription.expiryDate).getTime();
    return Math.ceil((expiryMs - Date.now()) / (1000 * 60 * 60 * 24));
  };

  const daysOfTrialLeft = () => {
    if (!subState?.trialEndDate) return 0;
    const trialEndMs = new Date(subState.trialEndDate).getTime();
    return Math.ceil((trialEndMs - Date.now()) / (1000 * 60 * 60 * 24));
  };

  // ========================================================================
  // ACCOUNT LOCKED STATE
  // ========================================================================
  if (subState?.lockedAt && !loading) {
    return (
      <ScrollView style={styles.container}>
        <View style={styles.heroBand}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={styles.backLink}
          >
            <Text style={styles.backLinkText}>← {t('common.back') || 'Home'}</Text>
          </TouchableOpacity>
          <Text style={styles.heroEmoji}>👋</Text>
          <Text style={styles.heroTitle}>We've Missed You!</Text>
          <Text style={styles.heroSubtitle}>
            {subState.lockReason || 'Subscription expired'} — but your data is safe.
          </Text>
        </View>

        <View style={styles.bannerContainer}>
          <View style={[styles.banner, styles.bannerWarn]}>
            <Text style={styles.bannerText}>
              👉 Good news — one payment to unlock and you're back to work instantly.
            </Text>
          </View>
        </View>

        <View style={styles.card}>
          <View style={styles.kvRow}>
            <Text style={styles.kvLabel}>Amount To Unlock</Text>
            <Text style={styles.kvValue}>KSh {SUBSCRIPTION_PLANS.biweekly.amount}</Text>
          </View>
        </View>

        <TouchableOpacity
          style={styles.buttonPrimary}
          onPress={handleUnlock}
          activeOpacity={0.8}
        >
          <Text style={styles.buttonPrimaryText}>🔓 Pay & Unlock Now →</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.buttonGhost}
          onPress={() => navigation.navigate('FrequencySelectScreen')}
          activeOpacity={0.7}
        >
          <Text style={styles.buttonGhostText}>Choose a different plan</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  }

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
          {t(`common.${error}`) || 'Unable to load subscription'}
        </Text>
        <TouchableOpacity
          style={styles.retryButton}
          onPress={() => {
            hasLoadedRef.current = false;
            loadSubscriptionData();
          }}
        >
          <Text style={styles.retryButtonText}>{t('common.retry') || 'Retry'}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ========================================================================
  // DETERMINE SUBSCRIPTION STATUS
  // ========================================================================
  const isOnFreeTrial = subState?.trialStarted && !subscription;
  const daysLeft = isOnFreeTrial ? daysOfTrialLeft() : daysUntilExpiry();
  const statusWord = isOnFreeTrial ? '🎁 Your free trial' : '✅ You\'re all set';
  const statusTitle = isOnFreeTrial ? 'Free Trial' : 'Active';
  const isUrgent = daysLeft <= 2;

  // ========================================================================
  // MAIN UI
  // ========================================================================
  return (
    <ScrollView
      style={styles.container}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor="#ff7a1a"
        />
      }
    >
      {/* HERO BAND */}
      <View style={styles.heroBand}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backLink}
        >
          <Text style={styles.backLinkText}>← {t('common.back') || 'Home'}</Text>
        </TouchableOpacity>
        <Text style={styles.heroEyebrow}>{statusWord}</Text>
        <Text style={styles.heroTitle}>{statusTitle}</Text>
        <View style={styles.heroCountdown}>
          <Text style={styles.heroCountdownDays}>{Math.max(daysLeft, 0)}</Text>
          <Text style={styles.heroCountdownLabel}>
            day{daysLeft === 1 ? '' : 's'} left{isOnFreeTrial ? ' of your free trial' : ' on your plan'}
          </Text>
        </View>
      </View>

      {/* URGENT BANNER */}
      {isUrgent && (
        <View style={styles.bannerContainer}>
          <View
            style={[
              styles.banner,
              daysLeft <= 1 ? styles.bannerError : styles.bannerWarn
            ]}
          >
            <Text style={styles.bannerText}>
              {daysLeft <= 1
                ? '⏰ Today is your last day! Keep your tools running — subscribe now.'
                : `⏰ Only ${daysLeft} days left. Subscribe now to stay active.`}
            </Text>
          </View>
        </View>
      )}

      {/* STATUS CARD */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Status Details</Text>
        <View style={styles.kvRow}>
          <Text style={styles.kvLabel}>Days Left</Text>
          <Text style={styles.kvValue}>{Math.max(daysLeft, 0)}</Text>
        </View>
        {subscription?.expiryDate && (
          <View style={styles.kvRow}>
            <Text style={styles.kvLabel}>Expiry Date</Text>
            <Text style={styles.kvValue}>
              {new Date(subscription.expiryDate).toLocaleDateString('en-KE')}
            </Text>
          </View>
        )}
        {subscription?.plan && (
          <View style={styles.kvRow}>
            <Text style={styles.kvLabel}>Current Plan</Text>
            <Text style={styles.kvValue}>
              {subscription.plan === 'biweekly'
                ? '📆 Bi-Weekly (14 days)'
                : '📆 Monthly (30 days)'}
            </Text>
          </View>
        )}
      </View>

      {/* WHY SUBSCRIBE CARD (TRIAL ONLY) */}
      {isOnFreeTrial && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Why Subscribe?</Text>
          <Text style={styles.cardSubtext}>
            ✅ Keep tracking every trip, fuel cost, and service reminder{'\n'}
            ✅ Stay connected to your SACCO{'\n'}
            ✅ From just KSh 35/day — less than a cup of tea
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
            onPress={() => navigation.navigate('FrequencySelectScreen')}
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

  // Hero Band
  heroBand: {
    backgroundColor: '#1a1c20',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 24,
    position: 'relative',
    overflow: 'hidden',
  },
  backLink: {
    marginBottom: 16,
  },
  backLinkText: {
    fontSize: 13,
    color: '#fff',
    opacity: 0.85,
  },
  heroEyebrow: {
    fontSize: 12,
    color: '#ff7a1a',
    fontWeight: '600',
    marginBottom: 8,
  },
  heroTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 12,
  },
  heroEmoji: {
    fontSize: 34,
    marginBottom: 8,
  },
  heroSubtitle: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.85)',
  },
  heroCountdown: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
    marginTop: 12,
  },
  heroCountdownDays: {
    fontSize: 34,
    fontWeight: '800',
    color: '#fff',
  },
  heroCountdownLabel: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.85)',
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
  cardTitle: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#1a1c20',
    marginBottom: 12,
  },
  cardSubtext: {
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