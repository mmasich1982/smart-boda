// rider-app/src/screens/financialPerformance/MoneyMasteryScreen.js
// ✅ SEAMLESS ONLINE/OFFLINE: Silent sync, automatic caching, critical errors only
// ✅ MULTILINGUAL: Uses i18n for all UI text
// ✅ OFFLINE PERSISTENCE: IndexedDB adapter for local-first storage
// ✅ NETWORK AWARE: Real-time connectivity detection

import React, { useState, useEffect, useCallback } from 'react';
import { ScrollView, View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import BackLink from '../../components/BackLink';
import { useRider } from '../../rider/RiderContext';
import { getLocalRiderId } from '../../offline/db';
import indexedDbAdapter from '../../offline/adapters/indexedDbAdapter';
import { useTranslation } from '../../i18n/LocalizationProvider';
import api from '../../api/client';
import { useNetworkStatus, useCriticalError } from '../../hooks/useNetworkStatus';

const PERIODS = [
  { key: 'today', label: 'period_today' },
  { key: 'this_week', label: 'period_thisWeek' },
  { key: 'this_month', label: 'period_thisMonth' },
];

export default function MoneyMasteryScreen({ navigation }) {
  const { state } = useRider();
  const { t } = useTranslation();
  const [localRiderId, setLocalRiderId] = useState(null);
  const [period, setPeriod] = useState('today');
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [nudgeDismissed, setNudgeDismissed] = useState(false);
  const [nudgeAccepted, setNudgeAccepted] = useState(false);

  const { isConnected, isInitialized } = useNetworkStatus();
  const { error: criticalError, showError: showCriticalError, clearError: clearCriticalError } = useCriticalError();

  // ✅ Load rider ID on mount
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

  /**
   * ✅ Load financial data with smart caching using IndexedDB
   * Stores all data locally for 6-month cycle, syncs with API when online
   */
  const loadData = useCallback(async () => {
    if (!effectiveRiderId || !isInitialized) return;

    try {
      setLoading(true);
      clearCriticalError();

      const cacheKey = `money_mastery_${effectiveRiderId}_${period}`;

      // Try cache first (IndexedDB is our source of truth)
      console.log('📦 Checking IndexedDB cache...');
      try {
        const cachedData = await indexedDbAdapter.kvGet(cacheKey);
        if (cachedData?.data) {
          setSummary(cachedData.data);
          console.log('✅ Loaded from IndexedDB cache');
        }
      } catch (cacheErr) {
        console.warn('⚠️ Cache retrieval error, will fetch fresh:', cacheErr);
      }

      // Try to sync fresh data if online
      if (isConnected) {
        console.log('📡 Syncing with API...');
        try {
          const response = await api.get(
            `/financial/net-profit?rider_id=${effectiveRiderId}&period=${period}`
          );

          if (response.data) {
            setSummary(response.data);
            
            // ✅ Cache the result in IndexedDB (local-first persistence)
            await indexedDbAdapter.kvSet(cacheKey, {
              data: response.data,
              cached_at: new Date().toISOString()
            });
            console.log('✅ Synced and cached data to IndexedDB');
          }
        } catch (apiErr) {
          console.warn('⚠️ API sync failed (using cached data):', apiErr.message);
          // Already have cached data - that's fine
        }
      }

      if (!summary) {
        showCriticalError(
          t('error_unableToLoadFinancialData') || 'Unable to load financial data. Please try again.',
          'data_load'
        );
      }

      setLoading(false);
    } catch (err) {
      console.error('❌ Error loading data:', err);
      setLoading(false);
      showCriticalError(
        t('error_failedToLoadFinancialData') || 'Failed to load financial data. Please try again.',
        'load_error'
      );
    }
  }, [effectiveRiderId, isInitialized, isConnected, period, t]);

  // Load on mount and when period changes
  useEffect(() => {
    loadData();
  }, [effectiveRiderId, period, loadData]);

  // Refresh on screen focus
  useFocusEffect(
    useCallback(() => {
      if (effectiveRiderId && isInitialized) {
        loadData();
      }
    }, [effectiveRiderId, isInitialized, loadData])
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

      {/* CRITICAL ERROR ONLY - No offline/status messages */}
      {criticalError && (
        <View style={styles.criticalErrorBanner}>
          <Text style={styles.criticalErrorText}>{criticalError}</Text>
          <TouchableOpacity onPress={clearCriticalError}>
            <Text style={styles.dismissText}>{t('dismiss') || 'Dismiss'}</Text>
          </TouchableOpacity>
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
              {t(p.label) || p.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {summary && (
        <>
          {showNudge && (
            <View style={styles.nudgeCard}>
              <Text style={styles.nudgeTitle}>{t('nudge_greatDay') || '✨ Great day!'}</Text>
              <Text style={styles.nudgeHint}>
                {t('nudge_setAsideProfit') || 'Want to set aside some of today\'s extra profit towards your goals?'}
              </Text>
              <View style={styles.nudgeButtonRow}>
                <TouchableOpacity style={styles.nudgeButtonPrimary} onPress={handleAcceptNudge}>
                  <Text style={styles.nudgeButtonText}>
                    {t('nudge_setAside') || 'Set Aside'} KSh {Math.round((summary.net_profit || 0) * 0.2).toLocaleString()}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.nudgeButtonSecondary} onPress={handleDismissNudge}>
                  <Text style={styles.nudgeButtonSecondaryText}>{t('notNow') || 'Not now'}</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          <View style={[styles.heroCard, isNegative && styles.heroCardNegative]}>
            <Text style={styles.heroLabel}>{t('netProfit') || 'Net Profit'}</Text>
            <Text style={[styles.netProfit, isNegative && styles.netProfitNegative]}>
              KSh {(summary.net_profit || 0).toLocaleString()}
            </Text>
            <Text style={styles.profitSplit}>
              {t('income') || 'Income'}: KSh {(summary.income || 0).toLocaleString()}   {t('expense') || 'Expense'}: KSh {(summary.total_expense || 0).toLocaleString()}
            </Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>{t('expenseBreakdown') || 'Expense Breakdown'}</Text>
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
              <Text style={styles.empty}>{t('noExpenses') || 'No expenses logged for this period.'}</Text>
            )}
          </View>

          <TouchableOpacity 
            style={styles.primaryBtn} 
            onPress={() => navigation.navigate('AddOtherExpense')}
          >
            <Text style={styles.primaryBtnText}>{t('addOtherExpense') || '＋ Add Other Expense →'}</Text>
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
