// rider-app/src/screens/onboarding/DuplicatePlateScreen.js
// Module A's guide covers the duplicate-plate business logic (duplicate_plate_service.py)
// and the admin queue (RiderAccountSupport.jsx) thoroughly, but never showed the rider-facing
// screen cleaned.html's 'duplicatePlate' case renders. Implemented per BR-SB02-008/009: the
// rider is told plainly what's happening, and the app stays fully usable while a human
// reviews the case -- never a blocking "suspended" state.
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import PrimaryButton from '../../components/PrimaryButton';
import { useTranslation } from '../../i18n/LocalizationProvider';
import colors from '../../theme/colors';
import api from '../../api/client';

export default function DuplicatePlateScreen({ route, navigation }) {
  const { caseId } = route.params || {};
  const { t } = useTranslation();
  const [status, setStatus] = useState('pending_review');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!caseId) { setLoading(false); return; }
    api.get(`/rider-support/duplicate-plate-cases/${caseId}`)
      .then((res) => setStatus(res.data.status))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [caseId]);

  const statusDisplay = loading ? t('duplicate.checking') : status === 'resolved' ? t('duplicate.resolved') : t('duplicate.pending');

  return (
    <View style={styles.container}>
      <Text style={styles.icon}>🔍</Text>
      <Text style={styles.title}>{t('duplicate.title')}</Text>
      <Text style={styles.body}>{t('duplicate.body')}</Text>
      <View style={styles.card}>
        <Text style={styles.cardLabel}>{t('duplicate.status_label')}</Text>
        <Text style={styles.cardValue}>{statusDisplay}</Text>
      </View>
      <Text style={styles.reassure}>{t('duplicate.reassure')}</Text>
      <PrimaryButton 
        label={t('duplicate.continue')} 
        onPress={() => navigation.navigate('Home')} 
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  icon: { fontSize: 44, marginBottom: 14 },
  title: { fontSize: 20, fontWeight: '800', color: colors.ink, textAlign: 'center', marginBottom: 10 },
  body: { fontSize: 14, color: colors.inkSoft, textAlign: 'center', marginBottom: 20, lineHeight: 20 },
  card: { backgroundColor: colors.cream, borderRadius: 12, padding: 16, width: '100%', marginBottom: 20, alignItems: 'center' },
  cardLabel: { fontSize: 11, color: colors.inkSoft, textTransform: 'uppercase' },
  cardValue: { fontSize: 16, fontWeight: '700', color: colors.ink, marginTop: 4 },
  reassure: { fontSize: 12.5, color: colors.signalGreen, textAlign: 'center', marginBottom: 24, lineHeight: 18 },
});