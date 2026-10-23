// rider-app/src/screens/chama/manageUi.js
// Building blocks of the Treasurer's Manage Chama screens, laid out like Smart_Boda_Prototype_v30:
//   TabBar (group type / group / circle tabs)  ·  MenuRow  ·  GroupLine  ·  CheckRow  ·  Fold  ·  Section  ·  FormInput
// The Hero card, buttons, cards, badges and notices come from ./mgrUi.
import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import colors from '../../theme/colors';
import { Card } from './mgrUi';
import { TYPE_LABEL } from './common';

/** Rounded tab strip. Fits up to 3 tabs across; more scroll sideways. tabs = [{ key, label }] */
export function TabBar({ tabs, value, onChange, testID }) {
  const body = tabs.map((t) => {
    const on = t.key === value;
    return (
      <TouchableOpacity key={t.key} testID={`${testID || 'tab'}-${t.key}`} accessibilityRole="tab" onPress={() => onChange(t.key)}
        style={[u.tab, tabs.length <= 3 ? { flex: 1 } : { minWidth: 110 }, on && u.tabOn]}>
        <Text style={[u.tabTxt, on && u.tabTxtOn]} numberOfLines={1}>{t.label}</Text>
      </TouchableOpacity>);
  });
  if (tabs.length <= 3) return <View style={u.tabs}>{body}</View>;
  return <ScrollView horizontal showsHorizontalScrollIndicator={false} style={u.tabScroll} contentContainerStyle={u.tabs}>{body}</ScrollView>;
}

/** Group type tabs, group tabs (only when there is more than one group of that type) and circle tabs (only when more than one). */
export function ManageTabs({ m, showType = true, showGroups = true }) {
  const single = m.groupsOfType.length === 1;
  return (<>
    {showType && m.types.length > 0 && <TabBar testID="type" tabs={m.types.map((t) => ({ key: t, label: TYPE_LABEL[t] }))} value={m.type} onChange={m.setType} />}
    {showGroups && m.groupsOfType.length > 1 && (
      <TabBar testID="group" tabs={m.groupsOfType.map((g) => ({ key: g.group_id, label: g.group_name }))} value={m.group?.group_id} onChange={m.setGroup} />)}
    {showGroups && single && !!m.group && <NameLine name={m.group.group_name} />}
    <CircleTabs m={m} />
  </>);
}

/** Circle tabs: shown only for a Merry-Go-Round group that has more than one circle. */
export function CircleTabs({ m }) {
  if (!m.isMgr || !m.circles || m.circles.length < 2) return null;
  return <TabBar testID="circle" tabs={m.circles.map((c) => ({ key: c.id, label: c.name }))} value={m.circle?.id} onChange={m.setCircle} />;
}

/** "👥 Tumaini Boda Chama" under the type tabs. */
export const NameLine = ({ name }) => <Text style={u.nameLine}>👥 {name}</Text>;

/** "🔄 Merry-Go-Round · Tumaini Boda Chama" under the title of a sub-screen. */
export const GroupLine = ({ type = 'mgr', name }) => <Text style={u.nameLine}>{TYPE_LABEL[type]}{name ? ` · ${name}` : ''}</Text>;

/** A big tappable card: emoji, title, optional amber badge, chevron. */
export function MenuRow({ emoji, title, badge, onPress, testID }) {
  return (
    <TouchableOpacity testID={testID} accessibilityRole="button" activeOpacity={0.8} onPress={onPress} style={u.menuRow}>
      <Text style={{ fontSize: 28 }}>{emoji}</Text>
      <Text style={u.menuTitle}>{title}</Text>
      {badge !== undefined && badge !== null && badge !== '' && <View style={u.menuBadge}><Text style={u.menuBadgeTxt}>{badge}</Text></View>}
      <Text style={u.chev}>›</Text>
    </TouchableOpacity>);
}

/** Tick box on a tinted, orange-bordered row (the prototype's confirm / double turn rows). */
export function CheckRow({ checked, onChange, children, disabled, testID, plain }) {
  return (
    <TouchableOpacity testID={testID} accessibilityRole="checkbox" accessibilityState={{ checked: !!checked, disabled: !!disabled }}
      disabled={disabled} activeOpacity={0.8} onPress={() => onChange(!checked)} style={[u.check, plain && u.checkPlain, disabled && { opacity: 0.6 }]}>
      <View style={[u.box, checked && u.boxOn]}>{checked ? <Text style={u.tick}>✓</Text> : null}</View>
      <Text style={[u.checkTxt, plain && u.checkTxtPlain]}>{children}</Text>
    </TouchableOpacity>);
}

/** Collapsible card ("Details ▾", "More details ▾"). */
export function Fold({ title, children, startOpen = false, bare }) {
  const [open, setOpen] = useState(startOpen);
  return (
    <View style={bare ? null : u.fold}>
      <TouchableOpacity onPress={() => setOpen(!open)} style={u.foldHead} accessibilityRole="button">
        <Text style={bare ? u.foldBare : u.foldTitle}>{title}</Text><Text style={u.caret}>{open ? '▴' : '▾'}</Text>
      </TouchableOpacity>
      {open && <View style={bare ? null : { paddingHorizontal: 14, paddingBottom: 12 }}>{children}</View>}
    </View>);
}

