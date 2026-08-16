// rider-app/src/screens/complianceHistory/FinancialHistoryScreen.js
import React, { useState, useEffect } from 'react';
import { ScrollView, View, Text, StyleSheet } from 'react-native';
import PeriodTabs from '../../components/PeriodTabs';
import PrimaryButton from '../../components/PrimaryButton';
import BackLink from '../../components/BackLink';
import api from '../../api/client';

const RANGES = [
  { key: 'this_month', label: 'This Month' }, { key: 'last_month', label: 'Last Month' },
  { key: 'last_3', label: 'Last 3 Months' }, { key: 'last_6', label: 'Last 6 Months' },
  { key: 'since_joining', label: 'Since Joining' },
];

export default function FinancialHistoryScreen({ riderId, navigation }) {
  const [range, setRange] = useState('this_month');
  const [summary, setSummary] = useState(null);

  useEffect(() => {
    api.get('/compliance/financial-history/summary', { params: { rider_id: riderId, quick_select: range } }).then(res => setSummary(res.data));
  }, [range]);

  if (!summary) return null;

  return (
    <ScrollView style={styles.container}>
      <BackLink label="← Home" onPress={() => navigation.navigate('Home')} />
      <Text style={styles.title}>My Financial History & Statements</Text>
      <PeriodTabs options={RANGES} active={range} onChange={setRange} />
      <Text style={styles.rangeLine}>{summary.range_start} — {summary.range_end}</Text>
      <Text style={styles.netProfit}>KSh {summary.net_profit.toLocaleString()}</Text>
      <Text style={styles.subline}>Income KSh {summary.income.toLocaleString()} · Expense KSh {summary.total_expense.toLocaleString()}</Text>
      {summary.breakdown.length ? summary.breakdown.map((row) => (
        <View key={row.category} style={styles.breakdownRow}>
          <Text style={styles.breakdownText}>{row.category} · {row.pct}% · KSh {row.amount.toLocaleString()}</Text>
        </View>
      )) : <Text style={styles.empty}>No expenses in this range.</Text>}  {/* NTF-SB19-001 */}
      <PrimaryButton label="📜 View Transactions →" onPress={() => navigation.navigate('TransactionList', { range })} />
      <PrimaryButton label="📄 Generate a Statement →" onPress={() => navigation.navigate('GenerateStatement', { range, start: summary.range_start, end: summary.range_end })} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, backgroundColor: '#fff' },
  title: { fontSize: 18, fontWeight: '800', color: '#1a1c20', marginBottom: 12 },
  rangeLine: { fontSize: 11.5, color: '#5b606c', marginBottom: 10 },
  netProfit: { fontSize: 28, fontWeight: '800', color: '#16a34a' },
  subline: { fontSize: 12, color: '#5b606c', marginBottom: 14 },
  breakdownRow: { backgroundColor: '#f8fafc', borderRadius: 8, padding: 8, marginBottom: 6 },
  breakdownText: { fontSize: 12.5, color: '#1a1c20' },
  empty: { fontSize: 12.5, color: '#5b606c', fontStyle: 'italic', marginBottom: 14 },
});
