// admin-console/src/pages/BusinessesList.jsx
// Manage Businesses > Businesses and Users. Every business with its people, roles and status, and everything the Administrator can do
// to a business after registering it (journey L): rename it, add a person, edit a name or number before the person has set up, name
// another Owner, switch a person or the whole business off and on, and remove what nobody has set up yet (typo clean-up).
import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  listBusinesses, updateBusiness, removeBusiness, deactivateBusiness, reactivateBusiness, addBusinessUser, updateBusinessUser,
  removeBusinessUser, deactivateBusinessUser, reactivateBusinessUser, changeBusinessOwner,
} from '../api/businesses';
import { useApiResource } from '../hooks/useApiResource';
import ConfirmButton from '../components/ConfirmButton';
import MaskedPhone from '../components/MaskedPhone';
import Pagination from '../components/Pagination';
import TriChoice, { errText } from '../components/TriChoice';
import BusinessTypeSelect from '../components/BusinessTypeSelect';
import LocationCascade from '../components/LocationCascade';
import BusinessPerformance from '../components/BusinessPerformance';

const BIZ_STATUS = { pending_setup: '🟡 Pending setup', activated: '🟢 Activated', inactive: '⚫ Switched off' };
const USER_STATUS = { awaiting_registration: '🟡 Awaiting registration', registered: '🟢 Registered', inactive: '⚫ Switched off' };
const PHONE_RE = /^(\+254|254|0)(7|1)[0-9]{8}$/;
const clean = (v) => (v || '').replace(/[ -]/g, '');
const tick = (ok) => (ok ? '✅' : '🚫');

