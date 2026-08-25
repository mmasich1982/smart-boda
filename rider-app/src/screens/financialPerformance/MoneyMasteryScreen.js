// rider-app/src/screens/financialPerformance/MoneyMasteryScreen.js
// ✅ SEAMLESS ONLINE/OFFLINE: Computes net profit locally from raw data
// ✅ DISPLAYS: Daily, Weekly, Monthly totals
// ✅ PRESERVED: Exact UI/UX layout and styling
// ✅ OFFLINE PERSISTENCE: IndexedDB adapter for local-first storage
// ✅ NETWORK AWARE: Real-time connectivity detection
// ✅ FIXED: All expenses (fuel, service, other) now appear
// ✅ FIXED: Week period calculation corrected

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ScrollView, View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import BackLink from '../../components/BackLink';
import { useRider } from '../../rider/RiderContext';
import { getLocalRiderId } from '../../offline/db';
import indexedDbAdapter from '../../offline/adapters/indexedDbAdapter';
import { useTranslation } from '../../i18n/LocalizationProvider';
import api from '../../api/client';
import { useNetworkStatus, useCriticalError } from '../../hooks/useNetworkStatus';
import { calculateNetProfit, calculateAllPeriodTotals, getWeekAverageDailyProfit } from '../../services/financialComputationService';

const PERIODS = [
  { key: 'today', label: 'Today' },
  { key: 'this_week', label: 'This Week' },
  { key: 'this_month', label: 'This Month' },
];

