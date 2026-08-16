// rider-app/src/screens/financialPerformance/SendMoneyHistoryScreen.js
import React, { useEffect, useState } from 'react';
import { ScrollView, View, Text, StyleSheet } from 'react-native';
import BackLink from '../../components/BackLink';
import api from '../../api/client';

export default function SendMoneyHistoryScreen({ riderId, navigation }) {
  const [rows, setRows] = useState([]);
  useEffect(() => { api.get('/financial/remittances', { params: { rider_id: riderId } }).then(res => setRows(res.data)); }, []);  // EXC-SB17-010

  return (
    <ScrollView style={styles.container}>
      <BackLink onPress={() => navigation.navigate('SendMoneyHome')} label="← Send Money Home" />
      <Text style={styles.title}>Send History</Text>
      {rows.length ? rows.map((r) => (
        <View key={r.id} style={styles.card}>
          <View style={styles.row}><Text style={styles.name}>{r.recipient_name}</Text><Text style={styles.amt}>KSh {r.amount.toLocaleString()}</Text></View>
          <Text style={styles.meta}>{r.channel_code}{r.relationship_code ? ` · ${r.relationship_code}` : ''} · {new Date(r.submitted_at).toLocaleDateString()}</Text>
        </View>
      )) : <Text style={styles.empty}>No money sent home yet. Log one from Send Money Home.</Text>}  {/* EXC-SB17-010 */}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: '#f6f4ef' },
  title: { fontFamily: 'SpaceGrotesk-Bold', fontSize: 22, fontWeight: '700', color: '#1a1c20', marginBottom: 14 },
  card: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#e7e4db', borderRadius: 14, padding: 14, marginBottom: 10 },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  name: { fontSize: 14, fontWeight: '800', color: '#1a1c20' },
  amt: { fontSize: 14, fontWeight: '800', color: '#e5650a' },
  meta: { fontSize: 11.5, color: '#5b606c', marginTop: 4 },
  empty: { fontSize: 12.5, color: '#5b606c', fontStyle: 'italic', textAlign: 'center', marginTop: 20 },  // TPL-RA07-030
});
