// rider-app/src/screens/subscription/SubscriptionScreen.js
// ============================================================================
// ✅ COMPREHENSIVE FIX: Error logging, API response validation, timeout handling
// ============================================================================
// FIXES:
// 1. Added detailed error logging to diagnose API failures
// 2. Better API response validation (checks for nested subscription data)
// 3. Added request timeout to prevent infinite loading
// 4. Improved offline fallback logic
// 5. Better state synchronization with rider context changes
// ============================================================================

import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Alert
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useTranslation } from '../../i18n/LocalizationProvider';
import { useRider } from '../../rider/RiderContext';
import indexedDbAdapter from '../../offline/adapters/indexedDbAdapter';
import api from '../../api/client';

const REQUEST_TIMEOUT_MS = 10000; // 10 second timeout

export const SubscriptionScreen = () => {
  const navigation = useNavigation();
  const { t } = useTranslation();
  const { state } = useRider();
  const riderId = state?.riderId;

  // ========================================================================
  // STATE
  // ========================================================================
  const [subscription, setSubscription] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [isOffline, setIsOffline] = useState(false);
  const [error, setError] = useState(null);

  // ========================================================================
  // CONTROL MECHANISMS
  // ========================================================================
  const hasLoadedRef = useRef(false);
  const isMountedRef = useRef(true);
  const lastFetchRef = useRef(0);
  const riderIdRef = useRef(riderId);
  const abortControllerRef = useRef(null);
  
  // Update rider ID ref when it changes
  useEffect(() => {
    riderIdRef.current = riderId;
  }, [riderId]);

  // ========================================================================
  // LOAD SUBSCRIPTION DATA
  // ========================================================================
  const loadSubscription = useCallback(async () => {
    // ✅ CRITICAL FIX: Check if component is mounted and riderId exists
    if (!riderIdRef.current) {
      console.warn('⚠️ SubscriptionScreen: riderId is not available in RiderContext');
      if (isMountedRef.current) {
        setError('no_rider_id');
        setLoading(false);
      }
      return;
    }

    if (!isMountedRef.current) {
      console.log('⚠️ SubscriptionScreen: Component unmounted, skipping load');
      return;
    }

    // Cancel previous request if still pending
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    try {
      setLoading(true);
      setError(null);

      let subscriptionData = null;

      // Try API first
      try {
        console.log('📡 SubscriptionScreen: Fetching subscription from API for rider:', riderIdRef.current);
        
        const controller = abortControllerRef.current;
        const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

        const response = await api.get('/subscription', {
          params: { rider_id: riderIdRef.current },
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        console.log('✅ SubscriptionScreen: API response received:', response.data);

        // ✅ FIXED: Better API response validation
        // The API returns: { rider_id, subscription: {...}, available_plans, frequencies, metadata }
        if (response?.data) {
          // Try to extract subscription data
          subscriptionData = response.data?.subscription;

          if (!subscriptionData) {
            console.warn('⚠️ SubscriptionScreen: API response missing subscription field');
            console.log('📊 SubscriptionScreen: Full API response structure:', Object.keys(response.data));
          } else {
            console.log('✅ SubscriptionScreen: Extracted subscription data:', subscriptionData);

            // ✅ Cache in IndexedDB
            try {
              await indexedDbAdapter.kvSet(
                `subscription_${riderIdRef.current}`,
                JSON.stringify({
                  data: subscriptionData,
                  cached_at: new Date().toISOString()
                })
              );
              console.log('✅ SubscriptionScreen: Data cached successfully');
            } catch (cacheErr) {
              console.warn('⚠️ SubscriptionScreen: Failed to cache data:', cacheErr.message);
            }

            setIsOffline(false);
          }
        } else {
          console.warn('⚠️ SubscriptionScreen: API response has no data field');
        }
      } catch (apiErr) {
        if (apiErr.name === 'AbortError') {
          console.error('❌ SubscriptionScreen: API request timeout after', REQUEST_TIMEOUT_MS, 'ms');
          if (isMountedRef.current) {
            setError('api_timeout');
          }
        } else {
          console.warn('⚠️ SubscriptionScreen: API fetch failed:', {
            message: apiErr.message,
            status: apiErr.response?.status,
            statusText: apiErr.response?.statusText,
            data: apiErr.response?.data
          });
          if (isMountedRef.current) {
            setIsOffline(true);
          }
        }
      }

      // ✅ IMPROVED: Fallback to cache if API failed
      if (!subscriptionData && isMountedRef.current) {
        try {
          console.log('📂 SubscriptionScreen: Attempting to load from cache');
          const cached = await indexedDbAdapter.kvGet(
            `subscription_${riderIdRef.current}`
          );
          if (cached) {
            const parsedCache = JSON.parse(cached);
            subscriptionData = parsedCache.data;
            console.log('✅ SubscriptionScreen: Loaded from cache:', subscriptionData);
            if (isMountedRef.current) {
              setIsOffline(true);
            }
          } else {
            console.warn('⚠️ SubscriptionScreen: No cached subscription data available');
          }
        } catch (cacheErr) {
          console.error('❌ SubscriptionScreen: Cache load error:', cacheErr.message);
        }
      }

      // Set state only if component is still mounted
      if (isMountedRef.current) {
        if (subscriptionData) {
          console.log('✅ SubscriptionScreen: Setting subscription state');
          setSubscription(subscriptionData);
          lastFetchRef.current = Date.now();
        } else {
          console.error('❌ SubscriptionScreen: No subscription data available from API or cache');
          setError('no_subscription_data');
        }
      }
    } catch (err) {
      console.error('❌ SubscriptionScreen: Unexpected error:', err);
      if (isMountedRef.current) {
        setError('error_loading_subscription');
      }
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  }, []);

  // ========================================================================
  // EFFECTS & LIFECYCLE
  // ========================================================================

  // ✅ Initialize mount/unmount state
  useEffect(() => {
    isMountedRef.current = true;
    console.log('✅ SubscriptionScreen: Component mounted');
    return () => {
      isMountedRef.current = false;
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      console.log('ℹ️ SubscriptionScreen: Component unmounted');
    };
  }, []);

  // ✅ Load on screen focus
  useFocusEffect(
    useCallback(() => {
      console.log('📌 SubscriptionScreen: Screen focused, riderId:', riderIdRef.current);
      
      // Reset and reload if riderId changed
      if (!hasLoadedRef.current && riderIdRef.current) {
        hasLoadedRef.current = true;
        loadSubscription();
      }

      return () => {
        // Allow reload on next focus if rider ID changes
        if (riderIdRef.current !== riderId) {
          hasLoadedRef.current = false;
        }
      };
    }, [riderId, loadSubscription])
  );

  // ✅ Reset loading flag when rider ID changes
  useEffect(() => {
    hasLoadedRef.current = false;
  }, [riderId]);

  // ✅ Refresh handler
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadSubscription();
    setRefreshing(false);
  }, [loadSubscription]);

  // ========================================================================
  // RENDER
  // ========================================================================

  // Loading state
  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#ff7a1a" />
        <Text style={styles.loadingText}>{t('common.loading')}</Text>
        <Text style={styles.debugText}>rider_id: {riderId || 'NOT SET'}</Text>
      </View>
    );
  }

  // Error state
  if (error || !subscription) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>
          {error === 'no_rider_id' 
            ? 'Rider ID not found in context'
            : error === 'api_timeout'
            ? 'Request timed out. Please try again.'
            : t(`common.${error || 'error_loading'}`)}
        </Text>
        <Text style={styles.debugText}>Error: {error}</Text>
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
              {t('subscription.renew_now_to_continue')}
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
              {t('subscription.account_locked')}
            </Text>
            <Text style={styles.lockedMessage}>
              {subscription.lock_reason || t('subscription.subscription_expired')}
            </Text>
          </View>
        </View>
      )}

      {/* ACTIONS */}
      <View style={styles.actionsContainer}>
        {subscription.locked ? (
          <TouchableOpacity
            style={styles.buttonPrimary}
            onPress={() => navigation.navigate('FrequencySelectScreen')}
          >
            <Text style={styles.buttonText}>
              {t('subscription.renew_subscription')} →
            </Text>
          </TouchableOpacity>
        ) : (
          <>
            <TouchableOpacity
              style={styles.buttonPrimary}
              onPress={() => navigation.navigate('FrequencySelectScreen')}
            >
              <Text style={styles.buttonText}>
                {subscription.has_ever_paid
                  ? t('subscription.renew_subscription')
                  : t('subscription.select_plan')} →
              </Text>
            </TouchableOpacity>

            {subscription.has_ever_paid && (
              <TouchableOpacity
                style={styles.buttonSecondary}
                onPress={() => navigation.navigate('PrepayScreen', {
                  currentExpiryAt: subscription.expiry_at,
                  dailyPrice: 34.5
                })}
              >
                <Text style={styles.buttonSecondaryText}>
                  {t('subscription.pay_ahead')} →
                </Text>
              </TouchableOpacity>
            )}

            {subscription.has_ever_paid && (
              <TouchableOpacity
                style={styles.buttonGhost}
                onPress={() => navigation.navigate('PaymentHistoryScreen')}
              >
                <Text style={styles.buttonGhostText}>
                  {t('subscription.payment_history')} →
                </Text>
              </TouchableOpacity>
            )}
          </>
        )}
      </View>

      {/* PRICING SECTION */}
      <View style={styles.pricingSection}>
        <Text style={styles.pricingTitle}>{t('subscription.available_plans')}</Text>
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
  debugText: {
    fontSize: 11,
    color: '#999',
    marginTop: 8,
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
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },

  offlineBanner: {
    backgroundColor: '#fff3e0',
    borderBottomWidth: 1,
    borderBottomColor: '#ff9800',
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  offlineBannerText: {
    fontSize: 13,
    color: '#e65100',
    fontWeight: '600',
  },

  statusCard: {
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e7e4db',
  },
  statusHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  statusTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1a1c20',
  },
  statusBadge: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 16,
  },
  statusBadgeActive: {
    backgroundColor: '#e8f5e9',
  },
  statusBadgeLocked: {
    backgroundColor: '#fdecea',
  },
  statusBadgeText: {
    fontSize: 12,
    fontWeight: '600',
  },

  statusDetails: {
    gap: 12,
  },
  statusItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  statusLabel: {
    fontSize: 13,
    color: '#5b606c',
    fontWeight: '500',
  },
  statusValue: {
    fontSize: 13,
    color: '#1a1c20',
    fontWeight: '700',
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
    gap: 12,
  },
  warningIcon: {
    fontSize: 20,
  },
  warningContent: {
    flex: 1,
  },
  warningTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#e65100',
    marginBottom: 2,
  },
  warningMessage: {
    fontSize: 12,
    color: '#bf360c',
    lineHeight: 16,
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
    gap: 12,
  },
  lockedIcon: {
    fontSize: 20,
  },
  lockedContent: {
    flex: 1,
  },
  lockedTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#c62828',
    marginBottom: 2,
  },
  lockedMessage: {
    fontSize: 12,
    color: '#b71c1c',
    lineHeight: 16,
  },

  actionsContainer: {
    marginHorizontal: 16,
    marginTop: 20,
    gap: 12,
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
    elevation: 4,
  },
  buttonSecondary: {
    backgroundColor: '#fff',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#ff7a1a',
  },
  buttonGhost: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  buttonDisabled: {
    backgroundColor: '#e9dccc',
    opacity: 0.6,
  },
  buttonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  buttonSecondaryText: {
    color: '#ff7a1a',
    fontSize: 15,
    fontWeight: '700',
  },
  buttonGhostText: {
    color: '#ff7a1a',
    fontSize: 15,
    fontWeight: '600',
  },

  pricingSection: {
    marginHorizontal: 16,
    marginTop: 24,
    marginBottom: 12,
  },
  pricingTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1a1c20',
    marginBottom: 12,
  },
  planCard: {
    backgroundColor: '#fff8f0',
    borderWidth: 1.5,
    borderColor: '#ffb366',
    borderRadius: 8,
    padding: 12,
    marginBottom: 10,
  },
  planHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  planName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1a1c20',
  },
  planPrice: {
    fontSize: 15,
    fontWeight: '700',
    color: '#ff7a1a',
  },
  planDetails: {
    fontSize: 12,
    color: '#5b606c',
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
    gap: 10,
  },
  infoIcon: {
    fontSize: 16,
  },
  infoText: {
    flex: 1,
    fontSize: 12,
    color: '#1a1c20',
    lineHeight: 16,
  },
});

export default SubscriptionScreen;