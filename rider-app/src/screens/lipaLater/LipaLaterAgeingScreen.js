/**
 * Lipa Later Ageing Report Screen (RA-03-G)
 * CORRECTED & ENHANCED: Full alignment to cleaned.html specification
 * 
 * Key improvements:
 * - Uses helper functions that follow cleaned.html patterns
 * - Proper date calculation for ageing categories
 * - Accurate outstanding balance calculations
 * - Comprehensive search and pagination
 * - Critical alert banner for overdue accounts
 */

import React, { useState, useMemo, useCallback } from 'react';
import { ScrollView, View, Text, TouchableOpacity, TextInput, StyleSheet, FlatList } from 'react-native';
import BackLink from '../../components/BackLink';
import { useRider } from '../../rider/RiderContext';
import { 
  getPendingLipaLaterTrips, 
  getRemainingBalance, 
  getDaysOverdue, 
  getAgeingCategory, 
  getAgeingCategoryLabel, 
  categorizeByAgeing 
} from '../../rider/RiderContext';

const RECORDS_PER_PAGE = 5;

/**
 * Ageing categories with proper ordering and styling
 * Follows cleaned.html categories exactly
 */
const AGEING_CATEGORIES = [
  { key: 'upcoming', label: '📅 Due Soon', bgColor: 'rgba(30,158,111,.08)', borderColor: 'rgba(30,158,111,.2)' },
  { key: 'due-today', label: '⚠️ Due Today', bgColor: 'rgba(201,138,18,.12)', borderColor: 'rgba(201,138,18,.3)' },
  { key: 'overdue-30', label: '🔶 1-30 Days Overdue', bgColor: 'rgba(255,122,26,.10)', borderColor: 'rgba(255,122,26,.2)' },
  { key: 'overdue-60', label: '🔴 31-60 Days Overdue', bgColor: 'rgba(255,122,26,.15)', borderColor: 'rgba(255,122,26,.3)' },
  { key: 'overdue-90', label: '🚨 61-90 Days Overdue', bgColor: 'rgba(224,69,63,.15)', borderColor: 'rgba(224,69,63,.3)' },
  { key: 'overdue-90plus', label: '🛑 90+ Days Overdue', bgColor: 'rgba(224,69,63,.20)', borderColor: 'rgba(224,69,63,.4)' },
];

