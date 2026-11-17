// admin-console/src/pages/AdminAppAccess.jsx
// Admin App > Admin App Access (Super Admin only). Who may sign in to the Smart Boda mobile app as an Administrator.
// An Administrator needs (1) a mobile number on their account and (2) app access switched ON here. They then set up in the app with that number
// (Setup My Profile > create a 4-digit PIN). A forgotten PIN is cleared here; the person sets a new one in the app. A phone that is lost: switch the app
// access off (the phone stops working at once) or reset the PIN.
import React, { useState } from 'react';
import { listAppAccess, setAppAccess, resetAppPin } from '../api/adminApp';
import { useApiResource } from '../hooks/useApiResource';
import ConfirmButton from '../components/ConfirmButton';
import MaskedPhone from '../components/MaskedPhone';
import Pagination from '../components/Pagination';

const errText = (e, fallback) => {
  const d = e?.response?.data?.detail;
  return typeof d === 'string' ? d : fallback;
};
const when = (v) => (v ? new Date(v).toLocaleString('en-GB', { timeZone: 'Africa/Nairobi', dateStyle: 'medium', timeStyle: 'short' }) : '—');

export default function AdminAppAccess() {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [msg, setMsg] = useState(null);
  const res = useApiResource(() => listAppAccess({ page, page_size: pageSize }), [page, pageSize]);
  const d = res.data || {};

  async function run(fn, ok) {
    try { await fn(); setMsg({ ok: true, text: ok }); res.refresh(); }
    catch (e) { setMsg({ ok: false, text: errText(e, 'That did not save.') }); }
  }

  return (
    <div className="page">
      <h1>Admin App Access</h1>
      <p className="muted">Who may sign in to the mobile app as an Administrator. The app shows the same records as this console. A person needs a mobile number on their account and access switched on; they then set up in the app with that number and choose a 4-digit PIN. If a PIN is forgotten, reset it here and the person sets a new one. If a phone is lost, switch access off: that phone stops working at once.</p>
      {msg && <div className="card" role="status" style={{ borderColor: msg.ok ? '#43a047' : '#d32f2f' }}>{msg.text} <button className="secondary" onClick={() => setMsg(null)}>OK</button></div>}
      {res.error && <p role="alert" style={{ color: 'red' }}>{String(res.error)}</p>}
      <div className="card" style={{ overflowX: 'auto' }}>
        <table>
          <thead><tr><th>Name</th><th>Role</th><th>Mobile number</th><th>App access</th><th>App PIN</th><th>Last app sign-in</th><th>Actions</th></tr></thead>
          <tbody>
            {(d.items || []).map((a) => (
              <tr key={a.id}>
                <td>{a.name}<div className="muted" style={{ fontSize: 12 }}>{a.email}{a.is_active ? '' : ' · account off'}</div></td>
                <td>{a.role === 'super_admin' ? 'Super Admin' : 'Support Admin'}</td>
                <td>{a.mobile_number ? <MaskedPhone value={a.mobile_number} /> : <span className="muted">none</span>}</td>
                <td>{a.app_access_enabled ? '🟢 On' : '⚫ Off'}</td>
                <td>{a.pin_set ? `✅ Set${a.locked ? ' · 🔒 locked' : ''}` : '— not set up'}<div className="muted" style={{ fontSize: 12 }}>{a.registered_at ? `since ${when(a.registered_at)}` : ''}</div></td>
                <td>{when(a.last_login)}</td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  {a.app_access_enabled
                    ? <ConfirmButton className="secondary" label="Switch off" confirmMessage={`Switch off the app for ${a.name}? Their phone stops working at once.`} onConfirm={() => run(() => setAppAccess(a.id, false), `${a.name} can no longer use the app.`)} />
                    : <button className="secondary" disabled={!a.mobile_number} title={a.mobile_number ? undefined : 'Add a mobile number to this account first'} onClick={() => run(() => setAppAccess(a.id, true), `${a.name} can now set up in the app with their mobile number.`)}>Switch on</button>}{' '}
                  {a.pin_set && <ConfirmButton className="secondary" label="Reset PIN" confirmMessage={`Clear the app PIN of ${a.name}? Their phone stops working until they set a new PIN in the app.`} onConfirm={() => run(() => resetAppPin(a.id), `${a.name}'s app PIN was cleared. They can set a new one in the app.`)} />}
                </td>
              </tr>))}
          </tbody>
        </table>
        {res.loading && <p className="muted">Loading…</p>}
        {!res.loading && (d.items || []).length === 0 && <p className="muted">No administrators found.</p>}
        <Pagination page={page} pageSize={pageSize} total={d.total || 0} disabled={res.loading} pageSizes={[5, 10, 20, 50]} onPage={setPage} onPageSize={(n) => { setPageSize(n); setPage(1); }} />
      </div>
    </div>
  );
}
