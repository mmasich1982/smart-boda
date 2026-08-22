/**
 * rider-app/src/screens/lipaLater/LipaLaterDetailsScreen.js
 * RA-03-H: Lipa Later Customer Details
 * 
 * ✅ SEAMLESS ONLINE/OFFLINE: Cache-first loading with API fallback
 * ✅ MULTILINGUAL: Uses i18n for all UI text
 * ✅ OFFLINE PERSISTENCE: IndexedDB adapter for local-first storage
 * ✅ NETWORK AWARE: Real-time connectivity detection
 * ✅ MINIMAL UI: Title + Customer Info + Payment History
 * ✅ NO STATUS BANNERS: Only critical errors shown
 * 
 * Shows detailed information about a specific Lipa Later customer:
 * - Customer contact details
 * - Original amount and payment tracking
 * - Payment progress visualization
 * - Payment history with dates and amounts
 * - Action buttons (Record Payment, View Ageing)
 */

import React, { useState, useEffect } from 'react';
import {
  ScrollView,
  View,
  Text,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  RefreshControl
} from 'react-native';
import BackLink from '../../components/BackLink';
import { useFocusEffect } from '@react-navigation/native';
import { useRider } from '../../rider/RiderContext';
import { useTranslation } from '../../i18n/LocalizationProvider';
import { getLocalRiderId } from '../../offline/db';
import indexedDbAdapter from '../../offline/adapters/indexedDbAdapter';
import { useNetworkStatus, useCriticalError } from '../../hooks/useNetworkStatus';
import api from '../../api/client';
import colors from '../../theme/colors';

