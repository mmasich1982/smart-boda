// admin-console/src/pages/ManageGroupsAndMembers.jsx
import React, { useEffect, useState } from 'react';
import { listGroups, getGroupStats, createGroup, updateGroup, setGroupActive } from '../api/groups';
import { getGroupFinance, checkTreasurerPhone } from '../api/groups';   // add to the existing groups.js import
import { useApiResource } from '../hooks/useApiResource';
import ConfirmButton from '../components/ConfirmButton';
import MaskedPhone from '../components/MaskedPhone';
import LocationCascade from '../components/LocationCascade';

const errText = (e, fallback) => {            // detail is a string for our errors, a LIST for a 422
  const d = e?.response?.data?.detail;
  if (!d) return fallback;
  if (typeof d === 'string') return d;
  const x = Array.isArray(d) ? d[0] || {} : {};
  return String(x.msg || fallback).replace(/^Value error,\s*/, '');
};

const EMPTY = { group_name: '', group_type: '', county_id: null, sub_county_id: null, ward_id: null, stage_name: '',
  approved_slots: 10, treasurer_name: '', treasurer_phone: '',
 };

function GroupFinance({ id }) {
  const [f, setF] = useState(null);
  const [err, setErr] = useState(null);
  useEffect(() => {
    setF(null); setErr(null);
    getGroupFinance(id).then(setF).catch(() => setErr('Could not load finance figures.'));
  }, [id]);
  const kes = (n) => 'KSh ' + Math.round(Number(n || 0)).toLocaleString();
  if (err) return <p role="alert" style={{ color: 'red' }}>{err}</p>;
  if (!f) return <p className="muted">Loading finance…</p>;
  if (!f.configured) return <p className="muted">This group has not finished Chama set-up yet.</p>;
  return (
    <p>
      Money in: {kes(f.money_in)} · Money out: {kes(f.money_out)}<br />
      Group fund (pool): <b>{kes(f.pool)}</b><br />
      Active loans: {f.active_loans} · Pending confirmations: {f.pending_confirmations}
    </p>
  );
}

// Defined OUTSIDE the page component so React keeps the same component between renders.
// (Defined inside, it is a new component on every keystroke and the input loses focus.)
function Field({ k, label, form, setForm, errors, ...p }) {
  return (
    <label style={{ display: 'block', marginBottom: 10 }}>
      <div style={{ fontWeight: 600, fontSize: 13 }}>{label} <span style={{ color: '#d32f2f' }}>*</span></div>
      <input value={form[k] ?? ''} onChange={(e) => setForm({ ...form, [k]: e.target.value })}
        style={{ width: '100%', padding: 8, boxSizing: 'border-box' }} {...p} />
      {errors[k] && <div role="alert" style={{ color: '#d32f2f', fontSize: 12 }}>⚠️ {errors[k]}</div>}
    </label>
  );
}

