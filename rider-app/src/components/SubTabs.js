// rider-app/src/components/SubTabs.js
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import colors from '../theme/colors';

export default function SubTabs({ tabs, active, onChange }) {
  // EXC-SB10-009: caller is responsible for discarding the outgoing sub-tab's draft on change
  return (
    <View style={styles.row}>
      {tabs.map((tab) => (
        <TouchableOpacity key={tab.key} onPress={() => onChange(tab.key)}
          style={[styles.tab, active === tab.key && styles.tabActive]}>
          <Text style={[styles.label, active === tab.key && styles.labelActive]}>{tab.label}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', borderRadius: 12, backgroundColor: '#eee', padding: 4, marginBottom: 16 },
  tab: { flex: 1, paddingVertical: 9, borderRadius: 9, alignItems: 'center' },
  tabActive: { backgroundColor: '#fff', shadowOpacity: 0.15, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  label: { fontSize: 12, fontWeight: '700', color: colors.inkSoft },
  labelActive: { color: colors.ink },
});