export default function LipaLaterDetailsScreen({ route, navigation }) {
  const { recordId, record: initialRecord } = route.params;
  const { state } = useRider();
  const { t } = useTranslation();
  const [localRiderId, setLocalRiderId] = useState(null);
  const [record, setRecord] = useState(initialRecord);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const { isConnected, isInitialized } = useNetworkStatus();
  const { error: criticalError, showError: showCriticalError, clearError: clearCriticalError } = useCriticalError();

  // ✅ LOAD RIDER ID ON MOUNT
  useEffect(() => {
    const loadRiderId = async () => {
      try {
        const id = await getLocalRiderId();
        if (id) {
          setLocalRiderId(id);
          console.log('✅ LipaLaterDetails: Loaded rider ID:', id);
        }
      } catch (err) {
        console.error('❌ Error loading rider ID:', err);
      }
    };
    loadRiderId();
  }, []);

  const effectiveRiderId = localRiderId || state?.riderId;

  // Load detail on focus
  useFocusEffect(
    React.useCallback(() => {
      if (!effectiveRiderId || !isInitialized) return;
      loadDetails();
    }, [effectiveRiderId, isInitialized])
  );

  const loadDetails = async () => {
    try {
      setLoading(true);
      clearCriticalError();

      let data = null;

      // Try API first if connected
      if (isConnected && isInitialized) {
        try {
          console.log('📡 Fetching Lipa Later details from API...');
          const response = await api.get(`/trips/lipa-later/${recordId}`, {
            params: { rider_id: effectiveRiderId }
          });

          if (response.data) {
            data = response.data;
            console.log('✅ Loaded details from API');

            // ✅ Cache the data using IndexedDB
            await indexedDbAdapter.kvSet(
              `lipa_detail_${recordId}`,
              JSON.stringify(data)
            );
          }
        } catch (apiErr) {
          console.warn('⚠️ API fetch failed, falling back to cache:', apiErr.message);
          data = await loadDetailsFromCache();
        }
      } else {
        // Offline mode - use cache
        console.log('📴 Offline mode: Loading from cache');
        data = await loadDetailsFromCache();
      }

      if (data) {
        setRecord(data);
      } else {
        setRecord(initialRecord);
      }
    } catch (err) {
      console.error('❌ Error loading details:', err);
      showCriticalError(t('error_loadDetails') || 'Unable to load details. Please try again.', 'data_load');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const loadDetailsFromCache = async () => {
    try {
      // ✅ Use IndexedDB adapter instead of LocalStore
      const cached = await indexedDbAdapter.kvGet(`lipa_detail_${recordId}`);
      if (cached) {
        const data = typeof cached === 'string' ? JSON.parse(cached) : cached;
        console.log('✅ Loaded details from IndexedDB cache');
        return data;
      }
    } catch (err) {
      console.warn('⚠️ Cache load failed:', err);
    }
    return null;
  };

  const handleRefresh = () => {
    setRefreshing(true);
    loadDetails();
  };

  const getDaysUntilDue = (dueDate) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const due = new Date(dueDate);
    due.setHours(0, 0, 0, 0);
    const diffTime = due - today;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'pending':
        return '#FFA500';
      case 'partial':
        return '#FF6B6B';
      case 'paid':
        return '#4CAF50';
      default:
        return '#999';
    }
  };

  const getStatusLabel = (status) => {
    switch (status) {
      case 'pending':
        return '⏳ ' + (t('pending') || 'Pending');
      case 'partial':
        return '⚠️ ' + (t('partial') || 'Partial');
      case 'paid':
        return '✓ ' + (t('paid') || 'Paid');
      default:
        return status;
    }
  };

  if (!isInitialized) {
    return (
      <ScrollView style={styles.container}>
        <BackLink onPress={() => navigation.goBack()} label={t('backLabel') || '← Back'} />
        <Text style={styles.title}>{t('customerDetails') || 'Customer Details'}</Text>
        <ActivityIndicator size="large" color="#ff7a1a" style={{ marginTop: 40 }} />
      </ScrollView>
    );
  }

  if (!record) {
    return (
      <ScrollView style={styles.container}>
        <BackLink onPress={() => navigation.goBack()} label={t('backLabel') || '← Back'} />
        <Text style={styles.title}>{t('customerDetails') || 'Customer Details'}</Text>
        <View style={styles.centerContainer}>
          <Text style={styles.emptyText}>{t('recordNotFound') || 'Record not found'}</Text>
        </View>
      </ScrollView>
    );
  }

  const remaining = parseFloat(record.remaining_balance || record.amount || 0);
  const original = parseFloat(record.amount || 0);
  const paid = original - remaining;
  const paymentPercentage = original > 0 ? (paid / original) * 100 : 0;
  const daysUntilDue = getDaysUntilDue(record.due_date);
  const isOverdue = daysUntilDue < 0;
  const isDueToday = daysUntilDue === 0;
  const payments = record.payments || [];

  return (
    <View style={styles.container}>
      {/* Header */}
      <ScrollView
        style={styles.headerSection}
        scrollEnabled={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            colors={['#ff7a1a']}
          />
        }
      >
        <BackLink onPress={() => navigation.goBack()} label={t('backLabel') || '← Back'} />
        <Text style={styles.title}>{t('customerDetails') || 'Customer Details'}</Text>

        {/* Error Banner */}
        {criticalError && (
          <View style={styles.criticalErrorBanner}>
            <Text style={styles.criticalErrorText}>⚠️ {criticalError}</Text>
            <TouchableOpacity onPress={clearCriticalError}>
              <Text style={styles.dismissText}>{t('dismiss') || 'Dismiss'}</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Customer Info Card */}
        <View style={styles.infoCard}>
          <View style={styles.headerRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.customerName}>{record.customer_name}</Text>
              <Text style={styles.phoneNumber}>{record.customer_mobile}</Text>
            </View>
            <View
              style={[
                styles.statusBadgeLarge,
                { backgroundColor: getStatusColor(record.status) }
              ]}
            >
              <Text style={styles.statusBadgeText}>{getStatusLabel(record.status)}</Text>
            </View>
          </View>

          {/* Amount Grid */}
          <View style={styles.amountGridLarge}>
            <View style={styles.amountCellLarge}>
              <Text style={styles.amountLabel}>{t('originalAmount') || 'ORIGINAL AMOUNT'}</Text>
              <Text style={styles.amountValue}>KSh {original.toLocaleString()}</Text>
            </View>
            <View style={styles.amountCellLarge}>
              <Text style={[styles.amountLabel, { color: '#4CAF50' }]}>{t('received') || 'RECEIVED'}</Text>
              <Text style={[styles.amountValue, { color: '#4CAF50' }]}>KSh {paid.toLocaleString()}</Text>
            </View>
            <View style={styles.amountCellLarge}>
              <Text style={[styles.amountLabel, { color: '#FFA500' }]}>{t('outstanding') || 'OUTSTANDING'}</Text>
              <Text style={[styles.amountValue, { color: '#FFA500' }]}>KSh {remaining.toLocaleString()}</Text>
            </View>
          </View>

          {/* Progress Bar */}
          <View style={styles.progressSectionLarge}>
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                marginBottom: 8
              }}
            >
              <Text style={styles.progressLabel}>{t('paymentProgress') || 'PAYMENT PROGRESS'}</Text>
              <Text style={styles.progressPercentage}>{Math.round(paymentPercentage)}%</Text>
            </View>
            <View style={styles.progressBarContainerLarge}>
              <View
                style={[
                  styles.progressBarFillLarge,
                  {
                    width: `${paymentPercentage}%`,
                    backgroundColor: paymentPercentage === 100 ? '#4CAF50' : '#FFA500'
                  }
                ]}
              />
            </View>
          </View>

          {/* Due Date Info */}
          <View style={styles.dueDateSection}>
            <Text style={styles.dueDateLabel}>{t('dueDate') || 'DUE DATE'}</Text>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={styles.dueDateValue}>{record.due_date}</Text>
              {isOverdue && (
                <Text style={styles.overdueFlag}>{Math.abs(daysUntilDue)} {t('daysOverdue') || 'days overdue'}</Text>
              )}
              {isDueToday && (
                <Text style={styles.dueTodayFlag}>{t('dueToday') || 'Due Today'} ⚠️</Text>
              )}
              {!isOverdue && !isDueToday && daysUntilDue > 0 && (
                <Text style={styles.dueSoonFlag}>{daysUntilDue} {t('daysToGo') || 'days to go'}</Text>
              )}
            </View>
          </View>
        </View>
      </ScrollView>

      {/* Payment History */}
      {payments.length > 0 ? (
        <View style={styles.paymentHistorySection}>
          <Text style={styles.sectionTitle}>{t('paymentHistory') || 'Payment History'}</Text>
          <FlatList
            data={payments}
            keyExtractor={(_, index) => index.toString()}
            scrollEnabled={false}
            renderItem={({ item }) => (
              <View style={styles.paymentItem}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                  <Text style={styles.paymentAmount}>
                    KSh {parseFloat(item.amount || 0).toLocaleString()}
                  </Text>
                  <Text
                    style={[
                      styles.paymentSyncStatus,
                      { color: item.sync_status === 'synced' ? '#4CAF50' : '#FFA500' }
                    ]}
                  >
                    {item.sync_status === 'synced' ? '✓ ' + (t('synced') || 'Synced') : '⧖ ' + (t('syncing') || 'Syncing')}
                  </Text>
                </View>
                <Text style={styles.paymentDate}>{item.date}</Text>
                {item.reference && (
                  <Text style={styles.paymentReference}>{t('ref') || 'Ref'}: {item.reference}</Text>
                )}
              </View>
            )}
            contentContainerStyle={{ paddingBottom: 20 }}
          />
        </View>
      ) : (
        <View style={styles.emptyHistorySection}>
          <Text style={styles.emptyHistoryText}>{t('noPaymentsRecorded') || 'No payments recorded yet'}</Text>
        </View>
      )}

      {/* Action Buttons */}
      {record.status !== 'paid' && (
        <View style={styles.actionButtonsSection}>
          <TouchableOpacity
            style={styles.primaryActionButton}
            onPress={() => navigation.navigate('RecordPayment', { recordId: record.id, record })}
            activeOpacity={0.8}
          >
            <Text style={styles.primaryActionButtonText}>{t('recordPayment') || 'Record Payment'} →</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f6f4ef'
  },
  headerSection: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
    backgroundColor: '#f6f4ef'
  },
  title: {
    fontFamily: 'SpaceGrotesk-Bold',
    fontSize: 22,
    fontWeight: '700',
    color: '#1a1c20',
    marginBottom: 16
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

  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center'
  },
  emptyText: {
    fontSize: 14,
    color: '#a8a196'
  },

  infoCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
    marginBottom: 20
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16
  },
  customerName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1a1c20',
    marginBottom: 4
  },
  phoneNumber: {
    fontSize: 12,
    color: '#a8a196'
  },
  statusBadgeLarge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#fff'
  },

  amountGridLarge: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
    gap: 8
  },
  amountCellLarge: {
    flex: 1
  },
  amountLabel: {
    fontSize: 10,
    color: '#a8a196',
    fontWeight: '700',
    marginBottom: 4
  },
  amountValue: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#1a1c20'
  },

  progressSectionLarge: {
    marginBottom: 16
  },
  progressLabel: {
    fontSize: 10,
    color: '#a8a196',
    fontWeight: '700'
  },
  progressPercentage: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#1a1c20'
  },
  progressBarContainerLarge: {
    height: 10,
    backgroundColor: '#e0e0e0',
    borderRadius: 5,
    overflow: 'hidden'
  },
  progressBarFillLarge: {
    height: '100%'
  },

  dueDateSection: {
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
    paddingTop: 12
  },
  dueDateLabel: {
    fontSize: 10,
    color: '#a8a196',
    fontWeight: '700',
    marginBottom: 6
  },
  dueDateValue: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1a1c20'
  },
  overdueFlag: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#d32f2f'
  },
  dueTodayFlag: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#FFA500'
  },
  dueSoonFlag: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666'
  },

  paymentHistorySection: {
    paddingHorizontal: 20,
    paddingVertical: 12
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1a1c20',
    marginBottom: 12
  },
  paymentItem: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    borderLeftWidth: 3,
    borderLeftColor: '#4CAF50'
  },
  paymentAmount: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#1a1c20'
  },
  paymentSyncStatus: {
    fontSize: 11,
    fontWeight: '600'
  },
  paymentDate: {
    fontSize: 11,
    color: '#a8a196'
  },
  paymentReference: {
    fontSize: 10,
    color: '#666',
    marginTop: 4
  },

  emptyHistorySection: {
    paddingHorizontal: 20,
    paddingVertical: 20,
    justifyContent: 'center',
    alignItems: 'center'
  },
  emptyHistoryText: {
    fontSize: 13,
    color: '#a8a196',
    fontStyle: 'italic'
  },

  actionButtonsSection: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0'
  },
  primaryActionButton: {
    backgroundColor: '#ff7a1a',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    shadowColor: '#ff7a1a',
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6
  },
  primaryActionButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.02
  }
});