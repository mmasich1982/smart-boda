// rider-app/src/screens/admin/AdminGroupScreens.js
// Manage Groups: Manage Groups and Members, and Incoming Group Member Additions (slot requests). Same server routes as the console; every list is paged.
import React, { useEffect, useState } from 'react';
import { View, Text } from 'react-native';
import { AdminScreen, Card, Btn, Field, Tabs, Hint, Section, StatTile, StatRow, SearchBox, PhoneText, Pager, ListState, Notice, useNotice, useAdminList, useClientList,
  LocationPicker, ReasonBox, Banner, errText, s, C } from './AdminUI';
import { getGroupStats, listGroups, createGroup, updateGroup, setGroupActive, getGroupFinance, checkTreasurerPhone, listSlotRequests, approveSlotRequest, declineSlotRequest } from '../../admin/adminApi';
import { isPhone, cleanPhone } from '../../admin/adminFormat';
import { confirmAction } from '../../utils/confirmDialog';

const toMenu = (navigation) => ({ back: '← Manage Groups', onBack: () => navigation.navigate('AdminMenu', { menuKey: 'groups' }) });
const kes = (n) => `KSh ${Math.round(Number(n || 0)).toLocaleString()}`;
const TYPE = { mgr: 'Merry-Go-Round', tb: 'Table Banking' };
const MEMBERS_TABS = [{ key: 'riders', label: 'Riders' }, { key: 'business', label: 'Business' }, { key: 'drivers', label: 'Drivers' }, { key: 'mixed', label: 'Mixed' }];      // SMART CABZ
const MEMBERS_LABEL = { riders: 'Riders', business: 'Business', drivers: 'Drivers', mixed: 'Mixed' };
const KIND_TABS = [{ key: 'chama', label: 'Chama member' }, { key: 'rider', label: 'Motorcycle rider' }, { key: 'driver', label: 'Car driver' }, { key: 'business', label: 'Business user' }];
const EMPTY = { group_name: '', group_type: '', members_type: '', treasurer_kind: '', county_id: null, sub_county_id: null, ward_id: null, stage_name: '', approved_slots: '10', treasurer_name: '', treasurer_phone: '' };

function GroupFinance({ id }) {
  const [f, setF] = useState(null);
  const [err, setErr] = useState(null);
  useEffect(() => { setF(null); setErr(null); getGroupFinance(id).then(setF).catch(() => setErr('Could not load finance figures.')); }, [id]);
  if (err) return <Hint>{err}</Hint>;
  if (!f) return <Hint>Loading finance…</Hint>;
  if (!f.configured) return <Hint>This group has not finished Chama set-up yet.</Hint>;
  return <Hint>Money in {kes(f.money_in)} · Money out {kes(f.money_out)} · Group fund {kes(f.pool)} · Active loans {f.active_loans} · Pending confirmations {f.pending_confirmations}</Hint>;
}

