// rider-app/src/screens/chama/chamaStyles.js
import { StyleSheet, View } from 'react-native';
import colors from '../../theme/colors';

export const fmt = (n) => 'KSh ' + Math.round(Number(n || 0)).toLocaleString();
export const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.cream },
  title: { fontSize: 22, fontWeight: '800', color: colors.ink, marginTop: 6 },
  sub: { color: colors.inkSoft, marginBottom: 12 },
  card: { backgroundColor: '#fff', borderWidth: 1, borderColor: colors.line, borderRadius: 10, padding: 14, marginBottom: 12 },
  cardTitle: { fontWeight: '800', marginBottom: 8 },
  label: { fontSize: 10.5, fontWeight: '800', color: colors.inkSoft, marginBottom: 6 },
  input: { borderWidth: 1, borderColor: colors.line, borderRadius: 8, padding: 10, marginBottom: 10, backgroundColor: '#fff' },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: colors.line },
  k: { color: colors.inkSoft, flex: 1 }, v: { fontWeight: '700', flexShrink: 1, textAlign: 'right' },
  hint: { fontSize: 11.5, color: colors.inkSoft, marginTop: 2 },
  big: { fontSize: 26, fontWeight: '800', color: colors.bodaOrange, marginVertical: 4 },
  banner: { flexDirection: 'row', gap: 8, backgroundColor: colors.signalAmberBg, borderWidth: 1, borderColor: colors.signalAmber, borderRadius: 10, padding: 10, marginBottom: 12 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  chip: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 99, borderWidth: 1.5, borderColor: colors.line, backgroundColor: '#fff' },
  chipOn: { borderColor: colors.bodaOrange, backgroundColor: '#fff6ee' },
  tile3: { flex: 1, minWidth: '30%', alignItems: 'center', backgroundColor: '#fff', borderWidth: 1, borderColor: colors.line, borderRadius: 12, padding: 14 },
});
export const Chip = ({ on, label, onPress }) => {
  const { TouchableOpacity, Text } = require('react-native');
  return <TouchableOpacity style={[s.chip, on && s.chipOn]} onPress={onPress}><Text style={{ fontWeight: '700' }}>{label}</Text></TouchableOpacity>;
};

// Tab control used by the My Savings and My Loans shells.
// tabs = [['key', 'Label'], ...]; value = the selected key; onChange(key) is called on tap.
export const Seg = ({ tabs, value, onChange }) => (
  <View style={s.chipRow}>{tabs.map(([k, l]) => <Chip key={k} on={value === k} label={l} onPress={() => onChange(k)} />)}</View>
);