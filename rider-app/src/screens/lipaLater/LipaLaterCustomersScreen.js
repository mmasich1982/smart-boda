/**
 * rider-app/src/screens/lipaLater/LipaLaterCustomersScreen.js
 * RA-03-E: Lipa Later Customers List
 * 
 * ✅ SEAMLESS ONLINE/OFFLINE: Silent sync, cache-first loading
 * ✅ MULTILINGUAL: Uses i18n for all UI text
 * ✅ OFFLINE PERSISTENCE: IndexedDB adapter for local-first storage
 * ✅ NETWORK AWARE: Real-time connectivity detection
 * ✅ NO STATUS BANNERS: Only critical errors shown
 * 
 * Displays all Lipa Later customer records with:
 * - Customer name and phone
 * - Original amount and remaining balance
 * - Payment progress
 * - Status (Pending, Partial, Paid)
 * - Due date with overdue indicator
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  ScrollView,
  View,
  Text,
  TextInput,
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

export default function LipaLaterCustomersScreen({ navigation }) {
  const { state } = useRider();
  const { t } = useTranslation();
  const [localRiderId, setLocalRiderId] = useState(null);
  const [customers, setCustomers] = useState([]);
  const [filteredCustomers, setFilteredCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeFilter, setActiveFilter] = useState('all');
  const [totalOutstanding, setTotalOutstanding] = useState(0);

  const { isConnected, isInitialized } = useNetworkStatus();
  const { error: criticalError, showError: showCriticalError, clearError: clearCriticalError } = useCriticalError();

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

  // Load customers data
  useFocusEffect(
    useCallback(() => {
      if (!effectiveRiderId || !isInitialized) return;
      loadCustomers();
    }, [effectiveRiderId, isInitialized])
  );

  const loadCustomers = async () => {
    try {
      setLoading(true);
      clearCriticalError();

      let data = [];

      // Try API first if connected
      if (isConnected && isInitialized) {
        try {
          console.log('📡 Fetching Lipa Later customers from API...');
          const response = await api.get('/trips/lipa-later/', {
            params: { rider_id: effectiveRiderId }
          });

          if (response.data && Array.isArray(response.data)) {
            data = response.data;
            console.log('✅ Loaded customers from API:', data.length);

            // ✅ Cache the data using IndexedDB
            await indexedDbAdapter.kvSet(
              `lipa_customers_${effectiveRiderId}`,
              JSON.stringify(data)
            );
          }
        } catch (apiErr) {
          console.warn('⚠️ API fetch failed, falling back to cache:', apiErr.message);
          // Fallback to cache
          data = await loadCustomersFromCache();
        }
      } else {
        // Offline mode - use cache
        console.log('📴 Offline mode: Loading from cache');
        data = await loadCustomersFromCache();
      }

      // Process and set data
      if (data && Array.isArray(data)) {
        setCustomers(data);
        applyFilters(data, activeFilter, searchTerm);
        calculateTotalOutstanding(data);
      } else {
        setCustomers([]);
        setFilteredCustomers([]);
        setTotalOutstanding(0);
      }
    } catch (err) {
      console.error('❌ Error loading customers:', err);
      showCriticalError(t('error_loadCustomers') || 'Unable to load customers. Please try again.', 'data_load');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const loadCustomersFromCache = async () => {
    try {
      // ✅ Use IndexedDB adapter instead of LocalStore
      const cached = await indexedDbAdapter.kvGet(`lipa_customers_${effectiveRiderId}`);
      if (cached) {
        const data = typeof cached === 'string' ? JSON.parse(cached) : cached;
        console.log('✅ Loaded customers from IndexedDB cache:', data.length);
        return data;
      }
    } catch (err) {
      console.warn('⚠️ Cache load failed:', err);
    }
    return [];
  };

  const applyFilters = (data, filter, search) => {
    let filtered = data;

    // Apply status filter
    if (filter !== 'all') {
      filtered = filtered.filter(r => r.status === filter);
    }

    // Apply search filter
    if (search.trim()) {
      const searchLower = search.toLowerCase();
      filtered = filtered.filter(r =>
        r.customer_name.toLowerCase().includes(searchLower) ||
        r.customer_mobile.includes(search)
      );
    }

    // Sort by due date
    filtered = filtered.sort((a, b) => new Date(a.due_date) - new Date(b.due_date));

    setFilteredCustomers(filtered);
  };

  const calculateTotalOutstanding = (data) => {
    const total = data.reduce((sum, r) => {
      const remaining = parseFloat(r.remaining_balance || r.amount || 0);
      return sum + remaining;
    }, 0);
    setTotalOutstanding(total);
  };

  const handleFilterChange = (filter) => {
    setActiveFilter(filter);
    applyFilters(customers, filter, searchTerm);
  };

  const handleSearch = (text) => {
    setSearchTerm(text);
    applyFilters(customers, activeFilter, text);
  };

  const handleRefresh = () => {
    setRefreshing(true);
    loadCustomers();
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

  const getDaysUntilDue = (dueDate) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const due = new Date(dueDate);
    due.setHours(0, 0, 0, 0);
    const diffTime = due - today;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  const renderCustomer = ({ item }) => {
    const remaining = parseFloat(item.remaining_balance || item.amount || 0);
    const original = parseFloat(item.amount || 0);
    const paid = original - remaining;
    const paymentPercentage = original > 0 ? (paid / original) * 100 : 0;
    const daysUntilDue = getDaysUntilDue(item.due_date);

    const isOverdue = daysUntilDue < 0;
    const isDueToday = daysUntilDue === 0;

    return (
      <TouchableOpacity
        onPress={() => navigation.navigate('LipaLaterDetails', { recordId: item.id, record: item })}
        activeOpacity={0.7}
      >
        <View
          style={[
            styles.customerCard,
            { borderLeftColor: getStatusColor(item.status) }
          ]}
        >
          {/* Header */}
          <View style={styles.cardHeader}>
            <Text style={styles.customerName}>{item.customer_name}</Text>
            <View
              style={[
                styles.statusBadge,
                { backgroundColor: getStatusColor(item.status) }
              ]}
            >
              <Text style={styles.statusBadgeText}>{getStatusLabel(item.status)}</Text>
            </View>
          </View>

          {/* Phone */}
          <Text style={styles.phoneText}>{item.customer_mobile}</Text>

          {/* Amount Grid */}
          <View style={styles.amountGrid}>
            <View style={styles.amountCell}>
              <Text style={styles.amountLabel}>{t('amount') || 'AMOUNT'}</Text>
              <Text style={styles.amountValue}>KSh {original.toLocaleString()}</Text>
            </View>
            <View style={styles.amountCell}>
              <Text style={[styles.amountLabel, { color: '#4CAF50' }]}>{t('paid') || 'PAID'}</Text>
              <Text style={[styles.amountValue, { color: '#4CAF50' }]}>KSh {paid.toLocaleString()}</Text>
            </View>
            <View style={styles.amountCell}>
              <Text style={[styles.amountLabel, { color: '#FFA500' }]}>{t('remaining') || 'REMAINING'}</Text>
              <Text style={[styles.amountValue, { color: '#FFA500' }]}>KSh {remaining.toLocaleString()}</Text>
            </View>
          </View>

          {/* Progress Bar */}
          <View style={styles.progressBarContainer}>
            <View
              style={[
                styles.progressBarFill,
                {
                  width: `${paymentPercentage}%`,
                  backgroundColor: paymentPercentage === 100 ? '#4CAF50' : '#FFA500'
                }
              ]}
            />
          </View>

          {/* Due Date */}
          <View style={styles.dueDateRow}>
            <Text style={styles.dueText}>{t('due') || 'Due'}: {item.due_date}</Text>
            <View>
              {isOverdue && (
                <Text style={styles.overdueText}>
                  {Math.abs(daysUntilDue)} {t('daysOverdue') || 'days overdue'}
                </Text>
              )}
              {isDueToday && (
                <Text style={styles.dueTodayText}>{t('dueToday') || 'Due Today'} ⚠️</Text>
              )}
              {!isOverdue && !isDueToday && daysUntilDue > 0 && (
                <Text style={styles.daysToGoText}>
                  {daysUntilDue} {t('daysToGo') || 'days to go'}
                </Text>
              )}
            </View>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  if (!isInitialized) {
    return (
      <ScrollView style={styles.container}>
        <BackLink onPress={() => navigation.goBack()} label={t('backLabel') || '← Back'} />
        <Text style={styles.title}>{t('lipaLaterCustomers') || 'Lipa Later Customers'}</Text>
        <ActivityIndicator size="large" color="#ff7a1a" style={{ marginTop: 40 }} />
      </ScrollView>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <ScrollView 
        style={styles.headerSection}
        scrollEnabled={false}
      >
        <BackLink onPress={() => navigation.goBack()} label={t('backLabel') || '← Back'} />
        <Text style={styles.title}>{t('lipaLaterCustomers') || 'Lipa Later Customers'}</Text>

        {/* Error Banner */}
        {criticalError && (
          <View style={styles.criticalErrorBanner}>
            <Text style={styles.criticalErrorText}>⚠️ {criticalError}</Text>
            <TouchableOpacity onPress={clearCriticalError}>
              <Text style={styles.dismissText}>{t('dismiss') || 'Dismiss'}</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Search */}
        <View style={styles.searchContainer}>
          <Text style={styles.searchIcon}>🔍</Text>
          <TextInput
            style={styles.searchInput}
            placeholder={t('searchByNamePhone') || 'Search by name or phone...'}
            placeholderTextColor="#b0a89d"
            value={searchTerm}
            onChangeText={handleSearch}
          />
        </View>

        {/* Filter Buttons */}
        <View style={styles.filterRow}>
          {['all', 'pending', 'partial', 'paid'].map(filter => (
            <TouchableOpacity
              key={filter}
              onPress={() => handleFilterChange(filter)}
              style={[
                styles.filterButton,
                activeFilter === filter && styles.filterButtonActive
              ]}
            >
              <Text
                style={[
                  styles.filterButtonText,
                  activeFilter === filter && styles.filterButtonTextActive
                ]}
              >
                {t(filter) || filter.toUpperCase()}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>

      {/* List */}
      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#ff7a1a" />
          <Text style={styles.loadingText}>{t('loadingCustomers') || 'Loading customers...'}</Text>
        </View>
      ) : filteredCustomers.length === 0 ? (
        <View style={styles.centerContainer}>
          <Text style={styles.emptyTitle}>
            {searchTerm ? t('noResultsFound') || 'No results found' : t('noLipaLaterRecords') || 'No Lipa Later records'}
          </Text>
          <Text style={styles.emptySubtitle}>
            {searchTerm
              ? t('trySearchDifferent') || 'Try searching with a different name or phone number'
              : t('createFromNewTrip') || 'Create a new Lipa Later entry from the New Trip screen'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={filteredCustomers}
          renderItem={renderCustomer}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              colors={['#ff7a1a']}
            />
          }
        />
      )}

      {/* Summary Footer */}
      {filteredCustomers.length > 0 && (
        <View style={styles.summaryFooter}>
          <View>
            <Text style={styles.summaryLabel}>{t('totalOutstanding') || 'TOTAL OUTSTANDING'}</Text>
            <Text style={styles.summaryAmount}>
              KSh {totalOutstanding.toLocaleString()}
            </Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={styles.summaryLabel}>{t('customers') || 'CUSTOMERS'}</Text>
            <Text style={styles.summaryAmount}>{filteredCustomers.length}</Text>
          </View>
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

  searchContainer: {
    backgroundColor: '#f4f4f5',
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    marginBottom: 12
  },
  searchIcon: {
    fontSize: 16,
    marginRight: 8
  },
  searchInput: {
    flex: 1,
    paddingVertical: 11,
    fontSize: 13,
    color: '#1a1c20'
  },

  filterRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12
  },
  filterButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#e0e0e0'
  },
  filterButtonActive: {
    backgroundColor: '#ff7a1a'
  },
  filterButtonText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#666'
  },
  filterButtonTextActive: {
    color: '#fff'
  },

  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20
  },
  loadingText: {
    marginTop: 12,
    color: '#a8a196',
    fontSize: 14
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1a1c20',
    marginBottom: 8
  },
  emptySubtitle: {
    fontSize: 13,
    color: '#a8a196',
    textAlign: 'center'
  },

  listContent: {
    paddingHorizontal: 12,
    paddingVertical: 12,
    paddingBottom: 100
  },

  customerCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    borderLeftWidth: 4
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8
  },
  customerName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1a1c20'
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#fff'
  },
  phoneText: {
    fontSize: 12,
    color: '#a8a196',
    marginBottom: 12
  },

  amountGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
    gap: 8
  },
  amountCell: {
    flex: 1
  },
  amountLabel: {
    fontSize: 10,
    color: '#a8a196',
    fontWeight: '700',
    marginBottom: 2
  },
  amountValue: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#1a1c20'
  },

  progressBarContainer: {
    height: 8,
    backgroundColor: '#e0e0e0',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 12
  },
  progressBarFill: {
    height: '100%'
  },

  dueDateRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  dueText: {
    fontSize: 11,
    color: '#a8a196'
  },
  overdueText: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#d32f2f'
  },
  dueTodayText: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#FFA500'
  },
  daysToGoText: {
    fontSize: 11,
    color: '#a8a196'
  },

  summaryFooter: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
    paddingHorizontal: 20,
    paddingVertical: 16,
    flexDirection: 'row',
    justifyContent: 'space-between'
  },
  summaryLabel: {
    fontSize: 11,
    color: '#a8a196',
    fontWeight: '700',
    marginBottom: 4
  },
  summaryAmount: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1a1c20'
  }
});