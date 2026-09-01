// rider-app/src/screens/lipaLater/PaymentSummaryScreen.js
// ✅ UPDATED: IndexedDB offline-first architecture for payment summary
// - Loads customer and payment history from IndexedDB cache
// - Displays transaction summary with real-time balance calculation
// - Network-aware with graceful fallback to cached data
// - UI/UX preserved exactly as original

import React, { useState, useEffect } from 'react';
import { 
  ScrollView, View, Text, TouchableOpacity, StyleSheet, ActivityIndicator 
} from 'react-native';
import BackLink from '../../components/BackLink';
import { useRider } from '../../rider/RiderContext';
import { useTranslation } from '../../i18n/LocalizationProvider';
import { getLocalRiderId } from '../../offline/db';
import { useNetworkStatus, useCriticalError } from '../../hooks/useNetworkStatus';
import {
  loadCustomerPaymentHistory,
  getPendingLipaLaterCustomers,
} from '../../offline/lipaLaterUtils';

export default function PaymentSummaryScreen({ route, navigation }) {
  const { customerId, customerData } = route.params || {};
  const { state } = useRider();
  const { t } = useTranslation();
  const [localRiderId, setLocalRiderId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [paymentHistory, setPaymentHistory] = useState([]);
  const [customer, setCustomer] = useState(customerData);

  const { isConnected, isInitialized } = useNetworkStatus();
  const { error: criticalError, showError: showCriticalError, clearError: clearCriticalError } = useCriticalError();

  // ✅ LOAD RIDER ID ON MOUNT
  useEffect(() => {
    const loadRiderId = async () => {
      try {
        const id = await getLocalRiderId();
        if (id) {
          setLocalRiderId(id);
          console.log('✅ PaymentSummary: Loaded rider ID:', id);
        }
      } catch (err) {
        console.error('❌ Error loading rider ID:', err);
      }
    };
    loadRiderId();
  }, []);

  const effectiveRiderId = localRiderId || state?.riderId;

  // ✅ LOAD PAYMENT HISTORY FROM CACHE
  useEffect(() => {
    if (!customerId || !isInitialized) {
      return;
    }

    let isMounted = true;

    const loadData = async () => {
      try {
        setLoading(true);

        // Load payment history from cache
        const history = await loadCustomerPaymentHistory(customerId);
        
        if (isMounted) {
          setPaymentHistory(history || []);
          console.log('✅ Loaded payment history from cache:', history?.length || 0, 'payments');
        }

        // Load customer data if we need to refresh
        if (effectiveRiderId && isMounted) {
          const customers = await getPendingLipaLaterCustomers(effectiveRiderId);
          const foundCustomer = customers.find(c => c.customerId === customerId);
          if (foundCustomer && isMounted) {
            setCustomer(foundCustomer);
          }
        }
      } catch (err) {
        console.error('❌ Error loading payment summary:', err);
        if (isMounted) {
          showCriticalError(
            t('error_loadSummaryFailed') || 'Unable to load payment summary.',
            'data_load'
          );
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    loadData();

    return () => {
      isMounted = false;
    };
  }, [customerId, effectiveRiderId, isInitialized, showCriticalError, t]);

  // Calculate totals
  const totalPaid = paymentHistory.reduce((s, p) => s + (p.amount || 0), 0);
  const outstanding = (customer?.totalOutstanding || 0);
  const originalAmount = (customer?.totalOutstanding || 0) + totalPaid;
  const paymentPercentage = originalAmount > 0 ? Math.round((totalPaid / originalAmount) * 100) : 0;

  const handleRecordAnotherPayment = () => {
    clearCriticalError();
    navigation.navigate('RecordPayment', { customerId, customerData: customer });
  };

  const handleViewCustomers = () => {
    clearCriticalError();
    navigation.navigate('LipaLaterCustomers');
  };

  const handleGoHome = () => {
    clearCriticalError();
    navigation.navigate('Home');
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '—';
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  if (!isInitialized || loading) {
    return (
      <ScrollView style={styles.container}>
        <BackLink onPress={handleGoHome} label={t('backLabel') || '← Home'} />
        <Text style={styles.title}>Payment Summary</Text>
        <ActivityIndicator size="large" color="#ffc107" style={{ marginTop: 40 }} />
      </ScrollView>
    );
  }

  const isFullySettled = outstanding === 0 || outstanding < 1;

  return (
    <ScrollView style={styles.container}>
      <BackLink onPress={handleGoHome} label={t('backLabel') || '← Home'} />
      <Text style={styles.title}>Payment Summary</Text>

      {criticalError && (
        <View style={styles.criticalErrorBanner}>
          <Text style={styles.criticalErrorText}>{criticalError}</Text>
          <TouchableOpacity onPress={clearCriticalError}>
            <Text style={styles.dismissText}>{t('dismiss') || 'Dismiss'}</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Customer Info */}
      {customer && (
        <View style={styles.customerBanner}>
          <Text style={styles.customerName}>{customer.customerName}</Text>
          <Text style={styles.customerPhone}>📞 {customer.customerPhone}</Text>
        </View>
      )}

      {/* Settlement Status */}
      {isFullySettled ? (
        <View style={styles.settledBanner}>
          <Text style={styles.settledTitle}>✅ ACCOUNT SETTLED</Text>
          <Text style={styles.settledText}>All payments received. Thank you!</Text>
        </View>
      ) : (
        <View style={styles.pendingBanner}>
          <Text style={styles.pendingTitle}>⏳ PAYMENT PENDING</Text>
          <Text style={styles.pendingAmount}>
            KSh {outstanding.toLocaleString()} outstanding
          </Text>
        </View>
      )}

      {/* Summary Grid */}
      <View style={styles.summaryGrid}>
        <View style={styles.summaryBox}>
          <Text style={styles.summaryLabel}>Original Amount</Text>
          <Text style={styles.summaryValue}>KSh {originalAmount.toLocaleString()}</Text>
        </View>
        <View style={styles.summaryBox}>
          <Text style={styles.summaryLabel}>Paid So Far</Text>
          <Text style={[styles.summaryValue, { color: '#1e9e6f' }]}>
            KSh {totalPaid.toLocaleString()}
          </Text>
        </View>
        <View style={styles.summaryBox}>
          <Text style={styles.summaryLabel}>Still Owing</Text>
          <Text style={[
            styles.summaryValue, 
            { color: outstanding > 0 ? '#ff7a1a' : '#1e9e6f' }
          ]}>
            KSh {Math.max(0, outstanding).toLocaleString()}
          </Text>
        </View>
      </View>

      {/* Progress Bar */}
      {originalAmount > 0 && (
        <View style={styles.progressContainer}>
          <View style={styles.progressBarBackground}>
            <View
              style={[
                styles.progressBarFill,
                { width: `${paymentPercentage}%` }
              ]}
            />
          </View>
          <Text style={styles.progressText}>{paymentPercentage}% Paid</Text>
        </View>
      )}

      {/* Payment History */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Payment History</Text>
        
        {paymentHistory && paymentHistory.length > 0 ? (
          <View style={styles.historyContainer}>
            {paymentHistory.map((payment, idx) => (
              <View key={idx} style={styles.historyItem}>
                <View style={styles.historyItemLeft}>
                  <Text style={styles.historyMethod}>{payment.paymentMethod || 'Payment'}</Text>
                  <Text style={styles.historyDate}>{formatDate(payment.date)}</Text>
                </View>
                <View style={styles.historyItemRight}>
                  <Text style={styles.historyAmount}>
                    +KSh {(payment.amount || 0).toLocaleString()}
                  </Text>
                  <Text style={styles.historyStatus}>✓ {payment.status || 'Completed'}</Text>
                </View>
              </View>
            ))}
          </View>
        ) : (
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateText}>No payments recorded yet.</Text>
          </View>
        )}
      </View>

      {/* Action Buttons */}
      <View style={styles.buttonContainer}>
        {!isFullySettled && (
          <TouchableOpacity 
            style={styles.primaryButton}
            onPress={handleRecordAnotherPayment}
            activeOpacity={0.8}
          >
            <Text style={styles.primaryButtonText}>
              💳 Record Another Payment
            </Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity 
          style={[styles.secondaryButton, isFullySettled && styles.secondaryButtonWide]}
          onPress={handleViewCustomers}
          activeOpacity={0.8}
        >
          <Text style={styles.secondaryButtonText}>
            👥 View All Customers
          </Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={[styles.secondaryButton, isFullySettled && styles.secondaryButtonWide]}
          onPress={handleGoHome}
          activeOpacity={0.8}
        >
          <Text style={styles.secondaryButtonText}>
            🏠 Home
          </Text>
        </TouchableOpacity>
      </View>

      {/* Offline Indicator */}
      {!isConnected && (
        <View style={styles.offlineBanner}>
          <Text style={styles.offlineText}>
            📱 Offline: Changes will sync when connection is restored.
          </Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    padding: 20, 
    backgroundColor: '#f6f4ef' 
  },
  title: { 
    fontFamily: 'SpaceGrotesk-Bold', 
    fontSize: 22, 
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

  customerBanner: {
    backgroundColor: '#e8f5e9',
    borderLeftWidth: 4,
    borderLeftColor: '#1e9e6f',
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
  },
  customerName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1a1c20',
    marginBottom: 4,
  },
  customerPhone: {
    fontSize: 12,
    color: '#5b606c',
  },

  settledBanner: {
    backgroundColor: 'rgba(30,158,111,.1)',
    borderLeftWidth: 4,
    borderLeftColor: '#1e9e6f',
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
  },
  settledTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1e9e6f',
    marginBottom: 4,
  },
  settledText: {
    fontSize: 12,
    color: '#5b606c',
  },

  pendingBanner: {
    backgroundColor: 'rgba(255,122,26,.1)',
    borderLeftWidth: 4,
    borderLeftColor: '#ff7a1a',
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
  },
  pendingTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#ff7a1a',
    marginBottom: 4,
  },
  pendingAmount: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1a1c20',
  },

  summaryGrid: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  summaryBox: {
    flex: 1,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e7e4db',
    borderRadius: 10,
    padding: 12,
    alignItems: 'center',
  },
  summaryLabel: {
    fontSize: 10,
    color: '#5b606c',
    fontWeight: '700',
    marginBottom: 6,
  },
  summaryValue: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1a1c20',
    textAlign: 'center',
  },

  progressContainer: {
    marginBottom: 20,
  },
  progressBarBackground: {
    backgroundColor: '#e7e4db',
    borderRadius: 10,
    height: 12,
    marginBottom: 8,
    overflow: 'hidden',
  },
  progressBarFill: {
    backgroundColor: '#1e9e6f',
    height: '100%',
  },
  progressText: {
    fontSize: 11,
    color: '#5b606c',
    fontWeight: '600',
  },

  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1a1c20',
    marginBottom: 12,
  },

  historyContainer: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e7e4db',
    borderRadius: 10,
    overflow: 'hidden',
  },
  historyItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  historyItemLeft: {
    flex: 1,
  },
  historyMethod: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1a1c20',
    marginBottom: 4,
  },
  historyDate: {
    fontSize: 10,
    color: '#5b606c',
  },
  historyItemRight: {
    alignItems: 'flex-end',
  },
  historyAmount: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1e9e6f',
    marginBottom: 4,
  },
  historyStatus: {
    fontSize: 10,
    color: '#1e9e6f',
    fontWeight: '600',
  },

  emptyState: {
    backgroundColor: '#f9f9f9',
    borderRadius: 10,
    padding: 20,
    alignItems: 'center',
  },
  emptyStateText: {
    fontSize: 12,
    color: '#5b606c',
    textAlign: 'center',
  },

  buttonContainer: {
    gap: 12,
    marginBottom: 20,
  },
  primaryButton: {
    backgroundColor: '#ffc107',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1a1c20',
  },

  secondaryButton: {
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: '#ff7a1a',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  secondaryButtonWide: {
    flex: 1,
  },
  secondaryButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#ff7a1a',
  },

  offlineBanner: {
    backgroundColor: '#fff3e0',
    borderLeftWidth: 4,
    borderLeftColor: '#ff7a1a',
    borderRadius: 10,
    padding: 12,
    marginBottom: 20,
  },
  offlineText: {
    fontSize: 11,
    color: '#e65100',
    fontWeight: '500',
  },
});