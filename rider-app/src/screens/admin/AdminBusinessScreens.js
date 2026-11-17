// rider-app/src/screens/admin/AdminBusinessScreens.js
// Manage Businesses: Register a Business, Businesses and Users, Tile Permissions, Business Types, Statement Requests.
// The same rules and the same server routes as the console pages (admin-console/src/pages/*), laid out for a phone. Every list is paged.
import React, { useEffect, useRef, useState } from 'react';
import { View, Text } from 'react-native';
import { AdminScreen, Card, Btn, Badge, Field, Tabs, Hint, Section, StatTile, StatRow, SearchBox, PhoneText, Pager, ListState, Notice, useNotice, useAdminList, useClientList,
  LocationPicker, PhoneVerdict, Choice, Banner, errText, s, C } from './AdminUI';
import DropdownField from '../../components/DropdownField';
import { listBusinesses, createBusiness, updateBusiness, removeBusiness, deactivateBusiness, reactivateBusiness, checkBusinessPhone, addBusinessUser, updateBusinessUser,
  removeBusinessUser, deactivateBusinessUser, reactivateBusinessUser, changeBusinessOwner, listBusinessTypes, addBusinessType, updateBusinessType, listStatementRequests, prepareStatement } from '../../admin/adminApi';
import { isPhone, cleanPhone, phoneKey, when, BIZ_STATUS, USER_STATUS } from '../../admin/adminFormat';
import { confirmAction } from '../../utils/confirmDialog';

const toMenu = (navigation) => ({ back: '← Manage Businesses', onBack: () => navigation.navigate('AdminMenu', { menuKey: 'businesses' }) });
const ADD = '__add_new__';
const ask = (title, message, confirmText) => confirmAction({ title, message, confirmText });

/** Business Type: pick from the master list or add a new one on the spot (it is saved to the list for every later registration). */
function BusinessTypePicker({ value, onChange, error }) {
  const [items, setItems] = useState([]);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [problem, setProblem] = useState(null);
  const [busy, setBusy] = useState(false);
  const load = () => listBusinessTypes().then((d) => setItems((d.items || []).filter((t) => t.is_active || t.code === value))).catch(() => setProblem('Could not load business types.'));
  useEffect(() => { load(); }, []);   // eslint-disable-line react-hooks/exhaustive-deps
  async function addAndSelect() {
    const clean = name.trim().replace(/\s+/g, ' ');
    if (clean.length < 2) { setProblem('Type at least 2 characters.'); return; }
    const same = items.find((t) => t.display_name.toLowerCase() === clean.toLowerCase());
    if (same) { onChange(same.code); setAdding(false); setName(''); return; }
    setBusy(true); setProblem(null);
    try { const t = await addBusinessType({ display_name: clean }); await load(); onChange(t.code); setAdding(false); setName(''); }
    catch (e) { setProblem(errText(e, 'We could not add that business type.')); } finally { setBusy(false); }
  }
  return (
    <View>
      <DropdownField label="Business type" required value={adding ? ADD : value || ''} error={error}
        options={[...items.map((t) => ({ label: t.display_name, value: t.code })), { label: '➕ Add a new business type…', value: ADD }]}
        onValueChange={(v) => { if (v === ADD) { setAdding(true); setProblem(null); } else { setAdding(false); onChange(v); } }} />
      {adding ? (
        <Card>
          <Field label="New business type" value={name} maxLength={60} placeholder="e.g. Car Wash" onChangeText={setName} error={problem} />
          <Hint>It is saved to the Business Type list and will be available for every business.</Hint>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
            <Btn label={busy ? 'Adding…' : 'Add and select'} small disabled={busy} onPress={addAndSelect} />
            <Btn label="Cancel" kind="ghost" small onPress={() => { setAdding(false); setName(''); setProblem(null); }} />
          </View>
        </Card>
      ) : null}
    </View>
  );
}

// ---------------------------------------------------------------------------------------------- Register a Business
let seq = 0;
const newRow = () => ({ key: ++seq, full_name: '', mobile_number: '', can_see_purchases: null, can_see_expenses: null, same_owner: false });

