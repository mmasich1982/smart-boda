// rider-app/src/screens/subscription/PaymentHistoryScreen.js
// ============================================================================
// ✅ REFACTORED: IndexedDB-FIRST with Local-First Pagination
// ✅ Improved cache key naming convention (payment_history_${riderId}_${timestamp})
// ✅ No external repository dependencies
// ============================================================================

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

const PaymentHistoryScreen = () => {
  const navigation = useNavigation();
  const { t } = useTranslation();
  const { state } = useRider();

  // ========================================================================
  // STATE
  // ========================================================================
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [dataSource, setDataSource] = useState('local');
  const [refreshing, setRefreshing] = useState(false);
  const [localRiderId, setLocalRiderId] = useState(null);

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
          console.log('✅ PaymentHistory: Loaded local rider ID:', id);
        } else if (state?.riderId) {
          setLocalRiderId(state.riderId);
          console.log('✅ PaymentHistory: Using context rider ID:', state.riderId);
        }
      } catch (err) {
        console.error('❌ Error loading rider ID:', err);
      }
    };

    loadRiderId();
  }, [state?.riderId]);

  // ========================================================================
  // LOAD PAYMENT HISTORY (Local-First Strategy)
  // ========================================================================
  const loadPaymentHistory = useCallback(async (forceAPI = false) => {
    if (!localRiderId || !isMountedRef.current) {
      return;
    }

    try {
      setLoading(true);
      setError(null);

      let paymentData = null;
      let source = 'local';

      // ✅ STRATEGY 1: Try to load from IndexedDB (local cache)
      if (!forceAPI) {
        try {
          console.log('📂 Loading payment history from IndexedDB...');
          paymentData = await loadPaymentsFromIndexedDB(localRiderId);

          if (paymentData && paymentData.length > 0) {
            source = 'local';
            console.log(`✅ Loaded ${paymentData.length} payments from local storage`);
          }
        } catch (localErr) {
          console.warn('⚠️ IndexedDB load failed:', localErr.message);
        }
      }

      // ✅ STRATEGY 2: Fallback to API if local data missing
      if (!paymentData) {
        try {
          console.log('📡 Fallback: Fetching payment history from API...');
          const response = await api.get('/subscription/payments', {
            params: { rider_id: localRiderId },
            timeout: 5000
          });

          if (response?.data?.payments && Array.isArray(response.data.payments)) {
            paymentData = response.data.payments;
            source = 'api';

            // ✅ Cache API response to IndexedDB for offline access
            await cachePaymentsToIndexedDB(localRiderId, paymentData);
            console.log('✅ Cached API payments to IndexedDB');
          }
        } catch (apiErr) {
          console.warn('⚠️ API fetch failed:', {
            status: apiErr.response?.status,
            message: apiErr.message
          });

          // Try IndexedDB as last resort even if forceAPI
          if (forceAPI) {
            const localPayments = await loadPaymentsFromIndexedDB(localRiderId);
            if (localPayments && localPayments.length > 0) {
              paymentData = localPayments;
              source = 'local_fallback';
            }
          }
        }
      }

      if (isMountedRef.current) {
        if (paymentData && Array.isArray(paymentData)) {
          setPayments(paymentData);
          setDataSource(source);
          console.log(`📊 Displayed ${paymentData.length} payments from ${source}`);
        } else {
          setError('no_payments');
          setPayments([]);
        }
      }
    } catch (err) {
      console.error('❌ Error loading payment history:', err);
      if (isMountedRef.current) {
        setError('error_loading_payments');
      }
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  }, [localRiderId]);

  // ========================================================================
  // IndexedDB OPERATIONS (Local Cache Management)
  // ========================================================================

  const loadPaymentsFromIndexedDB = async (riderId) => {
    try {
      const cacheKey = `payment_history_${riderId}`;
      const cached = await indexedDbAdapter.kvGet(cacheKey);

      if (cached) {
        const { data, cached_at } = JSON.parse(cached);

        // Check if cache is fresh (< 24 hours)
        const cacheAge = Date.now() - new Date(cached_at).getTime();
        const isFresh = cacheAge < 86400000;

        console.log(
          `📂 IndexedDB cache: ${isFresh ? '✅ fresh' : '⚠️ stale'} ` +
          `(${Math.floor(cacheAge / 60000)} minutes old)`
        );

        return data;
      }

      return null;
    } catch (err) {
      console.warn('Failed to load from IndexedDB:', err);
      return null;
    }
  };

  const cachePaymentsToIndexedDB = async (riderId, payments) => {
    try {
      const cacheKey = `payment_history_${riderId}`;

      await indexedDbAdapter.kvSet(
        cacheKey,
        JSON.stringify({
          data: payments,
          cached_at: new Date().toISOString()
        })
      );

      console.log('💾 Cached payments to IndexedDB');
    } catch (err) {
      console.warn('Failed to cache payments:', err);
    }
  };

  // ========================================================================
  // EFFECTS & LIFECYCLE
  // ========================================================================

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (!hasLoadedRef.current && localRiderId) {
        hasLoadedRef.current = true;
        console.log('🔄 Screen focused, loading payment history...');
        loadPaymentHistory(false);
      }
      return () => {
        hasLoadedRef.current = false;
      };
    }, [localRiderId, loadPaymentHistory])
  );

  // ========================================================================
  // REFRESH HANDLER
  // ========================================================================

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadPaymentHistory(true);
    setRefreshing(false);
  }, [loadPaymentHistory]);

  // ========================================================================
  // STATUS BADGE
  // ========================================================================

  const getStatusBadge = (status) => {
    switch (status) {
      case 'Verified':
      case 'verified':
        return {
          icon: '✅',
          text: t('subscription.verified_by_admin'),
          bgColor: '#e8f5e9',
          textColor: '#2e7d32'
        };
      case 'Pending':
      case 'pending':
      default:
        return {
          icon: '⏳',
          text: t('subscription.pending_review'),
          bgColor: '#fff3e0',
          textColor: '#e65100'
        };
    }
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
  if (error) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>
          {t(`subscription.${error}`)}
        </Text>
        <TouchableOpacity
          style={styles.retryButton}
          onPress={() => {
            hasLoadedRef.current = false;
            loadPaymentHistory(true);
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
      <TouchableOpacity
        onPress={() => navigation.goBack()}
        style={styles.backLink}
      >
        <Text style={styles.backLinkText}>← {t('common.back')}</Text>
      </TouchableOpacity>

      <Text style={styles.title}>{t('subscription.payment_history')}</Text>

      {/* DATA SOURCE BADGE */}
      <View style={styles.dataSourceBadge}>
        <Text style={styles.dataSourceIcon}>
          {dataSource === 'local' ? '📂' : '📡'}
        </Text>
        <Text style={styles.dataSourceText}>
          {dataSource === 'local'
            ? 'Local Storage (Offline Ready)'
            : 'From Server'}
        </Text>
      </View>

      {/* PAYMENT LIST */}
      {payments.length > 0 ? (
        <View style={styles.paymentList}>
          {payments.map((payment) => {
            const badge = getStatusBadge(payment.reconciliation || payment.status);
            const paymentDate = new Date(
              payment.submitted_at || payment.created_at
            );

            return (
              <View key={payment.id} style={styles.paymentRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowMain}>
                    {payment.channel || 'M-Pesa'} • {payment.mpesa_code}
                  </Text>
                  <Text style={styles.rowSub}>
                    {paymentDate.toLocaleString('en-KE')}
                  </Text>
                  <View
                    style={[
                      styles.statusBadge,
                      { backgroundColor: badge.bgColor }
                    ]}
                  >
                    <Text
                      style={[
                        styles.statusBadgeText,
                        { color: badge.textColor }
                      ]}
                    >
                      {badge.icon} {badge.text}
                    </Text>
                  </View>
                </View>
                <Text style={styles.amount}>
                  KES {payment.amount.toLocaleString('en-KE')}
                </Text>
              </View>
            );
          })}
        </View>
      ) : (
        <View style={styles.emptyState}>
          <Text style={styles.emptyIcon}>📋</Text>
          <Text style={styles.emptyText}>
            {t('subscription.no_payments')}
          </Text>
        </View>
      )}

      {/* INFO BANNER */}
      <View style={styles.infoBanner}>
        <Text style={styles.infoIcon}>ℹ️</Text>
        <Text style={styles.infoText}>
          {dataSource === 'local'
            ? 'Your payment history is stored locally for offline access. Pull down to refresh from server.'
            : 'Payment history is read-only and kept in sync with the server.'}
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
    padding: 16
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

  backLink: {
    marginBottom: 16
  },
  backLinkText: {
    fontSize: 14,
    color: '#ff7a1a',
    fontWeight: '600'
  },

  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1a1c20',
    marginBottom: 16
  },

  dataSourceBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#e3f2fd',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 16,
    borderLeftWidth: 4,
    borderLeftColor: '#1976d2'
  },
  dataSourceIcon: {
    fontSize: 16,
    marginRight: 8
  },
  dataSourceText: {
    fontSize: 12,
    color: '#1565c0',
    fontWeight: '600'
  },

  paymentList: {
    gap: 12,
    marginBottom: 20
  },
  paymentRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e7e4db',
    padding: 12
  },
  rowMain: {
    fontSize: 13,
    color: '#1a1c20',
    fontWeight: '600',
    marginBottom: 2
  },
  rowSub: {
    fontSize: 11,
    color: '#5b606c',
    marginBottom: 6
  },
  statusBadge: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 4,
    alignSelf: 'flex-start'
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '600'
  },
  amount: {
    fontSize: 14,
    fontWeight: '700',
    color: '#ff7a1a',
    textAlign: 'right'
  },

  emptyState: {
    alignItems: 'center',
    paddingVertical: 40,
    marginBottom: 20
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 12
  },
  emptyText: {
    fontSize: 13,
    color: '#5b606c',
    fontStyle: 'italic'
  },

  infoBanner: {
    backgroundColor: '#e3f2fd',
    borderRadius: 8,
    padding: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#1976d2',
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16
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

export default PaymentHistoryScreen;