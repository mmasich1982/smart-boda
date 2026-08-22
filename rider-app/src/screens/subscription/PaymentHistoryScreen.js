// rider-app/src/screens/subscription/PaymentHistoryScreen.js
// ✅ OFFLINE FIRST - View all subscription payments
// ✅ INDEXED DB: All data persisted locally with IndexedDB adapter
// ✅ MULTILINGUAL: Full localization support via i18n
// Shows payment history with status and reconciliation info

import React, { useState, useEffect, useContext } from 'react';
import {
  ScrollView,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  FlatList
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import BackLink from '../../components/BackLink';
import { AppContext } from '../../context/AppContext';
import indexedDbAdapter from '../../offline/adapters/indexedDbAdapter';
import { useNetworkStatus, useCriticalError } from '../../hooks/useNetworkStatus';
import { useTranslation } from '../../i18n/LocalizationProvider';
import api from '../../api/client';

const PaymentHistoryScreen = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const { state } = useContext(AppContext);
  const { t } = useTranslation();

  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const { isConnected, isInitialized } = useNetworkStatus();
  const { error: criticalError, showError: showCriticalError, clearError: clearCriticalError } = useCriticalError();

  const riderId = state?.riderId;

  // ========================================================================
  // OFFLINE FIRST: Load payment history from cache, then API
  // ========================================================================

  useEffect(() => {
    if (!riderId || !isInitialized) return;
    loadPaymentHistory();
  }, [riderId, isInitialized]);

  const loadPaymentHistory = async (showLoader = true) => {
    try {
      if (showLoader) setLoading(true);

      // Try API first if online
      if (isConnected && isInitialized) {
        try {
          const response = await api.get('/api/riders/subscription/history', {
            params: { limit: 50 }
          });

          if (response.ok && response.data?.payments) {
            setPayments(response.data.payments);

            // Cache it using IndexedDB
            await indexedDbAdapter.kvSet(
              `payment_history_${riderId}`,
              JSON.stringify(response.data.payments)
            );
            console.log('✅ Loaded payment history from API');
            return;
          }
        } catch (apiErr) {
          console.warn('⚠️ API load failed, using cache');
        }
      }

      // Fallback: Load from cache
      loadPaymentHistoryFromCache();
    } catch (err) {
      console.error('❌ Error loading payment history:', err);
      showCriticalError(t('error_paymentHistoryFailed') || 'Failed to load payment history', 'data_load');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const loadPaymentHistoryFromCache = async () => {
    try {
      const cached = await indexedDbAdapter.kvGet(`payment_history_${riderId}`);
      if (cached) {
        const data = typeof cached === 'string' ? JSON.parse(cached) : cached;
        setPayments(Array.isArray(data) ? data : []);
        console.log('✅ Loaded payment history from cache');
      } else {
        setPayments([]);
      }
    } catch (err) {
      console.error('❌ Cache load error:', err);
      setPayments([]);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadPaymentHistory(false);
  };

  // ========================================================================
  // Format Date
  // ========================================================================

  const formatDate = (dateString) => {
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });
    } catch {
      return dateString;
    }
  };

  // ========================================================================
  // Get Status Badge Color
  // ========================================================================

  const getStatusColor = (status) => {
    switch (status?.toLowerCase()) {
      case 'verified':
      case 'completed':
        return '#4caf50';
      case 'pending':
        return '#ff9800';
      case 'failed':
        return '#f44336';
      default:
        return '#5b606c';
    }
  };

  // ========================================================================
  // Render Payment Item
  // ========================================================================

  const renderPaymentItem = ({ item, index }) => {
    const frequencyLabel = item.frequency === 'biweekly' ? t('biweekly') || 'Bi-Weekly' : t('monthly') || 'Monthly';
    const statusLabel = item.reconciliation || item.status || (t('pending') || 'Pending');
    const statusColor = getStatusColor(statusLabel);

    return (
      <View key={index} style={styles.paymentItem}>
        <View style={styles.paymentRow}>
          <View style={styles.paymentInfo}>
            <Text style={styles.frequencyLabel}>{frequencyLabel} {t('plan') || 'Plan'}</Text>
            <Text style={styles.dateText}>{formatDate(item.created_at)}</Text>
            {item.mpesa_code && (
              <Text style={styles.mpesaCode}>{t('code') || 'Code'}: {item.mpesa_code}</Text>
            )}
          </View>

          <View style={styles.paymentRightContent}>
            <Text style={styles.amountText}>KSh {Math.floor(item.amount)}</Text>
            <View
              style={[
                styles.statusBadge,
                { backgroundColor: `${statusColor}20`, borderColor: statusColor }
              ]}
            >
              <Text style={[styles.statusText, { color: statusColor }]}>
                {statusLabel}
              </Text>
            </View>
          </View>
        </View>
      </View>
    );
  };

  // ========================================================================
  // Render Empty State
  // ========================================================================

  if (!isInitialized) {
    return (
      <ScrollView style={styles.container}>
        <BackLink onPress={() => navigation.goBack()} label={t('backLabel') || '← Back'} />
        <Text style={styles.title}>{t('paymentHistory') || 'Payment History'}</Text>
        <ActivityIndicator size="large" color="#ff7a1a" style={{ marginTop: 40 }} />
      </ScrollView>
    );
  }

  if (loading && payments.length === 0) {
    return (
      <ScrollView style={styles.container}>
        <BackLink onPress={() => navigation.goBack()} label={t('backLabel') || '← Back'} />
        <Text style={styles.title}>{t('paymentHistory') || 'Payment History'}</Text>
        <ActivityIndicator size="large" color="#ff7a1a" style={{ marginTop: 40 }} />
      </ScrollView>
    );
  }

  if (payments.length === 0) {
    return (
      <ScrollView
        style={styles.container}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        <BackLink onPress={() => navigation.goBack()} label={t('backLabel') || '← Back'} />
        <Text style={styles.title}>{t('paymentHistory') || 'Payment History'}</Text>

        <View style={styles.emptyContainer}>
          <Text style={styles.emptyIcon}>💳</Text>
          <Text style={styles.emptyTitle}>{t('noPaymentsYet') || 'No Payments Yet'}</Text>
          <Text style={styles.emptyMessage}>
            {t('noSubscriptionPaymentsYet') || "You haven't made any subscription payments yet."}
          </Text>
          <TouchableOpacity
            style={styles.ctaButton}
            onPress={() => navigation.navigate('Subscription')}
          >
            <Text style={styles.ctaButtonText}>{t('subscribeNow') || 'Subscribe Now →'}</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    );
  }

  // ========================================================================
  // Main Payment History Display
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
      <Text style={styles.title}>{t('paymentHistory') || 'Payment History'}</Text>

      {criticalError && (
        <View style={styles.criticalErrorBanner}>
          <Text style={styles.criticalErrorText}>{criticalError}</Text>
          <TouchableOpacity onPress={clearCriticalError}>
            <Text style={styles.dismissText}>{t('dismiss') || 'Dismiss'}</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* SUMMARY CARD */}
      <View style={styles.summaryCard}>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>{t('totalPayments') || 'Total Payments'}</Text>
          <Text style={styles.summaryValue}>{payments.length}</Text>
        </View>

        {payments.length > 0 && (
          <>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>{t('totalAmountPaid') || 'Total Amount Paid'}</Text>
              <Text style={styles.summaryValue}>
                KSh {payments.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0).toFixed(0)}
              </Text>
            </View>

            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>{t('latestPayment') || 'Latest Payment'}</Text>
              <Text style={styles.summaryValue}>
                {formatDate(payments[0]?.created_at)}
              </Text>
            </View>
          </>
        )}
      </View>

      {/* PAYMENT LIST */}
      <View style={styles.listContainer}>
        <Text style={styles.listTitle}>{t('paymentDetails') || 'Payment Details'}</Text>
        {payments.map((payment, index) => renderPaymentItem({ item: payment, index }))}
      </View>

      {/* INFO SECTION */}
      <View style={styles.infoSection}>
        <Text style={styles.infoTitle}>💡 {t('aboutPayments') || 'About Payments'}</Text>
        <View style={styles.infoCard}>
          <Text style={styles.infoText}>
            <Text style={styles.infoBold}>{t('pending') || 'Pending'}:</Text> {t('paymentPendingDescription') || 'Your M-Pesa payment is awaiting verification by our admin team.'}
          </Text>
        </View>
        <View style={styles.infoCard}>
          <Text style={styles.infoText}>
            <Text style={styles.infoBold}>{t('verified') || 'Verified'}:</Text> {t('paymentVerifiedDescription') || 'Your payment has been confirmed and your subscription is active.'}
          </Text>
        </View>
        <View style={styles.infoCard}>
          <Text style={styles.infoText}>
            <Text style={styles.infoBold}>{t('failed') || 'Failed'}:</Text> {t('paymentFailedDescription') || 'There was an issue with your payment. Please contact support.'}
          </Text>
        </View>
      </View>
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

  summaryCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1.5,
    borderColor: '#e7e4db'
  },

  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10
  },

  summaryLabel: {
    fontSize: 13,
    color: '#5b606c',
    fontWeight: '600',
    textTransform: 'uppercase'
  },

  summaryValue: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1a1c20'
  },

  listContainer: {
    marginBottom: 20
  },

  listTitle: {
    fontFamily: 'SpaceGrotesk-Bold',
    fontSize: 16,
    fontWeight: '700',
    color: '#1a1c20',
    marginBottom: 12
  },

  paymentItem: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1.5,
    borderColor: '#e7e4db'
  },

  paymentRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start'
  },

  paymentInfo: {
    flex: 1
  },

  frequencyLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1a1c20',
    marginBottom: 4
  },

  dateText: {
    fontSize: 12,
    color: '#5b606c',
    marginBottom: 6
  },

  mpesaCode: {
    fontSize: 11,
    color: '#ff7a1a',
    fontWeight: '600',
    fontFamily: 'Courier New'
  },

  paymentRightContent: {
    alignItems: 'flex-end',
    marginLeft: 12
  },

  amountText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1a1c20',
    marginBottom: 6
  },

  statusBadge: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
    borderWidth: 1
  },

  statusText: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'capitalize'
  },

  emptyContainer: {
    alignItems: 'center',
    marginVertical: 80
  },

  emptyIcon: {
    fontSize: 80,
    marginBottom: 20
  },

  emptyTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1a1c20',
    marginBottom: 8
  },

  emptyMessage: {
    fontSize: 14,
    color: '#5b606c',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 20
  },

  ctaButton: {
    backgroundColor: '#ff7a1a',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 24,
    shadowColor: '#ff7a1a',
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6
  },

  ctaButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.02
  },

  infoSection: {
    paddingVertical: 16
  },

  infoTitle: {
    fontFamily: 'SpaceGrotesk-Bold',
    fontSize: 16,
    fontWeight: '700',
    color: '#1a1c20',
    marginBottom: 10
  },

  infoCard: {
    backgroundColor: '#e3f2fd',
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    borderLeftWidth: 4,
    borderLeftColor: '#1976d2'
  },

  infoText: {
    fontSize: 12,
    color: '#1a1c20',
    lineHeight: 16
  },

  infoBold: {
    fontWeight: '700'
  }
});

export default PaymentHistoryScreen;