export function RegisterBusinessScreen({ navigation }) {
  const [name, setName] = useState('');
  const [type, setType] = useState('');
  const [loc, setLoc] = useState({ county_id: null, sub_county_id: null, ward_id: null });
  const [rows, setRows] = useState(() => [newRow()]);
  const [salesPurchases, setSalesPurchases] = useState(false);
  const [salesExpenses, setSalesExpenses] = useState(false);
  const [checks, setChecks] = useState({});
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const { notice, ok, fail, clear } = useNotice();
  const asked = useRef({});

  const numbers = rows.map((r) => `${r.key}:${cleanPhone(r.mobile_number)}`).join('|');
  useEffect(() => {                                   // every number is checked against ALL of Smart Boda and Smart Bizna once typing stops
    const timers = rows.map((r) => {
      const v = cleanPhone(r.mobile_number);
      if (!isPhone(v) || asked.current[r.key] === v) return null;
      return setTimeout(() => {
        asked.current[r.key] = v;
        checkBusinessPhone(v).then((res) => setChecks((c) => ({ ...c, [r.key]: { value: v, available: res.available, message: res.message, can_add_as_owner: !!res.can_add_as_owner, owner_name: res.owner_name, owner_of: res.owner_of || [] } })))
          .catch(() => setChecks((c) => { const n = { ...c }; delete n[r.key]; return n; }));
      }, 400);
    });
    return () => timers.forEach((t) => t && clearTimeout(t));
  }, [numbers]);   // eslint-disable-line react-hooks/exhaustive-deps

  const setRow = (key, patch) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const dupOf = (r) => rows.find((o) => o.key !== r.key && isPhone(o.mobile_number) && isPhone(r.mobile_number) && phoneKey(o.mobile_number) === phoneKey(r.mobile_number));
  const verdict = (r) => { const c = checks[r.key]; return c && c.value === cleanPhone(r.mobile_number) ? c : null; };
  const offer = (r, i) => { const c = verdict(r); return i === 0 && c && c.can_add_as_owner ? c : null; };
  const taken = (r, i) => { const c = verdict(r); return c && !c.available && !(offer(r, i) && r.same_owner) ? c : null; };
  const blocked = rows.some((r, i) => taken(r, i) || dupOf(r));
  const ownerNames = (c) => (c.owner_of || []).map((b) => b.business_name).join(', ');

  function validate() {
    const e = {};
    if (name.trim().length < 2) e.name = 'Business name is required (2 to 80 characters)';
    if (!type) e.type = 'Choose the business type, or add a new one';
    if (!loc.county_id) e.county_id = 'Select a county';
    if (!loc.sub_county_id) e.sub_county_id = 'Select a sub-county';
    if (!loc.ward_id) e.ward_id = 'Select a ward';
    rows.forEach((r) => {
      if (r.full_name.trim().length < 2) e[`n${r.key}`] = 'Name is required';
      if (!isPhone(r.mobile_number)) e[`m${r.key}`] = 'Enter a valid number, e.g. 0712345678';
    });
    return e;
  }

  async function save() {
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length || blocked) return;
    setSaving(true);
    try {
      const res = await createBusiness({
        business_name: name.trim(), business_type_code: type, county_id: loc.county_id, sub_county_id: loc.sub_county_id, ward_id: loc.ward_id,
        sales_can_see_purchases: salesPurchases, sales_can_see_expenses: salesExpenses,
        users: rows.map((r, i) => ({ full_name: r.full_name.trim(), mobile_number: cleanPhone(r.mobile_number),
          ...(i === 0 ? (r.same_owner ? { same_owner: true } : {}) : { can_see_purchases: r.can_see_purchases, can_see_expenses: r.can_see_expenses }) })),
      });
      ok(rows[0] && rows[0].same_owner
        ? `${res.business_name} was registered under the same Owner. ${res.status === 'activated' ? 'The Owner will see it in their app the next time they are online.' : 'They will see both businesses after they set up in the app.'}`
        : `${res.business_name} was registered with ${res.users.length} ${res.users.length === 1 ? 'person' : 'people'}. They can now set up in the app with their own mobile numbers.`);
      setName(''); setType(''); setLoc({ county_id: null, sub_county_id: null, ward_id: null }); setRows([newRow()]); setSalesPurchases(false); setSalesExpenses(false); setChecks({}); setErrors({}); asked.current = {};
    } catch (err) { fail(errText(err, 'Could not register the business.')); } finally { setSaving(false); }
  }

  return (
    <AdminScreen navigation={navigation} title="Register a Business" sub="You choose the type and location. Nobody gets a code or password: each person opens the app and types their own mobile number." {...toMenu(navigation)}>
      <Notice notice={notice} onClose={clear} />
      <Card>
        <Field label="Business name *" value={name} maxLength={80} onChangeText={setName} error={errors.name} />
        <BusinessTypePicker value={type} onChange={setType} error={errors.type} />
        <Section>Business location</Section>
        <LocationPicker value={loc} errors={errors} onChange={(l) => setLoc({ ...loc, ...l })} />
        <Hint>Number of users: {rows.length} (there is no limit)</Hint>
      </Card>

      {rows.map((r, i) => {
        const o = offer(r, i); const t = taken(r, i); const c = verdict(r);
        return (
          <Card key={r.key}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ fontWeight: '800', color: C.ink }}>User {i + 1} — {i === 0 ? 'Business Owner' : 'Sales/Service Person'}</Text>
              {i > 0 ? <Btn label="Remove" kind="ghost" small onPress={() => setRows(rows.filter((x) => x.key !== r.key))} /> : null}
            </View>
            <Field label="Full name *" value={r.full_name} maxLength={80} editable={!r.same_owner} onChangeText={(v) => setRow(r.key, { full_name: v })} error={errors[`n${r.key}`]} />
            <Field label="Mobile phone number *" value={r.mobile_number} placeholder="0712345678" keyboardType="phone-pad" onChangeText={(v) => setRow(r.key, { mobile_number: v, same_owner: false })} error={errors[`m${r.key}`]} />
            {o && !r.same_owner ? (
              <Banner tone="amber" text={`${o.owner_name} already owns: ${ownerNames(o)}. Register this business under the same Owner? They will not need to register again.`} onPress={() => setRow(r.key, { same_owner: true, full_name: o.owner_name })} />
            ) : null}
            {o && !r.same_owner ? <Btn label="Yes, same Owner" small onPress={() => setRow(r.key, { same_owner: true, full_name: o.owner_name })} /> : null}
            {o && r.same_owner ? <Banner tone="green" text={`✅ Same Owner: ${o.owner_name} will own this business as well as ${ownerNames(o)}. Tap to undo.`} onPress={() => setRow(r.key, { same_owner: false })} /> : null}
            {t && !o ? <PhoneVerdict taken message={i > 0 && t.can_add_as_owner ? 'This number belongs to a Business Owner, so it cannot be a Sales/Service Person.' : t.message} /> : null}
            {dupOf(r) && !t ? <PhoneVerdict taken message="This number is already used by another person in this form." /> : null}
            {c && c.available && !dupOf(r) ? <PhoneVerdict ok /> : null}
            {i === 0 ? <Hint>The Business Owner always sees every tile.</Hint> : (
              <View>
                <Text style={[s.label, { marginTop: 6 }]}>Business Purchases tile</Text>
                <Choice value={r.can_see_purchases} onChange={(v) => setRow(r.key, { can_see_purchases: v })} />
                <Text style={s.label}>Business Expenses tile</Text>
                <Choice value={r.can_see_expenses} onChange={(v) => setRow(r.key, { can_see_expenses: v })} />
              </View>
            )}
          </Card>
        );
      })}
      <Btn label="＋ Add another user" kind="ghost" onPress={() => setRows([...rows, newRow()])} />

      <Card>
        <Section>For the whole business</Section>
        <Hint>The default for every Sales/Service Person. You can change one person above without touching the others.</Hint>
        <Text style={[s.label, { marginTop: 8 }]}>Sales/Service Persons can see Business Purchases</Text>
        <Choice tri={false} value={salesPurchases} onChange={setSalesPurchases} />
        <Text style={s.label}>Sales/Service Persons can see Business Expenses</Text>
        <Choice tri={false} value={salesExpenses} onChange={setSalesExpenses} />
      </Card>
      <Btn label={saving ? 'Saving…' : 'Register Business'} disabled={saving || blocked} onPress={save} />
      {blocked ? <Hint>Fix the numbers marked in red first.</Hint> : null}
    </AdminScreen>
  );
}

