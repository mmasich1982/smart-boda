// rider-app/src/screens/complianceHistory/AddDocumentScreen.js — "Add a Document"
import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import FormField from '../../components/FormField';
import PrimaryButton from '../../components/PrimaryButton';
import { enqueue } from '../../offline/syncQueue';
import BackLink from '../../components/BackLink';

export default function AddDocumentScreen({ documentTypes, navigation }) {
  const [type, setType] = useState('');  // BR-SB18-002: exactly the 2 governed types — PSV Licence, Insurance Certificate
  const [expiryDate, setExpiryDate] = useState('');
  const [error, setError] = useState(null);

  async function handleSave() {
    if (!type) { setError('Select a Document Type.'); return; }  // EXC-SB18-001
    if (!expiryDate) { setError('Enter an Expiry Date for this document type.'); return; }  // EXC-SB18-002
    if (new Date(expiryDate) <= new Date()) { setError('Expiry Date must be in the future.'); return; }  // EXC-SB18-003
    await enqueue('compliance_document', { documentTypeCode: type, expiryDate, submittedAt: Date.now() });
    navigation.navigate('ComplianceDashboard');  // rider lands back on Expiry Reminders, now showing this document's status
  }

  return (
    <View style={styles.container}>
      <BackLink onPress={() => navigation.navigate('ComplianceDashboard')} />
      <Text style={styles.title}>Add a Document</Text>
      <FormField label="Document Type" type="select" value={type} onChangeText={setType}
        options={documentTypes.map(t => ({ label: t.display_name, value: t.code }))} />  {/* sourced entirely from Super Admin Master Data, never hard-coded */}
      <Text style={styles.hint}>Pick the document you want us to remind you about before it expires.</Text>
      <FormField label="Expiry Date" type="date" value={expiryDate} onChangeText={setExpiryDate} />
      {error && <Text style={styles.error}>⚠️ {error}</Text>}
      <PrimaryButton label="Save →" onPress={handleSave} disabled={!type || !expiryDate} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, backgroundColor: '#fff' },
  title: { fontSize: 18, fontWeight: '800', color: '#1a1c20', marginBottom: 16 },
  hint: { fontSize: 12, color: '#5b606c', marginBottom: 14 },
  error: { color: '#e0453f', fontSize: 12.5, marginBottom: 10, fontWeight: '700' },
});
