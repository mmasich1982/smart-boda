// rider-app/src/screens/admin/AdminRiderScreens.js
// Manage Riders: Active Riders List and Individual Riders (the console's two pages, one phone screen each; every list is paged).
import React, { useEffect, useState } from 'react';
import { View, Text } from 'react-native';
import { AdminScreen, Card, Btn, Badge, Field, Tabs, Hint, Section, StatTile, StatRow, SearchBox, PhoneText, Pager, ListState, Notice, useNotice, useAdminList,
  LocationPicker, PhoneVerdict, errText, s, C } from './AdminUI';
import { riderStats, listActiveRiders, listIndividualRiders, createIndividualRider, removeIndividualRider, checkIndividualPhone, changeVehicleType } from '../../admin/adminApi';
import useAdmin from '../../admin/useAdmin';      // SMART CABZ: Change vehicle type is for Super Admins
import { isPhone, cleanPhone, when, RIDER_STATUS } from '../../admin/adminFormat';
import { confirmAction } from '../../utils/confirmDialog';

// SMART CABZ ------------------------------------------------------------------------------------------------
export const VEHICLE_LABEL = { motorcycle: '🏍️ Motorcycle (Smart Boda)', car: '🚗 Car (Smart Cabz)' };
const VEHICLE_TABS = [{ key: 'motorcycle', label: 'Motorcycle' }, { key: 'car', label: 'Car' }];

/** "Change vehicle type" for a registered person: the other type, a reason (5+ characters), then Change. The server logs it. */
function VehicleChange({ row, onDone, onCancel }) {
  const [to, setTo] = useState(row.vehicle_type === 'car' ? 'motorcycle' : 'car');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const { notice, fail, clear } = useNotice();
  async function go() {
    setBusy(true); clear();
    try { await changeVehicleType(row.rider_id || row.id, to, reason.trim()); onDone(`${row.full_name} is now recorded as a ${to === 'car' ? 'car driver (Smart Cabz)' : 'motorcycle rider (Smart Boda)'}. Their phone switches the next time it is online.`); }
    catch (e) { fail(errText(e, 'Could not change the vehicle type.')); } finally { setBusy(false); }
  }
  return (
    <View style={{ marginTop: 8 }}>
      <Notice notice={notice} onClose={clear} />
      <Text style={s.label}>New type</Text>
      <Tabs value={to} onChange={setTo} tabs={VEHICLE_TABS} />
      <Field label="Reason * (at least 5 characters)" value={reason} onChangeText={setReason} maxLength={200} />
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Btn label={busy ? 'Saving…' : 'Change'} small disabled={busy || reason.trim().length < 5 || to === row.vehicle_type} onPress={go} />
        <Btn label="Cancel" kind="ghost" small onPress={onCancel} />
      </View>
    </View>
  );
}
// ------------------------------------------------------------------------------------------------------------

const toMenu = (navigation) => ({ back: '← Manage Riders', onBack: () => navigation.navigate('AdminMenu', { menuKey: 'riders' }) });

