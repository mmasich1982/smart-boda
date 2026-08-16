// rider-app/src/screens/lipaLater/LipaLaterCustomersScreen.js
// FIXED: Properly displays Lipa Later customer records from state.trips
// - Filters state.trips for pending Lipa Later records
// - Implements search by customer name or mobile
// - Implements pagination
// - Removes RA-03-E label per cleaned.html
// - Home button correctly navigates to Home screen
// - Shows overdue counts and status badges
// - Displays payment history and remaining balance

import React, { useState, useEffect, useCallback } from 'react';
import { ScrollView, View, Text, TouchableOpacity, StyleSheet, TextInput, Alert } from 'react-native';
import BackLink from '../../components/BackLink';
import { useRider } from '../../rider/RiderContext';

const RECORDS_PER_PAGE = 10;

export default function LipaLaterCustomersScreen({ navigation }) {
  const { state, dispatch } = useRider();
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);

  // Get pending Lipa Later trips from state.trips
  const getPendingLipaLaterTrips = useCallback(() => {
    if (!state?.trips) return [];
    return state.trips
      .filter(t => t.paymentMethod === 'LipaLater' && t.lipaLater && !t.lipaLater.settled && t.status === 'active')
      .sort((a, b) => (a.lipaLater.dueDate || '').localeCompare(b.lipaLater.dueDate || ''));
  }, [state?.trips]);

  // Filter by search term
  const filterBySearch = useCallback((trips, term) => {
    if (!term || term.trim() === '') return trips;
    const t = term.toLowerCase().trim();
    return trips.filter(trip => {
      const name = (trip.lipaLater?.customerName || '').toLowerCase();
      const phone = (trip.lipaLater?.customerPhone || '').toLowerCase();
      return name.includes(t) || phone.includes(t);
    });
  }, []);

  // Get paginated records
  const getPaginatedData = useCallback(() => {
    const pending = getPendingLipaLaterTrips();
    const filtered = filterBySearch(pending, searchTerm);
    const totalPages = Math.max(1, Math.ceil(filtered.length / RECORDS_PER_PAGE));
    const page = Math.max(1, Math.min(currentPage, totalPages));
    const startIdx = (page - 1) * RECORDS_PER_PAGE;
    const endIdx = Math.min(startIdx + RECORDS_PER_PAGE, filtered.length);
    
    return {
      allTrips: pending,
      filteredTrips: filtered,
      records: filtered.slice(startIdx, endIdx),
      totalRecords: pending.length,
      filteredCount: filtered.length,
      currentPage: page,
      totalPages,
      startIndex: startIdx,
      endIndex: endIdx,
    };
  }, [getPendingLipaLaterTrips, filterBySearch, searchTerm, currentPage]);

  const paginationData = getPaginatedData();
  const today = new Date().toISOString().split('T')[0];
  
  // Count overdue and due today
  const overdueCount = paginationData.allTrips.filter(t => 
    t.lipaLater.dueDate < today
  ).length;
  
  const dueTodayCount = paginationData.allTrips.filter(t => 
    t.lipaLater.dueDate === today
  ).length;

  // Helper: Get remaining balance
  const getRemainingBalance = (lipaLaterRec) => {
    if (!lipaLaterRec || !lipaLaterRec.payments) return lipaLaterRec?.originalAmount || 0;
    const paid = lipaLaterRec.payments.reduce((s, p) => s + (p.amount || 0), 0);
    return Math.max(0, (lipaLaterRec.originalAmount || 0) - paid);
  };

  // Helper: Get total paid
  const getTotalPaid = (lipaLaterRec) => {
    if (!lipaLaterRec || !lipaLaterRec.payments) return 0;
    return lipaLaterRec.payments.reduce((s, p) => s + (p.amount || 0), 0);
  };

  // Helper: Get status and styling
  const getStatusInfo = (dueDate) => {
    if (dueDate < today) {
      return { label: 'Overdue', color: '#e0453f', bgColor: '#fdecea', emoji: '🔴' };
    }
    if (dueDate === today) {
      return { label: 'Due Today', color: '#b3710d', bgColor: '#fdf3df', emoji: '⚠️' };
    }
    return { label: 'Upcoming', color: '#5b606c', bgColor: '#f0f0f0', emoji: '📅' };
  };

  // Helper: Format date
  const formatDate = (dateStr) => {
    if (!dateStr) return '—';
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  };

  // Handle record payment button
  const handleRecordPayment = useCallback((tripId) => {
    const trip = state.trips.find(t => t.id === tripId);
    if (!trip || !trip.lipaLater) return;
    
    if (trip.lipaLater.settled) {
      Alert.alert('Already Settled', "This customer's account has been fully settled.");
      return;
    }

    const remaining = getRemainingBalance(trip.lipaLater);
    if (dispatch) {
      dispatch({
        type: 'SET_PAYMENT_DRAFT',
        payload: {
          tripId,
          paymentType: 'full',
          amount: remaining.toString(),
          notes: '',
        },
      });
    }
    navigation.navigate('RecordPayment', { tripId });
  }, [state.trips, dispatch, navigation]);

  // Handle navigation to ageing report
  const handleGoToAgeing = useCallback(() => {
    navigation.navigate('LipaLaterAgeing');
  }, [navigation]);

  // Handle go home - navigate directly to Home, bypassing Lipa Later Details screen
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

  return (
    <ScrollView style={styles.container}>
      {/* FIXED: Back link now goes to Home, not LipaLaterDetails */}
      <BackLink onPress={handleGoHome} label="← Home" />
      
      <Text style={styles.title}>Lipa Later Customers Report</Text>
      {/* REMOVED: RA-03-E label per cleaned.html */}

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
          paginationData.records.map((trip, idx) => {
            const recordNum = paginationData.startIndex + idx + 1;
            const remaining = getRemainingBalance(trip.lipaLater);
            const totalPaid = getTotalPaid(trip.lipaLater);
            const statusInfo = getStatusInfo(trip.lipaLater.dueDate);

            return (
              <View 
                key={trip.id} 
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
                    <Text style={styles.customerName}>{trip.lipaLater.customerName}</Text>
                    <View style={[styles.statusBadge, { backgroundColor: statusInfo.bgColor }]}>
                      <Text style={[styles.statusBadgeText, { color: statusInfo.color }]}>
                        {statusInfo.emoji} {statusInfo.label}
                      </Text>
                    </View>
                  </View>

                  {/* Phone */}
                  <Text style={styles.customerPhone}>📞 {trip.lipaLater.customerPhone}</Text>

                  {/* Details Grid */}
                  <View style={styles.detailsGrid}>
                    <View style={styles.detailItem}>
                      <Text style={styles.detailLabel}>Original Amount</Text>
                      <Text style={styles.detailValue}>KSh {trip.lipaLater.originalAmount.toLocaleString()}</Text>
                    </View>
                    <View style={styles.detailItem}>
                      <Text style={styles.detailLabel}>Trip Date</Text>
                      <Text style={styles.detailValue}>{formatDate(trip.ts)}</Text>
                    </View>
                    <View style={styles.detailItem}>
                      <Text style={styles.detailLabel}>Due Date</Text>
                      <Text style={styles.detailValue}>{formatDate(trip.lipaLater.dueDate)}</Text>
                    </View>
                  </View>

                  {/* Payment Summary */}
                  {totalPaid > 0 ? (
                    <View style={styles.paymentSummary}>
                      <View style={styles.paymentRow}>
                        <Text style={styles.paymentLabel}>Paid so far:</Text>
                        <Text style={styles.paidAmount}>KSh {totalPaid.toLocaleString()}</Text>
                      </View>
                      <View style={styles.paymentRow}>
                        <Text style={styles.paymentLabel}>Still owing:</Text>
                        <Text style={[styles.remainingAmount, { color: remaining > 0 ? '#ff7a1a' : '#1e9e6f' }]}>
                          KSh {remaining.toLocaleString()}
                        </Text>
                      </View>
                    </View>
                  ) : null}

                  {/* Payment History */}
                  {trip.lipaLater.payments && trip.lipaLater.payments.length > 0 ? (
                    <View style={styles.paymentHistory}>
                      <Text style={styles.historyTitle}>Payment History:</Text>
                      {trip.lipaLater.payments.map((payment, pidx) => (
                        <View key={pidx} style={styles.historyItem}>
                          <Text style={styles.historyAmount}>KSh {payment.amount.toLocaleString()}</Text>
                          <Text style={styles.historyDate}>{formatDate(payment.date)}</Text>
                        </View>
                      ))}
                    </View>
                  ) : null}

                  {/* Record Payment Button */}
                  {!trip.lipaLater.settled ? (
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
          })
        ) : (
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateText}>
              {searchTerm ? '❌ No customers match your search.' : '✅ No pending Lipa Later payments right now. 🎉'}
            </Text>
          </View>
        )}
      </View>

      {/* Pagination */}
      {paginationData.totalPages > 1 ? (
        <View style={styles.paginationContainer}>
          <Text style={styles.paginationInfo}>
            Showing {paginationData.records.length === 0 ? 0 : paginationData.startIndex + 1}–{paginationData.endIndex} of {paginationData.filteredCount} {searchTerm ? 'matching ' : ''}customers (Page {paginationData.currentPage} of {paginationData.totalPages})
          </Text>
          <View style={styles.paginationButtons}>
            <TouchableOpacity
              style={[styles.paginationBtn, currentPage === 1 && styles.paginationBtnDisabled]}
              onPress={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              disabled={currentPage === 1}
            >
              <Text style={styles.paginationBtnText}>← Previous</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.paginationBtn, currentPage === paginationData.totalPages && styles.paginationBtnDisabled]}
              onPress={() => setCurrentPage(prev => Math.min(paginationData.totalPages, prev + 1))}
              disabled={currentPage === paginationData.totalPages}
            >
              <Text style={styles.paginationBtnText}>Next →</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}

      {/* Ageing Report Button */}
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
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1a1c20',
    marginTop: 16,
    marginBottom: 16,
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
  },
  paymentLabel: {
    fontSize: 11,
    color: '#5b606c',
  },
  paidAmount: {
    fontSize: 11,
    fontWeight: '700',
    color: '#1e9e6f',
  },
  remainingAmount: {
    fontSize: 11,
    fontWeight: '700',
  },
  paymentHistory: {
    backgroundColor: '#f9f9f9',
    borderRadius: 8,
    padding: 8,
    marginBottom: 8,
    borderTopWidth: 1,
    borderTopColor: '#e7e4db',
  },
  historyTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#1a1c20',
    marginBottom: 6,
  },
  historyItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
    fontSize: 10,
  },
  historyAmount: {
    fontSize: 10,
    fontWeight: '600',
    color: '#1a1c20',
  },
  historyDate: {
    fontSize: 10,
    color: '#5b606c',
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