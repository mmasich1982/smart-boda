// rider-app/src/screens/lipaLater/LipaLaterCustomersScreen.js
// ✅ COMPLETE: 100% UI aligned with index.html screenPaymentSummary()
// ✅ Lipa Later Customers Report - Shows all pending Lipa Later trips
// ✅ Search, pagination, status filtering, record payment
// ✅ IndexedDB offline-first architecture

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ScrollView, View, Text, TouchableOpacity, StyleSheet, TextInput, Alert, ActivityIndicator } from 'react-native';
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
  const [syncing, setSyncing] = useState(false);
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
        }
      } catch (err) {
        console.error('❌ Error loading rider ID:', err);
      }
    };
    loadRiderId();
  }, []);

  const effectiveRiderId = localRiderId || state?.riderId;

  // ✅ LOAD CUSTOMERS FROM CACHE ON MOUNT
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
              await syncLipaLaterFromApi(effectiveRiderId, response.data.customers);
              const updatedCustomers = await loadLipaLaterCustomersCache(effectiveRiderId);
              setCustomers(updatedCustomers);
              console.log('✅ Synced Lipa Later customers from API');
            }
          } catch (apiErr) {
            console.warn('⚠️ Failed to sync from API, using cached data:', apiErr.message);
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
      const name = (customer.lipaLater?.customerName || '').toLowerCase();
      const phone = (customer.lipaLater?.customerPhone || '').toLowerCase();
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
  const overdueCount = paginationData.allCustomers.filter(t => {
    const due = t.lipaLater?.dueDate || '';
    return due < today && !t.lipaLater?.settled;
  }).length;
  
  const dueTodayCount = paginationData.allCustomers.filter(t => {
    const due = t.lipaLater?.dueDate || '';
    return due === today && !t.lipaLater?.settled;
  }).length;

  // Get status info for record
  const getStatusInfo = (trip) => {
    if (trip.lipaLater?.settled) {
      return { label: 'Settled', color: '#1e9e6f', bgColor: '#e6f5ef', emoji: '✓' };
    }
    const due = trip.lipaLater?.dueDate || '';
    if (due < today) {
      return { label: 'Overdue', color: '#e0453f', bgColor: '#fdecea', emoji: '🔴' };
    }
    if (due === today) {
      return { label: 'Due Today', color: '#b3710d', bgColor: '#fdf3df', emoji: '⚠️' };
    }
    return { label: 'Upcoming', color: '#5b606c', bgColor: '#f0f0f0', emoji: '📅' };
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '—';
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  };

  const handleRecordPayment = (tripId) => {
    const trip = customers.find(t => t.id === tripId);
    if (!trip) return;
    
    if (trip.lipaLater?.settled) {
      Alert.alert('Already Settled', "This customer's account has been fully settled.");
      return;
    }

    navigation.navigate('RecordPayment', { tripId, tripData: trip });
  };

  const handleGoToAgeing = () => {
    navigation.navigate('LipaLaterAgeing');
  };

  const handleGoHome = () => {
    navigation.navigate('Home');
  };

  const handleClearSearch = () => {
    setSearchTerm('');
    setCurrentPage(1);
  };

  const handleSearchChange = (text) => {
    setSearchTerm(text);
    setCurrentPage(1);
  };

  const handlePrevPage = () => {
    setCurrentPage(prev => Math.max(1, prev - 1));
  };

  const handleNextPage = () => {
    setCurrentPage(prev => Math.min(paginationData.totalPages, prev + 1));
  };

  if (!effectiveRiderId || !isInitialized || loading) {
    return (
      <ScrollView style={styles.container}>
        <BackLink onPress={handleGoHome} label="← Home" />
        <Text style={styles.screenTitle}>Lipa Later Customers Report</Text>
        <ActivityIndicator size="large" color="#ffc93c" style={{ marginTop: 40 }} />
      </ScrollView>
    );
  }

  const records = paginationData.records;
  let recordNumber = paginationData.startIndex + 1;

  return (
    <ScrollView style={styles.container}>
      <BackLink onPress={handleGoHome} label="← Home" />
      
      <Text style={styles.screenTitle}>Lipa Later Customers Report</Text>
      <Text style={styles.screenSub}>RA-03-E · Lipa Later Customers Report</Text>

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
          <Text style={styles.criticalErrorText}>⚠️ {criticalError}</Text>
          <TouchableOpacity onPress={clearCriticalError}>
            <Text style={styles.dismissText}>Dismiss</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Search Container */}
      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder="🔍 Search by customer name or mobile…"
          placeholderTextColor="#b0a89d"
          value={searchTerm}
          onChangeText={handleSearchChange}
        />
        {searchTerm ? (
          <TouchableOpacity style={styles.clearButton} onPress={handleClearSearch}>
            <Text style={styles.clearButtonText}>Clear</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {/* Records Container */}
      <View style={styles.recordsContainer}>
        {records.length > 0 ? records.map((trip) => {
          const statusInfo = getStatusInfo(trip);
          const isOverdue = statusInfo.label === 'Overdue';
          const isDueToday = statusInfo.label === 'Due Today';
          const totalPaid = (trip.lipaLater?.payments || []).reduce((sum, p) => sum + p.amount, 0);
          const remaining = trip.lipaLater?.originalAmount - totalPaid;
          const num = recordNumber++;
          
          return (
            <View 
              key={trip.id} 
              style={[
                styles.recordItem,
                isOverdue && styles.recordItemOverdue,
                isDueToday && styles.recordItemDueToday,
              ]}
            >
              {/* Record Number Badge */}
              <View style={styles.recordNumber}>
                <Text style={styles.recordNumberText}>{num}</Text>
              </View>

              {/* Record Content */}
              <View style={styles.recordContent}>
                {/* Name + Status Badge */}
                <View style={styles.nameRow}>
                  <Text style={styles.customerName}>{trip.lipaLater?.customerName}</Text>
                  <View style={[styles.statusBadge, { backgroundColor: statusInfo.bgColor }]}>
                    <Text style={[styles.statusBadgeText, { color: statusInfo.color }]}>
                      {statusInfo.emoji} {statusInfo.label}
                    </Text>
                  </View>
                </View>

                {/* Phone */}
                <Text style={styles.customerPhone}>📞 {trip.lipaLater?.customerPhone}</Text>

                {/* Details Grid */}
                <View style={styles.detailsGrid}>
                  <View style={styles.detailItem}>
                    <Text style={styles.detailLabel}>Original Amount</Text>
                    <Text style={styles.detailValue}>KSh {(trip.lipaLater?.originalAmount || 0).toLocaleString()}</Text>
                  </View>
                  <View style={styles.detailItem}>
                    <Text style={styles.detailLabel}>Trip Date</Text>
                    <Text style={styles.detailValue}>{formatDate(trip.ts)}</Text>
                  </View>
                  <View style={styles.detailItem}>
                    <Text style={styles.detailLabel}>Due Date</Text>
                    <Text style={styles.detailValue}>{formatDate(trip.lipaLater?.dueDate)}</Text>
                  </View>
                </View>

                {/* Payment Status */}
                {totalPaid > 0 ? (
                  <View style={styles.paymentStatus}>
                    <View style={styles.paymentRow}>
                      <Text>Paid so far:</Text>
                      <Text style={styles.paidAmount}>KSh {totalPaid.toLocaleString()}</Text>
                    </View>
                    <View style={styles.paymentRow}>
                      <Text>Still owing:</Text>
                      <Text style={[styles.remainingAmount, { color: remaining > 0 ? '#ff7a1a' : '#1e9e6f' }]}>
                        KSh {remaining.toLocaleString()}
                      </Text>
                    </View>
                  </View>
                ) : null}

                {/* Record Payment Button or Settled Badge */}
                {!trip.lipaLater?.settled ? (
                  <TouchableOpacity 
                    style={styles.recordPaymentBtn}
                    onPress={() => handleRecordPayment(trip.id)}
                  >
                    <Text style={styles.recordPaymentBtnText}>💳 Record Payment</Text>
                  </TouchableOpacity>
                ) : (
                  <View style={styles.settledBadge}>
                    <Text style={styles.settledText}>✓ Fully settled</Text>
                  </View>
                )}
              </View>
            </View>
          );
        }) : (
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateText}>
              {searchTerm ? '❌ No customers match your search.' : '✅ No pending Lipa Later payments right now. 🎉'}
            </Text>
          </View>
        )}
      </View>

      {/* Pagination */}
      {paginationData.totalPages > 1 && (
        <View style={styles.paginationContainer}>
          <Text style={styles.paginationInfo}>
            Showing {records.length === 0 ? 0 : paginationData.startIndex + 1}–{paginationData.endIndex} of {paginationData.filteredCount} {searchTerm ? 'matching ' : ''}customers (Page {paginationData.currentPage} of {paginationData.totalPages})
          </Text>
          <View style={styles.paginationButtons}>
            <TouchableOpacity
              style={[styles.paginationBtn, paginationData.currentPage === 1 && styles.paginationBtnDisabled]}
              onPress={handlePrevPage}
              disabled={paginationData.currentPage === 1}
            >
              <Text style={styles.paginationBtnText}>← Previous</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.paginationBtn, paginationData.currentPage === paginationData.totalPages && styles.paginationBtnDisabled]}
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
        <Text style={styles.ageingButtonText}>📊 View Payment Ageing Report</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f6f4ef',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 40,
  },

  screenTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1a1c20',
    marginBottom: 6,
    marginTop: 8,
    fontFamily: 'SpaceGrotesk',
  },

  screenSub: {
    fontSize: 12.5,
    color: '#8b5cf6',
    fontWeight: '600',
    marginBottom: 14,
    fontFamily: 'JetBrains Mono',
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
    lineHeight: 18,
  },

  warningBold: {
    fontWeight: '700',
    color: '#1a1c20',
  },

  criticalErrorBanner: {
    backgroundColor: '#fdecea',
    borderWidth: 1.5,
    borderColor: '#f6cac7',
    borderRadius: 12,
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
    marginBottom: 20,
    gap: 10,
  },

  searchInput: {
    flex: 1,
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: '#e7e4db',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 14,
    color: '#1a1c20',
  },

  clearButton: {
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: '#e7e4db',
    borderRadius: 12,
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

  paymentStatus: {
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

  remainingAmount: {
    fontWeight: '700',
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
    borderRadius: 12,
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
    borderRadius: 12,
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