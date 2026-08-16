// rider-app/src/screens/fuelMaintenance/FuelEntryScreen.js — Petrol branch (RA-05-A/B)
// ADDED (ADDITIONAL_CRITICAL_MVP0_FEATURES.docx #4): removed the "Quick Odometer Check-In"
// block that was auto-triggered every 5th fuel entry, and the live cost-per-litre hint --
// both features have been dropped from MVP1 entirely per the new requirements doc. Fuel
// entry is now just litres + cost; odometer/service-due tracking is handled independently
// (see sb11_odometer / the Maintenance module), not bundled into this screen anymore.
import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import BackLink from '../../components/BackLink';
import FormField from '../../components/FormField';
import PrimaryButton from '../../components/PrimaryButton';
import colors from '../../theme/colors';
import { enqueue } from '../../offline/syncQueue';

export default function FuelEntryScreenPetrol({ navigation }) {
  const [litres, setLitres] = useState('');
  const [cost, setCost] = useState('');
  const [error, setError] = useState(null);

  async function handleSave() {
    const l = parseFloat(litres), c = parseFloat(cost);
    if (!l || l <= 0) { setError('Enter litres purchased, greater than zero.'); return; }  // EXC-SB09-001
    if (!c || c <= 0) { setError('Enter total cost, greater than zero.'); return; }  // EXC-SB09-002
    const entry = { mode: 'petrol', litres: l, cost: c, submittedAt: Date.now() };
    await enqueue('fuel_entry', entry);  // EXC-SB09-004: saved locally regardless of connectivity
    navigation.navigate('FuelHistory');  // NTF-SB09-001/002 toast fires from the enqueue() result
  }

  return (
    <View style={styles.container}>
      <BackLink onPress={() => navigation.navigate('FuelHub')} />
      <Text style={styles.title}>Record Fuel Cost</Text>
      <Text style={styles.sub}>Litres purchased and total cost</Text>
      <FormField label="Litres Purchased" value={litres} onChangeText={setLitres} keyboardType="decimal-pad" error={error?.includes('litres') ? error : null} />
      <FormField label="Total Cost (KSh)" value={cost} onChangeText={setCost} keyboardType="numeric" error={error?.includes('cost') ? error : null} />
      <PrimaryButton label="Record Fuel Cost →" onPress={handleSave} disabled={!litres || !cost} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, backgroundColor: '#fff' },
  title: { fontSize: 22, fontWeight: '700', color: colors.ink, marginBottom: 4 },
  sub: { fontSize: 13, color: colors.inkSoft, marginBottom: 18, lineHeight: 20 },
});
