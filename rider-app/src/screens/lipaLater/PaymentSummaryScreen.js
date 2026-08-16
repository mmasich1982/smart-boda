// rider-app/src/screens/lipaLater/PaymentSummaryScreen.js
// FIXED: Aligned to cleaned.html (RA-03-E) Lipa Later Customers Report
// - Search by customer name or mobile number
// - Pagination with record numbering
// - Status badges for overdue/due today/upcoming
// - Payment history display
// - Full/partial payment tracking

import React, { useState, useMemo, useCallback } from 'react';
import { ScrollView, View, Text, TouchableOpacity, StyleSheet, TextInput, FlatList } from 'react-native';
import BackLink from '../../components/BackLink';
import { useRider } from '../../rider/RiderContext';

const RECORDS_PER_PAGE = 5;

export default function PaymentSummaryScreen({ navigation }) {
  const { state } = useRider();
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);

  // Helper: Filter by search term
  const filterBySearch = useCallback((trips, term) => {
    if (!term || term.trim() === '') return trips;
    const search = term.toLowerCase().trim();
    return trips.filter(t => {
      const name = (t.lipaLater?.customerName || '').toLowerCase();
      const phone = (t.lipaLater?.customerPhone || '').toLowerCase();
      return name.includes(search) || phone.includes(search);
    });
  }, []);

  // Helper: Get remaining balance
  const getRemainingBalance = useCallback((lipaLater) => {
    if (!lipaLater || !lipaLater.payments) return lipaLater?.originalAmount || 0;
    const paid = lipaLater.payments.reduce((sum, p) => sum + (p.amount || 0), 0);
    return Math.max(0, (lipaLater.originalAmount || 0) - paid);
  }, []);

  // Helper: Get total paid
  const getTotalPaid = useCallback((lipaLater) => {
    if (!lipaLater || !lipaLater.payments) return 0;
    return lipaLater.payments.reduce((sum, p) => sum + (p.amount || 0), 0);
  }, []);

  // Get pending trips
  const pendingTrips = useMemo(() => {
    if (!state?.trips) return [];
    return state.trips
      .filter(t => t.paymentMethod === 'LipaLater' && t.lipaLater && !t.lipaLater.settled && t.status === 'active')
      .slice()
      .sort((a, b) => (a.lipaLater.dueDate || '').localeCompare(b.lipaLater.dueDate || ''));
  }, [state?.trips]);

  // Calculate stats
  const today = new Date().toISOString().split('T')[0];
  const overdueCount = useMemo(() => 
    pendingTrips.filter(t => t.lipaLater.dueDate < today).length,
    [pendingTrips, today]
  );
  const dueTodayCount = useMemo(() => 
    pendingTrips.filter(t => t.lipaLater.dueDate === today).length,
    [pendingTrips, today]
  );

  // Filter and paginate
  const filteredTrips = useMemo(() => filterBySearch(pendingTrips, searchTerm), [pendingTrips, searchTerm, filterBySearch]);
  const totalPages = Math.max(1, Math.ceil(filteredTrips.length / RECORDS_PER_PAGE));
  const validPage = Math.max(1, Math.min(currentPage, totalPages));
  const startIdx = (validPage - 1) * RECORDS_PER_PAGE;
  const endIdx = Math.min(startIdx + RECORDS_PER_PAGE, filteredTrips.length);
  const displayRecords = filteredTrips.slice(startIdx, endIdx);

  const handleSearch = useCallback((text) => {
    setSearchTerm(text);
    setCurrentPage(1);
  }, []);

  const handleClearSearch = useCallback(() => {
    setSearchTerm('');
    setCurrentPage(1);
  }, []);

  const handlePrevPage = useCallback(() => {
    if (validPage > 1) setCurrentPage(validPage - 1);
  }, [validPage]);

  const handleNextPage = useCallback(() => {
    if (validPage < totalPages) setCurrentPage(validPage + 1);
  }, [validPage, totalPages]);

  const handleRecordPayment = useCallback((tripId) => {
    navigation.navigate('RecordPayment', { tripId });
  }, [navigation]);

  const canPrevPage = validPage > 1;
  const canNextPage = validPage < totalPages;

  return (
    <ScrollView style={styles.container}>
      <BackLink onPress={() => navigation.goBack()} label="← Home" />
      
      <Text style={styles.title}>Lipa Later Customers Report</Text>
      <Text style={styles.subtitle}>RA-03-E · Lipa Later Customers Report</Text>

      {/* Warning Banner */}
      {(overdueCount > 0 || dueTodayCount > 0) && (
        <View style={styles.warningBanner}>
          <Text style={styles.warningText}>
            ⚠️ <Text style={styles.warningBold}>{overdueCount} overdue</Text>
            {dueTodayCount > 0 && <Text>, <Text style={styles.warningBold}>{dueTodayCount} due today</Text></Text>}
            — highlighted below for quick follow-up.
          </Text>
        </View>
      )}

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder="🔍 Search by customer name or mobile number…"
          value={searchTerm}
          onChangeText={handleSearch}
          placeholderTextColor="#c7c9ce"
        />
        {searchTerm && (
          <TouchableOpacity style={styles.clearBtn} onPress={handleClearSearch}>
            <Text style={styles.clearBtnText}>Clear</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Records List */}
      <View style={styles.recordsContainer}>
        {displayRecords.length > 0 ? (
          displayRecords.map((trip, idx) => {
            const recordNum = startIdx + idx + 1;
            const due = trip.lipaLater.dueDate;
            const isOverdue = due < today;
            const isDueToday = due === today;
            const remaining = getRemainingBalance(trip.lipaLater);
            const totalPaid = getTotalPaid(trip.lipaLater);

            return (
              <View key={trip.id} style={[
                styles.recordItem,
                isOverdue && styles.recordItemOverdue,
                isDueToday && styles.recordItemDueToday,
              ]}>
                <Text style={styles.recordNumber}>{recordNum}</Text>
                
                <View style={styles.recordContent}>
                  {/* Name and Badge */}
                  <View style={styles.headerRow}>
                    <Text style={styles.customerName}>{trip.lipaLater.customerName}</Text>
                    {isOverdue && <Text style={[styles.badge, styles.badgeRed]}>Overdue</Text>}
                    {isDueToday && !isOverdue && <Text style={[styles.badge, styles.badgeAmber]}>Due Today</Text>}
                    {!isOverdue && !isDueToday && <Text style={[styles.badge, styles.badgeGrey]}>Upcoming</Text>}
                  </View>

                  {/* Phone */}
                  <Text style={styles.phone}>📞 {trip.lipaLater.customerPhone}</Text>

                  {/* Grid: Original Amount, Trip Date, Due Date */}
                  <View style={styles.gridRow}>
                    <View style={styles.gridItem}>
                      <Text style={styles.gridLabel}>Original Amount</Text>
                      <Text style={styles.gridValue}>KSh {trip.lipaLater.originalAmount.toLocaleString()}</Text>
                    </View>
                    <View style={styles.gridItem}>
                      <Text style={styles.gridLabel}>Trip Date</Text>
                      <Text style={styles.gridValue}>{new Date(trip.ts).toLocaleDateString()}</Text>
                    </View>
                    <View style={styles.gridItem}>
                      <Text style={styles.gridLabel}>Due Date</Text>
                      <Text style={styles.gridValue}>{due ? new Date(due).toLocaleDateString() : '—'}</Text>
                    </View>
                  </View>

                  {/* Payment Status */}
                  {totalPaid > 0 && (
                    <View style={styles.paymentStatus}>
                      <View style={styles.paymentStatusRow}>
                        <Text style={styles.paymentStatusLabel}>Paid so far:</Text>
                        <Text style={styles.paymentStatusValueGreen}>KSh {totalPaid.toLocaleString()}</Text>
                      </View>
                      <View style={styles.paymentStatusRow}>
                        <Text style={styles.paymentStatusLabel}>Still owing:</Text>
                        <Text style={[styles.paymentStatusValue, { color: remaining > 0 ? '#ff7a1a' : '#1e9e6f' }]}>
                          KSh {remaining.toLocaleString()}
                        </Text>
                      </View>
                    </View>
                  )}

                  {/* Payment History */}
                  {(trip.lipaLater.payments || []).length > 0 && (
                    <View style={styles.paymentHistory}>
                      <Text style={styles.paymentHistoryTitle}>Payment History:</Text>
                      {trip.lipaLater.payments.map((p, pidx) => (
                        <View key={pidx} style={styles.paymentHistoryRow}>
                          <Text style={styles.paymentHistoryAmount}>KSh {p.amount.toLocaleString()}</Text>
                          <Text style={styles.paymentHistoryDate}>{new Date(p.date).toLocaleDateString()}</Text>
                        </View>
                      ))}
                    </View>
                  )}

                  {/* Action Button */}
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
          <View style={styles.noResults}>
            <Text style={styles.noResultsText}>
              {searchTerm ? '❌ No customers match your search.' : '✅ No pending Lipa Later payments right now. 🎉'}
            </Text>
          </View>
        )}
      </View>

      {/* Pagination */}
      {totalPages > 1 && (
        <View style={styles.paginationContainer}>
          <Text style={styles.paginationInfo}>
            Showing {displayRecords.length === 0 ? 0 : startIdx + 1}–{endIdx} of {filteredTrips.length} {searchTerm ? 'matching ' : ''}customers (Page {validPage} of {totalPages})
          </Text>
          <View style={styles.paginationButtons}>
            <TouchableOpacity
              style={[styles.paginationBtn, !canPrevPage && styles.paginationBtnDisabled]}
              onPress={handlePrevPage}
              disabled={!canPrevPage}
            >
              <Text style={styles.paginationBtnText}>← Previous</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.paginationBtn, !canNextPage && styles.paginationBtnDisabled]}
              onPress={handleNextPage}
              disabled={!canNextPage}
            >
              <Text style={styles.paginationBtnText}>Next →</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Ageing Report Link */}
      <TouchableOpacity
        style={styles.ageingLink}
        onPress={() => navigation.navigate('LipaLaterAgeing')}
      >
        <Text style={styles.ageingLinkText}>📊 View Payment Ageing Report</Text>
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
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 13,
    color: '#8b5cf6',
    marginBottom: 16,
  },
  warningBanner: {
    backgroundColor: '#fdf3df',
    borderLeftWidth: 4,
    borderLeftColor: '#c98a12',
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 20,
    borderRadius: 8,
  },
  warningText: {
    fontSize: 13,
    color: '#1a1c20',
  },
  warningBold: {
    fontWeight: '700',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: '#e7e4db',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#1a1c20',
  },
  clearBtn: {
    backgroundColor: '#f0f0f0',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  clearBtnText: {
    fontSize: 12,
    color: '#1a1c20',
    fontWeight: '600',
  },
  recordsContainer: {
    marginBottom: 20,
  },
  recordItem: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e7e4db',
    borderRadius: 12,
    marginBottom: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    flexDirection: 'row',
  },
  recordItemOverdue: {
    backgroundColor: '#fdecea',
    borderColor: '#f6cac7',
  },
  recordItemDueToday: {
    backgroundColor: '#fdf3df',
    borderColor: '#ffe3c2',
  },
  recordNumber: {
    fontSize: 13,
    fontWeight: '700',
    color: '#5b606c',
    marginRight: 12,
    minWidth: 20,
  },
  recordContent: {
    flex: 1,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  customerName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1a1c20',
  },
  badge: {
    fontSize: 10,
    fontWeight: '700',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    overflow: 'hidden',
  },
  badgeRed: {
    backgroundColor: '#fdecea',
    color: '#e0453f',
  },
  badgeAmber: {
    backgroundColor: '#fdf3df',
    color: '#c98a12',
  },
  badgeGrey: {
    backgroundColor: '#f0f0f0',
    color: '#5b606c',
  },
  phone: {
    fontSize: 12,
    color: '#5b606c',
    marginBottom: 8,
  },
  gridRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  gridItem: {
    flex: 1,
  },
  gridLabel: {
    fontSize: 10,
    color: '#5b606c',
    marginBottom: 2,
  },
  gridValue: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1a1c20',
  },
  paymentStatus: {
    backgroundColor: 'rgba(30,158,111,.08)',
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderRadius: 6,
    marginBottom: 8,
  },
  paymentStatusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 3,
  },
  paymentStatusLabel: {
    fontSize: 11,
    color: '#5b606c',
  },
  paymentStatusValue: {
    fontSize: 11,
    fontWeight: '700',
  },
  paymentStatusValueGreen: {
    fontSize: 11,
    fontWeight: '700',
    color: '#1e9e6f',
  },
  paymentHistory: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,.1)',
    paddingTopWidth: 10,
    marginTop: 10,
    marginBottom: 8,
  },
  paymentHistoryTitle: {
    fontSize: 11,
    fontWeight: '600',
    color: '#5b606c',
    marginBottom: 6,
  },
  paymentHistoryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
    fontSize: 11,
  },
  paymentHistoryAmount: {
    fontSize: 11,
    color: '#1a1c20',
  },
  paymentHistoryDate: {
    fontSize: 11,
    color: '#5b606c',
  },
  recordPaymentBtn: {
    backgroundColor: '#ff7a1a',
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: 'center',
    marginTop: 10,
  },
  recordPaymentBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#fff',
  },
  settledBadge: {
    backgroundColor: 'rgba(30,158,111,.15)',
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: 'center',
    marginTop: 10,
  },
  settledText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1e9e6f',
  },
  noResults: {
    paddingVertical: 20,
    alignItems: 'center',
  },
  noResultsText: {
    fontSize: 14,
    color: '#5b606c',
  },
  paginationContainer: {
    marginBottom: 20,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#e7e4db',
  },
  paginationInfo: {
    fontSize: 11,
    color: '#5b606c',
    marginBottom: 10,
  },
  paginationButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  paginationBtn: {
    flex: 1,
    backgroundColor: '#f0f0f0',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  paginationBtnDisabled: {
    opacity: 0.5,
  },
  paginationBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1a1c20',
  },
  ageingLink: {
    backgroundColor: '#f0f0f0',
    borderWidth: 1.5,
    borderColor: '#e7e4db',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 12,
  },
  ageingLinkText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1a1c20',
  },
});