// rider-app/src/screens/lipaLater/LipaLaterAgeingScreen.js
// ✅ UPDATED: IndexedDB offline-first architecture for ageing reports
// - Loads customer data from IndexedDB cache
// - Uses calculateAgeing() helper from lipaLaterUtils
// - Network-aware with graceful fallback to cached data
// - Preserves UI/UX exactly as original

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  ScrollView, View, Text, TouchableOpacity, StyleSheet, TextInput, 
  ActivityIndicator, Dimensions
} from 'react-native';
import BackLink from '../../components/BackLink';
import { useTranslation } from '../../i18n/LocalizationProvider';
import { getLocalRiderId } from '../../offline/db';
import indexedDbAdapter from '../../offline/adapters/indexedDbAdapter';
import { useNetworkStatus, useCriticalError } from '../../hooks/useNetworkStatus';
import api from '../../api/client';
import {
  calculateAgeing,
  getPendingLipaLaterCustomers,
  syncLipaLaterFromApi,
} from '../../offline/lipaLaterUtils';

const RECORDS_PER_PAGE = 10;

/**
 * Ageing categories with proper ordering and styling
 * Matches cleaned.html exactly
 */
const AGEING_CATEGORIES = [
  { key: 'current', label: '📅 Current (0-30 days)', color: '#1e9e6f' },
  { key: 'thirtyPlus', label: '🟡 31-60 Days', color: '#ff7a1a' },
  { key: 'sixtyPlus', label: '🔶 61-90 Days', color: '#ff5722' },
  { key: 'ninetyPlus', label: '🔴 90+ Days', color: '#e0453f' },
];

