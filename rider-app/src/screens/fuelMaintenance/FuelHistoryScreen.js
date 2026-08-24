// rider-app/src/screens/fuelMaintenance/FuelHistoryScreen.js
// SCAFFOLD -- named in Module C's folder tree but no code block was given in the
// developer guide. Built to match the pattern used by TransactionListScreen.js
// (Module E) -- paginated list + type filter chips. Wire up the real fuel-entry
// history endpoint once available.
import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, StyleSheet } from 'react-native';
import BackLink from '../../components/BackLink';
import PaginationControls from '../../components/PaginationControls';
import TypeFilterChips from '../../components/TypeFilterChips';
import colors from '../../theme/colors';

export default function FuelHistoryScreen({ navigation }) {
  const [entries, setEntries] = useState([]);
  const [page, setPage] = useState(1);

  useEffect(() => {
    // TODO: fetch from GET /fuel-maintenance/fuel-entry/history?page=...
  }, [page]);

  return (
    <View style={styles.container}>
      <BackLink onPress={() => navigation.goBack()} />
      <Text style={styles.title}>Fuel History</Text>
      <TypeFilterChips types={['Petrol', 'Swap', 'Charging']} onSelect={() => {}} />
      <FlatList
        data={entries}
        keyExtractor={(item) => String(item.id)}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <Text>{item.date}</Text>
            <Text>{item.amount}</Text>
          </View>
        )}
      />
      <PaginationControls page={page} totalPages={1} total={entries.length}
        onPrev={() => setPage((p) => Math.max(1, p - 1))}
        onNext={() => setPage((p) => p + 1)} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: colors.cream },
  title: { fontSize: 20, fontWeight: '700', marginVertical: 12 },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10 },
});
