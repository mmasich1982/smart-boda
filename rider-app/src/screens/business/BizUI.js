// rider-app/src/screens/business/BizUI.js
// SMART BIZNA shared look (prototype v46 colours): small building blocks every Smart Bizna screen uses.
import React from 'react';
import { View, Text, TouchableOpacity, TextInput, ScrollView, StyleSheet, Platform } from 'react-native';

export const C = { asphalt: '#14161a', asphalt2: '#1d2026', cream: '#f6f4ef', ink: '#1a1c20', soft: '#5b606c', line: '#e7e4db', orange: '#ff7a1a', orangeDark: '#e5650a',
  yellow: '#ffc93c', green: '#1e9e6f', greenBg: '#e6f5ef', red: '#e0453f', redBg: '#fdecea', amber: '#c98a12', amberBg: '#fdf3df', white: '#ffffff' };
const TONE = { green: [C.green, C.greenBg], red: [C.red, C.redBg], amber: [C.amber, C.amberBg], soft: [C.soft, '#efede6'], orange: [C.orangeDark, '#fff1e3'] };

export function Screen({ children, scroll = true, footer }) {
  const body = scroll ? <ScrollView contentContainerStyle={s.pad} keyboardShouldPersistTaps="handled">{children}</ScrollView> : <View style={s.pad}>{children}</View>;
  return <View style={s.screen}>{body}{footer}</View>;
}
export const BackLink = ({ label = '← Home', onPress }) => <TouchableOpacity onPress={onPress} accessibilityRole="button"><Text style={s.back}>{label}</Text></TouchableOpacity>;
export const Title = ({ children }) => <Text style={s.title} accessibilityRole="header">{children}</Text>;
export const Sub = ({ children }) => <Text style={s.sub}>{children}</Text>;
export const Hint = ({ children, style }) => <Text style={[s.hint, style]}>{children}</Text>;
export const Card = ({ children, style, onPress }) => (onPress ? <TouchableOpacity onPress={onPress} style={[s.card, style]}>{children}</TouchableOpacity> : <View style={[s.card, style]}>{children}</View>);
export const Row = ({ k, v, bold, color }) => (<View style={s.kv}><Text style={s.k}>{k}</Text><Text style={[s.v, bold && { fontWeight: '800' }, color && { color }]}>{v}</Text></View>);
export const Section = ({ children }) => <Text style={s.section}>{children}</Text>;

export function Btn({ label, onPress, kind = 'primary', disabled, small, style }) {
  const bg = kind === 'danger' ? C.red : kind === 'ghost' ? 'transparent' : kind === 'dark' ? C.asphalt : C.orange;
  const col = kind === 'ghost' ? C.ink : C.white;
  return (
    <TouchableOpacity onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityState={{ disabled: !!disabled }}
      style={[s.btn, small && s.btnSmall, { backgroundColor: bg, opacity: disabled ? 0.45 : 1 }, kind === 'ghost' && { borderWidth: 1, borderColor: C.line }, style]}>
      <Text style={[s.btnText, { color: col }, small && { fontSize: 13 }]}>{label}</Text>
    </TouchableOpacity>
  );
}
export const Badge = ({ text, tone = 'soft' }) => (<View style={[s.badge, { backgroundColor: TONE[tone][1] }]}><Text style={[s.badgeText, { color: TONE[tone][0] }]}>{text}</Text></View>);

export function Field({ label, error, hint, ...input }) {
  return (
    <View style={{ marginBottom: 12 }}>
      {label ? <Text style={s.label}>{label}</Text> : null}
      <TextInput placeholderTextColor="#9aa0ab" style={[s.input, error && { borderColor: C.red }]} {...input} />
      {error ? <Text style={s.err}>{error}</Text> : hint ? <Text style={s.hint}>{hint}</Text> : null}
    </View>
  );
}

/** Period / range tabs (This Month, Last Month, 6 Months ...). */
export function Tabs({ tabs, value, onChange }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10 }}>
      {tabs.map((t) => (
        <TouchableOpacity key={t.key} onPress={() => onChange(t.key)} accessibilityRole="tab" accessibilityState={{ selected: value === t.key }}
          style={[s.tab, value === t.key && s.tabOn]}><Text style={[s.tabText, value === t.key && { color: C.white }]}>{t.label}</Text></TouchableOpacity>
      ))}
    </ScrollView>
  );
}
export const Chips = Tabs;

