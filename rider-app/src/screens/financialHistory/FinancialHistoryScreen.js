import React, { useState, useCallback, useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, FlatList } from 'react-native';
import { useTranslation } from '../../i18n/LocalizationProvider';
import { useToast } from '../../components/Toast';
import BackLink from '../../components/BackLink';
import { getFinancialSummary, getEarliestTransactionDate, syncFinancialDataFromAPI } from '../../offline/financialHistoryRepository';
import { useRider } from '../../rider/RiderContext'; // ✅ Primary source
import { getLocalRiderId } from '../../offline/db'; // ✅ Fallback/persistent source

/**
 * FinancialHistoryScreen.js - ENHANCED v2.0
 * ✅ FIXED: Robust rider_id management using local storage fallback
 * ✅ FIXED: Implements dual-source pattern (context + local storage)
 * ✅ FIXED: Syncs expense data from API before displaying
 * ✅ FIXED: Proper error handling and logging
 * 
 * Rider ID Resolution:
 * 1. Try to get from local storage (persistent, survives app restart)
 * 2. Fall back to useRider hook (real-time, from context)
 * 3. Use effective rider ID for all API calls
 */

const QUICK_SELECT_PERIODS = [
  { key: 'thisMonth', label: 'This Month' },
  { key: 'lastMonth', label: 'Last Month' },
  { key: 'last3', label: 'Last 3 Months' },
  { key: 'last6', label: 'Last 6 Months' },
  { key: 'sinceJoining', label: 'Since Joining' },
];