export default function MoneyMasteryScreen({ navigation }) {
  const { state } = useRider();
  const { t } = useTranslation();
  const [localRiderId, setLocalRiderId] = useState(null);
  const [period, setPeriod] = useState('today');
  const [summary, setSummary] = useState(null);
  const [allTotals, setAllTotals] = useState(null);
  const [loading, setLoading] = useState(true);
  const [nudgeDismissed, setNudgeDismissed] = useState(false);
  const [nudgeAccepted, setNudgeAccepted] = useState(false);

  // ✅ CRITICAL: Track if we've already loaded data on mount
  const hasLoadedRef = useRef(false);

  const { isConnected, isInitialized } = useNetworkStatus();
  const { error: criticalError, showError: showCriticalError, clearError: clearCriticalError } = useCriticalError();

  // ✅ LOAD RIDER ID ON MOUNT
  useEffect(() => {
    const loadRiderId = async () => {
      try {
        const id = await getLocalRiderId();
        if (id) {
          setLocalRiderId(id);
          console.log('✅ MoneyMastery: Loaded rider ID:', id);
        }
      } catch (err) {
        console.error('❌ Error loading rider ID:', err);
      }
    };
    loadRiderId();
  }, []);

  const effectiveRiderId = localRiderId || state?.riderId;

  // ✅ LOAD FINANCIAL DATA ON MOUNT - Single execution
  useEffect(() => {
    if (!effectiveRiderId || !isInitialized || hasLoadedRef.current) {
      return;
    }

    let isMounted = true;

    async function loadFinancialDataOnMount() {
      try {
        setLoading(true);
        clearCriticalError();

        const cacheKey = `money_mastery_${effectiveRiderId}_${period}`;
        const allTotalsKey = `money_mastery_all_totals_${effectiveRiderId}`;

        // 1. Try cache for all totals
        console.log('📦 Checking IndexedDB cache for all totals...');
        let cachedTotals = null;
        try {
          const cached = await indexedDbAdapter.kvGet(allTotalsKey);
          if (cached && isMounted) {
            cachedTotals = typeof cached === 'string' ? JSON.parse(cached) : cached;
            setAllTotals(cachedTotals);
            console.log('✅ Loaded all totals from cache');
          }
        } catch (cacheErr) {
          console.warn('⚠️ Cache retrieval error:', cacheErr);
        }

        // 2. Try cache for current period
        console.log('📦 Checking IndexedDB cache for period...');
        let cachedData = null;
        try {
          const cached = await indexedDbAdapter.kvGet(cacheKey);
          if (cached && isMounted) {
            const data = typeof cached === 'string' ? JSON.parse(cached) : cached;
            if (data?.data) {
              cachedData = data.data;
              setSummary(data.data);
              console.log('✅ Loaded period from cache');
            } else if (data) {
              cachedData = data;
              setSummary(data);
              console.log('✅ Loaded period from cache');
            }
          }
        } catch (cacheErr) {
          console.warn('⚠️ Cache retrieval error:', cacheErr);
        }

        // 3. If no cache, compute locally
        if (!cachedData && isMounted) {
          console.log('📊 No cache found, computing from raw IndexedDB data...');
          try {
            const computed = await calculateNetProfit(effectiveRiderId, period);
            
            if (isMounted && computed) {
              setSummary(computed);
              cachedData = computed;
              
              try {
                await indexedDbAdapter.kvSet(cacheKey, JSON.stringify({
                  data: computed,
                  cached_at: new Date().toISOString()
                }));
                console.log('✅ Computed and cached net profit locally');
              } catch (setCacheErr) {
                console.warn('⚠️ Failed to cache computed result:', setCacheErr);
              }
            }
          } catch (computeErr) {
            console.error('❌ Error computing net profit:', computeErr);
          }
        }

        // 4. Compute all period totals if not cached
        if (!cachedTotals && isMounted) {
          console.log('📊 Computing all period totals...');
          try {
            const totals = await calculateAllPeriodTotals(effectiveRiderId);
            if (isMounted && totals) {
              setAllTotals(totals);
              
              try {
                await indexedDbAdapter.kvSet(allTotalsKey, JSON.stringify(totals));
                console.log('✅ Cached all period totals');
              } catch (setCacheErr) {
                console.warn('⚠️ Failed to cache totals:', setCacheErr);
              }
            }
          } catch (computeErr) {
            console.error('❌ Error computing all totals:', computeErr);
          }
        }

        // 5. Try to sync fresh data if online
        if (isConnected && isMounted) {
          console.log('📡 Syncing with API...');
          try {
            const response = await api.get(
              `/financial/net-profit?rider_id=${effectiveRiderId}&period=${period}`
            );

            if (response.data && isMounted) {
              setSummary(response.data);
              
              try {
                await indexedDbAdapter.kvSet(cacheKey, JSON.stringify({
                  data: response.data,
                  cached_at: new Date().toISOString()
                }));
                console.log('✅ Synced and cached data from API');
              } catch (setCacheErr) {
                console.warn('⚠️ Failed to cache API result:', setCacheErr);
              }
            }
          } catch (apiErr) {
            console.warn('⚠️ API sync failed (using computed/cached data):', apiErr.message);
          }
        }

        // 6. If we have no data at all, show empty state
        if (!cachedData && !summary && isMounted) {
          console.log('📊 No data found, showing empty state');
          setSummary({
            net_profit: 0,
            income: 0,
            total_expense: 0,
            fuel_expense: 0,
            maintenance_expense: 0,
            other_expense: 0,
            breakdown: [],
            week_avg_daily_profit: 0,
          });
        }

        if (isMounted) {
          hasLoadedRef.current = true;
          setLoading(false);
        }
      } catch (err) {
        console.error('❌ Error loading data:', err);
        if (isMounted) {
          setSummary({
            net_profit: 0,
            income: 0,
            total_expense: 0,
            fuel_expense: 0,
            maintenance_expense: 0,
            other_expense: 0,
            breakdown: [],
            week_avg_daily_profit: 0,
          });
          setLoading(false);
        }
      }
    }

    loadFinancialDataOnMount();

    return () => {
      isMounted = false;
    };
  }, [effectiveRiderId, isInitialized, isConnected, period]);

  // ✅ Refresh on period change
  useEffect(() => {
    if (!effectiveRiderId || !isInitialized) return;

    hasLoadedRef.current = false;
  }, [period]);

  // Refresh on screen focus
  useFocusEffect(
    useCallback(() => {
      if (!effectiveRiderId || !isInitialized || loading || !hasLoadedRef.current) return;

      async function softRefreshCache() {
        try {
          const cacheKey = `money_mastery_${effectiveRiderId}_${period}`;
          const allTotalsKey = `money_mastery_all_totals_${effectiveRiderId}`;
          
          const cachedData = await indexedDbAdapter.kvGet(cacheKey);
          if (cachedData) {
            const data = typeof cachedData === 'string' ? JSON.parse(cachedData) : cachedData;
            if (data?.data) {
              setSummary(data.data);
              console.log('✅ Refreshed cache on focus');
            } else if (data) {
              setSummary(data);
              console.log('✅ Refreshed cache on focus');
            }
          } else {
            const computed = await calculateNetProfit(effectiveRiderId, period);
            setSummary(computed);
          }

          // Refresh totals
          const cachedTotals = await indexedDbAdapter.kvGet(allTotalsKey);
          if (cachedTotals) {
            setAllTotals(typeof cachedTotals === 'string' ? JSON.parse(cachedTotals) : cachedTotals);
          }
        } catch (err) {
          console.warn('⚠️ Error in focus refresh:', err);
        }
      }

      softRefreshCache();
    }, [effectiveRiderId, isInitialized, period, loading])
  );

  if (!isInitialized || (loading && !summary)) {
    return (
      <ScrollView style={styles.container}>
        <BackLink onPress={() => navigation.navigate('Home')} label={t('backLabel') || '← Home'} />
        <Text style={styles.title}>{t('financialPerformance') || 'Financial Performance'}</Text>
        {loading && <ActivityIndicator size="large" color="#ff7a1a" style={{ marginTop: 40 }} />}
      </ScrollView>
    );
  }

  const isNegative = (summary?.net_profit || 0) < 0;
  const totalExpense = summary?.total_expense || 1;
  const categoryRows = (summary?.breakdown || [])
    .filter(row => row.amount > 0)
    .sort((a, b) => b.amount - a.amount);

  const showNudge = !nudgeDismissed && !nudgeAccepted && 
    period === 'today' && (summary?.net_profit || 0) > 0 && 
    (summary?.week_avg_daily_profit ? (summary.net_profit || 0) > summary.week_avg_daily_profit * 1.3 : false);

  const handleAcceptNudge = () => {
    setNudgeAccepted(true);
  };

  const handleDismissNudge = () => {
    setNudgeDismissed(true);
  };

  return (
    <ScrollView style={styles.container}>
      <BackLink onPress={() => navigation.navigate('Home')} label={t('backLabel') || '← Home'} />
      <Text style={styles.title}>{t('financialPerformance') || 'Financial Performance'}</Text>

      {/* CRITICAL ERROR ONLY */}
      {criticalError && (
        <View style={styles.criticalErrorBanner}>
          <Text style={styles.criticalErrorText}>{criticalError}</Text>
          <TouchableOpacity onPress={clearCriticalError}>
            <Text style={styles.dismissText}>{t('dismiss') || 'Dismiss'}</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Period Summary Totals */}
      {allTotals && (
        <View style={styles.periodSummaryContainer}>
          <View style={styles.periodSummaryItem}>
            <Text style={styles.periodSummaryLabel}>Today</Text>
            <Text style={[styles.periodSummaryValue, (allTotals.today.net_profit || 0) < 0 && styles.summaryNegative]}>
              KSh {(allTotals.today.net_profit || 0).toLocaleString()}
            </Text>
          </View>
          <View style={styles.periodSummaryDivider} />
          <View style={styles.periodSummaryItem}>
            <Text style={styles.periodSummaryLabel}>This Week</Text>
            <Text style={[styles.periodSummaryValue, (allTotals.this_week.net_profit || 0) < 0 && styles.summaryNegative]}>
              KSh {(allTotals.this_week.net_profit || 0).toLocaleString()}
            </Text>
          </View>
          <View style={styles.periodSummaryDivider} />
          <View style={styles.periodSummaryItem}>
            <Text style={styles.periodSummaryLabel}>This Month</Text>
            <Text style={[styles.periodSummaryValue, (allTotals.this_month.net_profit || 0) < 0 && styles.summaryNegative]}>
              KSh {(allTotals.this_month.net_profit || 0).toLocaleString()}
            </Text>
          </View>
        </View>
      )}

      {/* Period Tabs */}
      <View style={styles.periodTabs}>
        {PERIODS.map((p) => (
          <TouchableOpacity
            key={p.key}
            style={[styles.periodTab, period === p.key && styles.periodTabActive]}
            onPress={() => setPeriod(p.key)}
            activeOpacity={0.7}
          >
            <Text style={[styles.periodTabText, period === p.key && styles.periodTabTextActive]}>
              {p.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {summary && (
        <>
          {showNudge && (
            <View style={styles.nudgeCard}>
              <Text style={styles.nudgeTitle}>✨ Great day!</Text>
              <Text style={styles.nudgeHint}>
                Want to set aside some of today's extra profit towards your goals?
              </Text>
              <View style={styles.nudgeButtonRow}>
                <TouchableOpacity style={styles.nudgeButtonPrimary} onPress={handleAcceptNudge}>
                  <Text style={styles.nudgeButtonText}>
                    Set Aside KSh {Math.round((summary.net_profit || 0) * 0.2).toLocaleString()}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.nudgeButtonSecondary} onPress={handleDismissNudge}>
                  <Text style={styles.nudgeButtonSecondaryText}>Not now</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          <View style={[styles.heroCard, isNegative && styles.heroCardNegative]}>
            <Text style={styles.heroLabel}>Net Profit</Text>
            <Text style={[styles.netProfit, isNegative && styles.netProfitNegative]}>
              KSh {(summary.net_profit || 0).toLocaleString()}
            </Text>
            <Text style={styles.profitSplit}>
              Income: KSh {(summary.income || 0).toLocaleString()}   Expense: KSh {(summary.total_expense || 0).toLocaleString()}
            </Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Expense Breakdown</Text>
            {categoryRows.length > 0 ? (
              categoryRows.map((row) => (
                <View key={row.category} style={styles.catRow}>
                  <Text style={styles.catName}>{row.category}</Text>
                  <View style={styles.catRight}>
                    <Text style={styles.catPercent}>{Math.round((row.amount / totalExpense) * 100)}%</Text>
                    <Text style={styles.catAmount}>KSh {row.amount.toLocaleString()}</Text>
                  </View>
                </View>
              ))
            ) : (
              <Text style={styles.empty}>No expenses logged for this period.</Text>
            )}
          </View>

          <TouchableOpacity 
            style={styles.primaryBtn} 
            onPress={() => navigation.navigate('AddOtherExpense')}
          >
            <Text style={styles.primaryBtnText}>＋ Add Other Expense →</Text>
          </TouchableOpacity>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: '#f6f4ef' },
  title: { fontFamily: 'SpaceGrotesk-Bold', fontSize: 22, fontWeight: '700', color: '#1a1c20', marginBottom: 2 },
  
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

  periodSummaryContainer: {
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: '#e7e4db',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  periodSummaryItem: {
    flex: 1,
    alignItems: 'center'
  },
  periodSummaryLabel: {
    fontSize: 10,
    color: '#5b606c',
    fontWeight: '600',
    marginBottom: 4,
    textTransform: 'uppercase'
  },
  periodSummaryValue: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1a1c20'
  },
  summaryNegative: {
    color: '#d32f2f'
  },
  periodSummaryDivider: {
    width: 1,
    height: 30,
    backgroundColor: '#e7e4db'
  },

  periodTabs: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16
  },
  periodTab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: '#e7e4db',
    alignItems: 'center'
  },
  periodTabActive: {
    backgroundColor: '#ff7a1a',
    borderColor: '#ff7a1a'
  },
  periodTabText: {
    fontSize: 12,
    color: '#5b606c',
    fontWeight: '600'
  },
  periodTabTextActive: {
    color: '#fff'
  },

  nudgeCard: {
    backgroundColor: '#fff6ee',
    borderWidth: 1.5,
    borderColor: '#ff7a1a',
    borderRadius: 16,
    padding: 15,
    marginBottom: 14,
  },
  nudgeTitle: { fontSize: 13.5, fontWeight: '700', color: '#1a1c20', marginBottom: 6 },
  nudgeHint: { fontSize: 12, color: '#5b606c', marginBottom: 10 },
  nudgeButtonRow: { flexDirection: 'row', gap: 8 },
  nudgeButtonPrimary: {
    flex: 1,
    backgroundColor: '#ff7a1a',
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
  },
  nudgeButtonText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  nudgeButtonSecondary: { paddingVertical: 12 },
  nudgeButtonSecondaryText: { color: '#5b606c', fontSize: 13, fontWeight: '600' },

  heroCard: {
    backgroundColor: '#1d2026',
    borderRadius: 18,
    padding: 18,
    marginBottom: 14,
  },
  heroCardNegative: { backgroundColor: '#5a1f1c' },
  heroLabel: { fontSize: 11, color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: '700' },
  netProfit: { fontFamily: 'SpaceGrotesk-Bold', fontSize: 30, fontWeight: '700', color: '#ffc93c', marginTop: 4, marginBottom: 10 },
  netProfitNegative: { color: '#ff8a80' },
  profitSplit: { fontSize: 11.5, color: 'rgba(255,255,255,0.75)', lineHeight: 20 },

  card: { backgroundColor: '#fff', borderWidth: 1.5, borderColor: '#e7e4db', borderRadius: 16, padding: 16, marginBottom: 14 },
  cardTitle: { fontSize: 13.5, fontWeight: '700', color: '#1a1c20', marginBottom: 4 },
  catRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: '#e7e4db' },
  catName: { fontSize: 12.5, color: '#1a1c20', fontWeight: '500' },
  catRight: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  catPercent: { fontSize: 11, color: '#5b606c' },
  catAmount: { fontSize: 13, fontWeight: '700', color: '#1a1c20' },
  empty: { fontSize: 12, color: '#5b606c', paddingVertical: 10, fontStyle: 'italic' },

  primaryBtn: {
    backgroundColor: '#ff7a1a',
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
    marginBottom: 10,
    shadowColor: '#ff7a1a',
    shadowOpacity: 0.55,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
  },
  primaryBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});