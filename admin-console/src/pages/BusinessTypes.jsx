// admin-console/src/pages/BusinessTypes.jsx
// Manage Businesses > Business Types. The list people choose from in Setup My Profile (Retail Shop, Kiosk, Salon / Barber, ...), kept as
// master data like fuel types. A type is never deleted (businesses already use it): switch it off and it disappears from the app's list for
// new users only. At least one type must stay on.
import React, { useState } from 'react';
import { listBusinessTypes, addBusinessType, updateBusinessType } from '../api/businesses';
import { useApiResource } from '../hooks/useApiResource';
import { errText } from '../components/TriChoice';

export default function BusinessTypes() {
  const res = useApiResource(() => listBusinessTypes(), []);
  const [msg, setMsg] = useState(null);
  const [newName, setNewName] = useState('');
  const [edit, setEdit] = useState(null);       // { id, name }
  const d = res.data || {};

  async function run(fn, ok, after) {
    try { await fn(); setMsg({ ok: true, text: ok }); if (after) after(); res.refresh(); }
    catch (err) { setMsg({ ok: false, text: errText(err, 'That did not save.') }); }
  }

  return (
    <div className="page">
      <h1>Business Types</h1>
      <p className="muted">The list a business user chooses from when they set up in the app. Changes show in the app at once. Switching a type off hides it from <b>new</b> users only; businesses that already chose it keep it.</p>
      {msg && <div className="card" role="status" style={{ borderColor: msg.ok ? '#43a047' : '#d32f2f' }}>{msg.text} <button className="secondary" onClick={() => setMsg(null)}>OK</button></div>}
      {res.error && <p role="alert" style={{ color: 'red' }}>{String(res.error)}</p>}
      <div className="card" style={{ marginBottom: 12, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'end' }}>
        <label>New business type<input aria-label="New business type" value={newName} maxLength={60} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Boda Wash" style={{ display: 'block', minWidth: 240 }} /></label>
        <button className="primary" disabled={newName.trim().length < 2} onClick={() => run(() => addBusinessType({ display_name: newName.trim() }), `${newName.trim()} was added.`, () => setNewName(''))}>+ Add business type</button>
        <span className="muted" style={{ marginLeft: 'auto' }}>{d.active ?? '—'} of {d.total ?? '—'} switched on</span>
      </div>
      <div className="card" style={{ overflowX: 'auto' }}>
        <table>
          <thead><tr><th>Order</th><th>Name</th><th>Status</th><th>Businesses using it</th><th>Actions</th></tr></thead>
          <tbody>
            {(d.items || []).map((t) => (
              <tr key={t.id} style={{ opacity: t.is_active ? 1 : 0.6 }}>
                <td><input aria-label={`${t.display_name} order`} type="number" min={0} defaultValue={t.sort_order} style={{ width: 64, padding: 4 }}
                  onBlur={(e) => { const n = Number(e.target.value); if (n !== t.sort_order && n >= 0) run(() => updateBusinessType(t.id, { sort_order: n }), `${t.display_name}: order saved.`); }} /></td>
                <td>{edit?.id === t.id
                  ? <input aria-label="Business type name" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} style={{ padding: 4 }} />
                  : t.display_name}</td>
                <td>{t.is_active ? '🟢 On' : '⚫ Off'}</td>
                <td>{t.businesses_using}</td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  {edit?.id === t.id ? (
                    <><button className="primary" disabled={edit.name.trim().length < 2} onClick={() => run(() => updateBusinessType(t.id, { display_name: edit.name }), 'Name saved.', () => setEdit(null))}>Save</button>{' '}
                      <button className="secondary" onClick={() => setEdit(null)}>Cancel</button></>
                  ) : (
                    <><button className="secondary" onClick={() => setEdit({ id: t.id, name: t.display_name })}>Rename</button>{' '}
                      <button className="secondary" onClick={() => run(() => updateBusinessType(t.id, { is_active: !t.is_active }), `${t.display_name} is ${t.is_active ? 'switched off' : 'switched on'}.`)}>{t.is_active ? 'Switch off' : 'Switch on'}</button></>)}
                </td>
              </tr>))}
          </tbody>
        </table>
        {res.loading && <p className="muted">Loading…</p>}
      </div>
    </div>
  );
}
