// rider-app/src/screens/business/BizDateField.js
// SMART BIZNA selectable calendar date (request 3): the same field and calendar as the Smart Boda trip Lipa Later "Payment Due Date"
// (a tap opens a month calendar with ← Prev / Next →, days up to and including today are greyed out, Done closes it), kept as one component so the
// sale, the purchase and every other Lipa Later date in Smart Bizna look and behave the same. The value is "YYYY-MM-DD" (what the records already store).
// "Today" is the East Africa Time date, the day the person sees (the Smart Boda field uses the UTC date, which is a day behind between midnight and 3 am EAT).
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Modal, StyleSheet } from 'react-native';
import { C, s } from './BizUI';
import { todayEat } from '../../utils/businessFormat';

const iso = (y, m, d) => `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
const display = (v) => { if (!v) return ''; const [y, m, d] = v.split('-'); return `${m}/${d}/${y.slice(-2)}`; };

export default function BizDateField({ label = 'Payment Due Date', value, onChange, hint = 'Must be after today. This is not income until the customer pays.', error }) {
  const today = todayEat();
  const start = value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : today;
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState({ y: +start.slice(0, 4), m: +start.slice(5, 7) - 1 });
  const first = new Date(cursor.y, cursor.m, 1).getDay();
  const days = new Date(cursor.y, cursor.m + 1, 0).getDate();
  const cells = [...Array(first).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
  const move = (n) => { const d = new Date(cursor.y, cursor.m + n, 1); setCursor({ y: d.getFullYear(), m: d.getMonth() }); };
  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={s.label}>{label} <Text style={{ color: C.red }}>*</Text></Text>
      <TouchableOpacity onPress={() => setOpen(true)} accessibilityRole="button" accessibilityLabel={`${label}. ${value ? display(value) : 'Not chosen'}. Open calendar`}
        style={[st.input, error && { borderColor: C.red }]}>
        <Text style={{ fontSize: 15, color: value ? C.ink : '#9aa0ab' }}>{value ? display(value) : 'mm/dd/yy'}</Text>
        <Text style={{ fontSize: 18 }}>📅</Text>
      </TouchableOpacity>
      {error ? <Text style={s.err}>{error}</Text> : hint ? <Text style={s.hint}>{hint}</Text> : null}
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <View style={st.overlay}>
          <View style={st.modal}>
            <View style={st.head}>
              <TouchableOpacity onPress={() => move(-1)}><Text style={st.nav}>← Prev</Text></TouchableOpacity>
              <Text style={st.title}>{new Date(cursor.y, cursor.m, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</Text>
              <TouchableOpacity onPress={() => move(1)}><Text style={st.nav}>Next →</Text></TouchableOpacity>
            </View>
            <View style={st.week}>{['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((d) => <Text key={d} style={st.wd}>{d}</Text>)}</View>
            <View style={st.grid}>
              {cells.map((d, i) => {
                if (d === null) return <View key={`e${i}`} style={st.day} />;
                const cell = iso(cursor.y, cursor.m, d);
                const off = cell <= today, on = cell === value;
                return (
                  <TouchableOpacity key={d} disabled={off} style={[st.day, on && st.daySel]} accessibilityLabel={cell} onPress={() => { onChange(cell); setOpen(false); }}>
                    <Text style={[{ color: C.ink, fontSize: 14 }, on && { color: C.white, fontWeight: '800' }, off && { color: '#c4c7ce' }]}>{d}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <TouchableOpacity style={st.done} onPress={() => setOpen(false)}><Text style={{ color: C.white, fontWeight: '800' }}>Done</Text></TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}
const st = StyleSheet.create({
  input: { backgroundColor: C.white, borderWidth: 1, borderColor: C.line, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 11, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', padding: 16 },
  modal: { backgroundColor: C.white, borderRadius: 16, padding: 16, width: '100%', maxWidth: 360 },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  nav: { color: C.orangeDark, fontWeight: '700', fontSize: 13 }, title: { fontWeight: '800', color: C.ink, fontSize: 15 },
  week: { flexDirection: 'row', marginBottom: 6 }, wd: { width: '14.28%', textAlign: 'center', fontSize: 11, fontWeight: '600', color: C.soft },
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 12 },
  day: { width: '14.28%', aspectRatio: 1, alignItems: 'center', justifyContent: 'center', marginBottom: 4, borderRadius: 999 }, daySel: { backgroundColor: C.orange },
  done: { backgroundColor: C.asphalt, borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
});