export default function ManageGroupsAndMembers() {
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [form, setForm] = useState(null);     // null = closed; object = create/edit dialog
  const [editId, setEditId] = useState(null);
  const [view, setView] = useState(null);     // read-only details
  const [msg, setMsg] = useState(null);
  const [errors, setErrors] = useState({});
  const [origPhone, setOrigPhone] = useState('');        // the Treasurer phone the group already had (edit only)
  const [phoneWarn, setPhoneWarn] = useState(null);      // BLOCKING: the number already belongs to a rider (and is not a valid pair)
  const [phonePair, setPhonePair] = useState(null);      // info only: the number completes a Merry-Go-Round + Table Banking pair
  const stats = useApiResource(getGroupStats, []);
  const groups = useApiResource(() => listGroups({ q: q || undefined, status: status || undefined }), [q, status]);
  const refresh = () => { stats.refresh(); groups.refresh(); };

  // BLOCKING: a number that already belongs to a rider cannot be used for a new Treasurer (the server enforces it too),
  // EXCEPT when the same Treasurer already runs an active group of the OTHER type (a Merry-Go-Round + Table Banking pair).
  // Skipped while editing if the phone is unchanged.
  const phoneNow = form?.treasurer_phone || '';
  const typeNow = form?.group_type || '';
  useEffect(() => {
    const clean = phoneNow.replace(/ /g, '');
    if (!form || !typeNow || !/^(\+254|0)(7|1)[0-9]{8}$/.test(clean) || (editId && clean === (origPhone || '').replace(/ /g, ''))) {
      setPhoneWarn(null); setPhonePair(null); return undefined;
    }
    let cancelled = false;
    const t = setTimeout(() => {
      checkTreasurerPhone(clean, typeNow, editId || undefined)
        .then((r) => {
          if (cancelled) return;
          setPhoneWarn(r?.has_account && !r.pair_ok ? r : null);
          setPhonePair(r?.has_account && r.pair_ok ? r : null);
        })
        .catch(() => { if (!cancelled) { setPhoneWarn(null); setPhonePair(null); } });
    }, 400);
    return () => { cancelled = true; clearTimeout(t); };
  }, [phoneNow, typeNow, !!form, editId, origPhone]);   // eslint-disable-line react-hooks/exhaustive-deps

  function validate(f) {
    const e = {};
    if (!f.group_name.trim()) e.group_name = 'Group name is required';
    if (!f.group_type) e.group_type = 'Choose Merry-Go-Round or Table Banking';
    if (!f.county_id) e.county_id = 'Please select a county';
    if (!f.sub_county_id) e.sub_county_id = 'Please select a sub-county';
    if (!f.ward_id) e.ward_id = 'Please select a ward';
    if (!f.stage_name.trim()) e.stage_name = 'Stage name is required';
    if (!(Number(f.approved_slots) >= 1)) e.approved_slots = 'Enter at least 1 slot';
    if (!f.treasurer_name.trim()) e.treasurer_name = 'Treasurer name is required';
    if (!/^(\+254|0)(7|1)[0-9]{8}$/.test(f.treasurer_phone.replace(/ /g, ''))) e.treasurer_phone = 'Enter a valid number, e.g. 0712345678';
    return e;
  }

  async function save() {
    const e = validate(form);
    if (phoneWarn) e.treasurer_phone = phoneWarn.message;     // blocks saving
    setErrors(e);
    if (Object.keys(e).length) return;
    try {
      const body = { ...form, group_type: form.group_type || null, approved_slots: Number(form.approved_slots) };
      const saved = editId ? await updateGroup(editId, body) : await createGroup(body);
      setMsg(editId ? 'Group updated.' : `Group created. Group Code: ${saved.group_code}`);
      setForm(null); setEditId(null); setPhoneWarn(null); setPhonePair(null); refresh();
    } catch (err) { setMsg(errText(err, 'Could not save the group.')); }
  }
  const s = stats.data || {};
  const card = (t, v) => <div className="card" style={{ flex: 1, minWidth: 140 }}><div className="muted" style={{ fontSize: 12 }}>{t}</div><div style={{ fontSize: 26, fontWeight: 700 }}>{v ?? '—'}</div></div>;

  return (
    <div className="page">
      <h1>Manage Groups and Members</h1>
      {msg && <div className="card" role="status">{msg} <button className="secondary" onClick={() => setMsg(null)}>OK</button></div>}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
        {card('Total groups', s.total_groups)}{card('Active', s.active_groups)}{card('Inactive', s.inactive_groups)}
        {card('Approved slots', s.total_approved_slots)}{card('Pending slot requests', s.pending_slot_requests)}
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        <input placeholder="Search name, code or stage…" value={q} onChange={(e) => setQ(e.target.value)} style={{ flex: 1, minWidth: 200, padding: 8 }} />
        <select value={status} onChange={(e) => setStatus(e.target.value)} style={{ padding: 8 }}>
          <option value="">All statuses</option><option value="active">Active</option><option value="inactive">Inactive</option>
        </select>
        <button className="primary" onClick={() => { setForm(EMPTY); setEditId(null); setOrigPhone(''); setPhoneWarn(null); setPhonePair(null); setErrors({}); }}>+ New Group</button>
      </div>
      {groups.loading && <p>Loading…</p>}
      {groups.error && <p role="alert" style={{ color: 'red' }}>Couldn't load groups: {groups.error}</p>}
      <div className="card" style={{ overflowX: 'auto' }}>
        <table>
          <thead><tr><th>Code</th><th>Group</th><th>Type</th><th>Stage</th><th>Location</th><th>Slots (used/approved)</th><th>Treasurer</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>
            {(groups.data?.items || []).map((g) => (
              <tr key={g.id}>
                <td><b>{g.group_code}</b></td><td>{g.group_name}</td><td>{g.group_type === 'mgr' ? 'Merry-Go-Round' : g.group_type === 'tb' ? 'Table Banking' : '—'}</td><td>{g.stage_name}</td>
                <td>{g.ward}, {g.sub_county}, {g.county}</td>
                <td>{g.slots_used}/{g.approved_slots}{g.shared_with ? <div className="muted" style={{ fontSize: 11 }}>🔗 shared with {g.shared_with}</div> : null}</td>
                <td>{g.treasurer_name} · <MaskedPhone value={g.treasurer_phone} /></td>
                <td>{g.status === 'active' ? '🟢 Active' : '⚪ Inactive'}</td>
                <td style={{ display: 'flex', gap: 6 }}>
                  <button className="secondary" onClick={() => setView(g)}>View</button>
                  <button className="secondary" onClick={() => { setForm({ ...g }); setEditId(g.id); setOrigPhone(g.treasurer_phone || ''); setPhoneWarn(null); setPhonePair(null); setErrors({}); }}>Edit</button>
                  <ConfirmButton className="secondary" label={g.status === 'active' ? 'Deactivate' : 'Activate'}
                    confirmMessage={g.status === 'active' ? 'Deactivate this group? Its Treasurer will not be able to add members.' : 'Activate this group?'}
                    onConfirm={async () => { await setGroupActive(g.id, g.status !== 'active'); refresh(); }} />
                </td>
              </tr>))}
          </tbody>
        </table>
        {!groups.loading && (groups.data?.items || []).length === 0 && <p className="muted">No groups found.</p>}
      </div>

      {view && (
        <div className="card" style={{ marginTop: 12 }}>
          <h3>{view.group_name} · {view.group_code}</h3>
          <p>Stage: {view.stage_name}<br />Location: {view.ward}, {view.sub_county}, {view.county}<br />
            Slots: {view.slots_used} used of {view.approved_slots} ({view.slots_available} available)<br />
            Treasurer: {view.treasurer_name} ({view.treasurer_phone})<br />
            Registered: {view.registered_at} · Status: {view.status}</p>
          <GroupFinance id={view.id} />
          <button className="secondary" onClick={() => setView(null)}>Close</button>
        </div>)}

      {form && (
        <div className="card" style={{ marginTop: 12 }}>
          <h3>{editId ? 'Edit Group' : 'Create New Group'}</h3>
          <Field form={form} setForm={setForm} errors={errors} k="group_name" label="Group Name" maxLength={120} />
          <label style={{ display: 'block', margin: '8px 0' }}>Group Type *
            <select value={form.group_type || ''} onChange={(e) => setForm({ ...form, group_type: e.target.value })} style={{ display: 'block' }}>
              <option value="">Select…</option>
              <option value="mgr">Merry-Go-Round</option>
              <option value="tb">Table Banking</option>
            </select>
            {errors.group_type && <span role="alert" style={{ color: 'red' }}>{errors.group_type}</span>}
          </label>
          <LocationCascade value={form} errors={errors}
            onChange={(loc) => setForm({ ...form, ...loc })} />
          <Field form={form} setForm={setForm} errors={errors} k="stage_name" label="Stage Name" maxLength={120} placeholder="Where riders wait for customers" />
          <Field form={form} setForm={setForm} errors={errors} k="approved_slots" label="Number of Approved Member Slots" type="number" min="1" />
          <Field form={form} setForm={setForm} errors={errors} k="treasurer_name" label="Treasurer Name" maxLength={80} />
          <Field form={form} setForm={setForm} errors={errors} k="treasurer_phone" label="Treasurer Phone Number" placeholder="0712345678" />
          {phoneWarn && (
            <div role="alert" style={{ background: '#ffebee', border: '1px solid #d32f2f', color: '#b71c1c', padding: 8, borderRadius: 6, fontSize: 13, marginBottom: 10 }}>
              🚫 {phoneWarn.message} Use a different number to save this group.
            </div>)}
          {phonePair && (
            <div role="status" style={{ background: '#e8f5e9', border: '1px solid #43a047', color: '#1b5e20', padding: 8, borderRadius: 6, fontSize: 13, marginBottom: 10 }}>
              🔗 {phonePair.message}
            </div>)}
          <div className="muted" style={{ fontSize: 12, marginBottom: 8 }}>A rider is linked to a group by MOBILE NUMBER: when the Treasurer registers a rider's number, the rider sees the group after they set up their profile with that number.</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="primary" onClick={save} disabled={!!phoneWarn} title={phoneWarn ? 'This Treasurer number already has an account' : undefined}>{editId ? 'Save Changes' : 'Create Group'}</button>
            <button className="secondary" onClick={() => { setForm(null); setEditId(null); setPhoneWarn(null); setPhonePair(null); }}>Cancel</button>
          </div>
        </div>)}
    </div>
  );
}