// ---------------------------------------------------------------------------------------------- Businesses and Users
export function BusinessesListScreen({ navigation }) {
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [open, setOpen] = useState(null);
  const [panel, setPanel] = useState(null);          // { kind: 'rename'|'place'|'add'|'edit', bid, ...fields }
  const { notice, ok, fail, clear } = useNotice();
  const list = useAdminList((page, size) => listBusinesses({ q: q || undefined, status: status || undefined, page, page_size: size }), [q, status]);
  const d = list.data;
  const run = async (fn, done, after) => { try { await fn(); ok(done); if (after) after(); list.refresh(); } catch (e) { fail(errText(e, 'That did not work.')); } };

  return (
    <AdminScreen navigation={navigation} title="Businesses and Users" sub="Every business and the people in it. A business with people who have set up cannot be deleted, only switched off." {...toMenu(navigation)}>
      <Notice notice={notice} onClose={clear} />
      <StatRow>
        <StatTile label="Pending setup" value={d.pending} tone={C.amber} />
        <StatTile label="Activated" value={d.activated} tone={C.green} />
        <StatTile label="Switched off" value={d.inactive} />
      </StatRow>
      <Btn label="＋ Register a business" kind="dark" onPress={() => navigation.navigate('RegisterBusiness')} />
      <SearchBox value={q} onChange={setQ} placeholder="Search business, person or phone…" />
      <Tabs value={status} onChange={setStatus} tabs={[{ key: '', label: 'All' }, { key: 'pending_setup', label: 'Pending' }, { key: 'activated', label: 'Activated' }, { key: 'inactive', label: 'Switched off' }]} />
      <ListState list={list} emptyText="No businesses found." />

      {list.items.map((b) => {
        const isOpen = open === b.id;
        const allAwaiting = b.users.every((u) => u.status === 'awaiting_registration');
        const mine = panel && panel.bid === b.id ? panel : null;
        return (
          <Card key={b.id} style={{ opacity: b.status === 'inactive' ? 0.8 : 1 }} onPress={() => setOpen(isOpen ? null : b.id)}>
            <Text style={{ fontSize: 16, fontWeight: '800', color: C.ink }}>{b.business_name}</Text>
            <Hint>{BIZ_STATUS[b.status] || b.status} · {b.business_type ? b.business_type : 'Type not set'}</Hint>
            <Hint>📍 {b.ward || b.county ? [b.ward, b.sub_county, b.county].filter(Boolean).join(', ') : 'Location not set'}</Hint>
            {(b.also_owns || []).length ? <Hint>👤 Owner also owns: {b.also_owns.join(', ')}</Hint> : null}
            <Hint>{b.users.length} {b.users.length === 1 ? 'person' : 'people'} · tap {isOpen ? 'to close' : 'for people and actions'}</Hint>

            {isOpen ? (
              <View style={{ marginTop: 8 }}>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  <Btn label="Rename" kind="ghost" small onPress={() => setPanel({ kind: 'rename', bid: b.id, name: b.business_name })} />
                  <Btn label="Type and location" kind="ghost" small onPress={() => setPanel({ kind: 'place', bid: b.id, business_type_code: b.business_type_code || '', county_id: b.county_id || null, sub_county_id: b.sub_county_id || null, ward_id: b.ward_id || null })} />
                  <Btn label="＋ Add person" kind="ghost" small disabled={b.status === 'inactive'} onPress={() => setPanel({ kind: 'add', bid: b.id, full_name: '', mobile_number: '', can_see_purchases: null, can_see_expenses: null })} />
                  {b.status === 'inactive'
                    ? <Btn label="Switch business on" kind="ghost" small onPress={() => run(() => reactivateBusiness(b.id), `${b.business_name} is switched on again.`)} />
                    : <Btn label="Switch business off" kind="ghost" small onPress={async () => { if (await ask('Switch off', `Switch off ${b.business_name}? Nobody in it will be able to set up, and the app will stop accepting new records at the next sync. Records already saved stay.`, 'Switch off')) run(() => deactivateBusiness(b.id), `${b.business_name} is switched off.`); }} />}
                  {allAwaiting ? <Btn label="Remove" kind="ghost" small onPress={async () => { if (await ask('Remove business', `Remove ${b.business_name} and everyone in it? Nobody has set up yet.`, 'Remove')) run(() => removeBusiness(b.id), `${b.business_name} was removed.`); }} /> : null}
                </View>

                {mine && mine.kind === 'rename' ? (
                  <View style={{ marginTop: 8 }}>
                    <Field label="Business name" value={mine.name} maxLength={80} onChangeText={(t) => setPanel({ ...mine, name: t })} />
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      <Btn label="Save" small disabled={mine.name.trim().length < 2} onPress={() => run(() => updateBusiness(b.id, { business_name: mine.name }), 'Business renamed.', () => setPanel(null))} />
                      <Btn label="Cancel" kind="ghost" small onPress={() => setPanel(null)} />
                    </View>
                  </View>
                ) : null}

                {mine && mine.kind === 'place' ? (
                  <View style={{ marginTop: 8 }}>
                    <BusinessTypePicker value={mine.business_type_code} onChange={(c) => setPanel({ ...mine, business_type_code: c })} />
                    <LocationPicker value={mine} onChange={(l) => setPanel({ ...mine, ...l })} />
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      <Btn label="Save" small disabled={!mine.business_type_code || !mine.county_id || !mine.sub_county_id || !mine.ward_id}
                        onPress={() => run(() => updateBusiness(b.id, { business_type_code: mine.business_type_code, county_id: mine.county_id, sub_county_id: mine.sub_county_id, ward_id: mine.ward_id }), 'Business type and location saved.', () => setPanel(null))} />
                      <Btn label="Cancel" kind="ghost" small onPress={() => setPanel(null)} />
                    </View>
                  </View>
                ) : null}

                {mine && mine.kind === 'add' ? (
                  <View style={{ marginTop: 8 }}>
                    <Section>Add a Sales/Service Person</Section>
                    <Field label="Full name *" value={mine.full_name} onChangeText={(t) => setPanel({ ...mine, full_name: t })} />
                    <Field label="Mobile phone number *" value={mine.mobile_number} placeholder="0712345678" keyboardType="phone-pad" onChangeText={(t) => setPanel({ ...mine, mobile_number: t })} />
                    <Text style={s.label}>Purchases tile</Text>
                    <Choice value={mine.can_see_purchases} onChange={(v) => setPanel({ ...mine, can_see_purchases: v })} />
                    <Text style={s.label}>Expenses tile</Text>
                    <Choice value={mine.can_see_expenses} onChange={(v) => setPanel({ ...mine, can_see_expenses: v })} />
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      <Btn label="Add person" small disabled={!isPhone(mine.mobile_number) || mine.full_name.trim().length < 2}
                        onPress={() => run(() => addBusinessUser(b.id, { full_name: mine.full_name.trim(), mobile_number: cleanPhone(mine.mobile_number), can_see_purchases: mine.can_see_purchases, can_see_expenses: mine.can_see_expenses }), `${mine.full_name.trim()} was added.`, () => setPanel(null))} />
                      <Btn label="Cancel" kind="ghost" small onPress={() => setPanel(null)} />
                    </View>
                  </View>
                ) : null}

                {b.users.map((u) => {
                  const editing = mine && mine.kind === 'edit' && mine.uid === u.id;
                  return (
                    <View key={u.id} style={{ borderTopWidth: 1, borderTopColor: C.line, paddingVertical: 10, marginTop: 8 }}>
                      <Text style={{ fontWeight: '700', color: C.ink }}>{u.full_name}  {u.role === 'OWNER' ? '👑 Owner' : ''}</Text>
                      <PhoneText value={u.mobile_number} />
                      <Hint>{u.role === 'OWNER' ? 'Business Owner' : 'Sales/Service Person'} · {USER_STATUS[u.status] || u.status}</Hint>
                      <Hint>Purchases {u.purchases_allowed ? '✅' : '🚫'}{u.role === 'OWNER' ? ' always' : u.can_see_purchases === null ? ' same as business' : ' own choice'} · Expenses {u.expenses_allowed ? '✅' : '🚫'}{u.role === 'OWNER' ? ' always' : u.can_see_expenses === null ? ' same as business' : ' own choice'}</Hint>
                      {editing ? (
                        <View style={{ marginTop: 6 }}>
                          <Field label="Person name" value={mine.full_name} onChangeText={(t) => setPanel({ ...mine, full_name: t })} />
                          <Field label="Person number" value={mine.mobile_number} keyboardType="phone-pad" onChangeText={(t) => setPanel({ ...mine, mobile_number: t })} />
                          <View style={{ flexDirection: 'row', gap: 8 }}>
                            <Btn label="Save" small disabled={!isPhone(mine.mobile_number) || mine.full_name.trim().length < 2}
                              onPress={() => run(() => updateBusinessUser(b.id, u.id, { full_name: mine.full_name, mobile_number: cleanPhone(mine.mobile_number) }), 'Saved.', () => setPanel(null))} />
                            <Btn label="Cancel" kind="ghost" small onPress={() => setPanel(null)} />
                          </View>
                        </View>
                      ) : (
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 }}>
                          {u.status === 'awaiting_registration' ? <Btn label="Edit" kind="ghost" small onPress={() => setPanel({ kind: 'edit', bid: b.id, uid: u.id, full_name: u.full_name, mobile_number: u.mobile_number })} /> : null}
                          {u.role !== 'OWNER' && u.status !== 'inactive' ? <Btn label="Make Owner" kind="ghost" small onPress={async () => { if (await ask('Make Owner', `Make ${u.full_name} the Business Owner? The current Owner becomes a Sales/Service Person at once; their own records stay with them.`, 'Make Owner')) run(() => changeBusinessOwner(b.id, u.id), `${u.full_name} is now the Business Owner.`); }} /> : null}
                          {u.role !== 'OWNER' ? (u.status === 'inactive'
                            ? <Btn label="Switch on" kind="ghost" small onPress={() => run(() => reactivateBusinessUser(b.id, u.id), `${u.full_name} is switched on again.`)} />
                            : <Btn label="Switch off" kind="ghost" small onPress={async () => { if (await ask('Switch off', `Switch off ${u.full_name}? They will not be able to set up or send new records.`, 'Switch off')) run(() => deactivateBusinessUser(b.id, u.id), `${u.full_name} is switched off.`); }} />) : null}
                          {u.role !== 'OWNER' && u.status === 'awaiting_registration' ? <Btn label="Remove" kind="ghost" small onPress={async () => { if (await ask('Remove', `Remove ${u.full_name}? They have not set up yet.`, 'Remove')) run(() => removeBusinessUser(b.id, u.id), `${u.full_name} was removed.`); }} /> : null}
                        </View>
                      )}
                    </View>
                  );
                })}
              </View>
            ) : null}
          </Card>
        );
      })}
      <Pager list={list} />
    </AdminScreen>
  );
}

