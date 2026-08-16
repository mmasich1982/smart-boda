// rider-app/src/screens/settings/PaymentHistoryScreen.js
import React, { useState, useEffect } from 'react';
import { ScrollView, View, Text, StyleSheet } from 'react-native';
import BackLink from '../../components/BackLink';
import StatusBadge from '../../components/StatusBadge';
import PaginationControls from '../../components/PaginationControls';
import colors from '../../theme/colors';
import api from '../../api/client';

export default function PaymentHistoryScreen({ riderId, navigation }) {
  const [page, setPage] = useState(1);
  const [data, setData] = useState({ items: [], page: 1, total_pages: 1, total: 0 });

  useEffect(() => {
    api.get('/subscription/payments', { params: { rider_id: riderId, page } }).then(res => setData(res.data));  // BR-SB24-010: read-only, never editable
  }, [page]);

  return (
    <ScrollView style={styles.container}>
      <BackLink onPress={() => navigation.navigate('Subscription')} />
      <Text style={styles.title}>Payment History</Text>
      {data.items.length ? data.items.map((p) => (
        <View key={p.id} style={styles.row}>
          <View style={{ flex: 1 }}>
            <Text style={styles.rowMain}>{p.channel} · {p.mpesa_code}</Text>
            <Text style={styles.rowSub}>{new Date(p.submitted_at).toLocaleString()}</Text>
            <StatusBadge label={p.reconciliation === 'Verified' ? '✅ Verified by Super Admin' : '⏳ Pending Super Admin Review'}
              color={p.reconciliation === 'Verified' ? 'green' : 'amber'} />
          </View>
          <Text style={styles.amount}>KSh {p.amount.toLocaleString()}</Text>
        </View>
      )) : <Text style={styles.empty}>No payments yet.</Text>}
      <PaginationControls page={data.page} totalPages={data.total_pages} total={data.total}
        onPrev={() => setPage(p => p - 1)} onNext={() => setPage(p => p + 1)} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, backgroundColor: '#fff' },
  title: { fontSize: 18, fontWeight: '800', color: colors.ink, marginBottom: 14 },
  row: { flexDirection: 'row', justifyContent: 'space-between', borderBottomWidth: 1, borderColor: colors.line, paddingVertical: 12 },
  rowMain: { fontSize: 12.5, color: colors.ink, fontWeight: '700' },
  rowSub: { fontSize: 11, color: colors.inkSoft, marginBottom: 4 },
  amount: { fontSize: 13, fontWeight: '800', color: colors.ink },
  empty: { fontSize: 12.5, color: colors.inkSoft, fontStyle: 'italic', paddingVertical: 10 },
});
