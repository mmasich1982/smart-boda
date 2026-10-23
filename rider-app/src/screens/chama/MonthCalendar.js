// rider-app/src/screens/chama/MonthCalendar.js
// A month grid that MARKS the dates of a schedule (orange circles) and rings today, like the prototype's schedule screen.
// The marked dates come from the server (POST /chama/mgr/preview), so the app never re-works the schedule rules itself.
// Tapping a date calls onPick(isoDate); the schedule screen decides what that means for the chosen schedule type.
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import colors from '../../theme/colors';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const iso = (y, m, d) => `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

export default function MonthCalendar({ marked = [], onPick, legend }) {
  const today = new Date();
  const [ym, setYm] = useState({ y: today.getFullYear(), m: today.getMonth() });
  const set = new Set(marked);
  const lead = new Date(ym.y, ym.m, 1).getDay(), days = new Date(ym.y, ym.m + 1, 0).getDate();
  const todayIso = iso(today.getFullYear(), today.getMonth(), today.getDate());
  const cells = [...Array(lead).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
  while (cells.length % 7) cells.push(null);
  const rows = []; for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));
  const move = (n) => { const d = new Date(ym.y, ym.m + n, 1); setYm({ y: d.getFullYear(), m: d.getMonth() }); };
  return (
    <View testID="month-calendar">
      <View style={c.head}>
        <TouchableOpacity onPress={() => move(-1)} accessibilityLabel="Previous month" style={c.nav}><Text style={c.navTxt}>‹</Text></TouchableOpacity>
        <Text style={c.title}>{MONTHS[ym.m]} {ym.y}</Text>
        <TouchableOpacity onPress={() => move(1)} accessibilityLabel="Next month" style={c.nav}><Text style={c.navTxt}>›</Text></TouchableOpacity>
      </View>
      <View style={c.row}>{WEEK.map((w) => <Text key={w} style={c.week}>{w}</Text>)}</View>
      {rows.map((r, ri) => (
        <View key={ri} style={c.row}>
          {r.map((d, ci) => {
            if (!d) return <View key={ci} style={c.cell} />;
            const v = iso(ym.y, ym.m, d), on = set.has(v), isToday = v === todayIso;
            return (
              <TouchableOpacity key={ci} style={c.cell} disabled={!onPick} onPress={() => onPick && onPick(v)} accessibilityLabel={`${d} ${MONTHS[ym.m]}`}>
                <View style={[c.dot, on && c.dotOn, isToday && c.dotToday]}><Text style={[c.num, on && { color: '#fff', fontWeight: '800' }]}>{d}</Text></View>
              </TouchableOpacity>);
          })}
        </View>))}
      {!!legend && <View style={c.legend}><View style={c.legDot} /><Text style={c.legTxt}>{legend}</Text></View>}
    </View>);
}

const c = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  nav: { borderWidth: 1, borderColor: colors.bodaOrange, borderRadius: 10, width: 52, height: 40, alignItems: 'center', justifyContent: 'center' },
  navTxt: { color: colors.bodaOrange, fontSize: 20, fontWeight: '700', lineHeight: 22 },
  title: { fontWeight: '800', fontSize: 18, color: colors.ink },
  row: { flexDirection: 'row' },
  week: { flex: 1, textAlign: 'center', fontSize: 12.5, color: colors.inkSoft, paddingVertical: 6 },
  cell: { flex: 1, alignItems: 'center', paddingVertical: 3 },
  dot: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'transparent' },
  dotOn: { backgroundColor: colors.bodaOrange },
  dotToday: { borderColor: '#111' },
  num: { fontSize: 15, color: colors.ink },
  legend: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  legDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.bodaOrange },
  legTxt: { fontSize: 13, color: colors.inkSoft },
});