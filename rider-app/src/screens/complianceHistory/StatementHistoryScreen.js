// rider-app/src/screens/complianceHistory/StatementHistoryScreen.js
import React, { useState, useEffect } from 'react';
import { ScrollView, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import StatusBadge from '../../components/StatusBadge';
import PaginationControls from '../../components/PaginationControls';
import BackLink from '../../components/BackLink';
import api from '../../api/client';

export default function StatementHistoryScreen({ riderId, navigation }) {
  const [page, setPage] = useState(1);
  const [data, setData] = useState({ items: [], page: 1, total_pages: 1, total: 0 });

  useEffect(() => {
    api.get('/compliance/statements/history', { params: { rider_id: riderId, page } }).then(res => setData(res.data));  // BR-SB20-008: nothing ever deleted
  }, [page]);

  return (
    <ScrollView style={styles.container}>
      <BackLink onPress={() => navigation.navigate('FinancialHistory')} />
      <Text style={styles.title}>Statement History</Text>
      {data.items.length ? data.items.map((s) => (
        // BR-SB20-009: tapping any row re-opens that exact statement, figures frozen at generation
        <TouchableOpacity key={s.id} style={styles.card} onPress={() => navigation.navigate('StatementPreview', { statementId: s.id })}>
          <View style={styles.cardHead}>
            <Text style={styles.cardTitle}>{s.period_start} – {s.period_end}</Text>
            <StatusBadge label={s.verified ? 'Verified' : 'Pending Verification'} color={s.verified ? 'green' : 'amber'} />
          </View>
          <Text style={styles.cardHint}>📝 Summarized · {s.download_count ? `Downloaded ${s.download_count} time(s)` : 'Not yet downloaded'}</Text>
        </TouchableOpacity>
      )) : <Text style={styles.empty}>No statements generated yet.</Text>}  {/* EXC-SB20-008 */}
      <PaginationControls page={data.page} totalPages={data.total_pages} total={data.total}
        onPrev={() => setPage(p => p - 1)} onNext={() => setPage(p => p + 1)} />  {/* EXC-SB20-009 */}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, backgroundColor: '#fff' },
  title: { fontSize: 18, fontWeight: '800', color: '#1a1c20', marginBottom: 14 },
  card: { borderWidth: 1.5, borderColor: '#e7e4db', borderRadius: 14, padding: 14, marginBottom: 10 },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  cardTitle: { fontSize: 13, fontWeight: '700', color: '#1a1c20' },
  cardHint: { fontSize: 11.5, color: '#5b606c' },
  empty: { fontSize: 12.5, color: '#5b606c', fontStyle: 'italic', paddingVertical: 10 },
});
