// rider-app/src/screens/subscription/PaymentHistoryScreen.js
// ✅ REFACTORED: IndexedDB-FIRST + subscriptionUtils alignment
// ✅ BUSINESS LOGIC: Display payment history, status tracking, never editable
// ✅ UI/UX: Matches index.html design system (trip-row, badges, cards)
// ✅ OFFLINE-FIRST: All data persisted via IndexedDB adapter

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
import api from '../../api/client';

const ITEMS_PER_PAGE = 10;

const PaymentHistoryScreen = () => {
  const navigation = useNavigation();
  const { t } = useTranslation();
  const { state } = useRider();

  // ========================================================================
  // STATE
  // ========================================================================
  const [localRiderId, setLocalRiderId] = useState(null);
  const [payments, setPayments] = useState([]);
  const [filteredPayments, setFilteredPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [filterStatus, setFilterStatus] = useState('all'); // 'all' | 'success' | 'pending' | 'failed'

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
  // LOAD PAYMENT HISTORY
  // ========================================================================
  const loadPaymentHistory = useCallback(async () => {
    if (!localRiderId || !isMountedRef.current) {
      return;
    }

    try {
      setLoading(true);

      // ✅ Load payment records from IndexedDB
      const historyKey = `payment_history_${localRiderId}`;
      let history = [];

      try {
        const cached = await indexedDbAdapter.kvGet(historyKey);
        if (cached) {
          history = typeof cached === 'string' ? JSON.parse(cached) : cached;
          if (!Array.isArray(history)) history = [];
        }
      } catch (err) {
        console.warn('⚠️ Failed to load payment history:', err);
      }

      // ✅ Sort by date (newest first)
      history.sort((a, b) => {
        const timeA = a.ts || new Date(a.createdAt).getTime();
        const timeB = b.ts || new Date(b.createdAt).getTime();
        return timeB - timeA;
      });

      if (isMountedRef.current) {
        setPayments(history);
        applyFilter(history, 'all');
        setCurrentPage(1);
      }
    } catch (err) {
      console.error('❌ Error loading payment history:', err);
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  }, [localRiderId]);

  // ========================================================================
  // APPLY FILTER
  // ========================================================================
  const applyFilter = (paymentList, status) => {
    if (status === 'all') {
      setFilteredPayments(paymentList);
    } else {
      setFilteredPayments(paymentList.filter(p => p.status === status));
    }
  };

  // ========================================================================
  // HANDLE FILTER CHANGE
  // ========================================================================
  const handleFilterChange = (status) => {
    setFilterStatus(status);
    applyFilter(payments, status);
    setCurrentPage(1);
  };

  // ========================================================================
  // FOCUS EFFECT: Load on screen focus
  // ========================================================================
  useFocusEffect(
    useCallback(() => {
      if (!hasLoadedRef.current && localRiderId) {
        console.log('📌 PaymentHistory focused, loading data...');
        hasLoadedRef.current = true;
        loadPaymentHistory();
      }

      return () => {
        // Keep loaded state on unfocus
      };
    }, [loadPaymentHistory, localRiderId])
  );

  // ========================================================================
  // PAGINATION
  // ========================================================================
  const totalPages = Math.ceil(filteredPayments.length / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const endIndex = startIndex + ITEMS_PER_PAGE;
  const pageItems = filteredPayments.slice(startIndex, endIndex);

  // ========================================================================
  // RENDER PAYMENT ROW
  // ========================================================================
  const renderPaymentRow = (payment) => {
    const timestamp = payment.ts || new Date(payment.createdAt).getTime();
    const date = new Date(timestamp);
    const statusBadgeColor = payment.status === 'pending_verification'
      ? '#fdf3df'
      : payment.status === 'Success'
        ? '#e6f5ef'
        : '#fdecea';
    const statusTextColor = payment.status === 'pending_verification'
      ? '#8a5c0d'
      : payment.status === 'Success'
        ? '#146142'
        : '#a5312c';

    return (
      <View key={payment.id} style={styles.paymentRow}>
        <View style={styles.paymentInfo}>
          <Text style={styles.paymentChannel}>{payment.channel}</Text>
          <Text style={styles.paymentDate}>{date.toLocaleString('en-KE')}</Text>
          {payment.mpesaCode && (
            <Text style={styles.paymentCode}>M-Pesa: {payment.mpesaCode}</Text>
          )}
          {payment.days && (
            <Text style={styles.paymentDetails}>
              {payment.days}-Day Prepayment
            </Text>
          )}
        </View>
        <View style={styles.paymentAmount}>
          <View
            style={[
              styles.statusBadge,
              { backgroundColor: statusBadgeColor }
            ]}
          >
            <Text style={[styles.statusText, { color: statusTextColor }]}>
              {payment.status === 'pending_verification'
                ? '⏳ Pending'
                : payment.status === 'Success'
                  ? '✅ Success'
                  : '❌ Failed'}
            </Text>
          </View>
          <Text style={styles.amount}>KSh {payment.amount?.toLocaleString() || 0}</Text>
        </View>
      </View>
    );
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
  // MAIN UI
  // ========================================================================
  return (
    <ScrollView style={styles.container}>
      {/* BACK LINK */}
      <TouchableOpacity
        onPress={() => navigation.goBack()}
        style={styles.backLink}
      >
        <Text style={styles.backLinkText}>← {t('common.back') || 'Back'}</Text>
      </TouchableOpacity>

      {/* TITLE */}
      <Text style={styles.title}>Payment History</Text>
      <Text style={styles.subtitle}>All your subscription and prepay payments</Text>

      {/* FILTER BUTTONS */}
      <View style={styles.filterContainer}>
        <TouchableOpacity
          style={[
            styles.filterButton,
            filterStatus === 'all' && styles.filterButtonActive
          ]}
          onPress={() => handleFilterChange('all')}
          activeOpacity={0.7}
        >
          <Text
            style={[
              styles.filterButtonText,
              filterStatus === 'all' && styles.filterButtonTextActive
            ]}
          >
            All ({payments.length})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.filterButton,
            filterStatus === 'Success' && styles.filterButtonActive
          ]}
          onPress={() => handleFilterChange('Success')}
          activeOpacity={0.7}
        >
          <Text
            style={[
              styles.filterButtonText,
              filterStatus === 'Success' && styles.filterButtonTextActive
            ]}
          >
            Success ({payments.filter(p => p.status === 'Success').length})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.filterButton,
            filterStatus === 'pending_verification' && styles.filterButtonActive
          ]}
          onPress={() => handleFilterChange('pending_verification')}
          activeOpacity={0.7}
        >
          <Text
            style={[
              styles.filterButtonText,
              filterStatus === 'pending_verification' && styles.filterButtonTextActive
            ]}
          >
            Pending ({payments.filter(p => p.status === 'pending_verification').length})
          </Text>
        </TouchableOpacity>
      </View>

      {/* PAYMENT LIST */}
      {pageItems.length > 0 ? (
        <View style={styles.paymentList}>
          {pageItems.map(payment => renderPaymentRow(payment))}
        </View>
      ) : (
        <View style={styles.emptyState}>
          <Text style={styles.emptyStateText}>📋 No payments yet</Text>
          <Text style={styles.emptyStateSubtext}>Your subscription payments will appear here</Text>
        </View>
      )}

      {/* PAGINATION */}
      {totalPages > 1 && (
        <View style={styles.paginationContainer}>
          <TouchableOpacity
            style={[
              styles.paginationButton,
              currentPage === 1 && styles.paginationButtonDisabled
            ]}
            onPress={() => setCurrentPage(Math.max(1, currentPage - 1))}
            disabled={currentPage === 1}
            activeOpacity={0.7}
          >
            <Text style={styles.paginationButtonText}>← Previous</Text>
          </TouchableOpacity>

          <Text style={styles.paginationInfo}>
            Page {currentPage} of {totalPages}
          </Text>

          <TouchableOpacity
            style={[
              styles.paginationButton,
              currentPage === totalPages && styles.paginationButtonDisabled
            ]}
            onPress={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
            disabled={currentPage === totalPages}
            activeOpacity={0.7}
          >
            <Text style={styles.paginationButtonText}>Next →</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* INFO BANNER */}
      <View style={styles.infoBanner}>
        <Text style={styles.infoText}>
          ℹ️ Payment history is read-only and never editable by you. All payments are reconciled by our Super Admin team.
        </Text>
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
    paddingHorizontal: 14,
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

  // Back Link
  backLink: {
    marginTop: 16,
    marginBottom: 16,
  },
  backLinkText: {
    fontSize: 13,
    color: '#1a1c20',
    fontWeight: '600',
  },

  // Title & Subtitle
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1a1c20',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 13,
    color: '#5b606c',
    lineHeight: 19,
    marginBottom: 20,
  },

  // Filter Buttons
  filterContainer: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 16,
  },
  filterButton: {
    backgroundColor: '#fff',
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#e7e4db',
    paddingHorizontal: 12,
    paddingVertical: 8,
    flex: 1,
  },
  filterButtonActive: {
    backgroundColor: '#ff7a1a',
    borderColor: '#ff7a1a',
  },
  filterButtonText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#5b606c',
    textAlign: 'center',
  },
  filterButtonTextActive: {
    color: '#fff',
  },

  // Payment List
  paymentList: {
    marginBottom: 16,
  },
  paymentRow: {
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#e7e4db',
    padding: 14,
    marginBottom: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  paymentInfo: {
    flex: 1,
  },
  paymentChannel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1a1c20',
    marginBottom: 4,
  },
  paymentDate: {
    fontSize: 11,
    color: '#5b606c',
    marginBottom: 2,
  },
  paymentCode: {
    fontSize: 10.5,
    color: '#8b8c8e',
    marginBottom: 2,
  },
  paymentDetails: {
    fontSize: 10.5,
    color: '#8b8c8e',
    fontStyle: 'italic',
  },
  paymentAmount: {
    alignItems: 'flex-end',
    gap: 8,
  },
  statusBadge: {
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  statusText: {
    fontSize: 10,
    fontWeight: '600',
  },
  amount: {
    fontSize: 14,
    fontWeight: '800',
    color: '#ff7a1a',
  },

  // Empty State
  emptyState: {
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#e7e4db',
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyStateText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1a1c20',
    marginBottom: 4,
  },
  emptyStateSubtext: {
    fontSize: 12,
    color: '#5b606c',
  },

  // Pagination
  paginationContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  paginationButton: {
    backgroundColor: '#fff',
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#e7e4db',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  paginationButtonDisabled: {
    opacity: 0.5,
  },
  paginationButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#ff7a1a',
  },
  paginationInfo: {
    fontSize: 12,
    color: '#5b606c',
    fontWeight: '600',
  },

  // Info Banner
  infoBanner: {
    backgroundColor: '#eef3fb',
    borderRadius: 14,
    borderLeftWidth: 4,
    borderLeftColor: '#1976d2',
    padding: 12,
    marginBottom: 14,
  },
  infoText: {
    fontSize: 12,
    color: '#2c5182',
    lineHeight: 17,
  },
});

export default PaymentHistoryScreen;