// admin-console/src/pages/IndividualRiders.jsx
// Pre-register a rider who has no Treasurer and no group: name + mobile number. The number must exist nowhere in Smart Boda.
// The rider then registers in the mobile app (the app finds the name from the number). My Savings / My Loans appear only
// once a Treasurer adds the rider to a group.
import React, { useEffect, useState } from 'react';
import { listIndividualRiders, createIndividualRider, removeIndividualRider, checkIndividualPhone } from '../api/individualRiders';
import { useApiResource } from '../hooks/useApiResource';
import ConfirmButton from '../components/ConfirmButton';
import MaskedPhone from '../components/MaskedPhone';

const errText = (e, fallback) => {            // detail is a string for our errors, a LIST for a 422
  const d = e?.response?.data?.detail;
  if (!d) return fallback;
  if (typeof d === 'string') return d;
  const x = Array.isArray(d) ? d[0] || {} : {};
  return String(x.msg || fallback).replace(/^Value error,\s*/, '');
};

const PHONE_RE = /^(\+254|254|0)(7|1)[0-9]{8}$/;
const EMPTY = { full_name: '', mobile_number: '' };
const STATUS_LABEL = { awaiting_registration: '🟡 Awaiting rider registration', registered: '🟢 Registered' };

export default function IndividualRiders() {
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [form, setForm] = useState(null);
  const [errors, setErrors] = useState({});
  const [phoneWarn, setPhoneWarn] = useState(null);     // BLOCKING: the number already exists somewhere in Smart Boda
  const [phoneOk, setPhoneOk] = useState(false);
  const [msg, setMsg] = useState(null);
  const [saving, setSaving] = useState(false);
  const riders = useApiResource(() => listIndividualRiders({ q: q || undefined, status: status || undefined }), [q, status]);
  const d = riders.data || {};

  // Look the number up while the Administrator types (the server enforces the same rule again on Save).
  const phoneNow = form?.mobile_number || '';
  useEffect(() => {
    const clean = phoneNow.replace(/[ -]/g, '');
    if (!form || !PHONE_RE.test(clean)) { setPhoneWarn(null); setPhoneOk(false); return undefined; }
    let cancelled = false;
    const t = setTimeout(() => {
      checkIndividualPhone(clean)
        .then((r) => { if (!cancelled) { setPhoneWarn(r.available ? null : r); setPhoneOk(!!r.available); } })
        .catch(() => { if (!cancelled) { setPhoneWarn(null); setPhoneOk(false); } });
    }, 400);
    return () => { cancelled = true; clearTimeout(t); };
  }, [phoneNow, !!form]);   // eslint-disable-line react-hooks/exhaustive-deps

  function validate(f) {
    const e = {};
    if (f.full_name.trim().length < 2) e.full_name = 'Rider name is required';
    if (!PHONE_RE.test(f.mobile_number.replace(/[ -]/g, ''))) e.mobile_number = 'Enter a valid number, e.g. 0712345678';
    else if (phoneWarn) e.mobile_number = phoneWarn.message;
    return e;
  }

  async function save() {
    const e = validate(form);
    setErrors(e);
    if (Object.keys(e).length) return;
    setSaving(true);
    try {
      const r = await createIndividualRider({ full_name: form.full_name.trim(), mobile_number: form.mobile_number.replace(/[ -]/g, '') });
      setMsg(`${r.full_name} was pre-registered. They can now register in the Smart Boda app with ${r.mobile_number}.`);
      setForm(null); setPhoneWarn(null); setPhoneOk(false);
      riders.refresh();
    } catch (err) { setMsg(errText(err, 'Could not save the rider.')); } finally { setSaving(false); }
  }

  async function remove(r) {
    try { await removeIndividualRider(r.id); setMsg(`${r.full_name} was removed.`); riders.refresh(); }
    catch (err) { setMsg(errText(err, 'Could not remove the rider.')); }
  }

  const card = (t, v) => <div className="card" style={{ flex: 1, minWidth: 140 }}><div className="muted" style={{ fontSize: 12 }}>{t}</div><div style={{ fontSize: 26, fontWeight: 700 }}>{v ?? '—'}</div></div>;

  return (
    <div className="page">
      <h1>Individual Riders</h1>
      <p className="muted">Riders who join on their own, with no Treasurer and no group. Pre-register the rider's name and mobile number here, then ask them to register in the Smart Boda app. They get My Savings and My Loans only after a Treasurer adds them to a group.</p>
      {msg && <div className="card" role="status">{msg} <button className="secondary" onClick={() => setMsg(null)}>OK</button></div>}
      {riders.error && <p role="alert" style={{ color: 'red' }}>{String(riders.error)}</p>}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
        {card('Pre-registered', (d.awaiting ?? 0) + (d.registered ?? 0))}{card('Awaiting registration', d.awaiting)}{card('Registered in app', d.registered)}
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        <input placeholder="Search name or phone…" value={q} onChange={(e) => setQ(e.target.value)} style={{ flex: 1, minWidth: 200, padding: 8 }} />
        <select value={status} onChange={(e) => setStatus(e.target.value)} style={{ padding: 8 }}>
          <option value="">All statuses</option><option value="awaiting_registration">Awaiting registration</option><option value="registered">Registered</option>
        </select>
        <button className="primary" onClick={() => { setForm(EMPTY); setErrors({}); setPhoneWarn(null); setPhoneOk(false); }}>+ New Individual Rider</button>
      </div>

      <div className="card" style={{ overflowX: 'auto' }}>
        <table>
          <thead><tr><th>Name</th><th>Mobile number</th><th>Status</th><th>Created</th><th>Actions</th></tr></thead>
          <tbody>
            {(d.items || []).map((r) => (
              <tr key={r.id}>
                <td>{r.full_name}</td>
                <td><MaskedPhone value={r.mobile_number} /></td>
                <td>{STATUS_LABEL[r.status] || r.status}{r.status === 'registered' && r.rider_status && r.rider_status !== 'active' ? <div className="muted" style={{ fontSize: 11 }}>still setting up their PIN</div> : null}</td>
                <td>{r.created_at ? new Date(r.created_at).toLocaleDateString() : '—'}</td>
                <td>{r.status === 'awaiting_registration'
                  ? <ConfirmButton className="secondary" label="Remove" confirmMessage={`Remove ${r.full_name}? They will not be able to register until you add them again.`} onConfirm={() => remove(r)} />
                  : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {riders.loading && <p className="muted">Loading…</p>}
        {!riders.loading && (d.items || []).length === 0 && <p className="muted">No individual riders found.</p>}
      </div>

      {form && (
        <div className="card" style={{ marginTop: 12 }}>
          <h3>Pre-register an Individual Rider</h3>
          <label style={{ display: 'block', margin: '8px 0' }}>Rider Name *
            <input value={form.full_name} maxLength={80} onChange={(e) => setForm({ ...form, full_name: e.target.value })} style={{ display: 'block' }} />
            {errors.full_name && <span role="alert" style={{ color: 'red' }}>{errors.full_name}</span>}
          </label>
          <label style={{ display: 'block', margin: '8px 0' }}>Mobile Phone Number *
            <input value={form.mobile_number} placeholder="0712345678" onChange={(e) => setForm({ ...form, mobile_number: e.target.value })} style={{ display: 'block' }} />
            {errors.mobile_number && <span role="alert" style={{ color: 'red' }}>{errors.mobile_number}</span>}
          </label>
          {phoneWarn && (
            <div role="alert" style={{ background: '#ffebee', border: '1px solid #d32f2f', color: '#b71c1c', padding: 8, borderRadius: 6, fontSize: 13, marginBottom: 10 }}>
              🚫 {phoneWarn.message} Use a different number to save this rider.
            </div>)}
          {phoneOk && !phoneWarn && (
            <div role="status" style={{ background: '#e8f5e9', border: '1px solid #43a047', color: '#1b5e20', padding: 8, borderRadius: 6, fontSize: 13, marginBottom: 10 }}>
              ✅ This number is available.
            </div>)}
          <div className="muted" style={{ fontSize: 12, marginBottom: 8 }}>The rider types this number in the Smart Boda app; their name is filled in automatically, then they choose a fuel type and create a PIN.</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="primary" onClick={save} disabled={!!phoneWarn || saving} title={phoneWarn ? 'This number already exists in Smart Boda' : undefined}>{saving ? 'Saving…' : 'Save Rider'}</button>
            <button className="secondary" onClick={() => { setForm(null); setPhoneWarn(null); setPhoneOk(false); }}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}
