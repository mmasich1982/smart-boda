// admin-console/src/pages/ManageGroupsAndMembers.jsx
import React, { useState } from 'react';
import { listGroups, getGroupStats, createGroup, updateGroup, setGroupActive } from '../api/groups';
import { useApiResource } from '../hooks/useApiResource';
import ConfirmButton from '../components/ConfirmButton';
import MaskedPhone from '../components/MaskedPhone';
import LocationCascade from '../components/LocationCascade';

const EMPTY = { group_name: '', county_id: null, sub_county_id: null, ward_id: null, stage_name: '',
  approved_slots: 10, chair_name: '', chair_phone: '', treasurer_name: '', treasurer_phone: '' };

export default function ManageGroupsAndMembers() {
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [form, setForm] = useState(null);     // null = closed; object = create/edit dialog
  const [editId, setEditId] = useState(null);
  const [view, setView] = useState(null);     // read-only details
  const [msg, setMsg] = useState(null);
  const [errors, setErrors] = useState({});
  const stats = useApiResource(getGroupStats, []);
  const groups = useApiResource(() => listGroups({ q: q || undefined, status: status || undefined }), [q, status]);
  const refresh = () => { stats.refresh(); groups.refresh(); };

  function validate(f) {
    const e = {};
    if (!f.group_name.trim()) e.group_name = 'Group name is required';
    if (!f.county_id) e.county_id = 'Please select a county';
    if (!f.sub_county_id) e.sub_county_id = 'Please select a sub-county';
    if (!f.ward_id) e.ward_id = 'Please select a ward';
    if (!f.stage_name.trim()) e.stage_name = 'Stage name is required';
    if (!(Number(f.approved_slots) >= 1)) e.approved_slots = 'Enter at least 1 slot';
    if (!f.chair_name.trim()) e.chair_name = 'Chairperson name is required';
    if (!f.treasurer_name.trim()) e.treasurer_name = 'Treasurer name is required';
    ['chair_phone', 'treasurer_phone'].forEach((k) => {
      if (!/^(\+254|0)(7|1)[0-9]{8}$/.test(f[k].replace(/ /g, ''))) e[k] = 'Enter a valid number, e.g. 0712345678';
    });
    return e;
  }

  async function save() {
    const e = validate(form); setErrors(e);
    if (Object.keys(e).length) return;
    try {
      const body = { ...form, approved_slots: Number(form.approved_slots) };
      const saved = editId ? await updateGroup(editId, body) : await createGroup(body);
      setMsg(editId ? 'Group updated.' : `Group created. Group Code: ${saved.group_code}`);
      setForm(null); setEditId(null); refresh();
    } catch (err) { setMsg(err?.response?.data?.detail || 'Could not save the group.'); }
  }
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const T = ({ k, label, ...p }) => (
    <label style={{ display: 'block', marginBottom: 10 }}>
      <div style={{ fontWeight: 600, fontSize: 13 }}>{label} <span style={{ color: '#d32f2f' }}>*</span></div>
      <input value={form[k]} onChange={set(k)} style={{ width: '100%', padding: 8, boxSizing: 'border-box' }} {...p} />
      {errors[k] && <div role="alert" style={{ color: '#d32f2f', fontSize: 12 }}>⚠️ {errors[k]}</div>}
    </label>
  );
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
        <button className="primary" onClick={() => { setForm(EMPTY); setEditId(null); setErrors({}); }}>+ New Group</button>
      </div>
      {groups.loading && <p>Loading…</p>}
      {groups.error && <p role="alert" style={{ color: 'red' }}>Couldn't load groups: {groups.error}</p>}
      <div className="card" style={{ overflowX: 'auto' }}>
        <table>
          <thead><tr><th>Code</th><th>Group</th><th>Stage</th><th>Location</th><th>Slots (used/approved)</th><th>Treasurer</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>
            {(groups.data?.items || []).map((g) => (
              <tr key={g.id}>
                <td><b>{g.group_code}</b></td><td>{g.group_name}</td><td>{g.stage_name}</td>
                <td>{g.ward}, {g.sub_county}, {g.county}</td>
                <td>{g.slots_used}/{g.approved_slots}</td>
                <td>{g.treasurer_name} · <MaskedPhone value={g.treasurer_phone} /></td>
                <td>{g.status === 'active' ? '🟢 Active' : '⚪ Inactive'}</td>
                <td style={{ display: 'flex', gap: 6 }}>
                  <button className="secondary" onClick={() => setView(g)}>View</button>
                  <button className="secondary" onClick={() => { setForm({ ...g }); setEditId(g.id); setErrors({}); }}>Edit</button>
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
            Chairperson: {view.chair_name} ({view.chair_phone})<br />Treasurer: {view.treasurer_name} ({view.treasurer_phone})<br />
            Registered: {view.registered_at} · Status: {view.status}</p>
          <button className="secondary" onClick={() => setView(null)}>Close</button>
        </div>)}

      {form && (
        <div className="card" style={{ marginTop: 12 }}>
          <h3>{editId ? 'Edit Group' : 'Create New Group'}</h3>
          <T k="group_name" label="Group Name" maxLength={120} />
          <LocationCascade value={form} errors={errors}
            onChange={(loc) => setForm({ ...form, ...loc })} />
          <T k="stage_name" label="Stage Name" maxLength={120} placeholder="Where riders wait for customers" />
          <T k="approved_slots" label="Number of Approved Member Slots" type="number" min="1" />
          <T k="chair_name" label="Group Chairperson Name" maxLength={80} />
          <T k="chair_phone" label="Chairperson Phone Number" placeholder="0712345678" />
          <T k="treasurer_name" label="Treasurer Name" maxLength={80} />
          <T k="treasurer_phone" label="Treasurer Phone Number" placeholder="0712345678" />
          <div className="muted" style={{ fontSize: 12, marginBottom: 8 }}>Phone numbers are contact details only. Riders are linked to groups by motorcycle plate number.</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="primary" onClick={save}>{editId ? 'Save Changes' : 'Create Group'}</button>
            <button className="secondary" onClick={() => { setForm(null); setEditId(null); }}>Cancel</button>
          </div>
        </div>)}
    </div>
  );
}