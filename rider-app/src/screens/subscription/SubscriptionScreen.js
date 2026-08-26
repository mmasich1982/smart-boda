// rider-app/src/screens/subscription/SubscriptionScreen.js
// ✅ DIAGNOSTIC VERSION: Includes detailed logging for navigation debugging
// Use this to identify why FrequencySelectScreen and PaymentHistoryScreen navigation fails

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  ScrollView,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Alert
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
  // DIAGNOSTIC: Log navigation object on mount
  // ========================================================================
  useEffect(() => {
    console.log('🔍 [SubscriptionScreen] ===== NAVIGATION DIAGNOSTIC =====');
    console.log('📱 Navigation object:', navigation);
    console.log('📱 Navigation.getState():', navigation.getState?.());
    
    if (navigation.getState?.()) {
      const navState = navigation.getState();
      console.log('✅ Available route names:', navState.routeNames || 'NOT AVAILABLE');
      console.log('✅ Current routes:', navState.routes || 'NOT AVAILABLE');
      console.log('✅ Index:', navState.index);
    }
  }, [navigation]);

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

      const sub = await getActiveSubscription(localRiderId);
      const state = await getSubscriptionState(localRiderId);

      if (isMountedRef.current) {
        setSubscription(sub);
        setSubState(state);

        if (!state.lockedAt && sub === null && state.trialEndDate) {
          const trialEndMs = new Date(state.trialEndDate).getTime();
          if (trialEndMs <= Date.now()) {
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
  // HANDLE ACTIONS - WITH DIAGNOSTIC LOGGING
  // ========================================================================
  const handleSubscribeNow = () => {
    console.log('🔵 [handleSubscribeNow] TRIGGERED');
    console.log('📱 Navigation object exists?', !!navigation);
    console.log('📱 Navigation.navigate exists?', !!navigation.navigate);
    
    const navState = navigation.getState?.();
    if (navState) {
      console.log('📱 Available screens:', navState.routeNames);
      console.log('📱 FrequencySelectScreen in routes?', navState.routeNames?.includes('FrequencySelectScreen'));
    } else {
      console.warn('⚠️ Cannot get navigation state');
    }

    try {
      console.log('➡️ Attempting navigation to: FrequencySelectScreen');
      navigation.navigate('FrequencySelectScreen');
      console.log('✅ Navigation.navigate() call succeeded');
    } catch (error) {
      console.error('❌ Navigation error caught:', error);
      console.error('❌ Error message:', error.message);
      console.error('❌ Stack trace:', error.stack);
      Alert.alert('Navigation Error', `Unable to navigate: ${error.message}`);
    }
  };

  const handleRenewNow = () => {
    console.log('🔵 [handleRenewNow] TRIGGERED');
    console.log('📱 Navigation object exists?', !!navigation);
    
    try {
      console.log('➡️ Attempting navigation to: FrequencySelectScreen');
      navigation.navigate('FrequencySelectScreen');
      console.log('✅ Navigation.navigate() call succeeded');
    } catch (error) {
      console.error('❌ Navigation error:', error.message);
      Alert.alert('Navigation Error', `Unable to navigate: ${error.message}`);
    }
  };

  const handlePrepay = () => {
    console.log('🟢 [handlePrepay] TRIGGERED - THIS WORKS');
    console.log('📱 Navigation to: PrepayScreen');
    console.log('📱 Parameters:', { currentExpiryAt: subscription?.expiryDate });
    
    try {
      navigation.navigate('PrepayScreen', {
        currentExpiryAt: subscription?.expiryDate
      });
      console.log('✅ PrepayScreen navigation succeeded');
    } catch (error) {
      console.error('❌ PrepayScreen navigation error:', error.message);
    }
  };

  const handlePaymentHistory = () => {
    console.log('🔵 [handlePaymentHistory] TRIGGERED');
    console.log('📱 Navigation object exists?', !!navigation);
    
    const navState = navigation.getState?.();
    if (navState) {
      console.log('📱 Available screens:', navState.routeNames);
      console.log('📱 PaymentHistoryScreen in routes?', navState.routeNames?.includes('PaymentHistoryScreen'));
    }

    try {
      console.log('➡️ Attempting navigation to: PaymentHistoryScreen');
      navigation.navigate('PaymentHistoryScreen');
      console.log('✅ Navigation.navigate() call succeeded');
    } catch (error) {
      console.error('❌ Navigation error:', error.message);
      Alert.alert('Navigation Error', `Unable to navigate: ${error.message}`);
    }
  };

  const handleUnlock = () => {
    console.log('🔵 [handleUnlock] TRIGGERED');
    try {
      navigation.navigate('FrequencySelectScreen');
    } catch (error) {
      console.error('❌ Unlock navigation error:', error.message);
    }
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
        <HeroBand
          title="We've Missed You!"
          subtitle={subState.lockReason || 'Subscription expired — but your data is safe.'}
          onBack={() => navigation.goBack()}
        />

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
  const trialDaysLeft = daysOfTrialLeft();

  // ========================================================================
  // MAIN UI - FREE TRIAL OR ACTIVE SUBSCRIPTION
  // ========================================================================
  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <HeroBand
        title={
          isOnFreeTrial
            ? `${trialDaysLeft} Day${trialDaysLeft > 1 ? 's' : ''} Free Trial`
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
              ✨ Take your time — your {trialDaysLeft}-day free trial doesn't expire until{' '}
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

      {/* DIAGNOSTIC PANEL - REMOVE IN PRODUCTION */}
      <View style={styles.diagnosticPanel}>
        <Text style={styles.diagnosticTitle}>🔍 DIAGNOSTIC INFO (Remove before production)</Text>
        <Text style={styles.diagnosticText}>
          Rider ID: {localRiderId || 'NOT SET'}{'\n'}
          Subscription: {isSubscribed ? 'ACTIVE' : 'NONE'}{'\n'}
          Trial: {isOnFreeTrial ? `ACTIVE (${trialDaysLeft} days)` : 'NOT ON TRIAL'}{'\n'}
          Locked: {subState?.lockedAt ? 'YES' : 'NO'}
        </Text>
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

  // Diagnostic Panel (Remove in production)
  diagnosticPanel: {
    marginHorizontal: 14,
    marginBottom: 20,
    backgroundColor: '#fff3e0',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#ff9800',
    padding: 12,
  },
  diagnosticTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#e65100',
    marginBottom: 8,
  },
  diagnosticText: {
    fontSize: 11,
    color: '#bf360c',
    fontFamily: 'monospace',
    lineHeight: 16,
  },
});

export default SubscriptionScreen;