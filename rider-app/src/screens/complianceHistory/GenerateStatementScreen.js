// rider-app/src/screens/complianceHistory/GenerateStatementScreen.js
import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import FormField from '../../components/FormField';
import PrimaryButton from '../../components/PrimaryButton';
import BackLink from '../../components/BackLink';
import { useToast } from '../../components/Toast';
import api from '../../api/client';

export default function GenerateStatementScreen({ route, riderId, statementPurposes, navigation }) {
  const { start, end } = route.params;
  const [purpose, setPurpose] = useState('');  // optional, BR-SB20-003
  const { showToast } = useToast();

  async function handleGenerate() {
    const net = await NetInfo.fetch();
    const res = await api.post('/compliance/statements',
      { period_start: start, period_end: end, purpose_code: purpose || null },
      { params: { rider_id: riderId, online: net.isConnected } });
    if (!net.isConnected) {
      // EXC-SB20-002
      showToast('Statement generated locally — verification reference will register once online.', 'default');
    }
    navigation.replace('StatementPreview', { statementId: res.data.id });
  }

  return (
    <View style={styles.container}>
      <BackLink onPress={() => navigation.navigate('FinancialHistory')} />
      <Text style={styles.title}>Generate a Statement</Text>
      <Text style={styles.period}>Period: {start} — {end}</Text>
      <FormField label="Statement Purpose (optional)" type="select" value={purpose} onChangeText={setPurpose}
        options={statementPurposes.map(p => ({ label: p.display_name, value: p.code }))} />
      <Text style={styles.banner}>✅ Income / Expense / Net Profit is always included — the statement's foundation.</Text>
      <PrimaryButton label="Generate Statement →" onPress={handleGenerate} />  {/* BR-SB20: always enabled, Purpose is optional */}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, backgroundColor: '#fff' },
  title: { fontSize: 18, fontWeight: '800', color: '#1a1c20', marginBottom: 12 },
  period: { fontSize: 12.5, color: '#5b606c', marginBottom: 14 },
  banner: { fontSize: 12, color: '#065f46', backgroundColor: '#ecfdf5', borderRadius: 8, padding: 10, marginBottom: 16 },
});