export default function BusinessesList() {
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [msg, setMsg] = useState(null);
  const [rename, setRename] = useState(null);      // { id, name }
  const [place, setPlace] = useState(null);        // { bid, business_type_code, county_id, sub_county_id, ward_id }: the Administrator edits type and location
  const [edit, setEdit] = useState(null);          // { bid, uid, full_name, mobile_number }
  const [tab, setTab] = useState({});             // per business: 'people' (default) | 'performance'
  const [add, setAdd] = useState(null);            // { bid, full_name, mobile_number, can_see_purchases, can_see_expenses }
  const res = useApiResource(() => listBusinesses({ q: q || undefined, status: status || undefined, page, page_size: pageSize }), [q, status, page, pageSize]);
  const d = res.data || {};

  async function run(fn, ok, after) {
    try { await fn(); setMsg({ ok: true, text: ok }); if (after) after(); res.refresh(); }
    catch (err) { setMsg({ ok: false, text: errText(err, 'That did not work.') }); }
  }

  const card = (t, v) => <div className="card" style={{ flex: 1, minWidth: 130 }}><div className="muted" style={{ fontSize: 12 }}>{t}</div><div style={{ fontSize: 26, fontWeight: 700 }}>{v ?? '—'}</div></div>;

  return (
    <div className="page">
      <h1>Businesses and Users</h1>
      <p className="muted">Every business and the people in it. A business with people who have set up cannot be deleted, only switched off. To register a new one, use <Link to="/businesses/register">Register a Business</Link>.</p>
      {msg && <div className="card" role="status" style={{ borderColor: msg.ok ? '#43a047' : '#d32f2f' }}>{msg.text} <button className="secondary" onClick={() => setMsg(null)}>OK</button></div>}
      {res.error && <p role="alert" style={{ color: 'red' }}>{String(res.error)}</p>}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
        {card('Pending setup', d.pending)}{card('Activated', d.activated)}{card('Switched off', d.inactive)}
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        <input placeholder="Search business, person or phone…" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} style={{ flex: 1, minWidth: 220, padding: 8 }} />
        <select aria-label="Status filter" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} style={{ padding: 8 }}>
          <option value="">All statuses</option><option value="pending_setup">Pending setup</option><option value="activated">Activated</option><option value="inactive">Switched off</option>
        </select>
      </div>

      {(d.items || []).map((b) => {
        const allAwaiting = b.users.every((u) => u.status === 'awaiting_registration');
        return (
          <div key={b.id} className="card" style={{ marginBottom: 14, opacity: b.status === 'inactive' ? 0.75 : 1 }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              {rename?.id === b.id ? (
                <>
                  <input aria-label="Business name" value={rename.name} onChange={(e) => setRename({ ...rename, name: e.target.value })} style={{ padding: 6 }} />
                  <button className="primary" onClick={() => run(() => updateBusiness(b.id, { business_name: rename.name }), 'Business renamed.', () => setRename(null))}>Save</button>
                  <button className="secondary" onClick={() => setRename(null)}>Cancel</button>
                </>
              ) : (<h3 style={{ margin: 0 }}>{b.business_name}</h3>)}
              <span>{BIZ_STATUS[b.status] || b.status}</span>
              {(b.also_owns || []).length > 0 && <span className="muted" style={{ fontSize: 13 }} data-testid={`also-owns-${b.id}`}>👤 Owner also owns: {b.also_owns.join(', ')}</span>}
              <span className="muted" style={{ fontSize: 13 }} data-testid={`type-${b.id}`}>{b.business_type ? `Type: ${b.business_type}` : 'Type: not set'}</span>
              <span className="muted" style={{ fontSize: 13 }} data-testid={`place-${b.id}`}>{b.ward || b.county ? `📍 ${[b.ward, b.sub_county, b.county].filter(Boolean).join(', ')}` : '📍 Location: not set'}</span>
              <span style={{ marginLeft: 'auto', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <button className="secondary" onClick={() => setRename({ id: b.id, name: b.business_name })}>Rename</button>
                <button className="secondary" onClick={() => setPlace({ bid: b.id, business_type_code: b.business_type_code || '', county_id: b.county_id || '', sub_county_id: b.sub_county_id || '', ward_id: b.ward_id || '' })}>Edit type and location</button>
                <button className="secondary" onClick={() => setAdd({ bid: b.id, full_name: '', mobile_number: '', can_see_purchases: null, can_see_expenses: null })} disabled={b.status === 'inactive'}>+ Add person</button>
                {b.status === 'inactive'
                  ? <button className="secondary" onClick={() => run(() => reactivateBusiness(b.id), `${b.business_name} is switched on again.`)}>Switch business on</button>
                  : <ConfirmButton className="secondary" label="Switch business off" confirmMessage={`Switch off ${b.business_name}? Nobody in it will be able to set up, and the app will stop accepting new records at the next sync. Records already saved stay.`} onConfirm={() => run(() => deactivateBusiness(b.id), `${b.business_name} is switched off.`)} />}
                {allAwaiting && <ConfirmButton className="secondary" label="Remove" confirmMessage={`Remove ${b.business_name} and everyone in it? Nobody has set up yet.`} onConfirm={() => run(() => removeBusiness(b.id), `${b.business_name} was removed.`, () => { if ((d.items || []).length === 1 && page > 1) setPage(page - 1); })} />}
              </span>
            </div>

            <div role="tablist" style={{ display: 'flex', gap: 6, marginTop: 10 }}>
              {[['people', 'People and actions'], ['performance', 'Business Performance']].map(([k, label]) => (
                <button key={k} role="tab" aria-selected={(tab[b.id] || 'people') === k} className={(tab[b.id] || 'people') === k ? 'primary' : 'secondary'} onClick={() => setTab({ ...tab, [b.id]: k })}>{label}</button>
              ))}
            </div>
            {tab[b.id] === 'performance' ? <BusinessPerformance businessId={b.id} /> : (<>
            {place && place.bid === b.id && (
              <div className="card" style={{ marginTop: 10 }}>
                <h4 style={{ marginTop: 0 }}>Business type and location of {b.business_name}</h4>
                <BusinessTypeSelect value={place.business_type_code} onChange={(c) => setPlace({ ...place, business_type_code: c })} />
                <LocationCascade value={place} onChange={(l) => setPlace({ ...place, ...l })} />
                <button className="primary" disabled={!place.business_type_code || !place.county_id || !place.sub_county_id || !place.ward_id}
                  onClick={() => run(() => updateBusiness(b.id, { business_type_code: place.business_type_code, county_id: Number(place.county_id), sub_county_id: Number(place.sub_county_id), ward_id: Number(place.ward_id) }), 'Business type and location saved.', () => setPlace(null))}>Save</button>{' '}
                <button className="secondary" onClick={() => setPlace(null)}>Cancel</button>
              </div>)}

            <div style={{ overflowX: 'auto', marginTop: 10 }}>
              <table>
                <thead><tr><th>Name</th><th>Mobile number</th><th>Role</th><th>Status</th><th>Purchases tile</th><th>Expenses tile</th><th>Actions</th></tr></thead>
                <tbody>
                  {b.users.map((u) => {
                    const editing = edit && edit.uid === u.id;
                    return (
                      <tr key={u.id}>
                        <td>{editing ? <input aria-label="Person name" value={edit.full_name} onChange={(e) => setEdit({ ...edit, full_name: e.target.value })} style={{ padding: 4 }} /> : u.full_name}</td>
                        <td>{editing ? <input aria-label="Person number" value={edit.mobile_number} onChange={(e) => setEdit({ ...edit, mobile_number: e.target.value })} style={{ padding: 4 }} /> : <MaskedPhone value={u.mobile_number} />}</td>
                        <td>{u.role === 'OWNER' ? '👑 Business Owner' : 'Sales/Service Person'}</td>
                        <td>{USER_STATUS[u.status] || u.status}</td>
                        <td>{tick(u.purchases_allowed)}{u.role === 'OWNER' ? ' always' : u.can_see_purchases === null ? ' same as business' : ' own choice'}</td>
                        <td>{tick(u.expenses_allowed)}{u.role === 'OWNER' ? ' always' : u.can_see_expenses === null ? ' same as business' : ' own choice'}</td>
                        <td style={{ whiteSpace: 'nowrap' }}>
                          {editing ? (
                            <>
                              <button className="primary" onClick={() => run(() => updateBusinessUser(b.id, u.id, { full_name: edit.full_name, mobile_number: clean(edit.mobile_number) }), 'Saved.', () => setEdit(null))} disabled={!PHONE_RE.test(clean(edit.mobile_number)) || edit.full_name.trim().length < 2}>Save</button>{' '}
                              <button className="secondary" onClick={() => setEdit(null)}>Cancel</button>
                            </>
                          ) : (
                            <>
                              {u.status === 'awaiting_registration' && <button className="secondary" onClick={() => setEdit({ bid: b.id, uid: u.id, full_name: u.full_name, mobile_number: u.mobile_number })}>Edit</button>}{' '}
                              {u.role !== 'OWNER' && u.status !== 'inactive' && <ConfirmButton className="secondary" label="Make Owner" confirmMessage={`Make ${u.full_name} the Business Owner? The current Owner becomes a Sales/Service Person at once; their own records stay with them.`} onConfirm={() => run(() => changeBusinessOwner(b.id, u.id), `${u.full_name} is now the Business Owner.`)} />}{' '}
                              {u.role !== 'OWNER' && (u.status === 'inactive'
                                ? <button className="secondary" onClick={() => run(() => reactivateBusinessUser(b.id, u.id), `${u.full_name} is switched on again.`)}>Switch on</button>
                                : <ConfirmButton className="secondary" label="Switch off" confirmMessage={`Switch off ${u.full_name}? They will not be able to set up or send new records.`} onConfirm={() => run(() => deactivateBusinessUser(b.id, u.id), `${u.full_name} is switched off.`)} />)}{' '}
                              {u.role !== 'OWNER' && u.status === 'awaiting_registration' && <ConfirmButton className="secondary" label="Remove" confirmMessage={`Remove ${u.full_name}? They have not set up yet.`} onConfirm={() => run(() => removeBusinessUser(b.id, u.id), `${u.full_name} was removed.`)} />}
                            </>)}
                        </td>
                      </tr>);
                  })}
                </tbody>
              </table>
            </div>

            {add && add.bid === b.id && (
              <div className="card" style={{ marginTop: 10 }}>
                <h4 style={{ marginTop: 0 }}>Add a Sales/Service Person to {b.business_name}</h4>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'end' }}>
                  <label>Full name *<input aria-label="New person name" value={add.full_name} onChange={(e) => setAdd({ ...add, full_name: e.target.value })} style={{ display: 'block' }} /></label>
                  <label>Mobile phone number *<input aria-label="New person number" value={add.mobile_number} placeholder="0712345678" onChange={(e) => setAdd({ ...add, mobile_number: e.target.value })} style={{ display: 'block' }} /></label>
                  <label>Purchases tile <TriChoice label="New person purchases tile" value={add.can_see_purchases} onChange={(v) => setAdd({ ...add, can_see_purchases: v })} /></label>
                  <label>Expenses tile <TriChoice label="New person expenses tile" value={add.can_see_expenses} onChange={(v) => setAdd({ ...add, can_see_expenses: v })} /></label>
                  <button className="primary" disabled={!PHONE_RE.test(clean(add.mobile_number)) || add.full_name.trim().length < 2}
                    onClick={() => run(() => addBusinessUser(b.id, { full_name: add.full_name.trim(), mobile_number: clean(add.mobile_number), can_see_purchases: add.can_see_purchases, can_see_expenses: add.can_see_expenses }), `${add.full_name.trim()} was added.`, () => setAdd(null))}>Add person</button>
                  <button className="secondary" onClick={() => setAdd(null)}>Cancel</button>
                </div>
              </div>)}
            </>)}
          </div>);
      })}
      {res.loading && <p className="muted">Loading…</p>}
      {!res.loading && (d.items || []).length === 0 && <p className="muted">No businesses found.</p>}
      <Pagination page={page} pageSize={pageSize} total={d.total || 0} disabled={res.loading} onPage={setPage} onPageSize={(n) => { setPageSize(n); setPage(1); }} />
    </div>
  );
}
