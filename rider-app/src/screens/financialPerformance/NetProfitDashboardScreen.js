// rider-app/src/screens/financialPerformance/NetProfitDashboardScreen.js
import React, { useState, useEffect } from 'react';
import { ScrollView, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import BackLink from '../../components/BackLink';
import PeriodTabs from '../../components/PeriodTabs';
import { useRider } from '../../rider/RiderContext';
import { getLocalRiderStatus } from '../../offline/db';
import api from '../../api/client';

const PERIODS = [{ key: 'today', label: 'Today' }, { key: 'this_week', label: 'This Week' }, { key: 'this_month', label: 'This Month' }];

export default function NetProfitDashboardScreen({ navigation }) {
  const { state } = useRider();
  const [localRiderId, setLocalRiderId] = useState(null);
  const [period, setPeriod] = useState('today');
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

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

  if (!summary) return (
    <ScrollView style={styles.container}>
      <BackLink onPress={() => navigation.navigate('Home')} label="← Home" />
      <Text style={styles.title}>Financial Performance</Text>
      {loading && <Text style={styles.loading}>Loading...</Text>}
      {error && <Text style={styles.error}>{error}</Text>}
    </ScrollView>
  );
  const isNegative = summary.net_profit < 0;  // BR-SB13-011

  return (
    <ScrollView style={styles.container}>
      <BackLink onPress={() => navigation.navigate('Home')} label="← Home" />
      <Text style={styles.title}>Financial Performance</Text>
      <PeriodTabs options={PERIODS} active={period} onChange={setPeriod} />
      <View style={[styles.heroCard, isNegative && styles.heroCardNegative]}>
        <Text style={styles.heroLbl}>Net Profit</Text>
        <Text style={[styles.netProfit, isNegative && styles.netProfitNegative]}>KSh {summary.net_profit.toLocaleString()}</Text>
        <Text style={styles.subline}>Income: KSh {summary.income.toLocaleString()}   Expense: KSh {summary.total_expense.toLocaleString()}</Text>
      </View>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Expense Breakdown</Text>
        {summary.breakdown.length ? summary.breakdown.map((row) => {
          const pct = summary.total_expense > 0 ? Math.round((row.amount / summary.total_expense) * 100) : 0;
          return (
            <View key={row.category} style={styles.breakdownRow}>
              <Text style={styles.breakdownText}>{row.category}</Text>
              <Text style={styles.breakdownAmt}>{pct}%   KSh {row.amount.toLocaleString()}</Text>
            </View>
          );
        }) : <Text style={styles.empty}>No expenses logged for this period.</Text>}  {/* BR-SB13-005 */}
      </View>
      <TouchableOpacity style={styles.primaryBtn} onPress={() => navigation.navigate('AddOtherExpense')}>
        <Text style={styles.primaryBtnText}>＋ Add Other Expense →</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: '#f6f4ef' },  // boda-cream
  title: { fontFamily: 'SpaceGrotesk-Bold', fontSize: 22, fontWeight: '700', color: '#1a1c20', marginBottom: 4 },
  loading: { fontSize: 14, color: '#5b606c', marginTop: 20, textAlign: 'center' },
  error: { fontSize: 13, color: '#e0453f', marginTop: 20, textAlign: 'center', fontWeight: '600' },
  heroCard: { backgroundColor: '#1d2026', borderRadius: 16, padding: 18, marginBottom: 14 },
  heroCardNegative: { backgroundColor: '#3a1512' },  // BR-SB13-011: warning tint, never clamped to zero
  heroLbl: { fontSize: 11, color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase', letterSpacing: 0.5 },
  netProfit: { fontFamily: 'SpaceGrotesk-Bold', fontSize: 30, fontWeight: '700', color: '#ffc93c', marginVertical: 2 },  // boda-yellow
  netProfitNegative: { color: '#ff8a80' },
  subline: { fontSize: 12, color: 'rgba(255,255,255,0.75)' },
  card: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#e7e4db', borderRadius: 14, padding: 14, marginBottom: 16 },
  cardTitle: { fontSize: 13, fontWeight: '700', color: '#1a1c20', marginBottom: 8 },
  breakdownRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
  breakdownText: { fontSize: 13, color: '#5b606c' },
  breakdownAmt: { fontSize: 13, fontWeight: '700', color: '#1a1c20' },
  empty: { fontSize: 12.5, color: '#5b606c', fontStyle: 'italic' },  // TPL-RA07-030
  primaryBtn: { backgroundColor: '#ff7a1a', borderRadius: 14, paddingVertical: 15, alignItems: 'center', marginBottom: 10, shadowColor: '#ff7a1a', shadowOpacity: 0.4, shadowRadius: 10, shadowOffset: { width: 0, height: 6 } },
  primaryBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});