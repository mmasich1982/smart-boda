// rider-app/src/screens/fuelMaintenance/BatteryEntryScreen.js — redesigned, odometer logic embedded
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import BackLink from '../../components/BackLink';
import SubTabs from '../../components/SubTabs';
import FormField from '../../components/FormField';
import PrimaryButton from '../../components/PrimaryButton';
import colors from '../../theme/colors';
import { enqueue } from '../../offline/syncQueue';

export default function BatteryEntryScreen({ swapPartners, currentOdometer, navigation }) {
  const [tab, setTab] = useState('swap');
  // EXC-SB10-009: each sub-tab owns its own draft; switching discards the one being left
  const [network, setNetwork] = useState('');
  const [cost, setCost] = useState('');
  const [odometer, setOdometer] = useState(String(currentOdometer ?? ''));
  const [resetOverride, setResetOverride] = useState(false);  // BR-SB11-012, merged in from the deleted OdometerEntryScreen.js
  const [error, setError] = useState(null);

  function handleTabChange(next) {
    setTab(next); setNetwork(''); setCost(''); setError(null);  // EXC-SB10-009
  }
  function handleNetworkChange(name) {
    setNetwork(name);
    const partner = swapPartners.find(p => p.name === name);
    if (partner?.standard_fee != null) setCost(String(partner.standard_fee));  // BR-SB10-002, still editable next line
  }

  async function handleSave() {
    if (tab === 'swap' && !network) { setError('Select a swap network/partner.'); return; }  // EXC-SB10-001
    if (!cost || parseFloat(cost) <= 0) { setError('Enter the swap/charging cost paid.'); return; }  // EXC-SB10-002
    const odo = parseInt(odometer, 10);
    if (!odo || odo <= 0) { setError('Enter the current odometer reading.'); return; }  // EXC-SB10-003
    if (odo <= currentOdometer && !resetOverride) {
      setError(`New reading must be higher than ${currentOdometer} km, unless the odometer was reset.`);  // BR-SB11-005, EXC-SB11-001
      return;
    }
    await enqueue('fuel_entry', { mode: tab, network: tab === 'swap' ? network : null, cost: parseFloat(cost), odometer: odo, submittedAt: Date.now() });
    await enqueue('odometer_reading', { valueKm: odo, isResetOverride: resetOverride, submittedAt: Date.now() });  // BR-SB11-006/010, saved every time now
    navigation.navigate('FuelHistory');
  }

  return (
    <View style={styles.container}>
      <BackLink onPress={() => navigation.navigate('FuelHub')} />
      <Text style={styles.title}>Enter Battery Charging Cost</Text>
      <SubTabs tabs={[{ key: 'swap', label: '🔋 Battery Swap' }, { key: 'charging', label: '🔌 Charging' }]} active={tab} onChange={handleTabChange} />
      {tab === 'swap' && (
        <FormField label="Swap Network / Partner" type="select" value={network} onChangeText={handleNetworkChange}
          options={swapPartners.map(p => ({ label: p.standard_fee ? `${p.name} (KSh ${p.standard_fee})` : p.name, value: p.name }))} />
      )}
      <FormField label={tab === 'swap' ? 'Swap Cost' : 'Charging Cost'} value={cost} onChangeText={setCost} keyboardType="numeric" />
      <FormField label="Current Odometer Reading" value={odometer} onChangeText={setOdometer} keyboardType="numeric"
        error={error?.includes('odometer') || error?.includes('reset') ? error : null} />
      {error?.includes('reset') && (
        <TouchableOpacity onPress={() => setResetOverride(true)} style={styles.checkboxRow}>
          <Text style={styles.checkboxLabel}>☐ This bike's odometer was replaced or reset</Text>
        </TouchableOpacity>
      )}
      <Text style={styles.hint}>We'll alert you 5 km before your battery is expected to run out.</Text>
      {error && !error.includes('reset') && !error.includes('odometer') && <Text style={styles.error}>⚠️ {error}</Text>}
      <PrimaryButton label="Enter Battery Charging Cost →" onPress={handleSave} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, backgroundColor: '#fff' },
  title: { fontSize: 22, fontWeight: '700', color: colors.ink, marginBottom: 16 },
  checkboxRow: { marginBottom: 12, marginTop: -6 },
  checkboxLabel: { fontSize: 12.5, color: colors.ink },
  hint: { fontSize: 11.5, color: colors.inkSoft, marginBottom: 14, lineHeight: 16 },
  error: { color: colors.signalRed, fontSize: 12.5, marginBottom: 10, fontWeight: '700' },
});