export default function LipaLaterAgeingScreen({ navigation }) {
  const { t } = useTranslation();
  const [localRiderId, setLocalRiderId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [activeTab, setActiveTab] = useState('current');
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [ageingData, setAgeingData] = useState({
    current: { count: 0, total: 0, customers: [] },
    thirtyPlus: { count: 0, total: 0, customers: [] },
    sixtyPlus: { count: 0, total: 0, customers: [] },
    ninetyPlus: { count: 0, total: 0, customers: [] },
  });

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
          console.log('✅ LipaLaterAgeing: Loaded rider ID:', id);
        }
      } catch (err) {
        console.error('❌ Error loading rider ID:', err);
      }
    };
    loadRiderId();
  }, []);

  // ✅ LOAD AGEING DATA ON COMPONENT MOUNT
  useEffect(() => {
    if (!localRiderId || !isInitialized || hasLoadedRef.current) {
      return;
    }

    let isMounted = true;
    let isSyncing = false;

    const loadAgeingData = async () => {
      try {
        if (isMounted) setLoading(true);

        // Load ageing data from cache
        const ageing = await calculateAgeing(localRiderId);
        
        if (isMounted) {
          setAgeingData(ageing);
          console.log('✅ Loaded ageing data from cache');
        }

        // Try to sync from API if online - only if not already syncing
        if (isConnected && isMounted && !isSyncing) {
          try {
            isSyncing = true;
            if (isMounted) setSyncing(true);
            
            const response = await api.get('/lipa-later/customer-list', {
              params: { rider_id: localRiderId }
            });

            if (response.data && Array.isArray(response.data.customers) && isMounted) {
              // Sync API data to cache
              await syncLipaLaterFromApi(localRiderId, response.data.customers);
              
              // Reload ageing data
              const updatedAgeing = await calculateAgeing(localRiderId);
              if (isMounted) {
                setAgeingData(updatedAgeing);
                console.log('✅ Synced ageing data from API');
              }
            }
          } catch (apiErr) {
            console.warn('⚠️ Failed to sync from API, using cached data:', apiErr.message);
          } finally {
            if (isMounted) setSyncing(false);
            isSyncing = false;
          }
        }
      } catch (err) {
        console.error('❌ Error loading ageing data:', err);
        if (isMounted) {
          showCriticalError(
            t('error_loadAgeingFailed') || 'Unable to load ageing report. Please try again.',
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

    loadAgeingData();

    return () => {
      isMounted = false;
    };
  }, [localRiderId, isInitialized]);

  // Filter by search term
  const filterBySearch = useCallback((customers, term) => {
    if (!term || term.trim() === '') return customers;
    const t = term.toLowerCase().trim();
    return customers.filter(c => {
      const name = (c.customerName || '').toLowerCase();
      const phone = (c.customerPhone || '').toLowerCase();
      return name.includes(t) || phone.includes(t);
    });
  }, []);

  // Get paginated data for active tab
  const getPaginatedData = useCallback(() => {
    const customers = ageingData[activeTab]?.customers || [];
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
  }, [ageingData, activeTab, filterBySearch, searchTerm, currentPage]);

  const paginationData = getPaginatedData();
  const activeTabCategory = AGEING_CATEGORIES.find(c => c.key === activeTab);
  const totalOutstanding = Object.values(ageingData).reduce((s, b) => s + (b.total || 0), 0);
  const criticalCount = (ageingData.sixtyPlus?.count || 0) + (ageingData.ninetyPlus?.count || 0);
  const criticalAmount = (ageingData.sixtyPlus?.total || 0) + (ageingData.ninetyPlus?.total || 0);

  const handleClearSearch = useCallback(() => {
    setSearchTerm('');
    setCurrentPage(1);
  }, []);

  const handleSearchChange = useCallback((text) => {
    setSearchTerm(text);
    setCurrentPage(1);
  }, []);

  const handleTabChange = useCallback((tab) => {
    setActiveTab(tab);
    setSearchTerm('');
    setCurrentPage(1);
  }, []);

  const handlePrevPage = useCallback(() => {
    setCurrentPage(prev => Math.max(1, prev - 1));
  }, []);

  const handleNextPage = useCallback(() => {
    setCurrentPage(prev => Math.min(paginationData.totalPages, prev + 1));
  }, [paginationData.totalPages]);

  const handleGoHome = useCallback(() => {
    navigation.navigate('Home');
  }, [navigation]);

  if (!localRiderId || !isInitialized || loading) {
    return (
      <ScrollView style={styles.container}>
        <BackLink onPress={handleGoHome} label="← Home" />
        <Text style={styles.title}>Ageing Report</Text>
        <ActivityIndicator size="large" color="#ffc107" style={{ marginTop: 40 }} />
      </ScrollView>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <BackLink onPress={handleGoHome} label="← Home" />
      <Text style={styles.title}>Ageing Report</Text>

      {/* Sync Status */}
      {syncing && (
        <View style={styles.syncBanner}>
          <Text style={styles.syncText}>🔄 Syncing with server...</Text>
        </View>
      )}

      {/* Critical Alert */}
      {criticalCount > 0 && (
        <View style={styles.criticalAlertBanner}>
          <Text style={styles.criticalAlertTitle}>🚨 CRITICAL ACCOUNTS</Text>
          <Text style={styles.criticalAlertText}>
            {criticalCount} accounts overdue 60+ days
          </Text>
          <Text style={styles.criticalAlertAmount}>
            KSh {criticalAmount.toLocaleString()} at risk
          </Text>
        </View>
      )}

      {/* Summary Banner */}
      <View style={styles.summaryBanner}>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryLabel}>Total Outstanding</Text>
          <Text style={styles.summaryValue}>KSh {totalOutstanding.toLocaleString()}</Text>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryItem}>
          <Text style={styles.summaryLabel}>Total Customers</Text>
          <Text style={styles.summaryValue}>
            {Object.values(ageingData).reduce((s, b) => s + (b.count || 0), 0)}
          </Text>
        </View>
      </View>

      {/* Error Banner */}
      {criticalError && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{criticalError}</Text>
          <TouchableOpacity onPress={clearCriticalError}>
            <Text style={styles.dismissText}>{t('dismiss') || 'Dismiss'}</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Category Tabs */}
      <ScrollView 
        horizontal 
        showsHorizontalScrollIndicator={false}
        style={styles.tabsContainer}
        contentContainerStyle={styles.tabsContent}
      >
        {AGEING_CATEGORIES.map((cat) => {
          const data = ageingData[cat.key] || { count: 0, total: 0 };
          const isActive = activeTab === cat.key;
          
          return (
            <TouchableOpacity
              key={cat.key}
              style={[
                styles.tab,
                isActive && [styles.tabActive, { borderBottomColor: cat.color }],
              ]}
              onPress={() => handleTabChange(cat.key)}
            >
              <Text style={[
                styles.tabLabel,
                isActive && styles.tabLabelActive,
              ]}>
                {cat.label}
              </Text>
              <Text style={[
                styles.tabCount,
                isActive && styles.tabCountActive,
              ]}>
                {data.count}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Search */}
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

      {/* Category Summary */}
      <View style={[
        styles.categoryBanner,
        { borderLeftColor: activeTabCategory?.color }
      ]}>
        <Text style={styles.categoryBannerLabel}>
          {activeTabCategory?.label}
        </Text>
        <Text style={styles.categoryBannerValue}>
          KSh {(ageingData[activeTab]?.total || 0).toLocaleString()}
        </Text>
      </View>

      {/* Records */}
      <View style={styles.recordsContainer}>
        {paginationData.records.length > 0 ? (
          paginationData.records.map((customer, idx) => {
            const recordNum = paginationData.startIndex + idx + 1;
            return (
              <View key={customer.customerId} style={styles.recordItem}>
                <View style={styles.recordNumber}>
                  <Text style={styles.recordNumberText}>{recordNum}</Text>
                </View>

                <View style={styles.recordContent}>
                  <Text style={styles.customerName}>{customer.customerName}</Text>
                  <Text style={styles.customerPhone}>📞 {customer.customerPhone}</Text>
                  <View style={styles.recordDetailRow}>
                    <View style={styles.recordDetail}>
                      <Text style={styles.recordDetailLabel}>Outstanding</Text>
                      <Text style={styles.recordDetailValue}>
                        KSh {(customer.totalOutstanding || 0).toLocaleString()}
                      </Text>
                    </View>
                    <View style={styles.recordDetail}>
                      <Text style={styles.recordDetailLabel}>Trips</Text>
                      <Text style={styles.recordDetailValue}>
                        {(customer.pendingTrips || 0) + (customer.settledTrips || 0)}
                      </Text>
                    </View>
                  </View>
                </View>
              </View>
            );
          })
        ) : (
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateText}>
              {searchTerm ? 'No customers match your search.' : 'No customers in this category.'}
            </Text>
          </View>
        )}
      </View>

      {/* Pagination */}
      {paginationData.totalPages > 1 && (
        <View style={styles.paginationContainer}>
          <Text style={styles.paginationInfo}>
            Page {paginationData.currentPage} of {paginationData.totalPages}
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
              <Text style={styles.paginationBtnText}>← Prev</Text>
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
    marginBottom: 20,
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

  criticalAlertBanner: {
    backgroundColor: '#ffebee',
    borderLeftWidth: 4,
    borderLeftColor: '#e0453f',
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
  },
  criticalAlertTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#c62828',
    marginBottom: 6,
  },
  criticalAlertText: {
    fontSize: 12,
    color: '#d32f2f',
    marginBottom: 4,
  },
  criticalAlertAmount: {
    fontSize: 12,
    fontWeight: '700',
    color: '#e0453f',
  },

  summaryBanner: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e7e4db',
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
  },
  summaryItem: {
    flex: 1,
    alignItems: 'center',
  },
  summaryLabel: {
    fontSize: 10,
    color: '#5b606c',
    fontWeight: '700',
    marginBottom: 4,
  },
  summaryValue: {
    fontSize: 14,
    fontWeight: '700',
    color: '#ff7a1a',
  },
  summaryDivider: {
    width: 1,
    backgroundColor: '#e7e4db',
    marginHorizontal: 14,
  },

  errorBanner: {
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
  errorText: {
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

  tabsContainer: {
    marginBottom: 16,
  },
  tabsContent: {
    gap: 8,
  },
  tab: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e7e4db',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    alignItems: 'center',
    minWidth: 100,
  },
  tabActive: {
    backgroundColor: '#fffbf5',
    borderColor: '#ff7a1a',
  },
  tabLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#5b606c',
  },
  tabLabelActive: {
    color: '#1a1c20',
  },
  tabCount: {
    fontSize: 11,
    color: '#5b606c',
    marginTop: 4,
  },
  tabCountActive: {
    color: '#ff7a1a',
    fontWeight: '700',
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

  categoryBanner: {
    backgroundColor: '#fff',
    borderLeftWidth: 4,
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  categoryBannerLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1a1c20',
  },
  categoryBannerValue: {
    fontSize: 14,
    fontWeight: '700',
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
    marginBottom: 10,
  },
  recordNumber: {
    minWidth: 32,
    height: 32,
    backgroundColor: '#ff7a1a',
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  recordNumberText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#fff',
  },
  recordContent: {
    flex: 1,
  },
  customerName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1a1c20',
    marginBottom: 4,
  },
  customerPhone: {
    fontSize: 11,
    color: '#5b606c',
    marginBottom: 8,
  },
  recordDetailRow: {
    flexDirection: 'row',
    gap: 12,
  },
  recordDetail: {
    flex: 1,
  },
  recordDetailLabel: {
    fontSize: 9,
    color: '#5b606c',
    marginBottom: 2,
  },
  recordDetailValue: {
    fontSize: 11,
    fontWeight: '700',
    color: '#1a1c20',
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
    fontSize: 12,
    fontWeight: '600',
    color: '#ff7a1a',
  },
});