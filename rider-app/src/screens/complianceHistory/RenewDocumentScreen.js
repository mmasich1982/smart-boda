// rider-app/src/screens/complianceHistory/RenewDocumentScreen.js — "Renew: {Document Type}"
import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import FormField from '../../components/FormField';
import StatusBadge from '../../components/StatusBadge';
import PrimaryButton from '../../components/PrimaryButton';
import { enqueue } from '../../offline/syncQueue';
import BackLink from '../../components/BackLink';

// BR-SB18-011: renewal is entered directly here — this screen never links out to NTSA, eCitizen, or anywhere else.
export default function RenewDocumentScreen({ route, existingDoc, documentTypes, navigation }) {
  const { documentTypeCode } = route.params;
  const typeName = documentTypes.find(t => t.code === documentTypeCode)?.display_name;
  const [expiryDate, setExpiryDate] = useState('');
  const [error, setError] = useState(null);

  async function handleSave() {
    if (!expiryDate) { setError('Enter an Expiry Date for this document type.'); return; }
    if (new Date(expiryDate) <= new Date()) { setError('Expiry Date must be in the future.'); return; }
    await enqueue('compliance_document', { documentTypeCode, expiryDate, submittedAt: Date.now() });  // archives the old record, BR-SB18-004
    // NEW: no separate "dismiss" step needed — useUrgentAlerts() recomputes days-left from the fresh
    // expiryDate on its very next poll/focus-refresh, so this document's row simply stops qualifying
    // and disappears from the bell on its own (BR-SB18-014).
    navigation.navigate('ComplianceDashboard');  // shows "Fully Up To Date" once every document is Valid
  }

  return (
    <View style={styles.container}>
      <BackLink onPress={() => navigation.navigate('ComplianceDashboard')} />
      <Text style={styles.title}>Renew: {typeName}</Text>
      <Text style={styles.sub}>Already renewed your {typeName}? Just enter the new expiry date below and we'll update your reminder.</Text>
      {existingDoc?.expiry_date && (
        <View style={styles.card}>
          <Text style={styles.cardRow}>Current Expiry Date: {existingDoc.expiry_date}</Text>
          <StatusBadge label="Action Needed" color="amber" />
        </View>
      )}
      <FormField label="New Expiry Date" type="date" value={expiryDate} onChangeText={setExpiryDate} />
      {error && <Text style={styles.error}>⚠️ {error}</Text>}
      <PrimaryButton label="Save New Expiry Date →" onPress={handleSave} disabled={!expiryDate} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, backgroundColor: '#fff' },
  title: { fontSize: 18, fontWeight: '800', color: '#1a1c20', marginBottom: 6 },
  sub: { fontSize: 12.5, color: '#5b606c', marginBottom: 14 },
  card: { backgroundColor: '#f8fafc', borderRadius: 10, padding: 12, marginBottom: 14 },
  cardRow: { fontSize: 12.5, color: '#1a1c20', marginBottom: 6 },
  error: { color: '#e0453f', fontSize: 12.5, marginBottom: 10, fontWeight: '700' },
});