// ---------------------------------------------------------------------------------------------- Tile Permissions
export function TilePermissionsScreen({ navigation }) {
  const [q, setQ] = useState('');
  const { notice, ok, fail, clear } = useNotice();
  const list = useAdminList((page, size) => listBusinesses({ q: q || undefined, page, page_size: size }), [q], 5);
  const save = async (fn, done) => { try { await fn(); ok(done); list.refresh(); } catch (e) { fail(errText(e, 'That did not save.')); } };
  return (
    <AdminScreen navigation={navigation} title="Tile Permissions" sub="Decide who sees the Business Purchases and Business Expenses tiles. Set the default for the business, then change one person without touching the others. Changes reach each phone at its next sync." {...toMenu(navigation)}>
      <Notice notice={notice} onClose={clear} />
      <SearchBox value={q} onChange={setQ} placeholder="Search business, person or phone…" />
      <ListState list={list} emptyText="No businesses found." />
      {list.items.map((b) => {
        const owner = b.users.find((u) => u.role === 'OWNER');
        const sellers = b.users.filter((u) => u.role !== 'OWNER');
        return (
          <Card key={b.id}>
            <Text style={{ fontSize: 16, fontWeight: '800', color: C.ink }}>{b.business_name}</Text>
            <Hint>{owner ? `${owner.full_name} (Owner) always sees both tiles.` : ''}</Hint>
            <Text style={[s.label, { marginTop: 8 }]}>Sales/Service Persons see Business Purchases</Text>
            <Choice tri={false} value={!!b.sales_can_see_purchases} onChange={(v) => save(() => updateBusiness(b.id, { sales_can_see_purchases: v }), `Purchases default for ${b.business_name} saved.`)} />
            <Text style={s.label}>Sales/Service Persons see Business Expenses</Text>
            <Choice tri={false} value={!!b.sales_can_see_expenses} onChange={(v) => save(() => updateBusiness(b.id, { sales_can_see_expenses: v }), `Expenses default for ${b.business_name} saved.`)} />
            {sellers.map((u) => (
              <View key={u.id} style={{ borderTopWidth: 1, borderTopColor: C.line, paddingTop: 8, marginTop: 8 }}>
                <Text style={{ fontWeight: '700', color: C.ink }}>{u.full_name}{u.status === 'inactive' ? ' (switched off)' : ''}</Text>
                <Text style={s.label}>Purchases tile — now {u.purchases_allowed ? '✅ sees it' : '🚫 hidden'}</Text>
                <Choice value={u.can_see_purchases} onChange={(v) => save(() => updateBusinessUser(b.id, u.id, { can_see_purchases: v }), `${u.full_name}: Purchases tile saved.`)} />
                <Text style={s.label}>Expenses tile — now {u.expenses_allowed ? '✅ sees it' : '🚫 hidden'}</Text>
                <Choice value={u.can_see_expenses} onChange={(v) => save(() => updateBusinessUser(b.id, u.id, { can_see_expenses: v }), `${u.full_name}: Expenses tile saved.`)} />
              </View>
            ))}
            {!sellers.length ? <Hint>No Sales/Service Persons in this business yet.</Hint> : null}
          </Card>
        );
      })}
      <Pager list={list} />
    </AdminScreen>
  );
}

