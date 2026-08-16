// rider-app/src/screens/settings/ChooseFrequencyScreen.js
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import BackLink from '../../components/BackLink';
import PrimaryButton from '../../components/PrimaryButton';
import colors from '../../theme/colors';

const FREQUENCIES = [
  { key: 'daily', label: 'Daily', emoji: '☀️' }, { key: 'weekly', label: 'Weekly', emoji: '📅' },
  { key: 'biweekly', label: 'Biweekly', emoji: '🗓️' }, { key: 'monthly', label: 'Monthly', emoji: '🌙' },
];

export default function ChooseFrequencyScreen({ route, dailyPrice, amountFor, navigation }) {
  const [chosen, setChosen] = useState(route.params?.frequency ?? null);

  return (
    <View style={styles.container}>
      <BackLink label="← Back" onPress={() => navigation.navigate('Subscription')} />
      <Text style={styles.title}>How Would You Like to Pay? 💳</Text>
      <Text style={styles.sub}>Pick what works best for you. Pay less often and save a little too.</Text>
      <View style={styles.tileGrid}>
        {FREQUENCIES.map((f) => {
          const calc = amountFor(f.key);
          return (
            <TouchableOpacity key={f.key} onPress={() => setChosen(f.key)}
              style={[styles.tile, chosen === f.key && styles.tileSelected]}>
              {calc.save > 0 && <View style={styles.saveBadge}><Text style={styles.saveBadgeText}>SAVE {calc.save}</Text></View>}
              <Text style={styles.tileEmoji}>{f.emoji}</Text>
              <Text style={styles.tileLabel}>{f.label}</Text>
              <Text style={styles.tileAmount}>KSh {calc.amount.toLocaleString()}</Text>
              <Text style={styles.tileSub}>{calc.days === 1 ? 'per day' : `every ${calc.days} days`}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      <Text style={styles.hint}>Daily rate: KSh {dailyPrice}. Weekly, biweekly, and monthly plans work out cheaper per day.</Text>
      <PrimaryButton label="Continue →" onPress={() => navigation.navigate('ConfirmSubscription', { frequency: chosen })} disabled={!chosen} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, backgroundColor: '#fff' },
  title: { fontSize: 20, fontWeight: '700', color: colors.ink, marginBottom: 4 },
  sub: { fontSize: 13, color: colors.inkSoft, marginBottom: 16 },
  tileGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 10 },
  tile: { width: '47%', borderWidth: 1.5, borderColor: colors.line, borderRadius: 14, padding: 14, alignItems: 'center' },
  tileSelected: { borderColor: colors.bodaOrange, backgroundColor: '#fff6ee' },
  saveBadge: { position: 'absolute', top: 8, right: 8, backgroundColor: colors.signalGreen, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  saveBadgeText: { color: '#fff', fontSize: 9, fontWeight: '800' },
  tileEmoji: { fontSize: 20, marginBottom: 4 },
  tileLabel: { fontSize: 12.5, fontWeight: '700', color: colors.ink },
  tileAmount: { fontSize: 14, fontWeight: '800', color: colors.ink, marginTop: 2 },
  tileSub: { fontSize: 10.5, color: colors.inkSoft },
  hint: { fontSize: 11.5, color: colors.inkSoft, marginVertical: 14 },
});
