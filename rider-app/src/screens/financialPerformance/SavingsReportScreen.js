// rider-app/src/screens/financialPerformance/SavingsReportScreen.js
import React, { useState, useEffect } from 'react';
import { ScrollView, View, Text, StyleSheet } from 'react-native';
import BackLink from '../../components/BackLink';
import PeriodTabs from '../../components/PeriodTabs';
import api from '../../api/client';

const PERIODS = [{ key: 'this_month', label: 'This Month' }, { key: 'last_month', label: 'Last Month' },
                 { key: 'last_6_months', label: 'Last 6 Months' }, { key: 'since_joining', label: 'Since Joining' }];  // BR-SB17-010

export default function SavingsReportScreen({ route, riderId, navigation }) {
  const filterType = route.params?.type ?? null;  // null = combined SACCO + Chama, else pre-filtered
  const [period, setPeriod] = useState('last_6_months');
  const [report, setReport] = useState(null);

  useEffect(() => {
    api.get('/financial/savings/report', { params: { rider_id: riderId, period } }).then(res => setReport(res.data));
  }, [period]);

  if (!report) return null;
  const visibleAccounts = filterType ? report.accounts.filter((a) => a.type === filterType) : report.accounts;

  return (
    <ScrollView style={styles.container}>
      <BackLink onPress={() => navigation.navigate('SavingsHub')} label="← Savings" />
      <Text style={styles.title}>Savings Report</Text>
      <PeriodTabs options={PERIODS} active={period} onChange={setPeriod} />
      {visibleAccounts.length === 0 ? (
        // EXC-SB16-005
        <Text style={styles.empty}>No savings accounts yet. Register one from the Savings Hub to see your report here.</Text>
      ) : (
        <>
          {!filterType && (
            <View style={styles.card}>
              <View style={styles.row}><Text style={styles.k}>🤝 SACCO total</Text><Text style={styles.v}>KSh {report.sacco_total.toLocaleString()}</Text></View>
              <View style={styles.row}><Text style={styles.k}>👥 Chama total</Text><Text style={styles.v}>KSh {report.chama_total.toLocaleString()}</Text></View>
            </View>
          )}
          {visibleAccounts.map((acc) => (
            <View key={acc.id} style={styles.card}>
              <Text style={styles.accName}>{acc.name}</Text>
              <View style={styles.row}><Text style={styles.k}>This period</Text><Text style={styles.v}>{acc.period_total ? `KSh ${acc.period_total.toLocaleString()}` : 'No contributions this period'}</Text></View>  {/* EXC-SB16-006 */}
              <View style={styles.row}><Text style={styles.k}>Lifetime</Text><Text style={styles.v}>KSh {acc.lifetime_total.toLocaleString()}</Text></View>
            </View>
          ))}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: '#f6f4ef' },
  title: { fontFamily: 'SpaceGrotesk-Bold', fontSize: 22, fontWeight: '700', color: '#1a1c20', marginBottom: 4 },
  card: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#e7e4db', borderRadius: 14, padding: 14, marginBottom: 10 },
  accName: { fontSize: 14, fontWeight: '800', color: '#1a1c20', marginBottom: 4 },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 },
  k: { fontSize: 12.5, color: '#5b606c' },
  v: { fontSize: 13, fontWeight: '700', color: '#1a1c20' },
  empty: { fontSize: 12.5, color: '#5b606c', fontStyle: 'italic', textAlign: 'center', marginTop: 20 },  // TPL-RA07-030
});
