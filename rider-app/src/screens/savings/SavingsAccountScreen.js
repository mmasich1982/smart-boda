// rider-app/src/screens/savings/SavingsAccountScreen.js
import React, { useEffect, useState } from 'react';
import { ScrollView, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import BackLink from '../../components/BackLink';
import FormField from '../../components/FormField';
import api from '../../api/client';

// EXCEPTION per current MVP0 scope: Frequency options come from Super Admin master data (weekly/monthly today, extensible later)
const FREQUENCIES = [{ value: 'weekly', label: 'Weekly' }, { value: 'monthly', label: 'Monthly' }];

export default function SavingsAccountScreen({ route, riderId, navigation }) {
  const { type } = route.params;  // 'sacco' | 'chama'
  const typeLabel = type === 'sacco' ? 'SACCO' : 'Chama';
  const [accounts, setAccounts] = useState([]);
  const [name, setName] = useState('');
  const [frequency, setFrequency] = useState('weekly');
  const [contribAmount, setContribAmount] = useState({});
  const [error, setError] = useState(null);

  function loadAccounts() {
    api.get('/financial/savings/accounts', { params: { rider_id: riderId, type } }).then(res => setAccounts(res.data));
  }
  useEffect(loadAccounts, [type]);

  async function handleAddSaving() {
    if (!name.trim()) { setError(`Enter the ${typeLabel} Name.`); return; }  // EXC-SB16-001
    await api.post('/financial/savings/account', { type, name: name.trim(), frequency }, { params: { rider_id: riderId } });  // BR-SB16-002/003
    setName('');
    loadAccounts();
  }

  async function handleAddContribution(accountId) {
    const amount = parseFloat(contribAmount[accountId]);
    if (!amount || amount <= 0) { setError('Enter an amount greater than zero.'); return; }  // EXC-SB16-002
    await api.post('/financial/savings/contribution', { account_id: accountId, amount });  // BR-SB16-006
    setContribAmount((prev) => ({ ...prev, [accountId]: '' }));
    loadAccounts();
  }

  return (
    <ScrollView style={styles.container}>
      <BackLink onPress={() => navigation.navigate('SavingsHub')} label={`← Savings`} />
      <Text style={styles.title}>{typeLabel} Savings</Text>
      <Text style={styles.sub}>Register a {typeLabel} account, or add to one you already track.</Text>
      {accounts.map((acc) => (
        <View key={acc.id} style={styles.card}>
          <Text style={styles.accName}>{acc.name}</Text>
          <View style={styles.row}><Text style={styles.k}>Saved so far</Text><Text style={styles.v}>KSh {acc.lifetime_total.toLocaleString()}</Text></View>
          <FormField label="Add a contribution (KSh)" value={contribAmount[acc.id] || ''}
            onChangeText={(v) => setContribAmount((prev) => ({ ...prev, [acc.id]: v }))} keyboardType="numeric" />
          <TouchableOpacity style={styles.smallBtn} onPress={() => handleAddContribution(acc.id)}>
            <Text style={styles.smallBtnText}>＋ Add Contribution</Text>
          </TouchableOpacity>
        </View>
      ))}
      <View style={styles.divider} />
      <Text style={styles.sectionLabel}>{typeLabel} Name</Text>
      <FormField value={name} onChangeText={setName} placeholder={`e.g. Boda Riders ${typeLabel}`} />
      <Text style={styles.sectionLabel}>Frequency</Text>
      <View style={styles.freqRow}>
        {FREQUENCIES.map((f) => (
          <TouchableOpacity key={f.value} style={[styles.freqTile, frequency === f.value && styles.freqTileActive]} onPress={() => setFrequency(f.value)}>
            <Text style={[styles.freqText, frequency === f.value && styles.freqTextActive]}>{f.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
      {error && <Text style={styles.error}>⚠️ {error}</Text>}
      <TouchableOpacity style={[styles.primaryBtn, !name && styles.primaryBtnDisabled]} onPress={handleAddSaving} disabled={!name}>
        <Text style={styles.primaryBtnText}>＋ Add Saving</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: '#f6f4ef' },
  title: { fontFamily: 'SpaceGrotesk-Bold', fontSize: 22, fontWeight: '700', color: '#1a1c20', marginBottom: 4 },
  sub: { fontSize: 13, color: '#5b606c', marginBottom: 14 },
  card: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#e7e4db', borderRadius: 14, padding: 14, marginBottom: 10 },
  accName: { fontSize: 14, fontWeight: '800', color: '#1a1c20', marginBottom: 4 },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  k: { fontSize: 12.5, color: '#5b606c' },
  v: { fontSize: 13, fontWeight: '700', color: '#1a1c20' },
  smallBtn: { backgroundColor: '#fff6ee', borderWidth: 1.5, borderColor: '#ff7a1a', borderRadius: 10, paddingVertical: 8, alignItems: 'center', marginTop: 6 },
  smallBtnText: { color: '#e5650a', fontSize: 12.5, fontWeight: '800' },
  divider: { height: 1, backgroundColor: '#e7e4db', marginVertical: 14 },
  sectionLabel: { fontSize: 12.5, fontWeight: '700', color: '#1a1c20', marginBottom: 6 },
  freqRow: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  freqTile: { flex: 1, borderWidth: 1.5, borderColor: '#e7e4db', borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
  freqTileActive: { backgroundColor: '#ff7a1a', borderColor: '#ff7a1a' },
  freqText: { fontSize: 13, fontWeight: '700', color: '#5b606c' },
  freqTextActive: { color: '#fff' },
  error: { color: '#e0453f', fontSize: 12.5, marginBottom: 10, fontWeight: '700' },
  primaryBtn: { backgroundColor: '#ff7a1a', borderRadius: 14, paddingVertical: 15, alignItems: 'center', shadowColor: '#ff7a1a', shadowOpacity: 0.4, shadowRadius: 10, shadowOffset: { width: 0, height: 6 } },
  primaryBtnDisabled: { backgroundColor: '#e9dccc', shadowOpacity: 0 },
  primaryBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
