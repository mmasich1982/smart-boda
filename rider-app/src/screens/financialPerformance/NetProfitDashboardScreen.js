// rider-app/src/screens/financialPerformance/NetProfitDashboardScreen.js
// ✅ SEAMLESS ONLINE/OFFLINE: Cache-first loading, silent sync
// ✅ MULTILINGUAL: Uses i18n for all UI text
// ✅ OFFLINE PERSISTENCE: IndexedDB adapter for local-first storage
// ✅ NETWORK AWARE: Real-time connectivity detection

import React, { useState, useEffect, useCallback } from 'react';
import { ScrollView, View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import BackLink from '../../components/BackLink';
import PeriodTabs from '../../components/PeriodTabs';
import { useRider } from '../../rider/RiderContext';
import { useTranslation } from '../../i18n/LocalizationProvider';
import { getLocalRiderId } from '../../offline/db';
import indexedDbAdapter from '../../offline/adapters/indexedDbAdapter';
import { useNetworkStatus, useCriticalError } from '../../hooks/useNetworkStatus';
import api from '../../api/client';

const PERIODS = [
  { key: 'today', label: 'Today' }, 
  { key: 'this_week', label: 'This Week' }, 
  { key: 'this_month', label: 'This Month' }
];

export default function NetProfitDashboardScreen({ navigation }) {
  const { state } = useRider();
  const { t } = useTranslation();
  const [localRiderId, setLocalRiderId] = useState(null);
  const [period, setPeriod] = useState('today');
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  const { isConnected, isInitialized } = useNetworkStatus();
  const { error: criticalError, showError: showCriticalError, clearError: clearCriticalError } = useCriticalError();

  // ✅ LOAD RIDER ID ON MOUNT
  useEffect(() => {
    const loadRiderId = async () => {
      try {
        const id = await getLocalRiderId();
        if (id) {
          setLocalRiderId(id);
          console.log('✅ NetProfit: Loaded rider ID:', id);
        }
      } catch (err) {
        console.error('❌ Error loading rider ID:', err);
      }
    };
    
    loadRiderId();
  }, []);

  const effectiveRiderId = localRiderId || state?.riderId;

  // ✅ LOAD FINANCIAL DATA WITH CACHE-FIRST APPROACH
  useEffect(() => {
    let isMounted = true;

    if (!effectiveRiderId || !isInitialized) {
      return;
    }

    async function loadFinancialData() {
      try {
        setLoading(true);
        clearCriticalError();

        const cacheKey = `net_profit_${effectiveRiderId}_${period}`;

        // 1. TRY CACHE FIRST from IndexedDB
        console.log('📦 Checking cache...');
        const cachedData = await indexedDbAdapter.kvGet(cacheKey);
        
        if (cachedData) {
          try {
            const data = typeof cachedData === 'string' ? JSON.parse(cachedData) : cachedData;
            if (isMounted && data) {
              setSummary(data);
              console.log(`✅ Loaded from cache`);
            }
          } catch (parseErr) {
            console.warn('⚠️ Cache parse error');
          }
        }

        // 2. TRY TO SYNC FRESH DATA IF ONLINE
        if (isConnected) {
          console.log('📡 Syncing with API...');
          setSyncing(true);
          try {
            const response = await api.get(
              `/financial/net-profit?rider_id=${effectiveRiderId}&period=${period}`
            );

            if (isMounted && response.data) {
              setSummary(response.data);
              
              // Cache it for next time using IndexedDB
              await indexedDbAdapter.kvSet(cacheKey, JSON.stringify(response.data));
              console.log(`✅ Synced and cached financial data`);
            }
          } catch (apiErr) {
            console.warn('⚠️ API sync failed (using cached data):', apiErr.message);
            // Already have cached data - that's fine
          } finally {
            setSyncing(false);
          }
        }

        if (isMounted) {
          setLoading(false);
        }
      } catch (err) {
        console.error('❌ Load error:', err);
        if (isMounted && !summary) {
          showCriticalError(
            t('error_loadFinancialDataFailed') || 'Failed to load financial data. Please try again.',
            'load_error'
          );
          setLoading(false);
        }
      }
    }

    loadFinancialData();

    return () => {
      isMounted = false;
    };
  }, [period, effectiveRiderId, isInitialized, isConnected, summary, t]);

  /**
   * Refresh on screen focus
   */
  useFocusEffect(
    useCallback(() => {
      if (!effectiveRiderId || !isInitialized) return;

      try {
        // Check if cache has been updated in IndexedDB
        (async () => {
          const cacheKey = `net_profit_${effectiveRiderId}_${period}`;
          const cachedData = await indexedDbAdapter.kvGet(cacheKey);
          
          if (cachedData) {
            const data = typeof cachedData === 'string' ? JSON.parse(cachedData) : cachedData;
            if (data) {
              setSummary(data);
            }
          }
        })();
      } catch (err) {
        console.warn('⚠️ Error in focus effect:', err);
      }
    }, [effectiveRiderId, isInitialized, period])
  );

  if (!effectiveRiderId || !isInitialized) {
    return (
      <ScrollView style={styles.container}>
        <BackLink onPress={() => navigation.navigate('Home')} label={t('homeLabel') || '← Home'} />
        <Text style={styles.title}>{t('financialPerformance') || 'Financial Performance'}</Text>
        <ActivityIndicator size="large" color="#ff7a1a" style={{ marginTop: 40 }} />
      </ScrollView>
    );
  }

  if (loading && !summary) {
    return (
      <ScrollView style={styles.container}>
        <BackLink onPress={() => navigation.navigate('Home')} label={t('homeLabel') || '← Home'} />
        <Text style={styles.title}>{t('financialPerformance') || 'Financial Performance'}</Text>
        <ActivityIndicator size="large" color="#ff7a1a" style={{ marginTop: 40 }} />
      </ScrollView>
    );
  }

  if (!summary) {
    return (
      <ScrollView style={styles.container}>
        <BackLink onPress={() => navigation.navigate('Home')} label={t('homeLabel') || '← Home'} />
        <Text style={styles.title}>{t('financialPerformance') || 'Financial Performance'}</Text>
        {criticalError && (
          <View style={styles.criticalErrorBanner}>
            <Text style={styles.criticalErrorText}>{criticalError}</Text>
            <TouchableOpacity onPress={clearCriticalError}>
              <Text style={styles.dismissText}>{t('dismiss') || 'Dismiss'}</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    );
  }

  const isNegative = summary.net_profit < 0;

  return (
    <ScrollView style={styles.container}>
      <BackLink onPress={() => navigation.navigate('Home')} label={t('homeLabel') || '← Home'} />
      <Text style={styles.title}>{t('financialPerformance') || 'Financial Performance'}</Text>
      
      <PeriodTabs 
        options={PERIODS.map(p => ({ 
          key: p.key, 
          label: t(`period_${p.key}`) || p.label 
        }))} 
        active={period} 
        onChange={setPeriod} 
      />

      {criticalError && (
        <View style={styles.criticalErrorBanner}>
          <Text style={styles.criticalErrorText}>{criticalError}</Text>
          <TouchableOpacity onPress={clearCriticalError}>
            <Text style={styles.dismissText}>{t('dismiss') || 'Dismiss'}</Text>
          </TouchableOpacity>
        </View>
      )}

      {syncing && (
        <View style={styles.syncingBanner}>
          <ActivityIndicator size="small" color="#ff7a1a" />
          <Text style={styles.syncingText}>{t('syncing') || 'Syncing...'}</Text>
        </View>
      )}

      <View style={[styles.heroCard, isNegative && styles.heroCardNegative]}>
        <Text style={styles.heroLbl}>{t('netProfit') || 'Net Profit'}</Text>
        <Text style={[styles.netProfit, isNegative && styles.netProfitNegative]}>
          KSh {summary.net_profit?.toLocaleString() || '0'}
        </Text>
        <Text style={styles.subline}>
          {t('income') || 'Income'}: KSh {summary.income?.toLocaleString() || '0'}   
          {t('expense') || 'Expense'}: KSh {summary.total_expense?.toLocaleString() || '0'}
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>{t('expenseBreakdown') || 'Expense Breakdown'}</Text>
        {summary.breakdown && summary.breakdown.length ? (
          summary.breakdown.map((row) => {
            const pct = summary.total_expense > 0 ? Math.round((row.amount / summary.total_expense) * 100) : 0;
            return (
              <View key={row.category} style={styles.breakdownRow}>
                <Text style={styles.breakdownText}>{row.category}</Text>
                <Text style={styles.breakdownAmt}>
                  {pct}%   KSh {row.amount?.toLocaleString() || '0'}
                </Text>
              </View>
            );
          })
        ) : (
          <Text style={styles.empty}>
            {t('noExpensesLogged') || 'No expenses logged for this period.'}
          </Text>
        )}
      </View>

      <TouchableOpacity 
        style={[styles.primaryBtn, (loading || syncing) && styles.primaryBtnDisabled]}
        onPress={() => navigation.navigate('AddOtherExpense')}
        disabled={loading || syncing}
      >
        <Text style={styles.primaryBtnText}>
          {t('addOtherExpense') || '＋ Add Other Expense →'}
        </Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    padding: 20, 
    backgroundColor: '#f6f4ef' 
  },
  title: { 
    fontFamily: 'SpaceGrotesk-Bold', 
    fontSize: 22, 
    fontWeight: '700', 
    color: '#1a1c20', 
    marginBottom: 4 
  },

  criticalErrorBanner: {
    backgroundColor: '#fdecea',
    borderWidth: 1.5,
    borderColor: '#f6cac7',
    borderRadius: 14,
    padding: 12,
    marginBottom: 12,
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

  syncingBanner: {
    backgroundColor: '#e3f2fd',
    borderWidth: 1.5,
    borderColor: '#bbdefb',
    borderRadius: 14,
    padding: 12,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12
  },
  syncingText: {
    fontSize: 12,
    color: '#1565c0',
    fontWeight: '600'
  },

  heroCard: { 
    backgroundColor: '#1d2026', 
    borderRadius: 16, 
    padding: 18, 
    marginBottom: 14 
  },
  heroCardNegative: { 
    backgroundColor: '#3a1512' 
  },
  heroLbl: { 
    fontSize: 11, 
    color: 'rgba(255,255,255,0.6)', 
    textTransform: 'uppercase', 
    letterSpacing: 0.5 
  },
  netProfit: { 
    fontFamily: 'SpaceGrotesk-Bold', 
    fontSize: 30, 
    fontWeight: '700', 
    color: '#ffc93c', 
    marginVertical: 2 
  },
  netProfitNegative: { 
    color: '#ff8a80' 
  },
  subline: { 
    fontSize: 12, 
    color: 'rgba(255,255,255,0.75)' 
  },

  card: { 
    backgroundColor: '#fff', 
    borderWidth: 1, 
    borderColor: '#e7e4db', 
    borderRadius: 14, 
    padding: 14, 
    marginBottom: 16 
  },
  cardTitle: { 
    fontSize: 13, 
    fontWeight: '700', 
    color: '#1a1c20', 
    marginBottom: 8 
  },
  breakdownRow: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    paddingVertical: 6 
  },
  breakdownText: { 
    fontSize: 13, 
    color: '#5b606c' 
  },
  breakdownAmt: { 
    fontSize: 13, 
    fontWeight: '700', 
    color: '#1a1c20' 
  },
  empty: { 
    fontSize: 12.5, 
    color: '#5b606c', 
    fontStyle: 'italic' 
  },

  primaryBtn: { 
    backgroundColor: '#ff7a1a', 
    borderRadius: 14, 
    paddingVertical: 15, 
    alignItems: 'center', 
    marginBottom: 10, 
    shadowColor: '#ff7a1a', 
    shadowOpacity: 0.4, 
    shadowRadius: 10, 
    shadowOffset: { width: 0, height: 6 },
    elevation: 6
  },
  primaryBtnDisabled: {
    backgroundColor: '#e9dccc',
    shadowOpacity: 0
  },
  primaryBtnText: { 
    color: '#fff', 
    fontSize: 15, 
    fontWeight: '700' 
  },
});
