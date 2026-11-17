// rider-app/src/screens/admin/AdminUI.js
// ADMIN APP: the small shared pieces every admin screen uses, built on the Smart Bizna look (BizUI) and the app's own PaginationControls and DropdownField.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, TextInput, ActivityIndicator } from 'react-native';
import { Screen, BackLink, Title, Sub, Card, Btn, Banner, Hint, Badge, Tabs, Empty, Field, Section, s, C } from '../business/BizUI';
import PaginationControls from '../../components/PaginationControls';
import DropdownField from '../../components/DropdownField';
import { PAGE_SIZE, pageSlice, clampPage, totalPagesOf } from '../../admin/paging';
import { errText, maskPhone, toTri, fromTri } from '../../admin/adminFormat';
import { listCounties, listSubCounties, listWards } from '../../admin/adminApi';

export { Screen, BackLink, Title, Sub, Card, Btn, Banner, Hint, Badge, Tabs, Empty, Field, Section, s, C, errText };

/** A screen with a back link to its menu (or Admin Home) and a title. */
export function AdminScreen({ navigation, title, sub, back = '← Back', children, onBack }) {
  return (
    <Screen>
      <BackLink label={back} onPress={onBack || (() => (navigation.canGoBack() ? navigation.goBack() : navigation.navigate('AdminHome')))} />
      <Title>{title}</Title>
      {sub ? <Sub>{sub}</Sub> : null}
      {children}
    </Screen>
  );
}

/** A server-paged list: page 1 again whenever a filter changes; a late answer for an old page is dropped. fetcher(page, pageSize) -> { items, total, ... } */
export function useAdminList(fetcher, deps = [], pageSize = PAGE_SIZE) {
  const key = JSON.stringify(deps);
  const [pg, setPg] = useState({ key, page: 1 });
  const page = pg.key === key ? pg.page : 1;
  const [state, setState] = useState({ data: null, loading: true, error: null });
  const fetchRef = useRef(fetcher); fetchRef.current = fetcher;
  const seq = useRef(0);
  const load = useCallback(async () => {
    const mine = ++seq.current;
    setState((x) => ({ ...x, loading: true, error: null }));
    try {
      const data = await fetchRef.current(page, pageSize);
      if (mine !== seq.current) return;
      const total = Number(data && data.total) || 0;
      if (page > 1 && page > totalPagesOf(total, pageSize)) { setPg({ key, page: clampPage(page, total, pageSize) }); return; }    // the list got shorter: step back
      setState({ data, loading: false, error: null });
    } catch (e) {
      if (mine !== seq.current) return;
      setState((x) => ({ ...x, loading: false, error: errText(e, 'We could not load this. Check your internet and try again.') }));
    }
  }, [key, page, pageSize]);
  useEffect(() => { load(); }, [load]);
  const d = state.data || {};
  return { data: d, items: d.items || [], total: Number(d.total) || 0, page, setPage: (p) => setPg({ key, page: p }), pageSize, loading: state.loading, error: state.error, refresh: load };
}

/** A list the server returns whole (slot requests, business types, statement requests), cut into pages here. */
export function useClientList(fetcher, deps = [], pageSize = PAGE_SIZE) {
  const key = JSON.stringify(deps);
  const [pg, setPg] = useState({ key, page: 1 });
  const [state, setState] = useState({ all: [], loading: true, error: null, raw: null });
  const fetchRef = useRef(fetcher); fetchRef.current = fetcher;
  const seq = useRef(0);
  const load = useCallback(async () => {
    const mine = ++seq.current;
    setState((x) => ({ ...x, loading: true, error: null }));
    try {
      const raw = await fetchRef.current();
      if (mine !== seq.current) return;
      setState({ all: Array.isArray(raw) ? raw : (raw && raw.items) || [], raw, loading: false, error: null });
    } catch (e) {
      if (mine !== seq.current) return;
      setState((x) => ({ ...x, loading: false, error: errText(e, 'We could not load this. Check your internet and try again.') }));
    }
  }, [key]);
  useEffect(() => { load(); }, [load]);
  const cut = pageSlice(state.all, pg.key === key ? pg.page : 1, pageSize);
  return { ...cut, all: state.all, raw: state.raw, pageSize, setPage: (p) => setPg({ key, page: p }), loading: state.loading, error: state.error, refresh: load };
}

/** "Showing 11–20 of 33" and the page buttons. */
export function Pager({ list }) {
  return <PaginationControls page={list.page} totalPages={totalPagesOf(list.total, list.pageSize)} totalItems={list.total} pageSize={list.pageSize} onPageChange={list.setPage} />;
}

/** Loading, error (with Try again) and empty states for a list. */
export function ListState({ list, emptyText }) {
  if (list.loading && !list.items.length) return <View style={{ paddingVertical: 24 }}><ActivityIndicator color={C.orange} /></View>;
  if (list.error) return <Banner tone="red" text={`${list.error}  Tap to try again.`} onPress={list.refresh} />;
  if (!list.loading && !list.items.length) return <Empty>{emptyText}</Empty>;
  return null;
}

/** A search box that waits until typing stops before asking the server. */
export function SearchBox({ value, onChange, placeholder = 'Search…' }) {
  const [text, setText] = useState(value || '');
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);
  return (
    <TextInput value={text} placeholder={placeholder} placeholderTextColor="#9aa0ab" autoCapitalize="none" autoCorrect={false} accessibilityLabel={placeholder}
      onChangeText={(t) => { setText(t); clearTimeout(timer.current); timer.current = setTimeout(() => onChange(t.trim()), 400); }}
      style={[s.input, { marginBottom: 10 }]} />
  );
}

