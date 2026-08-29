// rider-app/src/screens/financialHistory/FinancialHistoryScreen.js
// ✅ REFACTORED: IndexedDB-first architecture (mirrors trip screens)
// ✅ SEAMLESS ONLINE/OFFLINE: Uses financialHistoryUtils for data aggregation
// ✅ UNIFIED ARCHITECTURE: Removed financialHistoryRepository dependencies
// ✅ INSTANT UPDATES: useFocusEffect ensures current data on screen focus
// ✅ RETENTION POLICY: 6-month rolling window enforced
// ✅ UI/UX: 100% preserved from original

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, FlatList, ActivityIndicator } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useTranslation } from '../../i18n/LocalizationProvider';
import { useToast } from '../../components/Toast';
import BackLink from '../../components/BackLink';
import { getLocalRiderId } from '../../offline/db';
import {
  getFinancialSummaryForRange,
  getEarliestTransactionDate,
} from '../../offline/financialHistoryUtils';

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

  const hasLoadedRef = useRef(false);
  const [riderId, setRiderId] = useState(null);
  const [selectedPeriod, setSelectedPeriod] = useState('thisMonth');
  const [rangeStart, setRangeStart] = useState(Date.now());
  const [rangeEnd, setRangeEnd] = useState(Date.now());
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [earliestDate, setEarliestDate] = useState(null);

  // ✅ Load rider ID on mount
  useEffect(() => {
    const loadRiderId = async () => {
      try {
        const id = await getLocalRiderId();
        if (id) {
          setRiderId(id);
          console.log('✅ FinancialHistory: Loaded rider ID:', id);
        }
      } catch (err) {
        console.error('❌ Error loading rider ID:', err);
        setError('Failed to load rider information');
      }
    };
    loadRiderId();
  }, []);

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

    if (earliest !== null) {
      start = Math.max(start, earliest);
    }

    end = Math.max(end, start);
    return { start, end };
  }, []);

  const loadData = useCallback(async () => {
    if (!riderId) return;

    try {
      setLoading(true);
      setError(null);

      // Get earliest transaction date
      const earliest = await getEarliestTransactionDate(riderId);
      setEarliestDate(earliest);

      // Calculate date range for selected period
      const { start, end } = calculateDateRange(selectedPeriod, earliest);
      setRangeStart(start);
      setRangeEnd(end);

      // Load financial summary
      const financialSummary = await getFinancialSummaryForRange(riderId, start, end);
      setSummary(financialSummary);

      console.log('✅ Financial history loaded:', {
        period: selectedPeriod,
        income: financialSummary.income,
        expense: financialSummary.totalExpense,
        profit: financialSummary.netProfit,
      });
    } catch (err) {
      console.error('❌ Error loading financial history:', err);
      setError('Failed to load financial history');
      showToast('Error loading financial history', 'error');
    } finally {
      setLoading(false);
    }
  }, [riderId, selectedPeriod, calculateDateRange, showToast]);

  // ✅ Load data on mount (single execution)
  useEffect(() => {
    if (riderId && !hasLoadedRef.current) {
      hasLoadedRef.current = true;
      loadData();
    }
  }, [riderId, loadData]);

  // ✅ Refresh when period changes
  useEffect(() => {
    if (riderId && hasLoadedRef.current) {
      loadData();
    }
  }, [selectedPeriod, riderId, loadData]);

  // ✅ Refresh on screen focus - ensures current data
  useFocusEffect(
    useCallback(() => {
      if (riderId && hasLoadedRef.current) {
        loadData();
      }
    }, [riderId, loadData])
  );

  if (!riderId || loading) {
    return (
      <ScrollView style={styles.container}>
        <BackLink label="‹ Back" onPress={() => navigation.goBack()} />
        <Text style={styles.screenTitle}>My Financial History & Statements</Text>
        <ActivityIndicator size="large" color="#ff7a1a" style={{ marginTop: 40 }} />
      </ScrollView>
    );
  }

  if (error && !summary) {
    return (
      <ScrollView style={styles.container}>
        <BackLink label="‹ Back" onPress={() => navigation.goBack()} />
        <Text style={styles.screenTitle}>My Financial History & Statements</Text>
        <Text style={styles.errorText}>{error}</Text>
      </ScrollView>
    );
  }

  const totalExpense = summary?.totalExpense || 0;
  const breakdown = summary?.breakdown || [];

  return (
    <ScrollView style={styles.container}>
      <BackLink label="‹ Back" onPress={() => navigation.goBack()} />
      <Text style={styles.screenTitle}>My Financial History & Statements</Text>

      {/* Period Selection */}
      <View style={styles.periodButtonsGrid}>
        {QUICK_SELECT_PERIODS.map((period) => (
          <TouchableOpacity
            key={period.key}
            style={[
              styles.periodButton,
              selectedPeriod === period.key && styles.periodButtonActive,
            ]}
            onPress={() => setSelectedPeriod(period.key)}
            activeOpacity={0.7}
          >
            <Text
              style={[
                styles.periodButtonText,
                selectedPeriod === period.key && styles.periodButtonTextActive,
              ]}
            >
              {period.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Date Range Hint */}
      <Text style={styles.dateRangeHint}>
        {new Date(rangeStart).toLocaleDateString()} — {new Date(rangeEnd).toLocaleDateString()}
      </Text>

      {/* Summary Cards */}
      {summary && (
        <>
          {/* Profit Hero Section */}
          <View style={[
            styles.profitHero,
            (summary.netProfit || 0) < 0 && styles.profitHeroNegative
          ]}>
            <Text style={styles.profitHeroLabel}>Net Profit (Selected Range)</Text>
            <Text style={styles.profitHeroAmount}>KSh {(summary.netProfit || 0).toLocaleString()}</Text>
            <View style={styles.profitSplit}>
              <Text style={styles.profitSplitText}>Income: KSh {(summary.income || 0).toLocaleString()}</Text>
              <Text style={styles.profitSplitText}>Expense: KSh {(summary.totalExpense || 0).toLocaleString()}</Text>
            </View>
          </View>

          {/* Expense Breakdown */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Category Breakdown</Text>
            {breakdown.length > 0 ? (
              breakdown.map((item) => (
                <View key={item.category} style={styles.breakdownRow}>
                  <View style={styles.breakdownLeft}>
                    <Text style={styles.breakdownCategory}>{item.category}</Text>
                  </View>
                  <View style={styles.breakdownRight}>
                    <Text style={styles.breakdownPercent}>
                      {totalExpense > 0 ? Math.round((item.amount / totalExpense) * 100) : 0}%
                    </Text>
                    <Text style={styles.breakdownAmount}>KSh {item.amount.toLocaleString()}</Text>
                  </View>
                </View>
              ))
            ) : (
              <Text style={styles.noDataText}>No expenses in this period</Text>
            )}
          </View>

          {/* Action Buttons */}
          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={() =>
              navigation.navigate('TransactionList', {
                rangeStart,
                rangeEnd,
                selectedPeriod,
                riderId,
              })
            }
            activeOpacity={0.7}
          >
            <Text style={styles.secondaryButtonText}>📜 View Transactions →</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.primaryButton}
            onPress={() =>
              navigation.navigate('GenerateStatement', {
                rangeStart,
                rangeEnd,
                selectedPeriod,
                riderId,
              })
            }
            activeOpacity={0.7}
          >
            <Text style={styles.primaryButtonText}>📄 Generate a Statement →</Text>
          </TouchableOpacity>
        </>
      )}
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
    marginBottom: 4,
  },
  screenSub: {
    fontSize: 13,
    color: '#5b606c',
    marginBottom: 20,
  },
  periodButtonsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  periodButton: {
    flex: 0.5,
    minWidth: '45%',
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: '#e7e4db',
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
  },
  periodButtonActive: {
    backgroundColor: '#fff6ee',
    borderColor: '#ff7a1a',
  },
  periodButtonText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#5b606c',
  },
  periodButtonTextActive: {
    color: '#1a1c20',
  },
  dateRangeHint: {
    fontSize: 12,
    color: '#5b606c',
    marginBottom: 14,
  },
  profitHero: {
    borderRadius: 18,
    paddingHorizontal: 18,
    paddingVertical: 18,
    marginBottom: 14,
    backgroundColor: '#2b2f38',
  },
  profitHeroNegative: {
    backgroundColor: '#5a1f1c',
  },
  profitHeroLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#a9adb6',
    textTransform: 'uppercase',
    letterSpacing: 0.06,
    marginBottom: 4,
  },
  profitHeroAmount: {
    fontSize: 30,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 10,
  },
  profitSplit: {
    flexDirection: 'row',
    gap: 14,
  },
  profitSplitText: {
    fontSize: 11.5,
    color: '#c7cad1',
  },
  card: {
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: '#e7e4db',
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
  },
  cardTitle: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#1a1c20',
    marginBottom: 12,
  },
  breakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: '#e7e4db',
  },
  breakdownLeft: {
    flex: 1,
  },
  breakdownCategory: {
    fontSize: 12.5,
    color: '#1a1c20',
    fontWeight: '600',
  },
  breakdownRight: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
  },
  breakdownPercent: {
    fontSize: 11,
    color: '#5b606c',
    minWidth: 30,
    textAlign: 'right',
  },
  breakdownAmount: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#1a1c20',
    minWidth: 80,
    textAlign: 'right',
  },
  primaryButton: {
    backgroundColor: '#ff7a1a',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 10,
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  secondaryButton: {
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: '#e7e4db',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 8,
  },
  secondaryButtonText: {
    color: '#ff7a1a',
    fontSize: 14,
    fontWeight: '700',
  },
  noDataText: {
    fontSize: 12,
    color: '#5b606c',
    paddingVertical: 10,
    fontStyle: 'italic',
  },
  errorText: {
    fontSize: 14,
    color: '#d32f2f',
    textAlign: 'center',
    marginTop: 20,
  },
});