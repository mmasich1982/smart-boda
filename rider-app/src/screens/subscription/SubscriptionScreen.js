// rider-app/src/screens/subscription/SubscriptionScreen.js
// ============================================================================
// ✅ REFACTORED: IndexedDB-FIRST + Sync Queue (Fuel Screen Pattern)
// ✅ MIGRATION: LocalStore → IndexedDB kvSet/kvGet
// ✅ No external repository dependencies
// ============================================================================

import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
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

const SubscriptionScreen = () => {
  const navigation = useNavigation();
  const { t } = useTranslation();
  const { state } = useRider();

  // ========================================================================
  // STATE
  // ========================================================================
  const [subscription, setSubscription] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [isOffline, setIsOffline] = useState(false);
  const [error, setError] = useState(null);
  const [localRiderId, setLocalRiderId] = useState(null);

  // ========================================================================
  // CONTROL MECHANISMS: Prevent infinite loops and double-initialization
  // ========================================================================
  const hasLoadedRef = useRef(false);
  const isMountedRef = useRef(true);
  const lastFetchRef = useRef(0);

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
  // LOAD SUBSCRIPTION DATA
  // ========================================================================
  // ✅ FIXED: Only depends on localRiderId, not included in useFocusEffect deps
  const loadSubscription = useCallback(async () => {
    if (!localRiderId || !isMountedRef.current) {
      console.log('⚠️ Skip load: no localRiderId or component unmounted');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      let subscriptionData = null;

      // ✅ STRATEGY 1: Try IndexedDB first (offline-ready)
      try {
        console.log('📂 Loading subscription from IndexedDB...');
        const cached = await indexedDbAdapter.kvGet(
          `subscription_${localRiderId}`
        );

        if (cached) {
          const parsedData = JSON.parse(cached);
          subscriptionData = parsedData.data;
          console.log('✅ Subscription loaded from IndexedDB');
        }
      } catch (cacheErr) {
        console.warn('⚠️ IndexedDB load failed:', cacheErr.message);
      }

      // ✅ STRATEGY 2: Fallback to API if cache miss
      if (!subscriptionData) {
        try {
          console.log('📡 Fallback: Fetching subscription from API...');
          const response = await api.get('/subscription', {
            params: { rider_id: localRiderId }
          });

          if (response?.data?.subscription) {
            subscriptionData = response.data.subscription;

            // ✅ Cache to IndexedDB for offline access
            await indexedDbAdapter.kvSet(
              `subscription_${localRiderId}`,
              JSON.stringify({
                data: subscriptionData,
                cached_at: new Date().toISOString()
              })
            );

            setIsOffline(false);
            console.log('✅ Subscription loaded from API and cached');
          }
        } catch (apiErr) {
          console.warn('⚠️ API fetch failed:', apiErr.message);
          setIsOffline(true);
        }
      }

      // Set state only if component is still mounted
      if (isMountedRef.current) {
        if (subscriptionData) {
          setSubscription(subscriptionData);
          lastFetchRef.current = Date.now();
        } else {
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
  }, [localRiderId]); // ✅ Only depends on localRiderId

  // ========================================================================
  // EFFECTS & LIFECYCLE
  // ========================================================================

  // ✅ Initialize mount/unmount state
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // ✅ Reset loaded flag when rider ID changes
  useEffect(() => {
    hasLoadedRef.current = false;
  }, [localRiderId]);

  // ✅ Load on screen focus (avoid infinite loops)
  useFocusEffect(
    useCallback(() => {
      if (!hasLoadedRef.current && localRiderId) {
        console.log('📌 Screen focused, loading subscription...');
        hasLoadedRef.current = true;
        loadSubscription();
      }

      return () => {
        // Keep loaded state on unfocus
      };
    }, [loadSubscription, localRiderId])
  );

  // ✅ Refresh handler
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadSubscription();
    setRefreshing(false);
  }, [loadSubscription]);

  // ========================================================================
  // HANDLE ACTIONS
  // ========================================================================

  const handleRenew = () => {
    navigation.navigate('FrequencySelectScreen');
  };

  const handlePrepay = () => {
    if (subscription) {
      navigation.navigate('PrepayScreen', {
        currentExpiryAt: subscription.expiry_at,
        dailyPrice: subscription.daily_price || 34.5
      });
    }
  };

  const handlePaymentHistory = () => {
    navigation.navigate('PaymentHistoryScreen');
  };

  // ========================================================================
  // RENDER
  // ========================================================================

  // Loading state
  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#ff7a1a" />
        <Text style={styles.loadingText}>{t('common.loading')}</Text>
      </View>
    );
  }

  // Error state
  if (error || !subscription) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>
          {t(`common.${error || 'error_loading'}`)}
        </Text>
        <TouchableOpacity
          style={styles.retryButton}
          onPress={() => {
            hasLoadedRef.current = false;
            loadSubscription();
          }}
        >
          <Text style={styles.retryButtonText}>{t('common.retry')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Main UI
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
      {/* OFFLINE BANNER */}
      {isOffline && (
        <View style={styles.offlineBanner}>
          <Text style={styles.offlineBannerText}>
            ⚠️ {t('common.offline_mode')}
          </Text>
        </View>
      )}

      {/* STATUS CARD */}
      <View style={styles.statusCard}>
        <View style={styles.statusHeader}>
          <Text style={styles.statusTitle}>
            {t('subscription.current_status')}
          </Text>
          <View
            style={[
              styles.statusBadge,
              subscription.locked ? styles.statusBadgeLocked : styles.statusBadgeActive
            ]}
          >
            <Text style={styles.statusBadgeText}>
              {subscription.locked
                ? t('subscription.locked')
                : t('subscription.active')}
            </Text>
          </View>
        </View>

        <View style={styles.statusDetails}>
          <View style={styles.statusItem}>
            <Text style={styles.statusLabel}>
              {t('subscription.days_left')}
            </Text>
            <Text style={styles.statusValue}>
              {subscription.days_left || 0}
            </Text>
          </View>

          <View style={styles.statusItem}>
            <Text style={styles.statusLabel}>
              {t('subscription.expiry_date')}
            </Text>
            <Text style={styles.statusValue}>
              {new Date(subscription.expiry_at).toLocaleDateString('en-KE')}
            </Text>
          </View>

          <View style={styles.statusItem}>
            <Text style={styles.statusLabel}>
              {t('subscription.plan')}
            </Text>
            <Text style={styles.statusValue}>
              {subscription.frequency === 'biweekly'
                ? t('subscription.biweekly_plan')
                : t('subscription.monthly_plan')}
            </Text>
          </View>
        </View>
      </View>

      {/* WARNING BANNER - Last 2 days */}
      {subscription.days_left <= 2 && !subscription.locked && (
        <View style={styles.warningBanner}>
          <Text style={styles.warningIcon}>⏰</Text>
          <View style={styles.warningContent}>
            <Text style={styles.warningTitle}>
              {subscription.days_left === 0
                ? t('subscription.expiring_today')
                : t('subscription.expiring_soon')}
            </Text>
            <Text style={styles.warningMessage}>
              {t('subscription.renew_now_to_avoid_lockout')}
            </Text>
          </View>
        </View>
      )}

      {/* LOCKED BANNER */}
      {subscription.locked && (
        <View style={styles.lockedBanner}>
          <Text style={styles.lockedIcon}>🔒</Text>
          <View style={styles.lockedContent}>
            <Text style={styles.lockedTitle}>
              {t('subscription.subscription_locked')}
            </Text>
            <Text style={styles.lockedMessage}>
              {t('subscription.renew_subscription_to_continue')}
            </Text>
          </View>
        </View>
      )}

      {/* ACTIONS CONTAINER */}
      <View style={styles.actionsContainer}>
        {/* Renew / Unlock Button */}
        <TouchableOpacity
          style={styles.buttonPrimary}
          onPress={handleRenew}
        >
          <Text style={styles.buttonText}>
            {subscription.locked ? t('subscription.unlock_now') : t('subscription.renew_subscription')} →
          </Text>
        </TouchableOpacity>

        {/* Prepay Button */}
        {!subscription.locked && (
          <TouchableOpacity
            style={styles.buttonSecondary}
            onPress={handlePrepay}
          >
            <Text style={styles.buttonSecondaryText}>
              {t('subscription.pay_ahead')} →
            </Text>
          </TouchableOpacity>
        )}

        {/* Payment History Button */}
        <TouchableOpacity
          style={styles.buttonGhost}
          onPress={handlePaymentHistory}
        >
          <Text style={styles.buttonGhostText}>
            {t('subscription.view_payment_history')} →
          </Text>
        </TouchableOpacity>
      </View>

      {/* PRICING SECTION */}
      <View style={styles.pricingSection}>
        <Text style={styles.pricingTitle}>
          {t('subscription.available_plans')}
        </Text>

        <View style={styles.planCard}>
          <View style={styles.planHeader}>
            <Text style={styles.planName}>📆 {t('subscription.biweekly_plan')}</Text>
            <Text style={styles.planPrice}>KES 500</Text>
          </View>
          <Text style={styles.planDetails}>
            {t('subscription.biweekly_description')}
          </Text>
        </View>

        <View style={styles.planCard}>
          <View style={styles.planHeader}>
            <Text style={styles.planName}>📆 {t('subscription.monthly_plan')}</Text>
            <Text style={styles.planPrice}>KES 1,000</Text>
          </View>
          <Text style={styles.planDetails}>
            {t('subscription.monthly_description')}
          </Text>
        </View>
      </View>

      {/* INFO BANNER */}
      <View style={styles.infoBanner}>
        <Text style={styles.infoIcon}>ℹ️</Text>
        <Text style={styles.infoText}>
          {t('subscription.payment_via_mpesa')}
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
    backgroundColor: '#f6f4ef'
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f6f4ef',
    paddingHorizontal: 20
  },
  loadingText: {
    fontSize: 14,
    color: '#5b606c',
    marginTop: 12
  },
  errorText: {
    fontSize: 14,
    color: '#a5312c',
    textAlign: 'center',
    marginBottom: 20
  },
  retryButton: {
    backgroundColor: '#ff7a1a',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8
  },
  retryButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14
  },

  offlineBanner: {
    backgroundColor: '#fff3e0',
    borderBottomWidth: 1,
    borderBottomColor: '#ff9800',
    paddingVertical: 12,
    paddingHorizontal: 16
  },
  offlineBannerText: {
    fontSize: 13,
    color: '#e65100',
    fontWeight: '600'
  },

  statusCard: {
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e7e4db'
  },
  statusHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16
  },
  statusTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1a1c20'
  },
  statusBadge: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 16
  },
  statusBadgeActive: {
    backgroundColor: '#e8f5e9'
  },
  statusBadgeLocked: {
    backgroundColor: '#fdecea'
  },
  statusBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1a1c20'
  },

  statusDetails: {
    gap: 12
  },
  statusItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8
  },
  statusLabel: {
    fontSize: 13,
    color: '#5b606c',
    fontWeight: '500'
  },
  statusValue: {
    fontSize: 13,
    color: '#1a1c20',
    fontWeight: '700'
  },

  warningBanner: {
    backgroundColor: '#fff3e0',
    borderLeftWidth: 4,
    borderLeftColor: '#ff9800',
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 8,
    padding: 12,
    flexDirection: 'row',
    gap: 12
  },
  warningIcon: {
    fontSize: 20
  },
  warningContent: {
    flex: 1
  },
  warningTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#e65100',
    marginBottom: 2
  },
  warningMessage: {
    fontSize: 12,
    color: '#bf360c',
    lineHeight: 16
  },

  lockedBanner: {
    backgroundColor: '#fdecea',
    borderLeftWidth: 4,
    borderLeftColor: '#ef5350',
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 8,
    padding: 12,
    flexDirection: 'row',
    gap: 12
  },
  lockedIcon: {
    fontSize: 20
  },
  lockedContent: {
    flex: 1
  },
  lockedTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#c62828',
    marginBottom: 2
  },
  lockedMessage: {
    fontSize: 12,
    color: '#b71c1c',
    lineHeight: 16
  },

  actionsContainer: {
    marginHorizontal: 16,
    marginTop: 20,
    gap: 12
  },
  buttonPrimary: {
    backgroundColor: '#ff7a1a',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    shadowColor: '#ff7a1a',
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4
  },
  buttonSecondary: {
    backgroundColor: '#fff',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#ff7a1a'
  },
  buttonGhost: {
    paddingVertical: 12,
    alignItems: 'center'
  },
  buttonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700'
  },
  buttonSecondaryText: {
    color: '#ff7a1a',
    fontSize: 15,
    fontWeight: '700'
  },
  buttonGhostText: {
    color: '#ff7a1a',
    fontSize: 15,
    fontWeight: '600'
  },

  pricingSection: {
    marginHorizontal: 16,
    marginTop: 24,
    marginBottom: 12
  },
  pricingTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1a1c20',
    marginBottom: 12
  },
  planCard: {
    backgroundColor: '#fff8f0',
    borderWidth: 1.5,
    borderColor: '#ffb366',
    borderRadius: 8,
    padding: 12,
    marginBottom: 10
  },
  planHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8
  },
  planName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1a1c20'
  },
  planPrice: {
    fontSize: 15,
    fontWeight: '700',
    color: '#ff7a1a'
  },
  planDetails: {
    fontSize: 12,
    color: '#5b606c'
  },

  infoBanner: {
    backgroundColor: '#e3f2fd',
    borderLeftWidth: 4,
    borderLeftColor: '#1976d2',
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 24,
    borderRadius: 8,
    padding: 12,
    flexDirection: 'row',
    gap: 10
  },
  infoIcon: {
    fontSize: 16
  },
  infoText: {
    flex: 1,
    fontSize: 12,
    color: '#1a1c20',
    lineHeight: 16
  }
});

export default SubscriptionScreen;