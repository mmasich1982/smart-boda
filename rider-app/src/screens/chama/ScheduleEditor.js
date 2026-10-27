// rider-app/src/screens/chama/ScheduleEditor.js
// Schedule picker for a Merry-Go-Round round. Used twice: kind="contribution" (how often members pay: "Days when members pay")
// and kind="payout" (when a member receives money: "Day when a member receives Money", the default). Produces exactly the shapes the server validates
// (services/mgr_schedule.py):  daily{days} | weekly{day} | twice{days:[2]} | biweekly{start} | monthly{dom, fix} | special{dates}
// Weekdays: 0 = Sunday ... 6 = Saturday.
import React from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
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

/** The prototype's wording for the schedule types (Smart_Boda_Prototype_v44), in the order it shows them. */
export const PAY_TYPES = [['daily', 'Every day'], ['weekly', 'Every week'], ['twice', 'Twice a week'], ['biweekly', 'Every 2 weeks'], ['monthly', 'Every month']];
export const RECEIVE_TYPES = [['weekly', 'Every week'], ['biweekly', 'Every 2 weeks'], ['monthly', 'Every month'], ['daily', 'Every day'], ['twice', 'Twice a week']];

/** Start a fresh schedule of a type, keeping what still makes sense. contrib = "every day" means all seven days (nothing to untick). */
export function switchType(prev, type, contrib) {
  switch (type) {
    case 'daily': return { type, days: contrib ? [0, 1, 2, 3, 4, 5, 6] : [1, 2, 3, 4, 5, 6] };
    case 'weekly': return { type, day: prev?.day ?? 6 };
    case 'twice': return { type, days: [2, 4] };
    case 'biweekly': return { type, start: prev?.start || '' };
    case 'monthly': return { type, dom: prev?.dom || 1, fix: {} };
    default: return { type: 'special', dates: prev?.dates || [] };
  }
}

// Chips in the prototype's look: one scrolling row, a tick inside the chosen one.
const PChip = ({ on, label, onPress }) => (
  <TouchableOpacity onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: !!on }} style={[pc.chip, on && pc.on]}>
    <Text style={[pc.txt, on && pc.txtOn]}>{on ? '✓ ' : ''}{label}</Text>
  </TouchableOpacity>);
const ChipRow = ({ children }) => (
  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={{ gap: 8, paddingVertical: 4, paddingRight: 8 }}>{children}</ScrollView>);
const pc = StyleSheet.create({
  chip: { paddingVertical: 10, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1.5, borderColor: colors.line, backgroundColor: '#fff' },
  on: { backgroundColor: colors.bodaOrange, borderColor: colors.bodaOrange },
  txt: { fontSize: 13, fontWeight: '700', color: colors.ink },
  txtOn: { color: '#fff' },
  hint: { fontSize: 14, color: colors.inkSoft, lineHeight: 21, marginTop: 8 },
  dayTitle: { fontWeight: '800', fontSize: 15, color: colors.ink, marginTop: 12 },
});

const DayChips = ({ value, onToggle }) => (
  <ChipRow>{DAYS.map((d, i) => <PChip key={d} on={value.includes(i)} label={d} onPress={() => onToggle(i)} />)}</ChipRow>);

/**
 * sched: current schedule object, onChange(newSched). flags = monthly_flags from the server (short months for dom >= 29).
 * kind: 'payout' (default) or 'contribution': changes the wording (and "every day" for contributions means all seven days).
 * types: the chips to offer, [[type, label], ...] (a schedule of another type that is already saved is added, so it never vanishes).
 * copy: replaces the hint line of a schedule type, e.g. { daily: 'Members pay every day. Nothing to pick.' }.
 * dayTitle: a heading ("Which day?") above the day chips of the weekly and twice-a-week schedules.
 */
