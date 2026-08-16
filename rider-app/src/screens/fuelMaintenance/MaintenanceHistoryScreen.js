// rider-app/src/screens/fuelMaintenance/MaintenanceHistoryScreen.js
// SCAFFOLD -- named in Module C's folder tree but no code block was given in the
// developer guide. Same pattern as FuelHistoryScreen.js -- wire up the real
// maintenance-entry history endpoint once available.
import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, StyleSheet } from 'react-native';
import BackLink from '../../components/BackLink';
import PaginationControls from '../../components/PaginationControls';
import colors from '../../theme/colors';

export default function MaintenanceHistoryScreen({ navigation }) {
  const [entries, setEntries] = useState([]);
  const [page, setPage] = useState(1);

  useEffect(() => {
    // TODO: fetch from GET /fuel-maintenance/maintenance-entry/history?page=...
  }, [page]);

  return (
    <View style={styles.container}>
      <BackLink onPress={() => navigation.goBack()} />
      <Text style={styles.title}>Maintenance History</Text>
      <FlatList
        data={entries}
        keyExtractor={(item) => String(item.id)}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <Text>{item.date}</Text>
            <Text>{item.service_type}</Text>
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