// ---------------------------------------------------------------------------------------------- Business Types
export function BusinessTypesScreen({ navigation }) {
  const list = useClientList(() => listBusinessTypes(), []);
  const [newName, setNewName] = useState('');
  const [edit, setEdit] = useState(null);
  const { notice, ok, fail, clear } = useNotice();
  const run = async (fn, done, after) => { try { await fn(); ok(done); if (after) after(); list.refresh(); } catch (e) { fail(errText(e, 'That did not save.')); } };
  const d = list.raw || {};
  return (
    <AdminScreen navigation={navigation} title="Business Types" sub="The list a business user chooses from. Switching a type off hides it from new users only; businesses that already chose it keep it." {...toMenu(navigation)}>
      <Notice notice={notice} onClose={clear} />
      <Card>
        <Field label="New business type" value={newName} maxLength={60} placeholder="e.g. Boda Wash" onChangeText={setNewName} />
        <Btn label="＋ Add business type" disabled={newName.trim().length < 2} onPress={() => run(() => addBusinessType({ display_name: newName.trim() }), `${newName.trim()} was added.`, () => setNewName(''))} />
        <Hint>{d.active ?? '—'} of {d.total ?? '—'} switched on</Hint>
      </Card>
      <ListState list={list} emptyText="No business types yet." />
      {list.items.map((t) => (
        <Card key={t.id} style={{ opacity: t.is_active ? 1 : 0.6 }}>
          {edit && edit.id === t.id ? (
            <View>
              <Field label="Business type name" value={edit.name} onChangeText={(v) => setEdit({ ...edit, name: v })} />
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Btn label="Save" small disabled={edit.name.trim().length < 2} onPress={() => run(() => updateBusinessType(t.id, { display_name: edit.name }), 'Name saved.', () => setEdit(null))} />
                <Btn label="Cancel" kind="ghost" small onPress={() => setEdit(null)} />
              </View>
            </View>
          ) : (
            <View>
              <Text style={{ fontSize: 15, fontWeight: '800', color: C.ink }}>{t.display_name}</Text>
              <Hint>{t.is_active ? '🟢 On' : '⚫ Off'} · {t.businesses_using} business(es) using it</Hint>
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                <Btn label="Rename" kind="ghost" small onPress={() => setEdit({ id: t.id, name: t.display_name })} />
                <Btn label={t.is_active ? 'Switch off' : 'Switch on'} kind="ghost" small onPress={() => run(() => updateBusinessType(t.id, { is_active: !t.is_active }), `${t.display_name} is ${t.is_active ? 'switched off' : 'switched on'}.`)} />
              </View>
            </View>
          )}
        </Card>
      ))}
      <Pager list={list} />
    </AdminScreen>
  );
}

