// rider-app/src/screens/fuelMaintenance/MaintenanceHubScreen.js — renamed "Service Motorcycle", redesigned
import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import BackLink from '../../components/BackLink';
import DueAlertBanner from '../../components/DueAlertBanner';
import PrimaryButton from '../../components/PrimaryButton';
import colors from '../../theme/colors';
import api from '../../api/client';

export default function MaintenanceHubScreen({ riderId, navigation }) {
  const [alerts, setAlerts] = useState([]);
  useEffect(() => {
    api.get('/fuel-maintenance/due-alerts', { params: { rider_id: riderId } }).then(res => setAlerts(res.data.slice(0, 3)));  // EXC-SB12-008: hub shows top 3, all remain visible in history
  }, []);

  return (
    <ScrollView style={styles.container}>
      <View style={styles.hero}>
        <BackLink label="← Home" onPress={() => navigation.navigate('Home')} />
        <Text style={styles.heroTitle}>Service Motorcycle</Text>
      </View>

      {alerts.length ? alerts.map((a) => (
        <DueAlertBanner key={a.service_type} serviceType={a.service_type} icon={a.icon} remainingKm={a.remaining_km}
          onLogNow={() => navigation.navigate('MaintenanceEntry', { prefillType: a.service_type })} />
      )) : (
        <View style={styles.successBanner}><Text style={styles.successText}>✅ No services due soon.</Text></View>
      )}

      <PrimaryButton label="🔧 Record Service Cost →" onPress={() => navigation.navigate('MaintenanceEntry')} />

      <TouchableOpacity style={styles.historyRow} onPress={() => navigation.navigate('MaintenanceHistory')}>
        <Text style={styles.historyText}>📈 Service Cost History</Text>
        <Text style={styles.historyArrow}>›</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, backgroundColor: '#fff' },
  hero: { backgroundColor: colors.ink, borderRadius: 18, padding: 18, marginHorizontal: -24, marginTop: -24, marginBottom: 18 },
  heroTitle: { fontSize: 24, fontWeight: '800', color: '#fff' },
  successBanner: { backgroundColor: colors.signalGreenBg, borderRadius: 14, padding: 13, marginBottom: 14 },
  successText: { color: colors.signalGreen, fontSize: 12.5, fontWeight: '700' },
  historyRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, borderTopWidth: 1, borderColor: colors.line },
  historyText: { flex: 1, fontSize: 14, color: colors.ink, fontWeight: '600' },
  historyArrow: { color: colors.inkSoft, fontSize: 18 },
});