export function StatTile({ label, value, tone, onPress }) {
  const body = (
    <View style={{ flexBasis: '47%', flexGrow: 1, backgroundColor: C.white, borderRadius: 14, borderWidth: 1, borderColor: C.line, padding: 12, marginBottom: 10 }}>
      <Text style={{ fontSize: 12, color: C.soft }}>{label}</Text>
      <Text style={{ fontSize: 26, fontWeight: '800', color: tone || C.ink }}>{value === null || value === undefined ? '—' : value}</Text>
    </View>
  );
  return onPress ? <TouchableOpacity onPress={onPress} accessibilityRole="button" style={{ flexBasis: '47%', flexGrow: 1 }}>{body}</TouchableOpacity> : body;
}
export const StatRow = ({ children }) => <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 2 }}>{children}</View>;

/** A phone number shown 0757***81; tap it to see the whole number (the console's masked number, on a phone). */
export function PhoneText({ value, style }) {
  const [open, setOpen] = useState(false);
  return (
    <TouchableOpacity onPress={() => setOpen(!open)} accessibilityRole="button" accessibilityLabel={open ? 'Hide number' : 'Show full number'}>
      <Text style={[{ color: C.ink, fontSize: 14 }, style]}>{open ? (value || '—') : maskPhone(value)}</Text>
    </TouchableOpacity>
  );
}

/** A message that stays until dismissed (green = done, red = refused). */
export function Notice({ notice, onClose }) {
  if (!notice) return null;
  return <Banner tone={notice.ok ? 'green' : 'red'} text={`${notice.text}${onClose ? '   ✕' : ''}`} onPress={onClose} />;
}
export function useNotice() {
  const [notice, setNotice] = useState(null);
  return { notice, ok: (text) => setNotice({ ok: true, text }), fail: (text) => setNotice({ ok: false, text }), clear: () => setNotice(null) };
}

/** Yes / No / (Same as business) as three chips: the console's TriChoice. */
export function Choice({ value, onChange, label, tri = true, disabled }) {
  const tabs = tri ? [{ key: 'same', label: 'Same as business' }, { key: 'yes', label: 'Yes' }, { key: 'no', label: 'No' }] : [{ key: 'yes', label: 'Yes' }, { key: 'no', label: 'No' }];
  const current = tri ? toTri(value) : (value ? 'yes' : 'no');
  return (
    <View style={{ opacity: disabled ? 0.5 : 1 }} pointerEvents={disabled ? 'none' : 'auto'}>
      {label ? <Text style={s.label}>{label}</Text> : null}
      <Tabs tabs={tabs} value={current} onChange={(k) => onChange(tri ? fromTri(k) : k === 'yes')} />
    </View>
  );
}

/** County > Sub-county > Ward (the console's LocationCascade). value / onChange use { county_id, sub_county_id, ward_id } as numbers or null. */
export function LocationPicker({ value, onChange, errors = {} }) {
  const [counties, setCounties] = useState([]);
  const [subs, setSubs] = useState([]);
  const [wards, setWards] = useState([]);
  const [problem, setProblem] = useState(null);
  useEffect(() => { listCounties().then(setCounties).catch(() => setProblem('Could not load counties.')); }, []);
  useEffect(() => {
    let alive = true; setSubs([]);
    if (value.county_id) listSubCounties(value.county_id).then((r) => alive && setSubs(r)).catch(() => alive && setProblem('Could not load sub-counties.'));
    return () => { alive = false; };
  }, [value.county_id]);
  useEffect(() => {
    let alive = true; setWards([]);
    if (value.sub_county_id) listWards(value.sub_county_id).then((r) => alive && setWards(r)).catch(() => alive && setProblem('Could not load wards.'));
    return () => { alive = false; };
  }, [value.sub_county_id]);
  const opts = (rows) => rows.map((r) => ({ label: r.name, value: String(r.id) }));
  const num = (v) => (v ? Number(v) : null);
  const set = (patch) => onChange({ county_id: value.county_id || null, sub_county_id: value.sub_county_id || null, ward_id: value.ward_id || null, ...patch });
  return (
    <View>
      {problem ? <Banner tone="red" text={problem} /> : null}
      <DropdownField label="County" required value={value.county_id ? String(value.county_id) : ''} options={opts(counties)} error={errors.county_id}
        onValueChange={(v) => { setProblem(null); set({ county_id: num(v), sub_county_id: null, ward_id: null }); }} />
      <DropdownField label="Sub-County" required value={value.sub_county_id ? String(value.sub_county_id) : ''} options={opts(subs)} error={errors.sub_county_id}
        onValueChange={(v) => set({ sub_county_id: num(v), ward_id: null })} />
      <DropdownField label="Ward" required value={value.ward_id ? String(value.ward_id) : ''} options={opts(wards)} error={errors.ward_id}
        onValueChange={(v) => set({ ward_id: num(v) })} />
    </View>
  );
}

/** A small result line under a phone box: green when free, red when taken. */
export function PhoneVerdict({ taken, ok, message }) {
  if (taken) return <Banner tone="red" text={`🚫 ${message || 'This number is already in use.'} Use a different number.`} />;
  if (ok) return <Banner tone="green" text="✅ This number is available." />;
  return null;
}

/** The inline reason box for "Decline" (the console asks for at least 5 characters). */
export function ReasonBox({ onSubmit, onCancel, busy, label = 'Decline' }) {
  const [reason, setReason] = useState('');
  return (
    <View style={{ marginTop: 8 }}>
      <Field label="Reason the Treasurer will see (at least 5 characters)" value={reason} onChangeText={setReason} multiline maxLength={200} />
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Btn label={busy ? 'Please wait…' : label} kind="danger" small disabled={busy || reason.trim().length < 5} onPress={() => onSubmit(reason.trim())} />
        <Btn label="Cancel" kind="ghost" small onPress={onCancel} />
      </View>
    </View>
  );
}
