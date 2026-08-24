// rider-app/src/screens/fuelMaintenance/FuelHubScreen.js — the previously-missing SB-09/SB-10 hub
import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import BackLink from '../../components/BackLink';
import PrimaryButton from '../../components/PrimaryButton';
import colors from '../../theme/colors';
import { batteryRangeRemainingKm } from '../../services/batteryRange';

// BR-SB09-005/BR-SB10-001: one hub screen branches Petrol vs Electric — never two separate menu items
export default function FuelHubScreen({ bike, currentOdometer, navigation }) {
  const isElectric = bike.fuelType === 'electric';
  const hasReading = currentOdometer !== null && currentOdometer !== undefined;
  const rangeRemaining = isElectric ? batteryRangeRemainingKm(bike) : null;  // BR-SB10-007

  return (
    <ScrollView style={styles.container}>
      <View style={styles.hero}>
        <BackLink label="← Home" onPress={() => navigation.navigate('Home')} />
        <Text style={styles.heroTitle}>{isElectric ? 'Charge Battery' : 'Fuel Motorcycle'}</Text>
      </View>

      {isElectric && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>🛣️ Odometer  <Text style={styles.cardValue}>{hasReading ? `${currentOdometer.toLocaleString()} km` : '—'}</Text></Text>
          {rangeRemaining !== null && (
            <Text style={styles.hint}>{rangeRemaining <= 5 ? '🔋 ' : ''}About <Text style={{ fontWeight: '800' }}>{Math.max(0, Math.round(rangeRemaining))} km</Text> left before your battery is expected to run out.</Text>
          )}
        </View>
      )}

      <PrimaryButton
        label={isElectric ? '🔋 Enter Battery Charging Cost →' : '⛽ Record Fuel Cost →'}
        onPress={() => navigation.navigate(isElectric ? 'BatteryEntry' : 'FuelEntry')}
      />

      <TouchableOpacity style={styles.historyRow} onPress={() => navigation.navigate('FuelHistory')}>
        <Text style={styles.historyText}>📜 {isElectric ? 'Charge Battery Cost History' : 'Fuel Cost History'}</Text>
        <Text style={styles.historyArrow}>›</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', padding: 24 },
  hero: { backgroundColor: colors.ink, borderRadius: 18, padding: 18, marginHorizontal: -24, marginTop: -24, marginBottom: 18 },
  heroTitle: { fontSize: 24, fontWeight: '800', color: '#fff' },
  card: { backgroundColor: '#fff', borderWidth: 1.5, borderColor: colors.line, borderRadius: 16, padding: 16, marginBottom: 16 },
  cardTitle: { fontWeight: '700', fontSize: 13.5, color: colors.ink },
  cardValue: { fontWeight: '800' },
  hint: { fontSize: 11.5, color: colors.inkSoft, marginTop: 6, lineHeight: 16 },
  historyRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, borderTopWidth: 1, borderColor: colors.line },
  historyText: { flex: 1, fontSize: 14, color: colors.ink, fontWeight: '600' },
  historyArrow: { color: colors.inkSoft, fontSize: 18 },
});
