// rider-app/src/screens/chama/MonthPicker.js
// A small month calendar for picking payout dates (every-2-weeks start date, or special dates). No native date picker needed.
import React, { useState } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import colors from '../../theme/colors';

const iso = (y, m, d) => `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** selected: array of ISO dates. multi: toggle many, otherwise a single choice. */
export default function MonthPicker({ selected = [], onChange, multi = false, minDate }) {
  const today = new Date();
  const first = selected[0] ? new Date(`${selected[0]}T00:00:00`) : today;
  const [ym, setYm] = useState({ y: first.getFullYear(), m: first.getMonth() });
  const lead = new Date(ym.y, ym.m, 1).getDay(), days = new Date(ym.y, ym.m + 1, 0).getDate();
  const min = minDate || iso(today.getFullYear(), today.getMonth(), today.getDate());
  const move = (n) => { const d = new Date(ym.y, ym.m + n, 1); setYm({ y: d.getFullYear(), m: d.getMonth() }); };
  const cells = [...Array(lead).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
  const toggle = (d) => {
    const v = iso(ym.y, ym.m, d);
    if (v < min) return;
    onChange(multi ? (selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v].sort()) : [v]);
  };
  return (
    <View testID="month-picker">
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <TouchableOpacity onPress={() => move(-1)} accessibilityLabel="Previous month"><Text style={{ fontSize: 22, paddingHorizontal: 10 }}>‹</Text></TouchableOpacity>
        <Text style={{ fontWeight: '800' }}>{MONTHS[ym.m]} {ym.y}</Text>
        <TouchableOpacity onPress={() => move(1)} accessibilityLabel="Next month"><Text style={{ fontSize: 22, paddingHorizontal: 10 }}>›</Text></TouchableOpacity>
      </View>
      <View style={{ flexDirection: 'row' }}>{['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => <Text key={i} style={{ flex: 1, textAlign: 'center', fontSize: 11, color: colors.inkSoft }}>{d}</Text>)}</View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        {cells.map((d, i) => {
          const v = d && iso(ym.y, ym.m, d), on = d && selected.includes(v), off = d && v < min;
          return (
            <View key={i} style={{ width: `${100 / 7}%`, padding: 2 }}>
              {d ? <TouchableOpacity onPress={() => toggle(d)} disabled={off} accessibilityLabel={v}
                style={{ paddingVertical: 8, borderRadius: 8, alignItems: 'center', backgroundColor: on ? colors.bodaOrange : 'transparent', opacity: off ? 0.3 : 1 }}>
                <Text style={{ fontWeight: on ? '800' : '500', color: on ? '#fff' : colors.ink }}>{d}</Text></TouchableOpacity> : <View style={{ height: 34 }} />}
            </View>);
        })}
      </View>
    </View>);
}
