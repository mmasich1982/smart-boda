// rider-app/src/screens/lipaLater/LipaLaterCustomersScreen.js
// ✅ UPDATED: 100% UI alignment with index.html
// - Lipa Later Customers Report (formerly PaymentSummary)
// - Loads customer data from IndexedDB cache
// - Search by name/mobile with clear button
// - Pagination with record numbering
// - Status badges for Overdue/Due Today/Upcoming
// - Inline payment history per customer
// - View Ageing Report button

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ScrollView, View, Text, TouchableOpacity, StyleSheet, TextInput, ActivityIndicator } from 'react-native';
import BackLink from '../../components/BackLink';
import { useRider } from '../../rider/RiderContext';
import { useTranslation } from '../../i18n/LocalizationProvider';
import { getLocalRiderId } from '../../offline/db';
import { useNetworkStatus, useCriticalError } from '../../hooks/useNetworkStatus';
import api from '../../api/client';
import {
  loadLipaLaterCustomersCache,
  getPendingLipaLaterCustomers,
  syncLipaLaterFromApi,
} from '../../offline/lipaLaterUtils';

const RECORDS_PER_PAGE = 10;

export default function LipaLaterCustomersScreen({ navigation }) {
  const { state } = useRider();
  const { t } = useTranslation();
  const [localRiderId, setLocalRiderId] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [customers, setCustomers] = useState([]);

  const { isConnected, isInitialized } = useNetworkStatus();
  const { error: criticalError, showError: showCriticalError, clearError: clearCriticalError } = useCriticalError();
  
  const hasLoadedRef = useRef(false);

  // ✅ LOAD RIDER ID ON MOUNT
  useEffect(() => {
    const loadRiderId = async () => {
      try {
        const id = await getLocalRiderId();
        if (id) {
          setLocalRiderId(id);
          console.log('✅ LipaLaterCustomers: Loaded rider ID:', id);
        }
      } catch (err) {
        console.error('❌ Error loading rider ID:', err);
      }
    };
    loadRiderId();
  }, []);

  const effectiveRiderId = localRiderId || state?.riderId;

  // ✅ LOAD CUSTOMERS FROM CACHE
  useEffect(() => {
    if (!effectiveRiderId || !isInitialized || hasLoadedRef.current) {
      return;
    }

    let isMounted = true;

    const loadCustomers = async () => {
      try {
        setLoading(true);
        const cachedCustomers = await loadLipaLaterCustomersCache(effectiveRiderId);
        
        if (isMounted) {
          setCustomers(cachedCustomers);
          console.log('✅ Loaded', cachedCustomers.length, 'Lipa Later customers from cache');
        }

        // Try to sync from API if online
        if (isConnected && isMounted) {
          try {
            const response = await api.get('/lipa-later/customer-list', {
              params: { rider_id: effectiveRiderId }
            });

            if (response.data && Array.isArray(response.data.customers) && isMounted) {
              await syncLipaLaterFromApi(effectiveRiderId, response.data.customers);
              const updatedCustomers = await loadLipaLaterCustomersCache(effectiveRiderId);
              if (isMounted) {
                setCustomers(updatedCustomers);
                console.log('✅ Synced Lipa Later customers from API');
              }
            }
          } catch (apiErr) {
            console.warn('⚠️ Failed to sync from API, using cached data:', apiErr.message);
          }
        }
      } catch (err) {
        console.error('❌ Error loading customers:', err);
        if (isMounted) {
          showCriticalError(
            t('error_loadCustomersFailed') || 'Unable to load customers. Please try again.',
            'data_load'
          );
        }
      } finally {
        if (isMounted) {
          hasLoadedRef.current = true;
          setLoading(false);
        }
      }
    };

    loadCustomers();

    return () => {
      isMounted = false;
    };
  }, [effectiveRiderId, isInitialized]);

  // Filter by search term
  const filterBySearch = useCallback((items, term) => {
    if (!term || term.trim() === '') return items;
    const t = term.toLowerCase().trim();
    return items.filter(customer => {
      const name = (customer.customerName || '').toLowerCase();
      const phone = (customer.customerPhone || '').toLowerCase();
      return name.includes(t) || phone.includes(t);
    });
  }, []);

  // Get paginated records
  const getPaginatedData = useCallback(() => {
    const sorted = [...customers].sort((a, b) => 
      (a.dueDate || '').localeCompare(b.dueDate || '')
    );
    const filtered = filterBySearch(sorted, searchTerm);
    const totalPages = Math.max(1, Math.ceil(filtered.length / RECORDS_PER_PAGE));
    const page = Math.max(1, Math.min(currentPage, totalPages));
    const startIdx = (page - 1) * RECORDS_PER_PAGE;
    const endIdx = Math.min(startIdx + RECORDS_PER_PAGE, filtered.length);
    
    return {
      allCustomers: customers,
      filteredCustomers: filtered,
      records: filtered.slice(startIdx, endIdx),
      totalRecords: customers.length,
      filteredCount: filtered.length,
      currentPage: page,
      totalPages,
      startIndex: startIdx,
      endIndex: endIdx,
    };
  }, [customers, filterBySearch, searchTerm, currentPage]);

  const paginationData = getPaginatedData();
  const today = new Date().toISOString().split('T')[0];
  
  // Count overdue and due today
  const overdueCount = paginationData.allCustomers.filter(c => 
    (c.dueDate || '') < today
  ).length;
  
  const dueTodayCount = paginationData.allCustomers.filter(c => 
    (c.dueDate || '') === today
  ).length;

  // Get status info for a customer
  const getStatusInfo = (customer) => {
    const dueDate = customer.dueDate || '';
    if (dueDate < today) {
      return { label: 'Overdue', badgeStyle: styles.badgeRed };
    }
    if (dueDate === today) {
      return { label: 'Due Today', badgeStyle: styles.badgeAmber };
    }
    return { label: 'Upcoming', badgeStyle: styles.badgeGrey };
  };

  // Format date
  const formatDate = (dateStr) => {
    if (!dateStr) return '—';
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  };

  // Handle record payment
  const handleRecordPayment = (customerId) => {
    const customer = customers.find(c => c.customerId === customerId);
    if (!customer) return;
    navigation.navigate('RecordPaymentScreen', { customerId, customerData: customer });
  };

  // Handle go to ageing
  const handleGoToAgeing = () => {
    navigation.navigate('LipaLaterAgeingScreen');
  };

  // Handle go home
  const handleGoHome = () => {
    navigation.navigate('Home');
  };

  if (!effectiveRiderId || !isInitialized || loading) {
    return (
      <ScrollView style={styles.container}>
        <BackLink onPress={handleGoHome} label={t('backLabel') || '← Home'} />
        <Text style={styles.title}>Lipa Later Customers Report</Text>
        <ActivityIndicator size="large" color="#ffc107" style={{ marginTop: 40 }} />
      </ScrollView>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <BackLink onPress={handleGoHome} label={t('backLabel') || '← Home'} />
      
      <Text style={styles.title}>Lipa Later Customers Report</Text>
      
      {/* Warning Banner */}
      {(overdueCount > 0 || dueTodayCount > 0) && (
        <View style={styles.warningBanner}>
          <Text style={styles.warningText}>
            <Text style={{ fontWeight: '700' }}>
              ⚠️ {overdueCount} overdue
            </Text>
            {dueTodayCount > 0 && (
              <Text style={{ fontWeight: '700' }}>
                , {dueTodayCount} due today
              </Text>
            )}
            <Text> — highlighted below for quick follow-up.</Text>
          </Text>
        </View>
      )}

      {/* Critical Error */}
      {criticalError && (
        <View style={styles.criticalErrorBanner}>
          <Text style={styles.criticalErrorText}>{criticalError}</Text>
          <TouchableOpacity onPress={clearCriticalError}>
            <Text style={styles.dismissText}>{t('dismiss') || 'Dismiss'}</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Search Container */}
      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder="🔍 Search by customer name or mobile number…"
          placeholderTextColor="#b0a89d"
          value={searchTerm}
          onChangeText={(text) => {
            setSearchTerm(text);
            setCurrentPage(1);
          }}
        />
        {searchTerm ? (
          <TouchableOpacity
            style={styles.clearButton}
            onPress={() => {
              setSearchTerm('');
              setCurrentPage(1);
            }}
          >
            <Text style={styles.clearButtonText}>Clear</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {/* Records Container */}
      <View style={styles.recordsContainer}>
        {paginationData.records.length > 0 ? (
          paginationData.records.map((customer, idx) => {
            const recordNum = paginationData.startIndex + idx + 1;
            const status = getStatusInfo(customer);
            const totalPaid = (customer.totalPaid || 0);
            const remaining = (customer.totalOutstanding || 0);
            const originalAmount = totalPaid + remaining;
            const payments = customer.payments || [];

            return (
              <View 
                key={customer.customerId} 
                style={[
                  styles.recordItem,
                  customer.settled && styles.recordItemSettled,
                  status.label === 'Overdue' && styles.recordItemOverdue,
                  status.label === 'Due Today' && styles.recordItemDueToday,
                ]}
              >
                <View style={styles.recordNumber}>
                  <Text style={styles.recordNumberText}>{recordNum}</Text>
                </View>
                
                <View style={styles.recordContent}>
                  {/* Top row: Name + Status Badge */}
                  <View style={styles.topRow}>
                    <Text style={styles.customerName}>{customer.customerName}</Text>
                    <View style={[styles.statusBadge, status.badgeStyle]}>
                      <Text style={styles.statusBadgeText}>{status.label}</Text>
                    </View>
                  </View>

                  {/* Phone */}
                  <Text style={styles.customerPhone}>📞 {customer.customerPhone}</Text>

                  {/* Details Grid */}
                  <View style={styles.detailsGrid}>
                    <View style={styles.gridItem}>
                      <Text style={styles.gridLabel}>Original Amount</Text>
                      <Text style={styles.gridValue}>KSh {originalAmount.toLocaleString()}</Text>
                    </View>
                    <View style={styles.gridItem}>
                      <Text style={styles.gridLabel}>Trip Date</Text>
                      <Text style={styles.gridValue}>
                        {formatDate(customer.tripDate || customer.createdAt)}
                      </Text>
                    </View>
                    <View style={styles.gridItem}>
                      <Text style={styles.gridLabel}>Due Date</Text>
                      <Text style={styles.gridValue}>{formatDate(customer.dueDate)}</Text>
                    </View>
                  </View>

                  {/* Payment Summary (if paid) */}
                  {totalPaid > 0 && (
                    <View style={styles.paymentSummary}>
                      <View style={styles.paymentRow}>
                        <Text>Paid so far:</Text>
                        <Text style={styles.paidAmount}>KSh {totalPaid.toLocaleString()}</Text>
                      </View>
                      <View style={styles.paymentRow}>
                        <Text>Still owing:</Text>
                        <Text style={[
                          styles.owingAmount,
                          remaining > 0 ? styles.owingAmountWarning : styles.owingAmountSuccess
                        ]}>
                          KSh {remaining.toLocaleString()}
                        </Text>
                      </View>
                    </View>
                  )}

                  {/* Payment History */}
                  {payments.length > 0 && (
                    <View style={styles.paymentHistory}>
                      <Text style={styles.paymentHistoryLabel}>Payment History:</Text>
                      {payments.map((p, i) => (
                        <View key={i} style={styles.paymentHistoryRow}>
                          <Text style={styles.paymentHistoryAmount}>
                            KSh {(p.amount || 0).toLocaleString()}
                          </Text>
                          <Text style={styles.paymentHistoryDate}>
                            {formatDate(p.date)}
                          </Text>
                        </View>
                      ))}
                    </View>
                  )}

                  {/* Record Payment Button or Settled Badge */}
                  {!customer.settled && remaining > 0 ? (
                    <TouchableOpacity
                      style={styles.recordPaymentBtn}
                      onPress={() => handleRecordPayment(customer.customerId)}
                    >
                      <Text style={styles.recordPaymentBtnText}>💳 Record Payment</Text>
                    </TouchableOpacity>
                  ) : (
                    <View style={styles.settledBadge}>
                      <Text style={styles.settledBadgeText}>✓ Fully settled</Text>
                    </View>
                  )}
                </View>
              </View>
            );
          })
        ) : (
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateText}>
              {searchTerm 
                ? '❌ No customers match your search.' 
                : '✅ No pending Lipa Later payments right now. 🎉'}
            </Text>
          </View>
        )}
      </View>

      {/* Pagination */}
      {paginationData.totalPages > 1 && (
        <View style={styles.paginationContainer}>
          <Text style={styles.paginationInfo}>
            Showing {paginationData.records.length === 0 ? 0 : paginationData.startIndex + 1}–{paginationData.endIndex} of {paginationData.filteredCount} {searchTerm ? 'matching ' : ''}customers (Page {paginationData.currentPage} of {paginationData.totalPages})
          </Text>
          <View style={styles.paginationButtons}>
            <TouchableOpacity
              style={[
                styles.paginationBtn,
                paginationData.currentPage === 1 && styles.paginationBtnDisabled
              ]}
              onPress={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              disabled={paginationData.currentPage === 1}
            >
              <Text style={styles.paginationBtnText}>← Previous</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.paginationBtn,
                paginationData.currentPage === paginationData.totalPages && styles.paginationBtnDisabled
              ]}
              onPress={() => setCurrentPage(prev => Math.min(paginationData.totalPages, prev + 1))}
              disabled={paginationData.currentPage === paginationData.totalPages}
            >
              <Text style={styles.paginationBtnText}>Next →</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Ageing Report Button */}
      <TouchableOpacity style={styles.ageingButton} onPress={handleGoToAgeing}>
        <Text style={styles.ageingButtonText}>📊 View Payment Ageing Report</Text>
      </TouchableOpacity>

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
    backgroundColor: '#f6f4ef',
  },
  title: {
    fontFamily: 'SpaceGrotesk-Bold',
    fontSize: 22,
    fontWeight: '700',
    color: '#1a1c20',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 11.5,
    color: '#5b606c',
    marginBottom: 16,
    fontWeight: '500',
  },

  warningBanner: {
    backgroundColor: '#fdf3df',
    borderLeftWidth: 4,
    borderLeftColor: '#c98a12',
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
  },
  warningText: {
    fontSize: 12,
    color: '#5b606c',
    lineHeight: 18,
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

  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    gap: 10,
  },
  searchInput: {
    flex: 1,
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: '#e7e4db',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 14,
    color: '#1a1c20',
  },
  clearButton: {
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: '#ff7a1a',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  clearButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#ff7a1a',
  },

  recordsContainer: {
    marginBottom: 20,
  },
  recordItem: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e7e4db',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  recordItemOverdue: {
    borderLeftWidth: 4,
    borderLeftColor: '#e0453f',
    backgroundColor: '#fffaf9',
  },
  recordItemDueToday: {
    borderLeftWidth: 4,
    borderLeftColor: '#b3710d',
    backgroundColor: '#fffbf5',
  },
  recordItemSettled: {
    opacity: 0.8,
  },
  recordNumber: {
    minWidth: 36,
    height: 36,
    backgroundColor: '#ff7a1a',
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    flexShrink: 0,
  },
  recordNumberText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#fff',
  },
  recordContent: {
    flex: 1,
  },

  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  customerName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1a1c20',
    flex: 1,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    marginLeft: 8,
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: '600',
  },
  badgeRed: {
    backgroundColor: '#ffe0db',
  },
  badgeRedText: {
    color: '#e0453f',
  },
  badgeAmber: {
    backgroundColor: '#fef3df',
  },
  badgeAmberText: {
    color: '#c98a12',
  },
  badgeGrey: {
    backgroundColor: '#f0f0f0',
  },
  badgeGreyText: {
    color: '#5b606c',
  },

  customerPhone: {
    fontSize: 12,
    color: '#5b606c',
    marginBottom: 8,
  },

  detailsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  gridItem: {
    flex: 1,
  },
  gridLabel: {
    fontSize: 10,
    color: '#5b606c',
    marginBottom: 4,
  },
  gridValue: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1a1c20',
  },

  paymentSummary: {
    backgroundColor: 'rgba(30,158,111,.08)',
    borderRadius: 8,
    padding: 8,
    marginBottom: 8,
  },
  paymentRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 3,
    fontSize: 11,
  },
  paidAmount: {
    fontWeight: '700',
    color: '#1e9e6f',
  },
  owingAmount: {
    fontWeight: '700',
  },
  owingAmountWarning: {
    color: '#ff7a1a',
  },
  owingAmountSuccess: {
    color: '#1e9e6f',
  },

  paymentHistory: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,.1)',
    paddingTop: 8,
    marginBottom: 8,
    fontSize: 11,
  },
  paymentHistoryLabel: {
    color: '#5b606c',
    marginBottom: 6,
    fontWeight: '600',
    fontSize: 10,
  },
  paymentHistoryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
    fontSize: 11,
  },
  paymentHistoryAmount: {
    color: '#1a1c20',
  },
  paymentHistoryDate: {
    color: '#5b606c',
  },

  recordPaymentBtn: {
    backgroundColor: '#ffc107',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
    marginTop: 10,
  },
  recordPaymentBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1a1c20',
  },
  settledBadge: {
    backgroundColor: 'rgba(30,158,111,.15)',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
    marginTop: 10,
  },
  settledBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1e9e6f',
  },

  emptyState: {
    backgroundColor: '#f9f9f9',
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
  },
  emptyStateText: {
    fontSize: 13,
    color: '#5b606c',
    textAlign: 'center',
  },

  paginationContainer: {
    marginBottom: 16,
  },
  paginationInfo: {
    fontSize: 11,
    color: '#5b606c',
    textAlign: 'center',
    marginBottom: 10,
  },
  paginationButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
  },
  paginationBtn: {
    flex: 1,
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: '#e7e4db',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  paginationBtnDisabled: {
    opacity: 0.5,
    backgroundColor: '#f0f0f0',
  },
  paginationBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#ff7a1a',
  },

  ageingButton: {
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: '#e7e4db',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    marginBottom: 20,
  },
  ageingButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1a1c20',
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