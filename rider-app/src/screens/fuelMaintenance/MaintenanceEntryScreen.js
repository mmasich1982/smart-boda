// rider-app/src/screens/fuelMaintenance/MaintenanceEntryScreen.js — redesigned, tile-grid Service Type
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import BackLink from '../../components/BackLink';
import FormField from '../../components/FormField';
import LiveCalculationHint from '../../components/LiveCalculationHint';
import PrimaryButton from '../../components/PrimaryButton';
import colors from '../../theme/colors';
import { enqueue } from '../../offline/syncQueue';

const DATED_TYPES = ['oil_change', 'general_service'];  // BR-SB12-002

export default function MaintenanceEntryScreen({ route, serviceTypes, oilTypes, currentOdometer, defaultOilType, navigation }) {
  const [serviceType, setServiceType] = useState(route.params?.prefillType ?? '');  // BR-SB12-010: pre-selected when opened via "Log Now"
  const [cost, setCost] = useState('');
  const [odometer, setOdometer] = useState(String(currentOdometer ?? ''));
  const [oilType, setOilType] = useState(defaultOilType ?? '');  // BR-SB12-006: pre-fills from Bike Profile, still editable
  const [error, setError] = useState(null);

  const isDated = DATED_TYPES.includes(serviceType);
  const selectedOil = oilTypes.find(o => o.code === oilType);
  const nextDueVisible = isDated && odometer && selectedOil;
  const nextDue = nextDueVisible ? parseInt(odometer, 10) + selectedOil.interval_km : null;  // BR-SB12-004/005, live

  async function handleSave() {
    if (!cost || parseFloat(cost) <= 0) { setError('Enter the service cost paid.'); return; }  // EXC-SB12-001
    if (isDated && !odometer) { setError('Enter the odometer reading at time of service.'); return; }  // EXC-SB12-002
    if (isDated && !oilType) { setError('Select the oil type used.'); return; }  // EXC-SB12-003
    await enqueue('maintenance_entry', {
      serviceType, cost: parseFloat(cost),
      odometer: isDated ? parseInt(odometer, 10) : null,
      oilType: isDated ? oilType : null,
      submittedAt: Date.now(),
    });
    navigation.navigate('MaintenanceHistory');  // NTF-SB12-001/002
  }

  return (
    <View style={styles.container}>
      <BackLink onPress={() => navigation.navigate('MaintenanceHub')} />
      <Text style={styles.title}>Record Service Cost</Text>
      <Text style={styles.sub}>Service Entry Screen</Text>

      <Text style={styles.label}>Service Type</Text>
      <View style={styles.tileGrid}>
        {serviceTypes.map((s) => (
          <TouchableOpacity key={s.code} onPress={() => setServiceType(s.code)}
            style={[styles.tile, serviceType === s.code && styles.tileSelected]}>
            <Text style={styles.tileEmoji}>{s.icon}</Text>
            <Text style={styles.tileLabel}>{s.display_name}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {isDated && (
        <>
          <FormField label="Oil Type Used" type="select" value={oilType} onChangeText={setOilType}
            options={oilTypes.map(o => ({ label: `${o.display_name} — every ${o.interval_km.toLocaleString()} km`, value: o.code }))} />
          <FormField label="Odometer Reading Now" value={odometer} onChangeText={setOdometer} keyboardType="numeric" />
          <LiveCalculationHint visible={nextDueVisible} label="Next service due at" value={`${nextDue?.toLocaleString()} km`} />
        </>
      )}
      <FormField label="Service Cost (KSh)" value={cost} onChangeText={setCost} keyboardType="numeric" />
      {error && <Text style={styles.error}>⚠️ {error}</Text>}
      <PrimaryButton label="Record Service Cost →" onPress={handleSave} disabled={!serviceType || !cost} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, backgroundColor: '#fff' },
  title: { fontSize: 22, fontWeight: '700', color: colors.ink, marginBottom: 4 },
  sub: { fontSize: 13, color: colors.inkSoft, marginBottom: 18 },
  label: { fontSize: 12, fontWeight: '700', color: colors.inkSoft, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },
  tileGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 8 },
  tile: { width: '47%', borderWidth: 1.5, borderColor: colors.line, borderRadius: 14, padding: 12, alignItems: 'center' },
  tileSelected: { borderColor: colors.bodaOrange, backgroundColor: '#fff6ee' },
  tileEmoji: { fontSize: 20, marginBottom: 4 },
  tileLabel: { fontSize: 12, fontWeight: '600', color: colors.ink, textAlign: 'center' },
  error: { color: colors.signalRed, fontSize: 12.5, marginBottom: 10, fontWeight: '700' },
});