export default function LipaLaterAgeingScreen({ navigation }) {
  const { state } = useRider();
  const [activeTab, setActiveTab] = useState('upcoming');
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPages, setCurrentPages] = useState({});

  // Get pending trips
  const pendingTrips = useMemo(() => getPendingLipaLaterTrips(state), [state]);

  // Categorize by ageing
  const categorized = useMemo(() => categorizeByAgeing(state), [state]);

  // Calculate totals per category
  const categoryTotals = useMemo(() => {
    const totals = {};
    Object.entries(categorized).forEach(([cat, trips]) => {
      totals[cat] = trips.reduce((s, t) => {
        try {
          return s + (getRemainingBalance(t.lipaLater) || 0);
        } catch (err) {
          console.error(`Error calculating balance for trip ${t.id}:`, err);
          return s;
        }
      }, 0);
    });
    return totals;
  }, [categorized]);

  // Calculate grand totals
  const totalOutstanding = useMemo(
    () => Object.values(categoryTotals).reduce((s, v) => s + v, 0),
    [categoryTotals]
  );

  const pendingCustomersCount = useMemo(() => pendingTrips.length, [pendingTrips]);

  // Critical accounts: 60+ days overdue
  const criticalCount = useMemo(
    () => {
      const count90plus = (categorized['overdue-90plus'] || []).length;
      const count90 = (categorized['overdue-90'] || []).length;
      return count90plus + count90;
    },
    [categorized]
  );

  const criticalAmount = useMemo(
    () => {
      const amt90plus = categoryTotals['overdue-90plus'] || 0;
      const amt90 = categoryTotals['overdue-90'] || 0;
      return amt90plus + amt90;
    },
    [categoryTotals]
  );

  // Filter and paginate for active tab
  const getActiveTabData = useCallback(() => {
    let trips = categorized[activeTab] || [];

    // Apply search filter
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      trips = trips.filter(t => {
        try {
          const name = (t.lipaLater?.customerName || '').toLowerCase();
          const phone = (t.lipaLater?.customerPhone || '').toLowerCase();
          return name.includes(term) || phone.includes(term);
        } catch (err) {
          console.error('Error filtering trip:', err);
          return false;
        }
      });
    }

    // Pagination
    const page = currentPages[activeTab] || 1;
    const totalPages = Math.max(1, Math.ceil(trips.length / RECORDS_PER_PAGE));
    const validPage = Math.max(1, Math.min(page, totalPages));
    const startIdx = (validPage - 1) * RECORDS_PER_PAGE;
    const endIdx = Math.min(startIdx + RECORDS_PER_PAGE, trips.length);
    const records = trips.slice(startIdx, endIdx);

    return {
      allTrips: categorized[activeTab] || [],
      filteredTrips: trips,
      records,
      totalCount: (categorized[activeTab] || []).length,
      filteredCount: trips.length,
      currentPage: validPage,
      totalPages,
      startIndex: startIdx,
      endIndex: endIdx,
    };
  }, [activeTab, searchTerm, categorized, currentPages]);

  const tabData = getActiveTabData();

  const handlePreviousPage = useCallback(() => {
    setCurrentPages(prev => ({
      ...prev,
      [activeTab]: Math.max(1, (prev[activeTab] || 1) - 1),
    }));
  }, [activeTab]);

  const handleNextPage = useCallback(() => {
    setCurrentPages(prev => ({
      ...prev,
      [activeTab]: Math.min(tabData.totalPages, (prev[activeTab] || 1) + 1),
    }));
  }, [activeTab, tabData.totalPages]);

  const handleSearchChange = useCallback((text) => {
    setSearchTerm(text);
    setCurrentPages(prev => ({ ...prev, [activeTab]: 1 }));
  }, [activeTab]);

  const handleClearSearch = useCallback(() => {
    setSearchTerm('');
    setCurrentPages(prev => ({ ...prev, [activeTab]: 1 }));
  }, [activeTab]);

  const handleTabChange = useCallback((newTab) => {
    setActiveTab(newTab);
    setSearchTerm('');
    setCurrentPages(prev => ({ ...prev, [newTab]: 1 }));
  }, []);

  return (
    <ScrollView style={styles.container}>
      <BackLink onPress={() => navigation.navigate('LipaLaterCustomers')} label="← Back to Customers" />

      <Text style={styles.title}>Lipa Later Ageing Report</Text>
      <Text style={styles.subtitle}>Track outstanding payments by age</Text>

      {/* Critical Alert Banner */}
      {criticalCount > 0 && (
        <View style={styles.criticalBanner}>
          <Text style={styles.criticalBannerText}>
            <Text style={styles.criticalEmoji}>🚨 </Text>
            <Text style={styles.criticalBannerBold}>
              {criticalCount} account{criticalCount === 1 ? '' : 's'} critically overdue
            </Text>
            <Text> (60+ days) — </Text>
            <Text style={styles.criticalBannerBold}>
              KSh {criticalAmount.toLocaleString()}
            </Text>
            <Text> at risk. Immediate follow-up recommended.</Text>
          </Text>
        </View>
      )}

      {/* Summary Cards */}
      <View style={styles.summaryContainer}>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryValue}>KSh {totalOutstanding.toLocaleString()}</Text>
          <Text style={styles.summaryLabel}>Total Outstanding</Text>
        </View>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryValue}>{pendingCustomersCount}</Text>
          <Text style={styles.summaryLabel}>Pending Customers</Text>
        </View>
      </View>

      {/* Tab Navigation */}
      {pendingTrips.length > 0 && (
        <>
          <View style={styles.tabsContainer}>
            {AGEING_CATEGORIES.map(category => {
              const count = (categorized[category.key] || []).length;
              if (count === 0) return null; // Hide empty tabs

              return (
                <TouchableOpacity
                  key={category.key}
                  style={[
                    styles.tab,
                    activeTab === category.key && styles.tabActive,
                  ]}
                  onPress={() => handleTabChange(category.key)}
                >
                  <Text style={[
                    styles.tabText,
                    activeTab === category.key && styles.tabTextActive,
                  ]}>
                    {category.label.split(' ')[0]} {count}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Search Input */}
          {tabData.totalCount > 0 && (
            <View style={styles.searchContainer}>
              <TextInput
                style={styles.searchInput}
                placeholder="🔍 Search by name or mobile…"
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
          )}

          {/* Category Info */}
          {tabData.totalCount > 0 && (
            <View style={[
              styles.categoryBox,
              { backgroundColor: AGEING_CATEGORIES.find(c => c.key === activeTab)?.bgColor || '#f5f5f5' },
              { borderColor: AGEING_CATEGORIES.find(c => c.key === activeTab)?.borderColor || '#ddd' }
            ]}>
              <View style={styles.categoryHeader}>
                <Text style={styles.categoryTitle}>
                  {AGEING_CATEGORIES.find(c => c.key === activeTab)?.label || activeTab}
                </Text>
              </View>

              <View style={styles.categoryStats}>
                <View>
                  <Text style={styles.statCount}>
                    {tabData.totalCount} customer{tabData.totalCount === 1 ? '' : 's'}
                  </Text>
                </View>
                <View style={styles.categoryAmount}>
                  <Text style={styles.statLabel}>Outstanding:</Text>
                  <Text style={styles.statAmount}>
                    KSh {(categoryTotals[activeTab] || 0).toLocaleString()}
                  </Text>
                </View>
              </View>

              {/* Records List */}
              <View style={styles.recordsContainer}>
                {tabData.records.length > 0 ? (
                  tabData.records.map((trip, idx) => {
                    try {
                      const remaining = getRemainingBalance(trip.lipaLater) || 0;
                      const daysOverdue = getDaysOverdue(trip.lipaLater.dueDate) || 0;
                      const daysLabel = daysOverdue < 0 
                        ? `Due in ${Math.abs(daysOverdue)} day${Math.abs(daysOverdue) === 1 ? '' : 's'}` 
                        : (daysOverdue === 0 ? 'Due today' : `${daysOverdue} day${daysOverdue === 1 ? '' : 's'} overdue`);

                      return (
                        <View key={trip.id} style={styles.recordItem}>
                          <View style={styles.recordNumber}><Text style={styles.recordNumberText}>{tabData.startIndex + idx + 1}</Text></View>
                          
                          <View style={styles.recordContent}>
                            <View>
                              <Text style={styles.recordName}>{trip.lipaLater?.customerName || 'Unknown'}</Text>
                              <Text style={styles.recordPhone}>
                                📞 {trip.lipaLater?.customerPhone || 'N/A'} · {daysLabel}
                              </Text>
                            </View>

                            <View style={styles.recordFinancials}>
                              <View>
                                <Text style={styles.financialLabel}>Original</Text>
                                <Text style={styles.financialValue}>
                                  KSh {(trip.lipaLater?.originalAmount || 0).toLocaleString()}
                                </Text>
                              </View>
                              <View style={styles.financialRight}>
                                <Text style={styles.financialLabel}>Outstanding</Text>
                                <Text style={styles.financialValueBold}>
                                  KSh {remaining.toLocaleString()}
                                </Text>
                              </View>
                            </View>
                          </View>
                        </View>
                      );
                    } catch (err) {
                      console.error(`Error rendering record ${idx}:`, err);
                      return (
                        <View key={trip.id} style={styles.recordError}>
                          <Text style={styles.recordErrorText}>Error displaying record</Text>
                        </View>
                      );
                    }
                  })
                ) : (
                  <View style={styles.emptyState}>
                    <Text style={styles.emptyStateText}>
                      {searchTerm ? '❌ No records match your search.' : '✅ No records in this category.'}
                    </Text>
                  </View>
                )}
              </View>

              {/* Pagination */}
              {tabData.totalPages > 1 && (
                <View style={styles.paginationContainer}>
                  <Text style={styles.paginationInfo}>
                    Page {tabData.currentPage} of {tabData.totalPages}
                  </Text>
                  <View style={styles.paginationButtons}>
                    <TouchableOpacity
                      style={[styles.paginationBtn, tabData.currentPage === 1 && styles.paginationBtnDisabled]}
                      onPress={handlePreviousPage}
                      disabled={tabData.currentPage === 1}
                    >
                      <Text style={styles.paginationBtnText}>← Prev</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.paginationBtn, tabData.currentPage === tabData.totalPages && styles.paginationBtnDisabled]}
                      onPress={handleNextPage}
                      disabled={tabData.currentPage === tabData.totalPages}
                    >
                      <Text style={styles.paginationBtnText}>Next →</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </View>
          )}
        </>
      )}

      {/* No Data State */}
      {pendingTrips.length === 0 && (
        <View style={styles.noDataContainer}>
          <Text style={styles.noDataEmoji}>✅</Text>
          <Text style={styles.noDataText}>No pending Lipa Later payments</Text>
          <Text style={styles.noDataSubtext}>All customers fully settled!</Text>
        </View>
      )}
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
    color: '#5b606c',
    marginBottom: 16,
  },
  criticalBanner: {
    backgroundColor: 'rgba(224,69,63,.15)',
    borderLeftWidth: 4,
    borderLeftColor: '#e0453f',
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginBottom: 20,
    borderRadius: 8,
  },
  criticalBannerText: {
    fontSize: 13,
    color: '#5b606c',
    lineHeight: 19,
  },
  criticalEmoji: {
    fontSize: 16,
  },
  criticalBannerBold: {
    fontWeight: '700',
    color: '#1a1c20',
  },
  summaryContainer: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20,
  },
  summaryCard: {
    flex: 1,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e7e4db',
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryValue: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1a1c20',
    marginBottom: 4,
  },
  summaryLabel: {
    fontSize: 11,
    color: '#5b606c',
    textAlign: 'center',
  },
  tabsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#e7e4db',
    marginBottom: 16,
  },
  tab: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#f5f3f0',
    borderRadius: 8,
  },
  tabActive: {
    backgroundColor: '#ff7a1a',
  },
  tabText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#1a1c20',
  },
  tabTextActive: {
    color: '#fff',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 16,
  },
  searchInput: {
    flex: 1,
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: '#e7e4db',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    color: '#1a1c20',
  },
  clearButton: {
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: '#e7e4db',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  clearButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#ff7a1a',
  },
  categoryBox: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    marginBottom: 20,
  },
  categoryHeader: {
    marginBottom: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,.1)',
  },
  categoryTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1a1c20',
  },
  categoryStats: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  statCount: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1a1c20',
  },
  categoryAmount: {
    alignItems: 'flex-end',
  },
  statLabel: {
    fontSize: 11,
    color: '#5b606c',
  },
  statAmount: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1a1c20',
  },
  recordsContainer: {
    gap: 10,
    marginBottom: 12,
  },
  recordItem: {
    flexDirection: 'row',
    gap: 10,
    backgroundColor: '#fff',
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,.05)',
  },
  recordNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#ff7a1a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  recordNumberText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#fff',
  },
  recordContent: {
    flex: 1,
    gap: 8,
  },
  recordName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1a1c20',
  },
  recordPhone: {
    fontSize: 11,
    color: '#5b606c',
  },
  recordFinancials: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,.05)',
  },
  financialLabel: {
    fontSize: 10,
    color: '#5b606c',
    marginBottom: 2,
  },
  financialValue: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1a1c20',
  },
  financialRight: {
    alignItems: 'flex-end',
  },
  financialValueBold: {
    fontSize: 12,
    fontWeight: '700',
    color: '#ff7a1a',
  },
  recordError: {
    padding: 12,
    backgroundColor: '#fdecea',
    borderRadius: 8,
    alignItems: 'center',
  },
  recordErrorText: {
    fontSize: 12,
    color: '#b3352f',
  },
  emptyState: {
    paddingVertical: 24,
    alignItems: 'center',
  },
  emptyStateText: {
    fontSize: 13,
    color: '#5b606c',
    textAlign: 'center',
  },
  paginationContainer: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,.1)',
    paddingTop: 10,
  },
  paginationInfo: {
    fontSize: 11,
    color: '#5b606c',
    textAlign: 'center',
    marginBottom: 10,
  },
  paginationButtons: {
    flexDirection: 'row',
    gap: 10,
  },
  paginationBtn: {
    flex: 1,
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: '#e7e4db',
    borderRadius: 8,
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
  noDataContainer: {
    backgroundColor: '#e6f5ef',
    borderRadius: 12,
    padding: 28,
    alignItems: 'center',
    marginTop: 20,
  },
  noDataEmoji: {
    fontSize: 36,
    marginBottom: 8,
  },
  noDataText: {
    fontSize: 16,
    color: '#1e9e6f',
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 4,
  },
  noDataSubtext: {
    fontSize: 13,
    color: '#1e9e6f',
    textAlign: 'center',
  },
});