export function ActiveRidersScreen({ navigation }) {
  const [st, setSt] = useState(null);
  const { admin } = useAdmin();
  const [changing, setChanging] = useState(null);
  const { notice, ok, clear } = useNotice();
  useEffect(() => { riderStats().then(setSt).catch(() => {}); }, []);
  const list = useAdminList((page, size) => listActiveRiders(page, size), []);
  return (
    <AdminScreen navigation={navigation} title="Active Riders List" sub="Riders and drivers who finished setting up their profile and PIN." {...toMenu(navigation)}>
      <Notice notice={notice} onClose={clear} />
      <StatRow>
        <StatTile label="Total riders" value={st && st.total_riders} />
        <StatTile label="Active riders" value={st && st.active_riders} tone={C.green} />
        <StatTile label="Joined in 7 days" value={st && st.active_joined_last_7_days} />
        <StatTile label="Joined in 30 days" value={st && st.active_joined_last_30_days} />
      </StatRow>
      <ListState list={list} emptyText="No active riders yet." />
      {list.items.map((r) => (
        <Card key={r.id}>
          <Text style={{ fontSize: 15, fontWeight: '800', color: C.ink }}>{r.full_name || '—'}</Text>
          <PhoneText value={r.mobile_number} />
          <Hint>{r.kind === 'business' ? '🏪 Business user' : r.vehicle_type === 'car' ? '🚗 Car driver' : '🏍️ Motorcycle rider'} · Joined {when(r.created_at)}</Hint>
          {admin.role === 'super_admin' && r.kind !== 'business' ? (
            changing === r.id ? <VehicleChange row={r} onCancel={() => setChanging(null)} onDone={(m) => { ok(m); setChanging(null); list.refresh(); }} />
              : <Btn label="Change vehicle type" kind="ghost" small onPress={() => setChanging(r.id)} />
          ) : null}
        </Card>
      ))}
      <Pager list={list} />
    </AdminScreen>
  );
}

const EMPTY = { full_name: '', mobile_number: '', vehicle_type: '', county_id: null, sub_county_id: null, ward_id: null };      // SMART CABZ: no default; the Administrator chooses