export default function FinancialHistoryScreen({ navigation, route }) {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const { state } = useRider(); // ✅ Get context (may be null/undefined)

  // ✅ FIXED: Dual-source rider ID management
  const [localRiderId, setLocalRiderId] = useState(null); // Local storage
  const [selectedPeriod, setSelectedPeriod] = useState('thisMonth');
  const [rangeStart, setRangeStart] = useState(Date.now());
  const [rangeEnd, setRangeEnd] = useState(Date.now());
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [earliestDate, setEarliestDate] = useState(null);
  const [syncingData, setSyncingData] = useState(false);

  // ✅ FIXED: Load rider ID from local storage on component mount
  useEffect(() => {
    const loadRiderId = async () => {
      try {
        const id = await getLocalRiderId();
        if (id) {
          console.log('[FinancialHistoryScreen] Loaded rider_id from local storage:', id);
          setLocalRiderId(id);
        } else {
          console.warn('[FinancialHistoryScreen] No rider_id found in local storage');
        }
      } catch (err) {
        console.error('[FinancialHistoryScreen] Error loading rider ID from local storage:', err);
      }
    };

    loadRiderId();
  }, []);

  // ✅ FIXED: Determine effective rider ID (prefer local storage, fall back to context)
  const effectiveRiderId = localRiderId || state?.riderId;

  const calculateDateRange = useCallback((period, earliest) => {
    const now = new Date();
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).getTime();
    let start, end = Date.now();

    switch (period) {
      case 'thisMonth':
        start = thisMonthStart;
        break;
      case 'lastMonth':
        start = lastMonthStart;
        end = thisMonthStart;
        break;
      case 'last3':
        start = Date.now() - 90 * 24 * 3600000;
        break;
      case 'last6':
        start = Date.now() - 180 * 24 * 3600000;
        break;
      case 'sinceJoining':
        start = earliest || thisMonthStart;
        break;
      default:
        start = thisMonthStart;
    }

    // Only clamp start if we have real transaction data
    if (earliest !== null) {
      start = Math.max(start, earliest);
    }

    end = Math.max(end, start);

    return { start, end };
  }, []);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);

      // ✅ FIXED: Validate rider ID before proceeding
      if (!effectiveRiderId) {
        console.error('[FinancialHistoryScreen] No rider ID available (context or local storage)');
        showToast('Unable to load financial history - rider ID missing', 'error');
        setLoading(false);
        return;
      }

      console.log(`[FinancialHistoryScreen] Loading data for rider: ${effectiveRiderId}, period: ${selectedPeriod}`);

      // ✅ FIXED: Sync financial data from API BEFORE displaying
      // This fetches all expense data (fuel, service, other) from backend
      setSyncingData(true);
      try {
        console.log('[FinancialHistoryScreen] Starting financial data sync...');
        await syncFinancialDataFromAPI(effectiveRiderId, 'all_time');
        console.log('[FinancialHistoryScreen] Financial data sync completed successfully');
      } catch (syncErr) {
        console.warn('[FinancialHistoryScreen] Financial data sync failed (will fall back to local storage):', syncErr.message);
        // Continue anyway - will use locally cached data
        // This allows the screen to work offline
      } finally {
        setSyncingData(false);
      }

      // Get earliest transaction date
      const earliest = await getEarliestTransactionDate();
      console.log('[FinancialHistoryScreen] Earliest transaction date:', earliest ? new Date(earliest).toISOString() : 'none');
      setEarliestDate(earliest);

      // Calculate range for selected period
      const { start, end } = calculateDateRange(selectedPeriod, earliest);
      setRangeStart(start);
      setRangeEnd(end);

      // Get financial summary for range
      const financialSummary = await getFinancialSummary(start, end);
      setSummary(financialSummary);

      console.log('[FinancialHistoryScreen] Summary loaded successfully:', {
        period: selectedPeriod,
        income: financialSummary.income,
        expenses: financialSummary.totalExpense,
        profit: financialSummary.netProfit,
      });
    } catch (err) {
      console.error('[FinancialHistoryScreen] Error loading data:', err);
      showToast('Error loading financial history', 'error');
    } finally {
      setLoading(false);
    }
  }, [selectedPeriod, calculateDateRange, showToast, effectiveRiderId]);

  useEffect(() => {
    loadData();
  }, [selectedPeriod, loadData]);

  const handleQuickSelect = (period) => {
    console.log('[FinancialHistoryScreen] Selected period:', period);
    setSelectedPeriod(period);
  };

  const handleViewTransactions = () => {
    if (!effectiveRiderId) {
      showToast('Rider ID not available', 'error');
      return;
    }
    navigation.navigate('TransactionList', {
      rangeStart,
      rangeEnd,
      selectedPeriod,
      riderId: effectiveRiderId,
    });
  };

  const handleGenerateStatement = () => {
    if (!effectiveRiderId) {
      showToast('Rider ID not available', 'error');
      return;
    }
    navigation.navigate('GenerateStatement', {
      rangeStart,
      rangeEnd,
      selectedPeriod,
      riderId: effectiveRiderId,
    });
  };

  if (loading || !summary) {
    return (
      <View style={styles.container}>
        <Text style={styles.loadingText}>
          {syncingData ? 'Syncing your financial data...' : 'Loading financial history...'}
        </Text>
      </View>
    );
  }

  // Build category breakdown from summary (category breakdown sorted by amount, descending)
  const allCategories = [
    { key: 'Fuel/Energy', amount: summary.fuel || 0 },
    { key: 'Service', amount: summary.service || 0 },
    ...(Object.entries(summary.otherByCategory || {}).map(([cat, amt]) => ({ key: cat, amount: amt }))),
  ];

  const expenseCategories = allCategories
    .filter(({ amount }) => amount > 0)
    .sort((a, b) => b.amount - a.amount);

  const totalExpense = summary.totalExpense || 1;

  return (
    <ScrollView style={styles.container}>
      <BackLink label="← Home" onPress={() => navigation.navigate('Home')} />

      <Text style={styles.screenTitle}>My Financial History &amp; Statements</Text>

      {/* Quick Select Period Tiles */}
      <View style={styles.quickSelectGrid}>
        {QUICK_SELECT_PERIODS.map((period) => (
          <TouchableOpacity
            key={period.key}
            style={[
              styles.quickSelectTile,
              selectedPeriod === period.key && styles.quickSelectTileSelected,
            ]}
            onPress={() => handleQuickSelect(period.key)}
          >
            <Text
              style={[
                styles.quickSelectText,
                selectedPeriod === period.key && styles.quickSelectTextSelected,
              ]}
            >
              {period.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Date Range Display */}
      <Text style={styles.dateRangeHint}>
        {new Date(rangeStart).toLocaleDateString()} — {new Date(rangeEnd).toLocaleDateString()}
      </Text>

      {/* Profit Hero Card */}
      <View style={styles.profitHero}>
        <Text style={styles.profitLabel}>Net Profit (Selected Range)</Text>
        <Text style={styles.profitAmount}>KSh {summary.netProfit.toLocaleString()}</Text>
        <View style={styles.profitSplit}>
          <Text style={styles.profitSplitItem}>Income: KSh {summary.income.toLocaleString()}</Text>
          <Text style={styles.profitSplitItem}>
            Expense: KSh {summary.totalExpense.toLocaleString()}
          </Text>
        </View>
      </View>

      {/* Category Breakdown */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Category Breakdown</Text>
        {expenseCategories.length > 0 ? (
          expenseCategories.map(({ key, amount }) => {
            const percentage = Math.round((amount / totalExpense) * 100);
            return (
              <View key={key} style={styles.categoryRow}>
                <Text style={styles.categoryName}>{key}</Text>
                <View style={styles.categoryValues}>
                  <Text style={styles.categoryPercentage}>{percentage}%</Text>
                  <Text style={styles.categoryAmount}>KSh {amount.toLocaleString()}</Text>
                </View>
              </View>
            );
          })
        ) : (
          <Text style={styles.noDataHint}>No expenses in this range.</Text>
        )}
      </View>

      {/* Action Buttons */}
      <TouchableOpacity style={styles.ghostButton} onPress={handleViewTransactions}>
        <Text style={styles.ghostButtonText}>📜 View Transactions →</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.primaryButton} onPress={handleGenerateStatement}>
        <Text style={styles.primaryButtonText}>📄 Generate a Statement →</Text>
      </TouchableOpacity>

      <View style={{ height: 20 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f6f4ef',
    padding: 16,
  },
  screenTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1a1c20',
    marginBottom: 16,
  },
  loadingText: {
    fontSize: 14,
    color: '#5b606c',
    textAlign: 'center',
    marginTop: 20,
  },
  quickSelectGrid: {
    display: 'flex',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  quickSelectTile: {
    flex: 1,
    minWidth: '48%',
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: '#e7e4db',
    borderRadius: 12,
    paddingVertical: 11,
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickSelectTileSelected: {
    borderColor: '#ff7a1a',
    backgroundColor: '#fff6ee',
  },
  quickSelectText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#5b606c',
    textAlign: 'center',
  },
  quickSelectTextSelected: {
    color: '#ff7a1a',
    fontWeight: '700',
  },
  dateRangeHint: {
    fontSize: 12,
    color: '#5b606c',
    marginBottom: 14,
    textAlign: 'center',
  },
  profitHero: {
    backgroundColor: '#1a1c20',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 18,
    marginBottom: 14,
  },
  profitLabel: {
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.06,
    color: '#a9adb6',
    fontWeight: '700',
    marginBottom: 6,
  },
  profitAmount: {
    fontFamily: 'SpaceGrotesk-Bold',
    fontSize: 28,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 10,
  },
  profitSplit: {
    display: 'flex',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  profitSplitItem: {
    fontSize: 11,
    color: '#a9adb6',
  },
  card: {
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: '#e7e4db',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 14,
  },
  cardTitle: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#1a1c20',
    marginBottom: 12,
  },
  categoryRow: {
    display: 'flex',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: '#e7e4db',
  },
  categoryName: {
    fontSize: 12.5,
    color: '#1a1c20',
  },
  categoryValues: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  categoryPercentage: {
    fontSize: 11,
    color: '#5b606c',
  },
  categoryAmount: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#1a1c20',
  },
  noDataHint: {
    fontSize: 12,
    color: '#5b606c',
    paddingVertical: 8,
  },
  ghostButton: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: '#e7e4db',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    marginBottom: 8,
  },
  ghostButtonText: {
    color: '#5b606c',
    fontWeight: '600',
    fontSize: 13,
  },
  primaryButton: {
    backgroundColor: '#ff7a1a',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 13,
  },
});
