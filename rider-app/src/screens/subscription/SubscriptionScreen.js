// rider-app/src/screens/subscription/SubscriptionScreen.js
// ✅ SEAMLESS ONLINE/OFFLINE: Cache-first loading, silent sync
// ✅ MULTILINGUAL: Uses i18n for all UI text
// ✅ OFFLINE PERSISTENCE: IndexedDB adapter for local-first storage
// ✅ NETWORK AWARE: Real-time connectivity detection

import React, { useState, useEffect, useCallback, useContext } from 'react';
import {
  ScrollView,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import BackLink from '../../components/BackLink';
import { useRider } from '../../rider/RiderContext';
import { useTranslation } from '../../i18n/LocalizationProvider';
import { getLocalRiderId } from '../../offline/db';
import indexedDbAdapter from '../../offline/adapters/indexedDbAdapter';
import { useNetworkStatus, useCriticalError } from '../../hooks/useNetworkStatus';
import api from '../../api/client';

const SubscriptionScreen = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const { state } = useRider();
  const { t } = useTranslation();
  
  const [localRiderId, setLocalRiderId] = useState(null);
  const [subscriptionData, setSubscriptionData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [syncing, setSyncing] = useState(false);
  
  const { isConnected, isInitialized } = useNetworkStatus();
  const { error: criticalError, showError: showCriticalError, clearError: clearCriticalError } = useCriticalError();

  const effectiveRiderId = localRiderId || state?.riderId;

  // ✅ LOAD RIDER ID ON MOUNT
  useEffect(() => {
    const loadRiderId = async () => {
      try {
        const id = await getLocalRiderId();
        if (id) {
          setLocalRiderId(id);
          console.log('✅ Subscription: Loaded rider ID:', id);
        }
      } catch (err) {
        console.error('❌ Error loading rider ID:', err);
      }
    };
    
    loadRiderId();
  }, []);

  // ========================================================================
  // OFFLINE FIRST: Load from cache, then try API
  // ========================================================================
  
  const loadSubscriptionData = useCallback(async (fromRefresh = false) => {
    try {
      if (!fromRefresh) setLoading(true);

      if (!effectiveRiderId || !isInitialized) {
        return;
      }

      const cacheKey = `subscription_status_${effectiveRiderId}`;
      let dataLoaded = false;

      // 1. TRY CACHE FIRST from IndexedDB
      console.log('📦 Checking cache...');
      const cachedData = await indexedDbAdapter.kvGet(cacheKey);
      
      if (cachedData) {
        try {
          const data = typeof cachedData === 'string' ? JSON.parse(cachedData) : cachedData;
          if (data) {
            setSubscriptionData(data);
            dataLoaded = true;
            console.log(`✅ Loaded from cache`);
          }
        } catch (parseErr) {
          console.warn('⚠️ Cache parse error');
        }
      }

      // 2. TRY TO SYNC FRESH DATA IF ONLINE
      if (isConnected) {
        console.log('📡 Syncing with API...');
        setSyncing(true);
        try {
          const response = await api.get('/api/riders/subscription/status');

          if (response.data) {
            setSubscriptionData(response.data);
            dataLoaded = true;
            
            // Cache it for next time using IndexedDB
            await indexedDbAdapter.kvSet(cacheKey, JSON.stringify(response.data));
            console.log(`✅ Synced and cached subscription data`);
          }
        } catch (apiErr) {
          console.warn('⚠️ API sync failed (using cached data):', apiErr.message);
          // Already have cached data or will show error - that's fine
        } finally {
          setSyncing(false);
        }
      }

      // If no data loaded and no cache, show error
      if (!dataLoaded && !subscriptionData) {
        showCriticalError(
          t('error_loadSubscriptionFailed') || 'Failed to load subscription. Please try again.',
          'load_error'
        );
      }

      setLoading(false);
      setRefreshing(false);
    } catch (err) {
      console.error('❌ Error loading subscription:', err);
      showCriticalError(
        t('error_subscriptionLoadFailed') || 'Failed to load subscription status',
        'data_load'
      );
      setLoading(false);
      setRefreshing(false);
    }
  }, [effectiveRiderId, isInitialized, isConnected, subscriptionData, t]);

  // Load on mount
  useEffect(() => {
    if (!effectiveRiderId || !isInitialized) return;
    loadSubscriptionData();
  }, [effectiveRiderId, isInitialized, loadSubscriptionData]);

  /**
   * Refresh on screen focus
   */
  useFocusEffect(
    useCallback(() => {
      if (!effectiveRiderId || !isInitialized) return;

      try {
        // Check if cache has been updated in IndexedDB
        (async () => {
          const cacheKey = `subscription_status_${effectiveRiderId}`;
          const cachedData = await indexedDbAdapter.kvGet(cacheKey);
          
          if (cachedData) {
            const data = typeof cachedData === 'string' ? JSON.parse(cachedData) : cachedData;
            if (data) {
              setSubscriptionData(data);
            }
          }
        })();
      } catch (err) {
        console.warn('⚠️ Error in focus effect:', err);
      }
    }, [effectiveRiderId, isInitialized])
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadSubscriptionData(true);
  }, [loadSubscriptionData]);

  // ========================================================================
  // Handle Navigation to Frequency Selection
  // ========================================================================
  
  const handleSubscribe = () => {
    if (subscriptionData?.is_locked) {
      showCriticalError(
        t('error_accountLocked') || 'Your account is locked. Contact support.',
        'locked'
      );
      return;
    }
    clearCriticalError();
    navigation.navigate('FrequencySelect', { 
      isRenewal: subscriptionData?.has_ever_paid 
    });
  };

  // ========================================================================
  // Render States
  // ========================================================================
  
  if (!effectiveRiderId || !isInitialized) {
    return (
      <ScrollView style={styles.container}>
        <BackLink onPress={() => navigation.goBack()} label={t('backLabel') || '← Back'} />
        <Text style={styles.title}>{t('mySubscription') || 'My Subscription'}</Text>
        <ActivityIndicator size="large" color="#ff7a1a" style={{ marginTop: 40 }} />
      </ScrollView>
    );
  }

  if (subscriptionData?.is_locked) {
    return (
      <ScrollView style={styles.container}>
        <BackLink onPress={() => navigation.goBack()} label={t('backLabel') || '← Back'} />
        <Text style={styles.title}>{t('accountLocked') || 'Account Locked'}</Text>
        
        <View style={styles.lockedContainer}>
          <Text style={styles.lockIcon}>🔒</Text>
          <Text style={styles.lockedTitle}>
            {t('subscriptionExpired') || 'Your subscription has expired'}
          </Text>
          <Text style={styles.lockedMessage}>
            {subscriptionData.lock_reason === 'Free Trial Expired' 
              ? t('subscribeNowToUse') || 'Subscribe now to continue using the app'
              : t('renewSubscriptionToUnlock') || 'Renew your subscription to unlock your account'
            }
          </Text>
          
          <TouchableOpacity style={styles.primaryBtn} onPress={handleSubscribe}>
            <Text style={styles.primaryBtnText}>
              {subscriptionData.lock_reason === 'Free Trial Expired' 
                ? (t('subscribeNow') || 'Subscribe Now →')
                : (t('renewNow') || 'Renew Now →')}
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    );
  }

  if (loading && !subscriptionData) {
    return (
      <ScrollView style={styles.container}>
        <BackLink onPress={() => navigation.goBack()} label={t('backLabel') || '← Back'} />
        <Text style={styles.title}>{t('mySubscription') || 'My Subscription'}</Text>
        <ActivityIndicator size="large" color="#ff7a1a" style={{ marginTop: 40 }} />
      </ScrollView>
    );
  }

  // ========================================================================
  // Main Subscription Status Display
  // ========================================================================
  
  return (
    <ScrollView 
      style={styles.container}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
      contentContainerStyle={{ paddingBottom: 40 }}
    >
      <BackLink onPress={() => navigation.goBack()} label={t('backLabel') || '← Back'} />
      <Text style={styles.title}>{t('mySubscription') || 'My Subscription'}</Text>

      {/* CRITICAL ERROR ONLY */}
      {criticalError && (
        <View style={styles.criticalErrorBanner}>
          <Text style={styles.criticalErrorText}>{criticalError}</Text>
          <TouchableOpacity onPress={clearCriticalError}>
            <Text style={styles.dismissText}>{t('dismiss') || 'Dismiss'}</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* SYNCING INDICATOR */}
      {syncing && (
        <View style={styles.syncingBanner}>
          <ActivityIndicator size="small" color="#ff7a1a" />
          <Text style={styles.syncingText}>{t('syncing') || 'Syncing...'}</Text>
        </View>
      )}

      {subscriptionData && (
        <>
          {/* DAYS LEFT HERO */}
          <View style={styles.heroBanner}>
            <Text style={styles.heroSubtitle}>
              {subscriptionData?.is_trial 
                ? (t('freeTrialBadge') || '🎁 Free Trial')
                : (t('activeSubscriptionBadge') || '✅ Active Subscription')}
            </Text>
            <Text style={styles.daysLeftNumber}>
              {subscriptionData?.days_left || 0}
            </Text>
            <Text style={styles.daysLeftLabel}>
              {subscriptionData?.days_left === 1 
                ? (t('dayLeft') || 'day left')
                : (t('daysLeft') || 'days left')}
            </Text>
          </View>

          {/* URGENCY BANNER - Only when ≤2 days */}
          {subscriptionData?.urgency_banner_shown && (
            <View style={[
              styles.urgencyBanner,
              { backgroundColor: subscriptionData?.expires_today ? '#fdecea' : '#fff3e0' }
            ]}>
              <Text style={[
                styles.urgencyText,
                { color: subscriptionData?.expires_today ? '#a5312c' : '#e65100' }
              ]}>
                {subscriptionData?.expires_today 
                  ? (t('subscriptionEndsToday') || 'Your subscription ends today')
                  : (t('subscriptionEndsTomorrow') || 'Your subscription ends tomorrow')}
              </Text>
            </View>
          )}

          {/* PENDING PRICE CHANGE ALERT */}
          {subscriptionData?.pending_price_change && (
            <View style={styles.priceChangeAlert}>
              <Text style={styles.priceChangeTitle}>⚠️ {t('priceChangeComing') || 'Price Change Coming'}</Text>
              <Text style={styles.priceChangeText}>
                {t('biweekly') || 'Bi-Weekly'}: {subscriptionData.pending_price_change.biweekly_price ? `KSh ${subscriptionData.pending_price_change.biweekly_price}` : t('noChange') || 'No change'} | 
                {t('monthly') || 'Monthly'}: {subscriptionData.pending_price_change.monthly_price ? `KSh ${subscriptionData.pending_price_change.monthly_price}` : t('noChange') || 'No change'}
              </Text>
              <Text style={styles.priceChangeTime}>
                {t('effectiveIn') || 'Effective in'} {subscriptionData.pending_price_change.hours_until}h
              </Text>
            </View>
          )}

          {/* PLAN INFO CARD */}
          <View style={styles.planCard}>
            <View style={styles.planRow}>
              <Text style={styles.planLabel}>{t('plan') || 'Plan'}</Text>
              <Text style={styles.planValue}>{subscriptionData?.plan_name}</Text>
            </View>

            <View style={styles.planRow}>
              <Text style={styles.planLabel}>{t('frequency') || 'Frequency'}</Text>
              <Text style={styles.planValue}>
                {subscriptionData?.frequency === 'biweekly' 
                  ? (t('biweekly') || 'Bi-Weekly')
                  : (t('monthly') || 'Monthly')}
              </Text>
            </View>

            <View style={styles.planRow}>
              <Text style={styles.planLabel}>{t('currentPrice') || 'Current Price'}</Text>
              <Text style={styles.planValue}>
                KSh {subscriptionData?.pricing?.amount || 0}
              </Text>
            </View>

            {subscriptionData?.total_paid_lifetime > 0 && (
              <View style={styles.planRow}>
                <Text style={styles.planLabel}>{t('lifetimeSpent') || 'Lifetime Spent'}</Text>
                <Text style={styles.planValue}>
                  KSh {Math.floor(subscriptionData.total_paid_lifetime)}
                </Text>
              </View>
            )}

            <Text style={styles.planNote}>
              {t('expires') || 'Expires'}: {new Date(subscriptionData?.expiry_at).toLocaleDateString(t('dateLocale') || 'en-US')}
            </Text>
          </View>

          {/* CTA BUTTONS */}
          <TouchableOpacity 
            style={[styles.primaryBtn, (loading || syncing) && styles.primaryBtnDisabled]}
            onPress={handleSubscribe}
            disabled={loading || syncing}
          >
            <Text style={styles.primaryBtnText}>
              {subscriptionData?.has_ever_paid 
                ? (t('renewNow') || '✅ Renew Now →')
                : (t('subscribeNow') || '🚀 Subscribe Now →')}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.secondaryBtn, (loading || syncing) && styles.secondaryBtnDisabled]}
            onPress={() => navigation.navigate('PaymentHistory')}
            disabled={loading || syncing}
          >
            <Text style={styles.secondaryBtnText}>
              {t('viewPaymentHistory') || '💳 View Payment History'}
            </Text>
          </TouchableOpacity>
        </>
      )}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f6f4ef',
    padding: 20
  },
  title: {
    fontFamily: 'SpaceGrotesk-Bold',
    fontSize: 28,
    fontWeight: '700',
    color: '#1a1c20',
    marginBottom: 20
  },
  
  criticalErrorBanner: {
    backgroundColor: '#fdecea',
    borderWidth: 1.5,
    borderColor: '#f6cac7',
    borderRadius: 14,
    padding: 12,
    marginBottom: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  criticalErrorText: {
    fontSize: 12,
    color: '#a5312c',
    fontWeight: '600',
    flex: 1
  },
  dismissText: {
    fontSize: 11,
    color: '#a5312c',
    fontWeight: '700',
    marginLeft: 12
  },

  syncingBanner: {
    backgroundColor: '#e3f2fd',
    borderWidth: 1.5,
    borderColor: '#bbdefb',
    borderRadius: 14,
    padding: 12,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12
  },
  syncingText: {
    fontSize: 12,
    color: '#1565c0',
    fontWeight: '600'
  },

  heroBanner: {
    backgroundColor: '#ff7a1a',
    borderRadius: 14,
    padding: 24,
    alignItems: 'center',
    marginBottom: 16,
    shadowColor: '#ff7a1a',
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6
  },
  heroSubtitle: {
    fontSize: 14,
    color: '#fff',
    opacity: 0.9,
    marginBottom: 12
  },
  daysLeftNumber: {
    fontSize: 48,
    fontWeight: '700',
    color: '#fff',
    lineHeight: 52
  },
  daysLeftLabel: {
    fontSize: 16,
    color: '#fff',
    opacity: 0.9,
    marginTop: 4
  },

  urgencyBanner: {
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
    borderLeftWidth: 4,
    borderLeftColor: '#e65100'
  },
  urgencyText: {
    fontSize: 14,
    fontWeight: '600'
  },

  priceChangeAlert: {
    backgroundColor: '#fff3e0',
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
    borderLeftWidth: 4,
    borderLeftColor: '#ff9800'
  },
  priceChangeTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#e65100',
    marginBottom: 4
  },
  priceChangeText: {
    fontSize: 12,
    color: '#1a1c20',
    marginBottom: 4
  },
  priceChangeTime: {
    fontSize: 11,
    color: '#5b606c',
    fontStyle: 'italic'
  },

  planCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1.5,
    borderColor: '#e7e4db'
  },
  planRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8
  },
  planLabel: {
    fontSize: 12,
    color: '#5b606c',
    fontWeight: '600',
    textTransform: 'uppercase'
  },
  planValue: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1a1c20'
  },
  planNote: {
    fontSize: 11,
    color: '#5b606c',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#e7e4db'
  },

  lockedContainer: {
    alignItems: 'center',
    marginVertical: 40
  },
  lockIcon: {
    fontSize: 80,
    marginBottom: 20
  },
  lockedTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1a1c20',
    marginBottom: 12,
    textAlign: 'center'
  },
  lockedMessage: {
    fontSize: 14,
    color: '#5b606c',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 20
  },

  primaryBtn: {
    backgroundColor: '#ff7a1a',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 12,
    shadowColor: '#ff7a1a',
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6
  },
  primaryBtnDisabled: {
    backgroundColor: '#e9dccc',
    shadowOpacity: 0
  },
  primaryBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.02
  },

  secondaryBtn: {
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: '#ff7a1a',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center'
  },
  secondaryBtnDisabled: {
    backgroundColor: '#f0ede7',
    borderColor: '#d0cbc0',
    opacity: 0.6
  },
  secondaryBtnText: {
    color: '#ff7a1a',
    fontSize: 16,
    fontWeight: '700'
  }
});

export default SubscriptionScreen;
