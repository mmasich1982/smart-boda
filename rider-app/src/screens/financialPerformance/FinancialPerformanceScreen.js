// rider-app/src/screens/financialPerformance/FinancialPerformanceScreen.js
// ✅ SEAMLESS ONLINE/OFFLINE: Clean UI, no status banners
// Silently manages sync in background, only shows critical errors

import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import BackLink from '../../components/BackLink';
import api from '../../api/client';
import { useRider } from '../../rider/RiderContext';
import { getLocalRiderId } from '../../offline/db';
import LocalStore from '../../offline/LocalStore';
import { useNetworkStatus, useCriticalError } from '../../hooks/useNetworkStatus';

const FinancialPerformanceScreen = ({ route }) => {
  const { state: riderState } = useRider();
  const [period, setPeriod] = useState(route?.params?.period || 'thisMonth');
  const [performanceData, setPerformanceData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [localRiderId, setLocalRiderId] = useState(null);

  const { isConnected, isInitialized } = useNetworkStatus();
  const { error: criticalError, showError: showCriticalError, clearError: clearCriticalError } = useCriticalError();

  // Load rider ID on mount
  useEffect(() => {
    const loadRiderId = async () => {
      try {
        const id = await getLocalRiderId();
        if (id) {
          setLocalRiderId(id);
          console.log('✅ FinancialPerformance: Loaded rider ID:', id);
        }
      } catch (err) {
        console.error('❌ Error loading rider ID:', err);
      }
    };
    
    loadRiderId();
  }, []);

  const effectiveRiderId = localRiderId || riderState?.riderId;

  /**
   * Load financial performance with smart caching
   */
  const loadPerformance = useCallback(async () => {
    if (!effectiveRiderId || !isInitialized) return;

    try {
      setLoading(true);
      clearCriticalError();

      const cacheKey = `financial_performance_${effectiveRiderId}_${period}`;

      // Try cache first
      console.log('📦 Checking cache...');
      const cachedDataStr = LocalStore.get(cacheKey);
      if (cachedDataStr) {
        try {
          const cached = JSON.parse(cachedDataStr);
          if (cached?.data) {
            if (setLoading) {
              setPerformanceData(cached.data);
              console.log('✅ Loaded performance data from cache');
            }
          }
        } catch (parseErr) {
          console.warn('⚠️ Cache parse error, fetching fresh');
        }
      }

      // Try to sync fresh data if online
      if (isConnected) {
        console.log('📡 Syncing with API...');
        try {
          const response = await api.get(
            `/financial/performance?rider_id=${effectiveRiderId}&period=${period}`
          );

          if (response.data) {
            setPerformanceData(response.data);
            
            // Cache the result
            LocalStore.set(cacheKey, JSON.stringify({
              data: response.data,
              cached_at: new Date().toISOString()
            }));
            console.log('✅ Synced and cached performance data');
          }
        } catch (apiErr) {
          console.warn('⚠️ API sync failed (using cached data):', apiErr.message);
          // Already have cached data - that's fine
        }
      }

      if (!performanceData && !cachedDataStr) {
        showCriticalError('Unable to load financial data. Please try again.', 'data_load');
      }

      setLoading(false);
    } catch (err) {
      console.error('❌ Error loading performance:', err);
      setLoading(false);
      showCriticalError('Failed to load financial data. Please try again.', 'load_error');
    }
  }, [effectiveRiderId, isInitialized, isConnected, period]);

  // Load on mount and when period changes
  useEffect(() => {
    loadPerformance();
  }, [effectiveRiderId, period]);

  // Refresh on screen focus
  useFocusEffect(
    useCallback(() => {
      if (effectiveRiderId && isInitialized) {
        loadPerformance();
      }
    }, [effectiveRiderId, isInitialized, loadPerformance])
  );

  if (!isInitialized) {
    return (
      <ScrollView style={styles.container}>
        <BackLink onPress={() => {}} label="← Back" />
        <Text style={styles.title}>Financial Performance</Text>
        <ActivityIndicator size="large" color="#ff7a1a" style={{ marginTop: 40 }} />
      </ScrollView>
    );
  }

  const profit = performanceData?.netProfit || 0;
  const isPositive = profit >= 0;

  return (
    <ScrollView style={styles.container}>
      <BackLink onPress={() => {}} label="← Back" />
      <Text style={styles.title}>Financial Performance</Text>

      {/* CRITICAL ERROR ONLY - No offline/status messages */}
      {criticalError && (
        <View style={styles.criticalErrorBanner}>
          <Text style={styles.criticalErrorText}>{criticalError}</Text>
          <TouchableOpacity onPress={clearCriticalError}>
            <Text style={styles.dismissText}>Dismiss</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Period Selector */}
      <View style={styles.periodSelector}>
        {[
          { key: 'today', label: 'Today' },
          { key: 'thisWeek', label: 'This Week' },
          { key: 'thisMonth', label: 'This Month' },
          { key: 'year', label: 'Year' },
        ].map((p) => (
          <TouchableOpacity
            key={p.key}
            style={[styles.periodButton, period === p.key && styles.periodButtonActive]}
            onPress={() => setPeriod(p.key)}
            activeOpacity={0.7}
          >
            <Text style={[styles.periodButtonText, period === p.key && styles.periodButtonTextActive]}>
              {p.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Main Profit Card */}
      {performanceData && (
        <>
          <View style={[styles.mainCard, { borderTopColor: isPositive ? '#4CAF50' : '#FF6B6B' }]}>
            <Text style={styles.mainLabel}>Net Profit</Text>
            <Text style={[styles.mainValue, { color: isPositive ? '#4CAF50' : '#FF6B6B' }]}>
              {isPositive ? '+' : ''}KSh {Math.abs(profit).toLocaleString()}
            </Text>
          </View>

          {/* Income & Expense Summary */}
          <View style={styles.summaryRow}>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryIcon}>💰</Text>
              <Text style={styles.summaryLabel}>Total Earnings</Text>
              <Text style={styles.summaryAmount}>
                KSh {(performanceData.totalEarnings || 0).toLocaleString()}
              </Text>
            </View>

            <View style={styles.summaryCard}>
              <Text style={styles.summaryIcon}>💸</Text>
              <Text style={styles.summaryLabel}>Total Expenses</Text>
              <Text style={styles.summaryAmount}>
                KSh {(performanceData.totalExpenses || 0).toLocaleString()}
              </Text>
            </View>
          </View>

          {/* Trips Summary */}
          {performanceData.trips && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>🚗 Trips</Text>
              <View style={styles.card}>
                <View style={styles.row}>
                  <Text style={styles.label}>Total Trips</Text>
                  <Text style={styles.value}>{performanceData.trips.count}</Text>
                </View>
                <View style={styles.row}>
                  <Text style={styles.label}>Trip Earnings</Text>
                  <Text style={styles.value}>KSh {(performanceData.trips.earnings || 0).toLocaleString()}</Text>
                </View>
                <View style={styles.row}>
                  <Text style={styles.label}>Average per Trip</Text>
                  <Text style={styles.value}>KSh {(performanceData.trips.averagePerTrip || 0).toLocaleString()}</Text>
                </View>
              </View>
            </View>
          )}

          {/* Expenses Breakdown */}
          {performanceData.expenses && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>💸 Expenses Breakdown</Text>
              <View style={styles.card}>
                {performanceData.expenses.fuel > 0 && (
                  <View style={styles.row}>
                    <Text style={styles.label}>⛽ Fuel</Text>
                    <Text style={styles.value}>KSh {performanceData.expenses.fuel.toLocaleString()}</Text>
                  </View>
                )}
                {performanceData.expenses.battery > 0 && (
                  <View style={styles.row}>
                    <Text style={styles.label}>🔋 Battery</Text>
                    <Text style={styles.value}>KSh {performanceData.expenses.battery.toLocaleString()}</Text>
                  </View>
                )}
                {performanceData.expenses.service > 0 && (
                  <View style={styles.row}>
                    <Text style={styles.label}>🔧 Service</Text>
                    <Text style={styles.value}>KSh {performanceData.expenses.service.toLocaleString()}</Text>
                  </View>
                )}
                {performanceData.expenses.other > 0 && (
                  <View style={styles.row}>
                    <Text style={styles.label}>📊 Other</Text>
                    <Text style={styles.value}>KSh {performanceData.expenses.other.toLocaleString()}</Text>
                  </View>
                )}
                {Object.values(performanceData.expenses).reduce((a, b) => a + b, 0) === 0 && (
                  <Text style={styles.noDataText}>No expenses recorded</Text>
                )}
              </View>
            </View>
          )}
        </>
      )}

      {loading && !performanceData && (
        <ActivityIndicator size="large" color="#ff7a1a" style={{ marginTop: 40 }} />
      )}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f6f4ef',
    padding: 0
  },
  title: {
    fontFamily: 'SpaceGrotesk-Bold',
    fontSize: 24,
    fontWeight: '700',
    color: '#1a1c20',
    marginBottom: 20,
    paddingHorizontal: 20,
    marginTop: 16
  },

  // CRITICAL ERROR ONLY
  criticalErrorBanner: {
    backgroundColor: '#fdecea',
    borderWidth: 1.5,
    borderColor: '#f6cac7',
    borderRadius: 14,
    padding: 12,
    marginHorizontal: 20,
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

  // Period selector
  periodSelector: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingVertical: 12,
    gap: 8,
    marginBottom: 16
  },
  periodButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: '#e7e4db',
    alignItems: 'center'
  },
  periodButtonActive: {
    backgroundColor: '#ff7a1a',
    borderColor: '#ff7a1a'
  },
  periodButtonText: {
    fontSize: 12,
    color: '#5b606c',
    fontWeight: '600'
  },
  periodButtonTextActive: {
    color: '#fff'
  },

  // Main card
  mainCard: {
    backgroundColor: '#fff',
    marginHorizontal: 20,
    marginBottom: 16,
    paddingVertical: 24,
    paddingHorizontal: 20,
    borderRadius: 14,
    borderTopWidth: 4,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 }
  },
  mainLabel: {
    fontSize: 12,
    color: '#5b606c',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.04,
    marginBottom: 8
  },
  mainValue: {
    fontSize: 28,
    fontWeight: '700',
    marginBottom: 0
  },

  // Summary row
  summaryRow: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    gap: 12,
    marginBottom: 16
  },
  summaryCard: {
    flex: 1,
    backgroundColor: '#fff',
    paddingVertical: 16,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#e7e4db',
    alignItems: 'center'
  },
  summaryIcon: {
    fontSize: 24,
    marginBottom: 8
  },
  summaryLabel: {
    fontSize: 11,
    color: '#5b606c',
    fontWeight: '600',
    marginBottom: 6
  },
  summaryAmount: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1a1c20'
  },

  // Section
  section: {
    paddingHorizontal: 20,
    marginBottom: 16
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1a1c20',
    marginBottom: 10
  },

  // Card
  card: {
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: '#e7e4db',
    borderRadius: 12,
    padding: 14,
    overflow: 'hidden'
  },

  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: '#f0ede7'
  },

  label: {
    fontSize: 12,
    color: '#5b606c',
    fontWeight: '500'
  },

  value: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1a1c20'
  },

  noDataText: {
    fontSize: 12,
    color: '#5b606c',
    fontWeight: '500',
    paddingVertical: 12,
    textAlign: 'center'
  }
});

export default FinancialPerformanceScreen;