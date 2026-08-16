// rider-app/src/screens/financialPerformance/SendMoneyHomeScreen.js
import React, { useState, useEffect } from 'react';
import { ScrollView, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import BackLink from '../../components/BackLink';
import FormField from '../../components/FormField';
import { enqueue } from '../../offline/syncQueue';
import api from '../../api/client';

export default function SendMoneyHomeScreen({ riderId, familyRelationships, paymentChannels, navigation }) {
  const [savedRecipients, setSavedRecipients] = useState([]);
  const [recipientName, setRecipientName] = useState('');
  const [relationship, setRelationship] = useState('');
  const [amount, setAmount] = useState('');
  const [channel, setChannel] = useState('');
  const [error, setError] = useState(null);

  useEffect(() => { api.get('/financial/recipients', { params: { rider_id: riderId } }).then(res => setSavedRecipients(res.data)); }, []);  // BR-SB17-009

  async function handleSave() {
    if (!recipientName.trim()) { setError('Recipient name is required.'); return; }  // EXC-SB17-006
    if (!amount || parseFloat(amount) <= 0) { setError('Enter an amount greater than zero.'); return; }  // EXC-SB17-007
    if (!channel) { setError('Select a payment channel.'); return; }  // EXC-SB17-008
    await enqueue('remittance', { recipientName, relationship: relationship || null, amount: parseFloat(amount), channel, submittedAt: Date.now() });
    navigation.navigate('SendMoneyHistory');  // NTF-SB17-005
  }

  return (
    <ScrollView style={styles.container}>
      <BackLink onPress={() => navigation.navigate('Home')} label="← Home" />
      <Text style={styles.title}>Send Money Home</Text>
      <Text style={styles.sub}>Log what you sent — the app tracks it, it doesn't move the money.</Text>
      <FormField label="Recipient Name" required value={recipientName} onChangeText={setRecipientName}
        suggestions={savedRecipients.map(r => r.name)} />  {/* BR-SB17-009: tap-to-fill from prior recipients */}
      {/* EXCEPTION per current MVP0 scope: Relationship and Payment Channel values are Super Admin master data */}
      <FormField label="Relationship — optional" type="select" value={relationship} onChangeText={setRelationship}
        options={familyRelationships.map(r => ({ label: r.display_name, value: r.code }))} placeholder="Select..." />
      <FormField label="Amount" required value={amount} onChangeText={setAmount} keyboardType="numeric" />
      <FormField label="Payment Channel" required type="select" value={channel} onChangeText={setChannel}
        options={paymentChannels.map(c => ({ label: c.display_name, value: c.code }))} placeholder="Select..." />  {/* reused from Module B */}
      {error && <Text style={styles.error}>⚠️ {error}</Text>}
      <TouchableOpacity style={[styles.primaryBtn, (!recipientName || !amount || !channel) && styles.primaryBtnDisabled]} onPress={handleSave} disabled={!recipientName || !amount || !channel}>
        <Text style={styles.primaryBtnText}>Save →</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.ghostBtn} onPress={() => navigation.navigate('SendMoneyHistory')}>
        <Text style={styles.ghostBtnText}>View Send History →</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: '#f6f4ef' },
  title: { fontFamily: 'SpaceGrotesk-Bold', fontSize: 22, fontWeight: '700', color: '#1a1c20', marginBottom: 4 },
  sub: { fontSize: 13, color: '#5b606c', marginBottom: 16 },
  error: { color: '#e0453f', fontSize: 12.5, marginBottom: 10, fontWeight: '700' },
  primaryBtn: { backgroundColor: '#ff7a1a', borderRadius: 14, paddingVertical: 15, alignItems: 'center', marginBottom: 10, shadowColor: '#ff7a1a', shadowOpacity: 0.4, shadowRadius: 10, shadowOffset: { width: 0, height: 6 } },
  primaryBtnDisabled: { backgroundColor: '#e9dccc', shadowOpacity: 0 },
  primaryBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  ghostBtn: { borderWidth: 1.5, borderColor: '#e7e4db', borderRadius: 14, paddingVertical: 13, alignItems: 'center' },
  ghostBtnText: { color: '#1a1c20', fontSize: 14, fontWeight: '700' },
});