export default function ScheduleEditor({ sched, onChange, flags = [], kind = 'payout', title, types, copy = {}, dayTitle }) {
  const sc = sched || DEFAULT_SCHED;
  const contrib = kind === 'contribution';
  const noun = contrib ? 'contribution' : 'payout';
  const toggleMany = (i, max) => {
    const cur = sc.days || [];
    if (cur.includes(i)) return onChange({ ...sc, days: cur.filter((x) => x !== i) });
    if (max && cur.length >= max) return onChange({ ...sc, days: [...cur.slice(1), i].sort() });
    onChange({ ...sc, days: [...cur, i].sort() });
  };
  return (
    <View>
      {title
        ? <Text style={{ fontWeight: '800', fontSize: 15, color: colors.ink, marginBottom: 8 }}>{title}</Text>
        : <Text style={s.label}>{contrib ? 'HOW OFTEN DO MEMBERS CONTRIBUTE? *' : 'HOW OFTEN IS THE POOL PAID OUT? *'}</Text>}
      <ChipRow>{((types || SCHEDULE_TYPES).some(([k]) => k === sc.type) ? (types || SCHEDULE_TYPES) : [...(types || SCHEDULE_TYPES), ...SCHEDULE_TYPES.filter(([k]) => k === sc.type)])
        .map(([k, l]) => <PChip key={k} on={sc.type === k} label={l} onPress={() => onChange(switchType(sc, k, contrib))} />)}</ChipRow>

      {sc.type === 'daily' && (contrib
        ? <Text style={pc.hint}>{copy.daily || 'Members pay every day. Nothing to pick.'}</Text>
        : (<><View style={{ height: 6 }} /><DayChips value={sc.days || []} onToggle={(i) => toggleMany(i)} /><Text style={pc.hint}>{copy.daily || `Untick the days with no ${noun}, for example Sunday. You can also tap a date on the calendar.`}</Text></>))}
      {sc.type === 'weekly' && (<>{!!dayTitle && <Text style={pc.dayTitle}>{dayTitle}</Text>}<View style={{ height: 6 }} />
        <ChipRow>{DAYS.map((d, i) => <PChip key={d} on={sc.day === i} label={d} onPress={() => onChange({ ...sc, day: i })} />)}</ChipRow>
        <Text style={pc.hint}>{copy.weekly || `Pick the ${noun} day, or tap a date on the calendar.`}</Text></>)}
      {sc.type === 'twice' && (<>{!!dayTitle && <Text style={pc.dayTitle}>{dayTitle}</Text>}<View style={{ height: 6 }} /><DayChips value={sc.days || []} onToggle={(i) => toggleMany(i, 2)} /><Text style={pc.hint}>{copy.twice || 'Pick two days, for example Tue and Thu, or tap dates on the calendar.'}</Text></>)}
      {sc.type === 'biweekly' && (<><Text style={s.label}>{contrib ? 'FIRST CONTRIBUTION DATE *' : 'FIRST PAYOUT DATE *'}</Text>
        <MonthPicker selected={sc.start ? [sc.start] : []} onChange={(d) => onChange({ ...sc, start: d[0] })} />
        <Text style={s.hint}>{isoOk(sc.start || '') ? `${niceDate(sc.start)}, then every 2 weeks.` : (copy.biweekly || 'Then it repeats every 2 weeks.')}</Text></>)}
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
        <Text style={s.hint}>For exceptional cases. Add every {noun} date by hand.</Text>
        {(sc.dates || []).map((d) => (
          <View key={d} style={s.row}><Text style={s.k}>{niceDate(d)}</Text>
            <TouchableOpacity onPress={() => onChange({ ...sc, dates: sc.dates.filter((x) => x !== d) })}><Text style={{ color: colors.signalRed, fontWeight: '700' }}>Remove</Text></TouchableOpacity></View>))}
        <Text style={s.hint}>Tap each {noun} date on the calendar. Tap again to remove it.</Text>
        <MonthPicker multi selected={sc.dates || []} onChange={(d) => onChange({ ...sc, dates: d })} />
</>)}
    </View>);
}