// rider-app/src/screens/complianceHistory/TransactionListScreen.js
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import TypeFilterChips from '../../components/TypeFilterChips';
import PaginationControls from '../../components/PaginationControls';
import BackLink from '../../components/BackLink';
import api from '../../api/client';

const TYPES = [{ key: 'all', label: 'All' }, { key: 'trip', label: 'Trips' }, { key: 'fuel', label: 'Fuel' },
  { key: 'maintenance', label: 'Service' }, { key: 'other', label: 'Other Expense' }];

const PERIOD_PHRASE = {
  this_month: 'for This Month', last_month: 'for Last Month',
  last_3: 'for the Last 3 Months', last_6: 'for the Last 6 Months',
  since_joining: 'Since Joining',
};

export default function TransactionListScreen({ route, riderId, navigation }) {
  const { range } = route.params;
  const [typeFilter, setTypeFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [data, setData] = useState({ items: [], page: 1, total_pages: 1, total: 0 });

  useEffect(() => {
    api.get('/compliance/financial-history/transactions',
      { params: { rider_id: riderId, quick_select: range, type_filter: typeFilter, page } }).then(res => setData(res.data));
  }, [typeFilter, page, range]);

  function handleTypeChange(next) { setTypeFilter(next); setPage(1); }  // EXC-SB19-006: reset to page 1 on filter change

  return (
    <View style={styles.container}>
      <BackLink onPress={() => navigation.navigate('FinancialHistory')} />
      <Text style={styles.title}>My Transactions {PERIOD_PHRASE[range] || 'for the Selected Period'}</Text>
      <TypeFilterChips options={TYPES} active={typeFilter} onChange={handleTypeChange} />
      {data.items.length ? data.items.map((t, i) => (
        <View key={i} style={[styles.row, t.voided && styles.rowVoided]}>
          <Text style={styles.type}>{t.type}{t.corrected ? ' · Corrected' : ''}{t.voided ? ' · Voided' : ''}</Text>  {/* BR-SB19-008 */}
          <Text style={styles.amount}>KSh {t.amount.toLocaleString()}</Text>
        </View>
      )) : <Text style={styles.empty}>No transactions match this filter.</Text>}  {/* NTF-SB19-002 */}
      <PaginationControls page={data.page} totalPages={data.total_pages} total={data.total}
        onPrev={() => setPage(p => p - 1)} onNext={() => setPage(p => p + 1)} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, backgroundColor: '#fff' },
  title: { fontSize: 18, fontWeight: '800', color: '#1a1c20', marginBottom: 12 },
  row: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: '#f8fafc', borderRadius: 8, padding: 10, marginBottom: 6 },
  rowVoided: { opacity: 0.5 },
  type: { fontSize: 12.5, color: '#1a1c20' },
  amount: { fontSize: 12.5, fontWeight: '700' },
  empty: { fontSize: 12.5, color: '#5b606c', fontStyle: 'italic', paddingVertical: 10 },
});