/** The orange "ⓘ More info" link that opens a short explanation under it. */
export function MoreInfo({ children }) {
  const [open, setOpen] = useState(false);
  return (<>
    <TouchableOpacity onPress={() => setOpen(!open)} style={{ marginVertical: 6 }} accessibilityRole="button">
      <Text style={u.more}>ⓘ More info</Text>
    </TouchableOpacity>
    {open && <Text style={u.moreTxt}>{children}</Text>}
  </>);
}

/** Card with a bold title; collapsible when `collapsible` is set ("2 · Members in Daily  ▴"). */
export function Section({ title, children, collapsible, startOpen = true, style }) {
  const [open, setOpen] = useState(startOpen);
  return (
    <Card style={style}>
      {collapsible
        ? <TouchableOpacity onPress={() => setOpen(!open)} style={u.secHead} accessibilityRole="button"><Text style={u.secTitle}>{title}</Text><Text style={u.caret}>{open ? '▴' : '▾'}</Text></TouchableOpacity>
        : <Text style={u.secTitle}>{title}</Text>}
      {(!collapsible || open) && children}
    </Card>);
}

/** Label above a text box. */
export function FormInput({ label, required, hint, style, ...rest }) {
  return (
    <View style={{ marginBottom: 12 }}>
      {!!label && <Text style={u.label}>{label}{required ? <Text style={{ color: colors.signalRed }}> *</Text> : null}</Text>}
      <TextInput placeholderTextColor="#9a9da4" style={[u.input, style]} {...rest} />
      {!!hint && <Text style={u.hint}>{hint}</Text>}
    </View>);
}

export const u = StyleSheet.create({
  tabs: { flexDirection: 'row', backgroundColor: '#f1efe9', borderRadius: 12, padding: 4, gap: 4, marginBottom: 12 },
  tabScroll: { flexGrow: 0, marginBottom: 12, backgroundColor: '#f1efe9', borderRadius: 12 },
  tab: { paddingVertical: 8, paddingHorizontal: 6, borderRadius: 10, borderWidth: 1.5, borderColor: 'transparent', alignItems: 'center', justifyContent: 'center' },
  tabOn: { backgroundColor: '#fff', borderColor: colors.bodaOrange },
  tabTxt: { fontSize: 12.5, fontWeight: '700', color: colors.inkSoft },
  tabTxtOn: { color: colors.bodaOrangeDark },
  nameLine: { fontSize: 12.5, fontWeight: '700', color: colors.inkSoft, marginBottom: 12, marginLeft: 2 },
  menuRow: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, backgroundColor: '#fff', borderWidth: 1, borderColor: colors.line, borderRadius: 16, marginBottom: 14 },
  menuTitle: { flex: 1, fontWeight: '800', fontSize: 16, color: colors.ink },
  menuBadge: { backgroundColor: colors.signalAmberBg, borderRadius: 999, paddingVertical: 4, paddingHorizontal: 12 },
  menuBadgeTxt: { color: colors.signalAmber, fontWeight: '800', fontSize: 13 },
  chev: { color: colors.inkSoft, fontSize: 22, lineHeight: 24 },
  check: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#fff6ee', borderWidth: 1, borderColor: colors.bodaOrange, borderRadius: 14, padding: 14, marginBottom: 12 },
  checkPlain: { backgroundColor: '#fff', borderColor: colors.line, borderRadius: 16 },
  checkTxtPlain: { fontSize: 13.5, fontWeight: '400' },
  box: { width: 22, height: 22, borderRadius: 4, borderWidth: 1.5, borderColor: '#666', backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  boxOn: { backgroundColor: colors.bodaOrange, borderColor: colors.bodaOrange },
  tick: { color: '#fff', fontWeight: '800', fontSize: 14, lineHeight: 16 },
  checkTxt: { flex: 1, fontSize: 14.5, fontWeight: '600', color: colors.inkSoft, lineHeight: 21 },
  fold: { backgroundColor: '#fff', borderWidth: 1, borderColor: colors.line, borderRadius: 16, marginBottom: 14 },
  foldHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 14 },
  foldTitle: { fontWeight: '700', fontSize: 13.5, color: colors.ink },
  foldBare: { fontWeight: '700', fontSize: 13.5, color: colors.bodaOrangeDark },
  caret: { color: colors.inkSoft, fontSize: 12 },
  more: { color: colors.bodaOrangeDark, fontWeight: '700', fontSize: 13 },
  moreTxt: { fontSize: 12.5, color: colors.inkSoft, lineHeight: 19, marginBottom: 8 },
  secHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  secTitle: { fontWeight: '700', fontSize: 15, color: colors.ink, marginBottom: 8 },
  label: { fontSize: 13, fontWeight: '700', color: colors.ink, marginBottom: 6 },
  input: { borderWidth: 1, borderColor: colors.line, borderRadius: 10, paddingVertical: 12, paddingHorizontal: 14, fontSize: 14, color: colors.ink, backgroundColor: '#fff' },
  hint: { fontSize: 11.5, color: colors.inkSoft, marginTop: 6, lineHeight: 17 },
});