/** The Net Profit hero card (red when negative) with Income, Purchases and Expenses beneath. */
export function ProfitHero({ title, totals, kes }) {
  const neg = totals.net_profit < 0;
  return (
    <View style={[s.hero, neg && { backgroundColor: '#7a1d19' }]}>
      <Text style={s.heroLabel}>{title}</Text>
      <Text style={s.heroAmt}>{kes(totals.net_profit)}</Text>
      <View style={s.heroRow}>
        <Text style={s.heroSmall}>Income {kes(totals.income)}</Text><Text style={s.heroSmall}>Purchases {kes(totals.purchases)}</Text><Text style={s.heroSmall}>Expenses {kes(totals.expenses)}</Text>
      </View>
      <Text style={s.heroFormula}>Net Profit = Sales/Services Income − (Purchases + Expenses)</Text>
    </View>
  );
}

/** A horizontal bar made of coloured shares that always add up to 100. */
export function ShareBar({ parts }) {
  return (
    <View style={s.bar} accessibilityLabel="Share of money received by payment method">
      {parts.filter((p) => p.percent > 0).map((p) => <View key={p.key} style={{ flex: p.percent, backgroundColor: p.color }} />)}
    </View>
  );
}

export const Empty = ({ children }) => <Text style={s.empty}>{children}</Text>;
export const Banner = ({ text, tone = 'amber', onPress }) => (onPress
  ? <TouchableOpacity onPress={onPress} style={[s.banner, { backgroundColor: TONE[tone][1] }]}><Text style={[s.bannerText, { color: TONE[tone][0] }]}>{text}</Text></TouchableOpacity>
  : <View style={[s.banner, { backgroundColor: TONE[tone][1] }]}><Text style={[s.bannerText, { color: TONE[tone][0] }]}>{text}</Text></View>);

export const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.cream }, pad: { padding: 16, paddingBottom: 40, maxWidth: 720, width: '100%', alignSelf: 'center' },
  back: { color: C.orangeDark, fontWeight: '700', fontSize: 14, marginBottom: 10 }, title: { fontSize: 22, fontWeight: '800', color: C.ink, marginBottom: 4 },
  sub: { color: C.soft, fontSize: 14, marginBottom: 12 }, hint: { color: C.soft, fontSize: 12.5, marginTop: 2 }, section: { fontSize: 15, fontWeight: '800', color: C.ink, marginTop: 14, marginBottom: 6 },
  card: { backgroundColor: C.white, borderRadius: 14, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: C.line },
  kv: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 }, k: { color: C.soft, fontSize: 14, flexShrink: 1, paddingRight: 8 }, v: { color: C.ink, fontSize: 14, fontWeight: '600' },
  btn: { borderRadius: 12, paddingVertical: 14, paddingHorizontal: 16, alignItems: 'center', marginBottom: 10 }, btnSmall: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 10, marginBottom: 0 },
  btnText: { fontWeight: '800', fontSize: 15 }, badge: { alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 9, paddingVertical: 2, marginRight: 6, marginTop: 4 }, badgeText: { fontSize: 11.5, fontWeight: '800' },
  label: { fontSize: 13, fontWeight: '700', color: C.ink, marginBottom: 4 },
  input: { backgroundColor: C.white, borderWidth: 1, borderColor: C.line, borderRadius: 10, paddingHorizontal: 12, paddingVertical: Platform.OS === 'web' ? 10 : 9, fontSize: 15, color: C.ink },
  err: { color: C.red, fontSize: 12.5, marginTop: 3 }, tab: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, backgroundColor: '#efede6', marginRight: 8 }, tabOn: { backgroundColor: C.asphalt },
  tabText: { fontSize: 13, fontWeight: '700', color: C.ink }, hero: { backgroundColor: C.asphalt, borderRadius: 16, padding: 16, marginBottom: 12 },
  heroLabel: { color: '#c9ccd3', fontSize: 13 }, heroAmt: { color: C.white, fontSize: 30, fontWeight: '800', marginVertical: 4 }, heroRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  heroSmall: { color: '#e5e7eb', fontSize: 12.5, marginRight: 10 }, heroFormula: { color: '#9aa0ab', fontSize: 11.5, marginTop: 8 }, bar: { flexDirection: 'row', height: 12, borderRadius: 6, overflow: 'hidden', backgroundColor: C.line, marginVertical: 8 },
  empty: { color: C.soft, textAlign: 'center', paddingVertical: 18 }, banner: { borderRadius: 12, padding: 12, marginBottom: 12 }, bannerText: { fontWeight: '700', fontSize: 13.5 },
});
