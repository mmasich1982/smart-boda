// rider-app/src/screens/lipaLater/LipaLaterCustomersScreen.js
// ✅ COMPLETE: 100% UI alignment with index.html
// ✅ FIXED: Proper refresh of customer list after payment
// ✅ FIXED: Removes fully settled customers from the view
// ✅ FIXED: Updates customer balance for partial payments
// ✅ FIXED: Screen focus listener for soft refresh after payment
// ✅ FIXED: Proper navigation with parameters
// ✅ FIXED: Displays warning banner for overdue or due-today customers
// ✅ FEATURE: Lipa Later Customers Report with status badges
// - Loads customer data from IndexedDB cache
// - Search by name/mobile with clear button
// - Pagination with record numbering
// - Status badges for Overdue/Due Today/Upcoming
// - Inline payment history per customer
// - View Ageing Report button
// - Complete refresh after payment (navigation.useFocusEffect pattern)
// - Automatic removal of fully settled customers
// - Balance updates for partial payments

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ScrollView, View, Text, TouchableOpacity, StyleSheet, TextInput, ActivityIndicator, useFocusEffect } from 'react-native';
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
  const [filterMode, setFilterMode] = useState('all'); // 'all', 'pending', 'settled'

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

  // ✅ LOAD CUSTOMERS FROM CACHE - INITIAL LOAD
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

  // ✅ FIXED: Complete refresh after payment using useFocusEffect pattern
  useFocusEffect(
    useCallback(() => {
      if (!effectiveRiderId || !hasLoadedRef.current) {
        return;
      }

      const refreshAfterPayment = async () => {
        try {
          console.log('🔄 Screen focused - checking for payment refresh...');
          
          // Reload customers from cache
          const updatedCustomers = await loadLipaLaterCustomersCache(effectiveRiderId);
          
          // ✅ AUTOMATICALLY REMOVE FULLY SETTLED CUSTOMERS
          // Filter to keep only customers that have remaining balance (totalOutstanding > 0)
          const pendingCustomers = updatedCustomers.filter(customer => {
            const totalOutstanding = customer.totalOutstanding || 0;
            const isSettled = customer.settled === true || totalOutstanding <= 0;
            
            if (isSettled) {
              console.log('✅ Removing fully settled customer from list:', customer.customerId);
            }
            
            return !isSettled; // Keep only unsettled customers
          });
          
          setCustomers(pendingCustomers);
          console.log('✅ Refreshed customer list, removed', updatedCustomers.length - pendingCustomers.length, 'settled customers');
          
          // Try to sync fresh data from API if online
          if (isConnected) {
            try {
              const response = await api.get('/lipa-later/customer-list', {
                params: { rider_id: effectiveRiderId }
              });

              if (response.data && Array.isArray(response.data.customers)) {
                await syncLipaLaterFromApi(effectiveRiderId, response.data.customers);
                const freshCustomers = await loadLipaLaterCustomersCache(effectiveRiderId);
                
                // ✅ RE-FILTER SETTLED CUSTOMERS AFTER API SYNC
                const freshPendingCustomers = freshCustomers.filter(c => {
                  const remaining = c.totalOutstanding || 0;
                  return !c.settled && remaining > 0;
                });
                
                setCustomers(freshPendingCustomers);
                console.log('✅ Synced and refreshed from API');
              }
            } catch (apiErr) {
              console.warn('⚠️ Failed to sync from API during refresh:', apiErr.message);
            }
          }
        } catch (err) {
          console.error('❌ Error refreshing after payment:', err);
        }
      };

      // Execute refresh
      refreshAfterPayment();
    }, [effectiveRiderId, isConnected])
  );

  // Filter by search term
  const filterBySearch = useCallback((items, term) => {
    if (!term || term.trim() === '') return items;
    const searchLower = term.toLowerCase().trim();
    return items.filter(customer => {
      const name = (customer.customerName || '').toLowerCase();
      const phone = (customer.customerPhone || customer.customerMobile || '').toLowerCase();
      return name.includes(searchLower) || phone.includes(searchLower);
    });
  }, []);

  // Get paginated records
  const getPaginatedData = useCallback(() => {
    // ✅ Filter out fully settled customers and update balances for partial payments
    const activeCustomers = customers.filter(c => {
      const remaining = c.totalOutstanding || 0;
      return remaining > 0 && !c.settled; // Only show customers with outstanding balance
    });
    
    const sorted = [...activeCustomers].sort((a, b) => 
      (a.dueDate || '').localeCompare(b.dueDate || '')
    );
    const filtered = filterBySearch(sorted, searchTerm);
    const totalPages = Math.max(1, Math.ceil(filtered.length / RECORDS_PER_PAGE));
    const page = Math.max(1, Math.min(currentPage, totalPages));
    const startIdx = (page - 1) * RECORDS_PER_PAGE;
    const endIdx = Math.min(startIdx + RECORDS_PER_PAGE, filtered.length);
    
    return {
      allCustomers: customers,
      activeCustomers: activeCustomers,
      filteredCustomers: filtered,
      records: filtered.slice(startIdx, endIdx),
      totalRecords: activeCustomers.length,
      filteredCount: filtered.length,
      currentPage: page,
      totalPages,
      startIndex: startIdx,
      endIndex: endIdx,
    };
  }, [customers, filterBySearch, searchTerm, currentPage]);

  const paginationData = getPaginatedData();
  const today = new Date().toISOString().split('T')[0];
  
  // ✅ Count overdue and due today from ACTIVE CUSTOMERS ONLY
  const overdueCount = paginationData.activeCustomers.filter(c => {
    const dueDate = c.dueDate || '';
    const remaining = c.totalOutstanding || 0;
    return remaining > 0 && dueDate < today;
  }).length;
  
  const dueTodayCount = paginationData.activeCustomers.filter(c => {
    const dueDate = c.dueDate || '';
    const remaining = c.totalOutstanding || 0;
    return remaining > 0 && dueDate === today;
  }).length;

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

  // ✅ FIXED: Handle record payment with proper data passing
  const handleRecordPayment = (customerId) => {
    const customer = paginationData.activeCustomers.find(c => c.customerId === customerId);
    if (!customer) {
      console.warn('⚠️ Customer not found:', customerId);
      return;
    }
    
    // ✅ Calculate remaining balance (updates balance for partial payments)
    const remaining = customer.totalOutstanding || 0;
    const totalPaid = customer.totalPaid || 0;
    
    // Pass customerId as string, ensure customerData has all required fields
    const customerDataToPass = {
      customerId: String(customer.customerId),
      customerName: customer.customerName || 'Unknown',
      customerMobile: customer.customerMobile || customer.customerPhone || '—',
      totalOutstanding: parseFloat(remaining),
      totalPaid: parseFloat(totalPaid),
      originalAmount: parseFloat((totalPaid + remaining) || 0),
      dueDate: customer.dueDate,
    };
    
    console.log('📱 Navigating to RecordPayment with customer:', customerId, 'Remaining balance:', remaining);
    navigation.navigate('RecordPaymentScreen', { 
      customerId: customerId,
      customerData: customerDataToPass 
    });
  };

  // Handle go to ageing
  const handleGoToAgeing = () => {
    navigation.navigate('LipaLaterAgeingScreen');
  };

  // Handle go home
  const handleGoHome = () => {
    navigation.navigate('Home');
  };

  // Handle search clear
  const handleClearSearch = () => {
    setSearchTerm('');
    setCurrentPage(1);
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
      
      {/* ✅ WARNING BANNER for overdue or due-today customers */}
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
            <Text style={styles.dismissText}>✕</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Summary Stats */}
      {paginationData.totalRecords > 0 && (
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>Total</Text>
            <Text style={styles.statValue}>{paginationData.totalRecords}</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>Overdue</Text>
            <Text style={[styles.statValue, { color: '#e0453f' }]}>{overdueCount}</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>Due Today</Text>
            <Text style={[styles.statValue, { color: '#b3710d' }]}>{dueTodayCount}</Text>
          </View>
        </View>
      )}

      {/* Search */}
      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder={t('searchPlaceholder') || 'Search by name or phone…'}
          placeholderTextColor="#b0a89d"
          value={searchTerm}
          onChangeText={setSearchTerm}
        />
        {searchTerm && (
          <TouchableOpacity style={styles.clearButton} onPress={handleClearSearch}>
            <Text style={styles.clearButtonText}>Clear</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Records */}
      {paginationData.records.length > 0 ? (
        <View style={styles.recordsContainer}>
          {paginationData.records.map((customer, index) => {
            const statusInfo = getStatusInfo(customer);
            const remaining = customer.totalOutstanding || 0;
            const paid = customer.totalPaid || 0;
            const recordNumber = paginationData.startIndex + index + 1;
            
            // ✅ Calculate days overdue for display
            const dueDate = customer.dueDate || '';
            const overdueBy = dueDate < today ? Math.floor((new Date(today) - new Date(dueDate)) / (1000 * 60 * 60 * 24)) : 0;
            
            return (
              <View
                key={customer.customerId}
                style={[
                  styles.recordItem,
                  dueDate < today && styles.recordItemOverdue,
                  dueDate === today && styles.recordItemDueToday,
                ]}
              >
                <View style={styles.recordNumber}>
                  <Text style={styles.recordNumberText}>{recordNumber}</Text>
                </View>

                <View style={styles.recordContent}>
                  {/* Top row: Name + Status */}
                  <View style={styles.topRow}>
                    <Text style={styles.customerName}>{customer.customerName || 'Unknown'}</Text>
                    <View style={[styles.statusBadge, statusInfo.badgeStyle]}>
                      <Text style={[styles.statusBadgeText, 
                        dueDate < today && styles.badgeRedText,
                        dueDate === today && styles.badgeAmberText,
                        dueDate >= today && styles.badgeGreyText
                      ]}>
                        {statusInfo.label}
                        {overdueBy > 0 && ` (${overdueBy}d)`}
                      </Text>
                    </View>
                  </View>

                  {/* Phone */}
                  <Text style={styles.customerPhone}>
                    📱 {customer.customerMobile || customer.customerPhone || '—'}
                  </Text>

                  {/* Details grid */}
                  <View style={styles.detailsGrid}>
                    <View style={styles.gridItem}>
                      <Text style={styles.gridLabel}>Due Date</Text>
                      <Text style={styles.gridValue}>{formatDate(customer.dueDate)}</Text>
                    </View>
                    <View style={styles.gridItem}>
                      <Text style={styles.gridLabel}>Original</Text>
                      <Text style={styles.gridValue}>KSh {(paid + remaining).toLocaleString('en-US', { maximumFractionDigits: 2 })}</Text>
                    </View>
                    <View style={styles.gridItem}>
                      <Text style={styles.gridLabel}>Trip Date</Text>
                      <Text style={styles.gridValue}>{formatDate(customer.tripDate || customer.createdAt)}</Text>
                    </View>
                  </View>

                  {/* Payment Summary */}
                  <View style={styles.paymentSummary}>
                    <View style={styles.paymentRow}>
                      <Text style={{ color: '#5b606c' }}>Paid:</Text>
                      <Text style={styles.paidAmount}>KSh {paid.toLocaleString('en-US', { maximumFractionDigits: 2 })}</Text>
                    </View>
                    <View style={styles.paymentRow}>
                      <Text style={{ color: '#5b606c' }}>Owing:</Text>
                      <Text style={[
                        styles.owingAmount,
                        remaining > 0 ? styles.owingAmountWarning : styles.owingAmountSuccess
                      ]}>
                        KSh {remaining.toLocaleString('en-US', { maximumFractionDigits: 2 })}
                      </Text>
                    </View>
                  </View>

                  {/* Payment History */}
                  {Array.isArray(customer.payments) && customer.payments.length > 0 && (
                    <View style={styles.paymentHistory}>
                      <Text style={styles.paymentHistoryLabel}>Payment History:</Text>
                      {customer.payments.slice(0, 2).map((payment, idx) => (
                        <View key={idx} style={styles.paymentHistoryRow}>
                          <Text style={styles.paymentHistoryAmount}>
                            KSh {payment.amount?.toLocaleString('en-US', { maximumFractionDigits: 2 }) || '0'}
                          </Text>
                          <Text style={styles.paymentHistoryDate}>{formatDate(payment.date)}</Text>
                        </View>
                      ))}
                      {customer.payments.length > 2 && (
                        <Text style={styles.paymentHistoryLabel}>
                          +{customer.payments.length - 2} more payment{customer.payments.length - 2 !== 1 ? 's' : ''}
                        </Text>
                      )}
                    </View>
                  )}

                  {/* Record Payment Button */}
                  {remaining > 0 && (
                    <TouchableOpacity
                      style={styles.recordPaymentBtn}
                      onPress={() => handleRecordPayment(customer.customerId)}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.recordPaymentBtnText}>
                        Record Payment {remaining > 0 ? `→` : ''}
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            );
          })}
        </View>
      ) : (
        <View style={styles.emptyState}>
          <Text style={styles.emptyStateText}>
            {paginationData.totalRecords === 0
              ? 'No pending customers. Great work! 🎉'
              : 'No matching customers found.'}
          </Text>
        </View>
      )}

      {/* Pagination */}
      {paginationData.totalPages > 1 && (
        <View style={styles.paginationContainer}>
          <Text style={styles.paginationInfo}>
            Page {paginationData.currentPage} of {paginationData.totalPages}
            {searchTerm && ` (${paginationData.filteredCount} results)`}
          </Text>
          <View style={styles.paginationButtons}>
            <TouchableOpacity
              style={[
                styles.paginationBtn,
                paginationData.currentPage === 1 && styles.paginationBtnDisabled,
              ]}
              onPress={() => setCurrentPage(paginationData.currentPage - 1)}
              disabled={paginationData.currentPage === 1}
              activeOpacity={0.7}
            >
              <Text style={styles.paginationBtnText}>← Previous</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.paginationBtn,
                paginationData.currentPage === paginationData.totalPages && styles.paginationBtnDisabled,
              ]}
              onPress={() => setCurrentPage(paginationData.currentPage + 1)}
              disabled={paginationData.currentPage === paginationData.totalPages}
              activeOpacity={0.7}
            >
              <Text style={styles.paginationBtnText}>Next →</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Ageing Button */}
      <TouchableOpacity
        style={styles.ageingButton}
        onPress={handleGoToAgeing}
        activeOpacity={0.8}
      >
        <Text style={styles.ageingButtonText}>View Ageing Report →</Text>
      </TouchableOpacity>
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
    fontSize: 24,
    fontWeight: '700',
    color: '#1a1c20',
    marginBottom: 16,
  },

  warningBanner: {
    backgroundColor: '#fffbf5',
    borderLeftWidth: 4,
    borderLeftColor: '#ff7a1a',
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
    alignItems: 'center',
  },
  criticalErrorText: {
    fontSize: 12,
    color: '#a5312c',
    fontWeight: '600',
    flex: 1,
  },
  dismissText: {
    fontSize: 16,
    color: '#a5312c',
    fontWeight: '700',
    marginLeft: 12,
  },

  statsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e7e4db',
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
  },
  statLabel: {
    fontSize: 10,
    color: '#5b606c',
    fontWeight: '600',
    marginBottom: 4,
  },
  statValue: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1a1c20',
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

  emptyState: {
    backgroundColor: '#f9f9f9',
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
    marginBottom: 20,
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
});