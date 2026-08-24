// rider-app/src/screens/complianceHistory/ComplianceDashboardScreen.js — "License and Insurance Expiry Reminders"
import React, { useEffect, useState } from 'react';
import { ScrollView, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import StatusBadge from '../../components/StatusBadge';
import PrimaryButton from '../../components/PrimaryButton';
import { useToast } from '../../components/Toast';
import BackLink from '../../components/BackLink';
import api from '../../api/client';

const STATUS_META = {
  expired: { label: '🔴 Expired', color: 'red' },
  due: { label: '🔴 Due today', color: 'red' },
  expiring_1mo: { label: '🟡 Expiring within 1 month', color: 'amber' },
  expiring_2mo: { label: '🟠 Expiring within 2 months', color: 'amber' },
  valid: { label: '✅ Valid', color: 'green' },
};

export default function ComplianceDashboardScreen({ riderId, documentTypes, navigation }) {
  const [docs, setDocs] = useState([]);
  const { showToast } = useToast();
  const actionNeeded = docs.some(d => d.status !== 'valid');
  const fullyCompliant = docs.length > 0 && !actionNeeded;  // drives the hero banner, matching cleaned.html's screenCompliance()

  useEffect(() => {
    api.get('/compliance/documents', { params: { rider_id: riderId } }).then((res) => {
      setDocs(res.data);
      res.data.forEach((d) => d.reminders_fired.forEach((tier) => {
        const typeName = documentTypes.find(t => t.code === d.document_type_code)?.display_name;
        showToast(tier === 'first'
          ? `⏰ Your ${typeName} expires in 5 days. Renew soon to stay compliant.`
          : `⚠️ Your ${typeName} expires soon. Renew now.`, 'warn');  // NTF-SB18-003/004
      }));
    });
  }, []);

  return (
    <ScrollView style={styles.container}>
      <BackLink label="← Home" onPress={() => navigation.navigate('Home')} />
      <Text style={styles.title}>License and Insurance Expiry Reminders</Text>
      {docs.length > 0 && (
        <View style={[styles.hero, fullyCompliant ? styles.heroOk : styles.heroAction]}>
          <Text style={[styles.heroText, { color: fullyCompliant ? '#16a34a' : '#b45309' }]}>
            {fullyCompliant ? '✅ Fully Up To Date' : '⚠️ Action Needed'}
          </Text>
        </View>
      )}
      {docs.length ? docs.map((d) => (
        <View key={d.id} style={styles.row}>
          <Text style={styles.docType}>{documentTypes.find(t => t.code === d.document_type_code)?.display_name}</Text>
          <Text style={styles.expiry}>Expires {d.expiry_date}</Text>
          <View style={styles.badgeRow}>
            <StatusBadge label={STATUS_META[d.status].label} color={STATUS_META[d.status].color} />
            {d.status !== 'valid' && (
              // BR-SB18-011: goes straight to in-app renewal — never an external link
              <TouchableOpacity onPress={() => navigation.navigate('RenewDocument', { documentTypeCode: d.document_type_code })}>
                <Text style={styles.renewLink}>Renew</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      )) : <Text style={styles.empty}>No documents added yet. Add your first to get started.</Text>}
      <PrimaryButton label="＋ Add Your License Or Insurance →" onPress={() => navigation.navigate('AddDocument')} />
      <Text style={styles.footnote}>An expired document never restricts any app feature.</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, backgroundColor: '#fff' },
  title: { fontSize: 18, fontWeight: '800', color: '#1a1c20', marginBottom: 12 },
  hero: { borderRadius: 10, padding: 12, alignItems: 'center', marginBottom: 14 },
  heroOk: { backgroundColor: '#ecfdf5' },
  heroAction: { backgroundColor: '#fff7ec' },
  heroText: { fontSize: 15, fontWeight: '800' },
  row: { backgroundColor: '#f8fafc', borderRadius: 10, padding: 12, marginBottom: 10 },
  docType: { fontSize: 13, fontWeight: '800' },
  expiry: { fontSize: 11.5, color: '#5b606c', marginBottom: 6 },
  badgeRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  renewLink: { fontSize: 12, fontWeight: '800', color: '#ff7a1a' },
  empty: { fontSize: 12.5, color: '#5b606c', fontStyle: 'italic', marginBottom: 14 },
  footnote: { fontSize: 11, color: '#94a3b8', textAlign: 'center', marginTop: 12 },
});