export function ManageGroupsScreen({ navigation }) {
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [membersFilter, setMembersFilter] = useState('');      // SMART CABZ
  const [stats, setStats] = useState(null);
  const [form, setForm] = useState(null);
  const [editId, setEditId] = useState(null);
  const [origPhone, setOrigPhone] = useState('');
  const [errors, setErrors] = useState({});
  const [warn, setWarn] = useState(null);             // BLOCKING: the number already belongs to a rider
  const [pair, setPair] = useState(null);             // info: completes a Merry-Go-Round + Table Banking pair
  const [open, setOpen] = useState(null);             // group id whose details are open
  const [saving, setSaving] = useState(false);
  const { notice, ok, fail, clear } = useNotice();
  const list = useAdminList((page, size) => listGroups({ q: q || undefined, status: status || undefined, members_type: membersFilter || undefined, page, page_size: size }), [q, status, membersFilter]);
  const refreshAll = () => { list.refresh(); getGroupStats().then(setStats).catch(() => {}); };
  useEffect(() => { getGroupStats().then(setStats).catch(() => {}); }, []);

  const phone = form ? cleanPhone(form.treasurer_phone) : '';
  const typeNow = form ? form.group_type : '';
  useEffect(() => {
    const mt = form ? form.members_type : ''; const tk = form ? form.treasurer_kind : '';
    if (!form || !typeNow || !mt || (mt === 'mixed' && !tk) || !isPhone(phone) || (editId && phone === cleanPhone(origPhone))) { setWarn(null); setPair(null); return undefined; }
    let live = true;
    const t = setTimeout(() => {
      checkTreasurerPhone(phone, typeNow, editId || undefined, mt, mt === 'mixed' ? tk : undefined).then((r) => {
        if (!live) return;
        setWarn(r && !r.pair_ok && (r.has_account || mt === 'business') ? r : null);
        setPair(r && r.has_account && r.pair_ok ? r : null);
      }).catch(() => { if (live) { setWarn(null); setPair(null); } });
    }, 400);
    return () => { live = false; clearTimeout(t); };
  }, [phone, typeNow, form && form.members_type, form && form.treasurer_kind, !!form, editId, origPhone]);   // eslint-disable-line react-hooks/exhaustive-deps

  function validate(f) {
    const e = {};
    if (!f.group_name.trim()) e.group_name = 'Group name is required';
    if (!f.members_type) e.members_type = 'Choose the Group Members Type';      // SMART CABZ
    if (f.members_type === 'mixed' && !f.treasurer_kind) e.treasurer_kind = 'Choose the Treasurer type';
    if (!f.group_type) e.group_type = 'Choose Merry-Go-Round or Table Banking';
    if (!f.county_id) e.county_id = 'Please select a county';
    if (!f.sub_county_id) e.sub_county_id = 'Please select a sub-county';
    if (!f.ward_id) e.ward_id = 'Please select a ward';
    if (f.members_type === 'riders' && !(f.stage_name || '').trim()) e.stage_name = 'Stage name is required';      // only a Riders group has a stage
    if (!(Number(f.approved_slots) >= 1)) e.approved_slots = 'Enter at least 1 slot';
    if (!f.treasurer_name.trim()) e.treasurer_name = 'Treasurer name is required';
    if (!isPhone(f.treasurer_phone)) e.treasurer_phone = 'Enter a valid number, e.g. 0712345678';
    return e;
  }

  async function save() {
    const e = validate(form);
    if (warn) e.treasurer_phone = warn.message;
    setErrors(e);
    if (Object.keys(e).length) return;
    setSaving(true);
    try {
      const body = { ...form, treasurer_phone: phone, approved_slots: Number(form.approved_slots),
        stage_name: form.members_type === 'riders' ? form.stage_name : null, treasurer_kind: form.members_type === 'mixed' ? form.treasurer_kind : null };
      const saved = editId ? await updateGroup(editId, body) : await createGroup(body);
      ok(editId ? 'Group updated.' : `Group created. Group Code: ${saved.group_code}`);
      setForm(null); setEditId(null); setWarn(null); setPair(null); refreshAll();
    } catch (err) { fail(errText(err, 'Could not save the group.')); } finally { setSaving(false); }
  }

  async function toggle(g) {
    const on = g.status === 'active';
    const yes = await confirmAction({ title: on ? 'Deactivate group' : 'Activate group', message: on ? 'Deactivate this group? Its Treasurer will not be able to add members.' : 'Activate this group?', confirmText: on ? 'Deactivate' : 'Activate' });
    if (!yes) return;
    try { await setGroupActive(g.id, !on); ok(`${g.group_name} is ${on ? 'deactivated' : 'active'}.`); refreshAll(); } catch (err) { fail(errText(err, 'That did not save.')); }
  }

  const st = stats || {};
  return (
    <AdminScreen navigation={navigation} title="Manage Groups and Members" {...toMenu(navigation)}>
      <Notice notice={notice} onClose={clear} />
      <StatRow>
        <StatTile label="Total groups" value={st.total_groups} />
        <StatTile label="Active" value={st.active_groups} tone={C.green} />
        <StatTile label="Approved slots" value={st.total_approved_slots} />
        <StatTile label="Pending slot requests" value={st.pending_slot_requests} tone={st.pending_slot_requests ? C.red : undefined} onPress={() => navigation.navigate('IncomingAdditions')} />
      </StatRow>

      {form ? (
        <Card>
          <Section>{editId ? 'Edit group' : 'Create new group'}</Section>
          <Text style={s.label}>Group Members Type *</Text>
          <Tabs value={form.members_type} onChange={(k) => setForm({ ...form, members_type: k, treasurer_kind: k === 'mixed' ? 'chama' : '' })} tabs={MEMBERS_TABS} />
          {errors.members_type ? <Text style={s.err}>{errors.members_type}</Text> : null}
          {form.members_type ? <Hint>{{ riders: 'Motorcycle riders only. The stage name is asked.', business: 'Smart Bizna business users only. Their Treasurer must already be a registered business user.', drivers: 'Car drivers only.', mixed: 'Riders, drivers and business users together.' }[form.members_type]}</Hint> : null}
          <Field label="Group name *" value={form.group_name} maxLength={120} onChangeText={(t) => setForm({ ...form, group_name: t })} error={errors.group_name} />
          <Text style={s.label}>Group type *</Text>
          <Tabs value={form.group_type} onChange={(k) => setForm({ ...form, group_type: k })} tabs={[{ key: 'mgr', label: 'Merry-Go-Round' }, { key: 'tb', label: 'Table Banking' }]} />
          {errors.group_type ? <Text style={s.err}>{errors.group_type}</Text> : null}
          <LocationPicker value={form} errors={errors} onChange={(l) => setForm({ ...form, ...l })} />
          {form.members_type === 'riders' && <Field label="Stage name *" value={form.stage_name} maxLength={120} placeholder="Where riders wait for customers" onChangeText={(t) => setForm({ ...form, stage_name: t })} error={errors.stage_name} />}
          <Field label="Number of approved member slots *" value={String(form.approved_slots ?? '')} keyboardType="number-pad" onChangeText={(t) => setForm({ ...form, approved_slots: t.replace(/\D/g, '') })} error={errors.approved_slots} />
          {form.members_type === 'mixed' && (<>
            <Text style={s.label}>Treasurer type *</Text>
            <Tabs value={form.treasurer_kind} onChange={(k) => setForm({ ...form, treasurer_kind: k })} tabs={KIND_TABS} />
            {errors.treasurer_kind ? <Text style={s.err}>{errors.treasurer_kind}</Text> : null}
          </>)}
          <Field label="Treasurer name *" value={form.treasurer_name} maxLength={80} onChangeText={(t) => setForm({ ...form, treasurer_name: t })} error={errors.treasurer_name} />
          <Field label="Treasurer phone number *" value={form.treasurer_phone} placeholder="0712345678" keyboardType="phone-pad" onChangeText={(t) => setForm({ ...form, treasurer_phone: t })} error={errors.treasurer_phone} />
          {warn ? <Banner tone="red" text={`🚫 ${warn.message} Use a different number to save this group.`} /> : null}
          {pair ? <Banner tone="green" text={`🔗 ${pair.message}`} /> : null}
          <Hint>A rider is linked to a group by MOBILE NUMBER: when the Treasurer registers a rider's number, the rider sees the group after they set up their profile with that number.</Hint>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
            <Btn label={saving ? 'Saving…' : editId ? 'Save changes' : 'Create group'} disabled={saving || !!warn} onPress={save} />
            <Btn label="Cancel" kind="ghost" onPress={() => { setForm(null); setEditId(null); setWarn(null); setPair(null); }} />
          </View>
        </Card>
      ) : <Btn label="＋ New group" onPress={() => { setForm(EMPTY); setEditId(null); setOrigPhone(''); setErrors({}); clear(); }} />}

      <SearchBox value={q} onChange={setQ} placeholder="Search name, code or stage…" />
      <Tabs value={status} onChange={setStatus} tabs={[{ key: '', label: 'All' }, { key: 'active', label: 'Active' }, { key: 'inactive', label: 'Inactive' }]} />
      <Tabs value={membersFilter} onChange={setMembersFilter} tabs={[{ key: '', label: 'All types' }, ...MEMBERS_TABS]} />
      <ListState list={list} emptyText="No groups found." />
      {list.items.map((g) => (
        <Card key={g.id} onPress={() => setOpen(open === g.id ? null : g.id)}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={{ fontSize: 15, fontWeight: '800', color: C.ink, flexShrink: 1 }}>{g.group_name}</Text>
            <Text style={{ fontSize: 12.5 }}>{g.status === 'active' ? '🟢 Active' : '⚪ Inactive'}</Text>
          </View>
          <Hint>{g.group_code} · {TYPE[g.group_type] || '—'} · {MEMBERS_LABEL[g.members_type] || 'Riders'} · Slots {g.slots_used}/{g.approved_slots}{g.shared_with ? ` · 🔗 ${g.shared_with}` : ''}</Hint>
          <Hint>{[g.stage_name, [g.ward, g.sub_county, g.county].filter(Boolean).join(', ')].filter(Boolean).join(' · ')}</Hint>
          {open === g.id ? (
            <View style={{ marginTop: 8 }}>
              <Text style={{ fontSize: 14, color: C.ink }}>Treasurer: {g.treasurer_name}</Text>
              <PhoneText value={g.treasurer_phone} />
              <Hint>Registered {g.registered_at || '—'} · {g.slots_available} slot(s) available</Hint>
              <GroupFinance id={g.id} />
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                <Btn label="Edit" kind="ghost" small onPress={() => { setForm({ ...EMPTY, ...g, approved_slots: String(g.approved_slots), group_type: g.group_type || '' }); setEditId(g.id); setOrigPhone(g.treasurer_phone || ''); setErrors({}); clear(); }} />
                <Btn label={g.status === 'active' ? 'Deactivate' : 'Activate'} kind="ghost" small onPress={() => toggle(g)} />
              </View>
            </View>
          ) : <Hint>Tap for details</Hint>}
        </Card>
      ))}
      <Pager list={list} />
    </AdminScreen>
  );
}