// ---------------------------------------------------------------------------------------------- Statement Requests
const STATUS = { requested: '🟡 Requested', ready: '🟢 Ready' };
const TYPE = { summary: 'Summary', detailed: 'Detailed' };

export function StatementRequestsScreen({ navigation }) {
  const [status, setStatus] = useState('');
  const [busyId, setBusyId] = useState(null);
  const { notice, ok, fail, clear } = useNotice();
  const list = useClientList(() => listStatementRequests({ status: status || undefined }), [status]);
  async function prepare(r) {
    setBusyId(r.id);
    try { const out = await prepareStatement(r.id); ok(`Statement for ${r.business_name} is Ready. Verification code ${out.verification_code}.`); list.refresh(); }
    catch (e) { fail(errText(e, 'We could not prepare that statement.')); } finally { setBusyId(null); }
  }
  return (
    <AdminScreen navigation={navigation} title="Statement Requests" sub="Owners ask here for statements older than the six months kept on their phone. Prepare each one within 24 hours; it then appears in the Owner's app." {...toMenu(navigation)}>
      <Notice notice={notice} onClose={clear} />
      <Tabs value={status} onChange={setStatus} tabs={[{ key: '', label: 'All' }, { key: 'requested', label: 'Requested' }, { key: 'ready', label: 'Ready' }]} />
      <ListState list={list} emptyText="No statement requests." />
      {list.items.map((r) => (
        <Card key={r.id}>
          <Text style={{ fontSize: 15, fontWeight: '800', color: C.ink }}>{r.business_name}</Text>
          <Hint>{r.period_from} → {r.period_to} · {TYPE[r.statement_type] || r.statement_type}</Hint>
          <Hint>Purpose: {r.purpose || '—'} · Requested {when(r.requested_at)}</Hint>
          <Text style={{ marginTop: 4, color: C.ink }}>{STATUS[r.status] || r.status}{r.status === 'ready' ? `  (${when(r.ready_at)})` : ''}</Text>
          <Btn label={busyId === r.id ? 'Preparing…' : r.status === 'requested' ? 'Prepare and mark Ready' : 'Prepare again'} kind={r.status === 'requested' ? 'primary' : 'ghost'} small disabled={busyId === r.id}
            style={{ marginTop: 8 }} onPress={() => prepare(r)} />
        </Card>
      ))}
      <Pager list={list} />
    </AdminScreen>
  );
}