export function IndividualRidersScreen({ navigation }) {
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [vehicle, setVehicle] = useState('');          // SMART CABZ: filter
  const [changing, setChanging] = useState(null);
  const { admin } = useAdmin();
  const [form, setForm] = useState(null);
  const [errors, setErrors] = useState({});
  const [verdict, setVerdict] = useState(null);       // { value, available, message }
  const [saving, setSaving] = useState(false);
  const { notice, ok, fail, clear } = useNotice();
  const list = useAdminList((page, size) => listIndividualRiders({ q: q || undefined, status: status || undefined, vehicle_type: vehicle || undefined, page, page_size: size }), [q, status, vehicle]);

  const phone = form ? cleanPhone(form.mobile_number) : '';
  useEffect(() => {                                   // check each complete number once typing stops, like the console
    if (!form || !isPhone(phone)) { setVerdict(null); return undefined; }
    let live = true;
    const t = setTimeout(() => {
      checkIndividualPhone(phone).then((r) => live && setVerdict({ value: phone, available: r.available, message: r.message })).catch(() => live && setVerdict(null));
    }, 400);
    return () => { live = false; clearTimeout(t); };
  }, [phone, !!form]);   // eslint-disable-line react-hooks/exhaustive-deps

  const taken = verdict && verdict.value === phone && !verdict.available;
  const free = verdict && verdict.value === phone && verdict.available;

  async function save() {
    const e = {};
    if (form.full_name.trim().length < 2) e.full_name = 'Name is required';
    if (!isPhone(phone)) e.mobile_number = 'Enter a valid number, e.g. 0712345678';
    if (!form.vehicle_type) e.vehicle_type = 'Choose the type of vehicle';      // SMART CABZ
    if (!form.county_id) e.county_id = 'Select a county';
    if (!form.sub_county_id) e.sub_county_id = 'Select a sub-county';
    if (!form.ward_id) e.ward_id = 'Select a ward';
    setErrors(e);
    if (Object.keys(e).length || taken) return;
    setSaving(true);
    try {
      const r = await createIndividualRider({ full_name: form.full_name.trim(), mobile_number: phone, vehicle_type: form.vehicle_type, county_id: form.county_id, sub_county_id: form.sub_county_id, ward_id: form.ward_id });
      ok(`${r.full_name || form.full_name.trim()} was added as a ${form.vehicle_type === 'car' ? 'car driver (Smart Cabz)' : 'motorcycle rider (Smart Boda)'}. They can now set up in the app with their own mobile number.`);
      setForm(null); setVerdict(null); list.refresh();
    } catch (err) { fail(errText(err, 'Could not add the rider.')); } finally { setSaving(false); }
  }

  async function remove(r) {
    const yes = await confirmAction({ title: 'Remove rider', message: `Remove ${r.full_name}? They have not set up yet.`, confirmText: 'Remove' });
    if (!yes) return;
    try { await removeIndividualRider(r.id); ok(`${r.full_name} was removed.`); list.refresh(); } catch (err) { fail(errText(err, 'Could not remove.')); }
  }

  return (
    <AdminScreen navigation={navigation} title="Individual Riders" sub="Riders who join on their own, with no group. Add them here; they finish in the app with their number." {...toMenu(navigation)}>
      <Notice notice={notice} onClose={clear} />
      <StatRow>
        <StatTile label="Awaiting registration" value={list.data.awaiting} tone={C.amber} />
        <StatTile label="Registered" value={list.data.registered} tone={C.green} />
      </StatRow>
      {form ? (
        <Card>
          <Section>New individual rider</Section>
          <Field label="Full name *" value={form.full_name} maxLength={80} onChangeText={(t) => setForm({ ...form, full_name: t })} error={errors.full_name} />
          <Field label="Mobile phone number *" value={form.mobile_number} placeholder="0712345678" keyboardType="phone-pad" onChangeText={(t) => setForm({ ...form, mobile_number: t })} error={errors.mobile_number} />
          <PhoneVerdict taken={taken} ok={free} message={verdict && verdict.message} />
          <Text style={s.label}>Type of Vehicle *</Text>
          <Tabs value={form.vehicle_type} onChange={(k) => setForm({ ...form, vehicle_type: k })} tabs={VEHICLE_TABS} />
          {errors.vehicle_type ? <Text style={s.err}>{errors.vehicle_type}</Text> : null}
          <LocationPicker value={form} errors={errors} onChange={(l) => setForm({ ...form, ...l })} />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Btn label={saving ? 'Saving…' : 'Add rider'} disabled={saving || !!taken} onPress={save} />
            <Btn label="Cancel" kind="ghost" onPress={() => { setForm(null); setErrors({}); }} />
          </View>
        </Card>
      ) : <Btn label="＋ New individual rider" onPress={() => { setForm(EMPTY); setErrors({}); clear(); }} />}

      <SearchBox value={q} onChange={setQ} placeholder="Search name or phone…" />
      <Tabs value={status} onChange={setStatus} tabs={[{ key: '', label: 'All' }, { key: 'awaiting_registration', label: 'Awaiting' }, { key: 'registered', label: 'Registered' }]} />
      <Tabs value={vehicle} onChange={setVehicle} tabs={[{ key: '', label: 'All vehicles' }, ...VEHICLE_TABS]} />
      <ListState list={list} emptyText="No individual riders found." />
      {list.items.map((r) => (
        <Card key={r.id}>
          <Text style={{ fontSize: 15, fontWeight: '800', color: C.ink }}>{r.full_name}</Text>
          <PhoneText value={r.mobile_number} />
          <Hint>{VEHICLE_LABEL[r.vehicle_type] || r.vehicle_type}</Hint>
          <Hint>📍 {[r.ward, r.sub_county, r.county].filter(Boolean).join(', ') || 'Location not set'}</Hint>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 }}>
            <Text style={{ fontSize: 13, color: C.soft }}>{RIDER_STATUS[r.status] || r.status}</Text>
            {r.status === 'awaiting_registration' ? <Btn label="Remove" kind="ghost" small onPress={() => remove(r)} /> : null}
            {r.status === 'registered' && r.rider_id && admin.role === 'super_admin' && changing !== r.id ? <Btn label="Change vehicle type" kind="ghost" small onPress={() => setChanging(r.id)} /> : null}
          </View>
          {changing === r.id ? <VehicleChange row={r} onCancel={() => setChanging(null)} onDone={(m) => { ok(m); setChanging(null); list.refresh(); }} /> : null}
        </Card>
      ))}
      <Pager list={list} />
    </AdminScreen>
  );
}
