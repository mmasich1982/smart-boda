// rider-app/src/screens/financialPerformance/MoneyMasteryScreen.js
// UPDATED: Now displays Net Profit Dashboard directly per cleaned.html (RA-07-D)
// Shows income vs expense, period-based calculations, expense breakdown, and savings nudge

import React, { useState, useEffect } from 'react';
import { ScrollView, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import BackLink from '../../components/BackLink';
import PeriodTabs from '../../components/PeriodTabs';
import { useRider } from '../../rider/RiderContext';
import { getLocalRiderStatus } from '../../offline/db';
import api from '../../api/client';

const PERIODS = [
  { key: 'today', label: 'Today' },
  { key: 'this_week', label: 'This Week' },
  { key: 'this_month', label: 'This Month' },
];

export default function MoneyMasteryScreen({ navigation }) {
  const { state } = useRider();
  const [localRiderId, setLocalRiderId] = useState(null);
  const [period, setPeriod] = useState('today');
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [nudgeDismissed, setNudgeDismissed] = useState(false);
  const [nudgeAccepted, setNudgeAccepted] = useState(false);

  // ✅ LOAD RIDER ID FROM LOCAL STORAGE
  useEffect(() => {
    async function loadRiderId() {
      try {
        const status = await getLocalRiderStatus();
        if (status?.rider_id) {
          setLocalRiderId(status.rider_id);
        }
      } catch (err) {
        console.error('Error loading rider status:', err);
      } finally {
        setLoading(false);
      }
    }
    loadRiderId();
  }, []);

  // ✅ USE LOCAL STORAGE AS PRIMARY, FALLBACK TO CONTEXT
  const effectiveRiderId = localRiderId || state?.riderId;

  useEffect(() => {
    if (!effectiveRiderId || loading) return;

    let isMounted = true;
    api.get(`/financial/net-profit?rider_id=${effectiveRiderId}&period=${period}`)
      .then(res => {
        if (isMounted) {
          setSummary(res.data);
        }
      })
      .catch(err => {
        if (isMounted) {
          setError('Failed to load financial data');
          console.error('Error:', err);
        }
      });
    return () => { isMounted = false; };
  }, [period, effectiveRiderId, loading]);

  if (loading || !summary) {
    return (
      <ScrollView style={styles.container}>
        <BackLink onPress={() => navigation.navigate('Home')} label="← Home" />
        <Text style={styles.title}>Financial Performance</Text>
        {loading && <Text style={styles.loading}>Loading...</Text>}
        {error && <Text style={styles.errorMessage}>{error}</Text>}
      </ScrollView>
    );
  }
  
  // Calculate expense breakdown percentages
  const totalExpense = summary.total_expense || 1;
  const breakdownRows = summary.breakdown
    .filter(row => row.amount > 0)
    .sort((a, b) => b.amount - a.amount)
    .map(row => ({
      ...row,
      pct: Math.round((row.amount / totalExpense) * 100),
    }));

  const isNegative = summary.net_profit < 0;
  const categoryRows = (summary.breakdown || [])
    .filter(row => row.amount > 0)
    .sort((a, b) => b.amount - a.amount);
  
  // Savings nudge: shown if net profit today > 1.3x average daily profit from week, and not dismissed/accepted
  const showNudge = !nudgeDismissed && !nudgeAccepted && 
    period === 'today' && summary.net_profit > 0 && 
    (summary.week_avg_daily_profit ? summary.net_profit > summary.week_avg_daily_profit * 1.3 : false);

  const handleAcceptNudge = () => {
    setNudgeAccepted(true);
    // Toast would be shown by parent navigation context
  };

  const handleDismissNudge = () => {
    setNudgeDismissed(true);
  };

  return (
    <ScrollView style={styles.container}>
      <BackLink onPress={() => navigation.navigate('Home')} label="← Home" />
      <Text style={styles.title}>Financial Performance</Text>

      <PeriodTabs options={PERIODS} active={period} onChange={setPeriod} />

      {showNudge && (
        <View style={styles.nudgeCard}>
          <Text style={styles.nudgeTitle}>✨ Great day!</Text>
          <Text style={styles.nudgeHint}>Want to set aside some of today's extra profit towards your goals?</Text>
          <View style={styles.nudgeButtonRow}>
            <TouchableOpacity style={styles.nudgeButtonPrimary} onPress={handleAcceptNudge}>
              <Text style={styles.nudgeButtonText}>Set Aside KSh {Math.round(summary.net_profit * 0.2).toLocaleString()}</Text>
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
          KSh {summary.net_profit.toLocaleString()}
        </Text>
        <Text style={styles.profitSplit}>
          Income: KSh {summary.income.toLocaleString()}   Expense: KSh {summary.total_expense.toLocaleString()}
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
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: '#f6f4ef' },
  title: { fontFamily: 'SpaceGrotesk-Bold', fontSize: 22, fontWeight: '700', color: '#1a1c20', marginBottom: 2 },
  subtitle: { fontSize: 12, color: '#8b5cf6', marginBottom: 16 },
  loading: { fontSize: 14, color: '#5b606c', marginTop: 20, textAlign: 'center' },
  errorMessage: { fontSize: 13, color: '#e0453f', marginTop: 20, textAlign: 'center', fontWeight: '600' },
  
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