export function IncomingAdditionsScreen({ navigation }) {
  const list = useClientList(() => listSlotRequests('pending'), []);
  const [declining, setDeclining] = useState(null);
  const [busy, setBusy] = useState(false);
  const { notice, ok, fail, clear } = useNotice();
  const act = async (fn, done) => {
    setBusy(true);
    try { await fn(); ok(done); setDeclining(null); } catch (e) { fail(errText(e, 'Something went wrong.')); } finally { setBusy(false); list.refresh(); }   // another admin may have decided it first (409): the list reloads
  };
  const extra = list.all.reduce((n, r) => n + (Number(r.requested_slots) || 0), 0);
  return (
    <AdminScreen navigation={navigation} title="Incoming Group Member Additions" sub="Treasurers whose groups reached their approved member limit ask for more slots here." {...toMenu(navigation)}>
      <Notice notice={notice} onClose={clear} />
      <StatRow>
        <StatTile label="Pending requests" value={list.loading ? null : list.all.length} tone={list.all.length ? C.red : undefined} />
        <StatTile label="Extra slots requested" value={list.loading ? null : extra} />
      </StatRow>
      <ListState list={list} emptyText="No pending requests. 🎉" />
      {list.items.map((r) => (
        <Card key={r.id}>
          <Text style={{ fontSize: 15, fontWeight: '800', color: C.ink }}>{r.group_name} · {r.group_code}</Text>
          <Hint>{r.stage_name ? `Stage: ${r.stage_name} · ` : ''}Treasurer: {r.treasurer_name}</Hint>
          <Text style={{ fontSize: 14, color: C.ink, marginTop: 4 }}>Slots now: {r.slots_used} used of {r.current_slots} · <Text style={{ fontWeight: '800' }}>requesting +{r.requested_slots}</Text></Text>
          <Hint>Reason: “{r.reason}”</Hint>
          {declining === r.id ? (
            <ReasonBox busy={busy} onCancel={() => setDeclining(null)} onSubmit={(reason) => act(() => declineSlotRequest(r.id, reason), 'Request declined. The Treasurer will see your reason.')} />
          ) : (
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
              <Btn label={`Approve +${r.requested_slots}`} small disabled={busy} onPress={async () => {
                const yes = await confirmAction({ title: 'Approve', message: `Approve ${r.requested_slots} extra slots for ${r.group_name}? The Treasurer is told immediately.`, confirmText: 'Approve' });
                if (yes) act(() => approveSlotRequest(r.id, r.requested_slots, null), `Approved +${r.requested_slots} for ${r.group_name}.`);
              }} />
              <Btn label="Decline" kind="ghost" small disabled={busy} onPress={() => setDeclining(r.id)} />
            </View>
          )}
        </Card>
      ))}
      <Pager list={list} />
    </AdminScreen>
  );
}
