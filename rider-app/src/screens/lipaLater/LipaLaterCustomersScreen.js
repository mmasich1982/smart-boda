// rider-app/src/screens/lipaLater/LipaLaterCustomersScreen.js
// ✅ UPDATED: IndexedDB offline-first architecture for Lipa Later
// - Loads customer data from IndexedDB cache instead of state.trips
// - Seamless sync between local cache and API
// - Network-aware with graceful fallback to cached data
// - Full pagination, search, and status filtering
// - UI/UX preserved exactly as original

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ScrollView, View, Text, TouchableOpacity, StyleSheet, TextInput, Alert, ActivityIndicator } from 'react-native';
import BackLink from '../../components/BackLink';
import { useRider } from '../../rider/RiderContext';
import { useTranslation } from '../../i18n/LocalizationProvider';
import { getLocalRiderId } from '../../offline/db';
import indexedDbAdapter from '../../offline/adapters/indexedDbAdapter';
import { useNetworkStatus, useCriticalError } from '../../hooks/useNetworkStatus';
import api from '../../api/client';
import {
  loadLipaLaterCustomersCache,
  saveLipaLaterCustomersCache,
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
  const [syncing, setSyncing] = useState(false);
  const [customers, setCustomers] = useState([]);

  const { isConnected, isInitialized } = useNetworkStatus();
  const { error: criticalError, showError: showCriticalError, clearError: clearCriticalError } = useCriticalError();
  
  // Track if we've already loaded data on mount
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

  // ✅ LOAD CUSTOMERS FROM CACHE ON COMPONENT MOUNT/FOCUS
  useEffect(() => {
    if (!effectiveRiderId || !isInitialized || hasLoadedRef.current) {
      return;
    }

    let isMounted = true;

    const loadCustomers = async () => {
      try {
        setLoading(true);

        // Load from IndexedDB cache
        const cachedCustomers = await loadLipaLaterCustomersCache(effectiveRiderId);
        
        if (isMounted) {
          setCustomers(cachedCustomers);
          console.log('✅ Loaded', cachedCustomers.length, 'Lipa Later customers from cache');
        }

        // Try to sync from API if online
        if (isConnected && isMounted) {
          try {
            setSyncing(true);
            const response = await api.get('/lipa-later/customer-list', {
              params: { rider_id: effectiveRiderId }
            });

            if (response.data && Array.isArray(response.data.customers) && isMounted) {
              // Sync API data to cache
              await syncLipaLaterFromApi(effectiveRiderId, response.data.customers);
              
              // Reload from cache
              const updatedCustomers = await loadLipaLaterCustomersCache(effectiveRiderId);
              setCustomers(updatedCustomers);
              console.log('✅ Synced Lipa Later customers from API');
            }
          } catch (apiErr) {
            console.warn('⚠️ Failed to sync from API, using cached data:', apiErr.message);
            // API failed - stick with cached data
          } finally {
            if (isMounted) setSyncing(false);
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
  }, [effectiveRiderId, isInitialized, isConnected, showCriticalError, t]);

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
    const filtered = filterBySearch(customers, searchTerm);
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
  const overdueCount = paginationData.allCustomers.filter(c => {
    const dueDate = new Date(c.lastTransactionDate || c.createdAt);
    dueDate.setDate(dueDate.getDate() + 30);
    return dueDate.toISOString().split('T')[0] < today;
  }).length;
  
  const dueTodayCount = paginationData.allCustomers.filter(c => {
    const dueDate = new Date(c.lastTransactionDate || c.createdAt);
    dueDate.setDate(dueDate.getDate() + 30);
    return dueDate.toISOString().split('T')[0] === today;
  }).length;

  // Helper: Get status and styling
  const getStatusInfo = (customerRecord) => {
    const dueDate = new Date(customerRecord.lastTransactionDate || customerRecord.createdAt);
    dueDate.setDate(dueDate.getDate() + 30);
    const dueDateStr = dueDate.toISOString().split('T')[0];

    if (dueDateStr < today) {
      return { label: 'Overdue', color: '#e0453f', bgColor: '#fdecea', emoji: '🔴' };
    }
    if (dueDateStr === today) {
      return { label: 'Due Today', color: '#b3710d', bgColor: '#fdf3df', emoji: '⚠️' };
    }
    return { label: 'Upcoming', color: '#5b606c', bgColor: '#f0f0f0', emoji: '📅' };
  };

  // Helper: Format date
  const formatDate = (dateStr) => {
    if (!dateStr) return '—';
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  };

  // Handle record payment button
  const handleRecordPayment = useCallback((customerId) => {
    const customer = customers.find(c => c.customerId === customerId);
    if (!customer) return;
    
    if (customer.settled || customer.totalOutstanding === 0) {
      Alert.alert('Already Settled', "This customer's account has been fully settled.");
      return;
    }

    // Navigate to RecordPayment with customer data
    navigation.navigate('RecordPayment', { customerId, customerData: customer });
  }, [customers, navigation]);

  // Handle navigation to ageing report
  const handleGoToAgeing = useCallback(() => {
    navigation.navigate('LipaLaterAgeing');
  }, [navigation]);

  // Handle go home
  const handleGoHome = useCallback(() => {
    navigation.navigate('Home');
  }, [navigation]);

  // Handle search clear
  const handleClearSearch = useCallback(() => {
    setSearchTerm('');
    setCurrentPage(1);
  }, []);

  // Handle search change
  const handleSearchChange = useCallback((text) => {
    setSearchTerm(text);
    setCurrentPage(1);
  }, []);

  // Handle page change
  const handlePrevPage = useCallback(() => {
    setCurrentPage(prev => Math.max(1, prev - 1));
  }, []);

  const handleNextPage = useCallback(() => {
    setCurrentPage(prev => Math.min(paginationData.totalPages, prev + 1));
  }, [paginationData.totalPages]);

  if (!effectiveRiderId || !isInitialized || loading) {
    return (
      <ScrollView style={styles.container}>
        <BackLink onPress={handleGoHome} label="← Home" />
        <Text style={styles.title}>Lipa Later Customers Report</Text>
        <ActivityIndicator size="large" color="#ffc107" style={{ marginTop: 40 }} />
      </ScrollView>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <BackLink onPress={handleGoHome} label="← Home" />
      
      <Text style={styles.title}>Lipa Later Customers Report</Text>

      {/* Sync Status */}
      {syncing && (
        <View style={styles.syncBanner}>
          <Text style={styles.syncText}>🔄 Syncing with server...</Text>
        </View>
      )}

      {/* Warning Banner */}
      {(overdueCount > 0 || dueTodayCount > 0) && (
        <View style={styles.warningBanner}>
          <Text style={styles.warningText}>
            <Text>⚠️ </Text>
            <Text style={styles.warningBold}>
              {overdueCount} overdue{dueTodayCount > 0 ? `, ${dueTodayCount} due today` : ''}
            </Text>
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
          placeholder="🔍 Search by customer name or mobile…"
          value={searchTerm}
          onChangeText={handleSearchChange}
          placeholderTextColor="#c7c9ce"
        />
        {searchTerm ? (
          <TouchableOpacity style={styles.clearButton} onPress={handleClearSearch}>
            <Text style={styles.clearButtonText}>Clear</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {/* Records Container */}
      <View style={styles.recordsContainer}>
        {paginationData.records.length > 0 ? (
          paginationData.records.map((customer, idx) => {
            const recordNum = paginationData.startIndex + idx + 1;
            const statusInfo = getStatusInfo(customer);

            return (
              <View 
                key={customer.customerId} 
                style={[
                  styles.recordItem,
                  statusInfo.label === 'Overdue' && styles.recordItemOverdue,
                  statusInfo.label === 'Due Today' && styles.recordItemDueToday,
                ]}
              >
                <View style={styles.recordNumber}>
                  <Text style={styles.recordNumberText}>{recordNum}</Text>
                </View>

                <View style={styles.recordContent}>
                  {/* Name and Status Badge */}
                  <View style={styles.nameRow}>
                    <Text style={styles.customerName}>{customer.customerName}</Text>
                    <View style={[styles.statusBadge, { backgroundColor: statusInfo.bgColor }]}>
                      <Text style={[styles.statusBadgeText, { color: statusInfo.color }]}>
                        {statusInfo.emoji} {statusInfo.label}
                      </Text>
                    </View>
                  </View>

                  {/* Phone */}
                  <Text style={styles.customerPhone}>📞 {customer.customerPhone}</Text>

                  {/* Details Grid */}
                  <View style={styles.detailsGrid}>
                    <View style={styles.detailItem}>
                      <Text style={styles.detailLabel}>Outstanding</Text>
                      <Text style={styles.detailValue}>KSh {(customer.totalOutstanding || 0).toLocaleString()}</Text>
                    </View>
                    <View style={styles.detailItem}>
                      <Text style={styles.detailLabel}>Settled</Text>
                      <Text style={styles.detailValue}>KSh {(customer.totalSettled || 0).toLocaleString()}</Text>
                    </View>
                    <View style={styles.detailItem}>
                      <Text style={styles.detailLabel}>Trips</Text>
                      <Text style={styles.detailValue}>{(customer.pendingTrips || 0) + (customer.settledTrips || 0)}</Text>
                    </View>
                  </View>

                  {/* Action Button */}
                  {!customer.settled && customer.totalOutstanding > 0 ? (
                    <TouchableOpacity
                      style={styles.recordPaymentBtn}
                      onPress={() => handleRecordPayment(customer.customerId)}
                    >
                      <Text style={styles.recordPaymentBtnText}>Record Payment →</Text>
                    </TouchableOpacity>
                  ) : (
                    <View style={styles.settledBadge}>
                      <Text style={styles.settledText}>✓ Settled</Text>
                    </View>
                  )}
                </View>
              </View>
            );
          })
        ) : (
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateText}>
              {searchTerm ? 'No customers match your search.' : 'No pending Lipa Later customers.'}
            </Text>
          </View>
        )}
      </View>

      {/* Pagination */}
      {paginationData.totalPages > 1 && (
        <View style={styles.paginationContainer}>
          <Text style={styles.paginationInfo}>
            Page {paginationData.currentPage} of {paginationData.totalPages}
            {searchTerm ? ` (${paginationData.filteredCount} matches)` : ''}
          </Text>
          <View style={styles.paginationButtons}>
            <TouchableOpacity
              style={[
                styles.paginationBtn,
                paginationData.currentPage === 1 && styles.paginationBtnDisabled,
              ]}
              onPress={handlePrevPage}
              disabled={paginationData.currentPage === 1}
            >
              <Text style={styles.paginationBtnText}>← Previous</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.paginationBtn,
                paginationData.currentPage === paginationData.totalPages && styles.paginationBtnDisabled,
              ]}
              onPress={handleNextPage}
              disabled={paginationData.currentPage === paginationData.totalPages}
            >
              <Text style={styles.paginationBtnText}>Next →</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Ageing Button */}
      <TouchableOpacity style={styles.ageingButton} onPress={handleGoToAgeing}>
        <Text style={styles.ageingButtonText}>📊 View Ageing Report</Text>
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
    fontSize: 22, 
    fontWeight: '700', 
    color: '#1a1c20', 
    marginBottom: 20 
  },
  
  syncBanner: {
    backgroundColor: '#e3f2fd',
    borderLeftWidth: 4,
    borderLeftColor: '#2196f3',
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 16,
    borderRadius: 8,
  },
  syncText: {
    fontSize: 12,
    color: '#1565c0',
    fontWeight: '500',
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

  warningBanner: {
    backgroundColor: '#fdf3df',
    borderLeftWidth: 4,
    borderLeftColor: '#b3710d',
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 20,
    borderRadius: 8,
  },
  warningText: {
    fontSize: 13,
    color: '#5b606c',
  },
  warningBold: {
    fontWeight: '700',
    color: '#1a1c20',
  },

  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
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
    borderColor: '#e7e4db',
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
    padding: 14,
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
  },
  recordNumberText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#fff',
  },
  recordContent: {
    flex: 1,
  },
  nameRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  customerName: {
    fontSize: 14,
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
    fontSize: 11,
    fontWeight: '600',
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
  detailItem: {
    flex: 1,
  },
  detailLabel: {
    fontSize: 10,
    color: '#5b606c',
    marginBottom: 2,
  },
  detailValue: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1a1c20',
  },

  recordPaymentBtn: {
    backgroundColor: '#ff7a1a',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  recordPaymentBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#fff',
  },
  settledBadge: {
    backgroundColor: 'rgba(30,158,111,.15)',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  settledText: {
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
    marginBottom: 20,
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
    fontSize: 13,
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