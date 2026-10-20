// rider-app/src/screens/chama/ScheduleEditor.js
// Payout schedule picker for a Merry-Go-Round circle. Produces exactly the shapes the server validates
// (services/mgr_schedule.py):  daily{days} | weekly{day} | twice{days:[2]} | biweekly{start} | monthly{dom, fix} | special{dates}
// Weekdays: 0 = Sunday ... 6 = Saturday.
import React from 'react';
import { View, Text, TextInput, TouchableOpacity } from 'react-native';
import { s, Chip } from './chamaStyles';
import { niceDate } from './common';
import MonthPicker from './MonthPicker';
import colors from '../../theme/colors';

export const SCHEDULE_TYPES = [
  ['daily', 'Every day'], ['weekly', 'Once a week'], ['twice', 'Twice a week'],
  ['biweekly', 'Every 2 weeks'], ['monthly', 'Once a month'], ['special', 'Pick dates']];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const isoOk = (v) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !isNaN(new Date(v));

export const DEFAULT_SCHED = { type: 'weekly', day: 6 };

/** Start a fresh schedule of a type, keeping what still makes sense. */
export function switchType(prev, type) {
  switch (type) {
    case 'daily': return { type, days: [1, 2, 3, 4, 5, 6] };
    case 'weekly': return { type, day: prev?.day ?? 6 };
    case 'twice': return { type, days: [2, 4] };
    case 'biweekly': return { type, start: prev?.start || '' };
    case 'monthly': return { type, dom: prev?.dom || 1, fix: {} };
    default: return { type: 'special', dates: prev?.dates || [] };
  }
}

const DayChips = ({ value, onToggle }) => (
  <View style={s.chipRow}>{DAYS.map((d, i) => <Chip key={d} on={value.includes(i)} label={d} onPress={() => onToggle(i)} />)}</View>);

/**
 * sched: current schedule object, onChange(newSched). flags = monthly_flags from the server (short months for dom >= 29).
 */
export default function ScheduleEditor({ sched, onChange, flags = [] }) {
  const sc = sched || DEFAULT_SCHED;
  const toggleMany = (i, max) => {
    const cur = sc.days || [];
    if (cur.includes(i)) return onChange({ ...sc, days: cur.filter((x) => x !== i) });
    if (max && cur.length >= max) return onChange({ ...sc, days: [...cur.slice(1), i].sort() });
    onChange({ ...sc, days: [...cur, i].sort() });
  };
  return (
    <View>
      <Text style={s.label}>HOW OFTEN IS THE POOL PAID OUT? *</Text>
      <View style={s.chipRow}>{SCHEDULE_TYPES.map(([k, l]) => <Chip key={k} on={sc.type === k} label={l} onPress={() => onChange(switchType(sc, k))} />)}</View>

      {sc.type === 'daily' && (<><Text style={s.hint}>Untick the days with no payout.</Text><DayChips value={sc.days || []} onToggle={(i) => toggleMany(i)} /></>)}
      {sc.type === 'weekly' && (<><Text style={s.hint}>Which day?</Text>
        <View style={s.chipRow}>{DAYS.map((d, i) => <Chip key={d} on={sc.day === i} label={d} onPress={() => onChange({ ...sc, day: i })} />)}</View></>)}
      {sc.type === 'twice' && (<><Text style={s.hint}>Pick two days, for example Tue and Thu.</Text><DayChips value={sc.days || []} onToggle={(i) => toggleMany(i, 2)} /></>)}
      {sc.type === 'biweekly' && (<><Text style={s.label}>FIRST PAYOUT DATE *</Text>
        <MonthPicker selected={sc.start ? [sc.start] : []} onChange={(d) => onChange({ ...sc, start: d[0] })} />
        <Text style={s.hint}>{isoOk(sc.start || '') ? `${niceDate(sc.start)}, then every 2 weeks.` : 'Then it repeats every 2 weeks.'}</Text></>)}
      {sc.type === 'monthly' && (<><Text style={s.label}>DATE EACH MONTH (1 TO 31) *</Text>
        <TextInput style={s.input} keyboardType="number-pad" value={String(sc.dom || '')} maxLength={2}
          onChangeText={(v) => onChange({ ...sc, dom: parseInt(v, 10) || 0, fix: {} })} />
        {flags.length > 0 && (<View style={s.banner}><Text>ℹ️</Text><View style={{ flex: 1 }}>
          <Text style={{ fontWeight: '700' }}>Some months are shorter than the {sc.dom}th.</Text>
          <Text style={s.hint}>Pick the day to use in those months. If you leave it, the last day of the month is used.</Text>
          {flags.map((f) => { const [y, m] = f.key.split('-').map(Number); return (
            <View key={f.key} style={[s.row, { alignItems: 'center' }]}>
              <Text style={s.k}>{MONTHS[m - 1]} {y} ({f.days_in_month} days)</Text>
              <View style={s.chipRow}>{[f.days_in_month - 2, f.days_in_month - 1, f.days_in_month].map((dd) => {
                const cur = sc.fix?.[f.key] || f.fix || f.days_in_month;
                return <Chip key={dd} on={cur === dd} label={String(dd)} onPress={() => onChange({ ...sc, fix: { ...(sc.fix || {}), [f.key]: dd } })} />;
              })}</View>
            </View>); })}
        </View></View>)}</>)}
      {sc.type === 'special' && (<>
        <Text style={s.hint}>For exceptional cases. Add every payout date by hand.</Text>
        {(sc.dates || []).map((d) => (
          <View key={d} style={s.row}><Text style={s.k}>{niceDate(d)}</Text>
            <TouchableOpacity onPress={() => onChange({ ...sc, dates: sc.dates.filter((x) => x !== d) })}><Text style={{ color: colors.signalRed, fontWeight: '700' }}>Remove</Text></TouchableOpacity></View>))}
        <Text style={s.hint}>Tap each payout date on the calendar. Tap again to remove it.</Text>
        <MonthPicker multi selected={sc.dates || []} onChange={(d) => onChange({ ...sc, dates: d })} />
</>)}
    </View>);
}
